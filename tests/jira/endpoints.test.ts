// tests/jira/endpoints.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  findStoryPointsFieldId, searchIssuesWithWorklogs, searchMyIssues, getIssueWorklogs,
  addWorklog, getSprintIssues, getActiveSprint, getActiveSprints,
  searchSprintSubtasks, filterKeysInSprint,
} from '@/jira/endpoints'
import type { JiraClient } from '@/jira/client'

// Client giả: ghi lại request và trả kết quả đã dựng sẵn theo path.
const fakeClient = (routes: Record<string, unknown>) => {
  const calls: { method: string; path: string; body?: unknown }[] = []
  const client: JiraClient = {
    call: vi.fn(async (...args: unknown[]) => {
      const req = args[0] as { method: string; path: string; body?: unknown }
      calls.push(req)
      const key = `${req.method} ${req.path.split('?')[0]}`
      if (!(key in routes)) throw new Error(`route chưa khai báo: ${key}`)
      return routes[key] as never
    }),
  }
  return { client, calls }
}

// IssueMeta mong đợi cho một issue "trơn": không parent, status không rõ.
const flatMeta = (key: string, summary: string) => ({
  key, summary, statusName: '', statusCategory: 'new',
  parentKey: null, parentSummary: null, isSubtask: false,
})

describe('findStoryPointsFieldId', () => {
  it('tìm field theo tên Story Points', async () => {
    const { client } = fakeClient({
      'GET /rest/api/3/field': [
        { id: 'customfield_1', name: 'Sprint' },
        { id: 'customfield_10016', name: 'Story Points' },
      ],
    })
    expect(await findStoryPointsFieldId(client)).toBe('customfield_10016')
  })

  it('nhận cả tên "Story point estimate" của Jira team-managed', async () => {
    const { client } = fakeClient({
      'GET /rest/api/3/field': [{ id: 'customfield_10026', name: 'Story point estimate' }],
    })
    expect(await findStoryPointsFieldId(client)).toBe('customfield_10026')
  })

  it('trả null khi instance không có field nào khớp', async () => {
    const { client } = fakeClient({ 'GET /rest/api/3/field': [{ id: 'x', name: 'Rank' }] })
    expect(await findStoryPointsFieldId(client)).toBeNull()
  })
})

describe('searchIssuesWithWorklogs', () => {
  it('dựng JQL đủ ba điều kiện: ngày, tác giả, project', async () => {
    const { client, calls } = fakeClient({
      'POST /rest/api/3/search/jql': { issues: [{ key: 'CAG-1', fields: { summary: 'S1' } }] },
    })

    const out = await searchIssuesWithWorklogs(client, {
      projects: ['CAG'], accountIds: ['u1', 'u2'], from: '2026-08-17', to: '2026-08-21',
    })

    const jql = (calls[0]!.body as { jql: string }).jql
    expect(jql).toContain('worklogDate >= "2026-08-17"')
    expect(jql).toContain('worklogDate <= "2026-08-21"')
    expect(jql).toContain('worklogAuthor in ("u1","u2")')
    expect(jql).toContain('project in ("CAG")')
    expect(out).toEqual([flatMeta('CAG-1', 'S1')])
    // parent/status/issuetype phải nằm trong fields, nếu không thì không có
    // đường nào biết quan hệ cha/con mà không thêm request.
    const fields = (calls[0]!.body as { fields: string[] }).fields
    expect(fields).toEqual(['summary', 'parent', 'status', 'issuetype'])
  })

  it('map parent + status + issuetype của sub-task', async () => {
    const { client } = fakeClient({
      'POST /rest/api/3/search/jql': {
        issues: [{
          key: 'CAG-3052',
          fields: {
            summary: 'Implement: queue a user move',
            parent: { key: 'CAG-2969', fields: { summary: 'Allow moving user via SCIM' } },
            status: { name: 'In Testing', statusCategory: { key: 'indeterminate' } },
            issuetype: { subtask: true },
          },
        }],
      },
    })
    expect(await searchIssuesWithWorklogs(client, {
      projects: [], accountIds: ['u1'], from: '2026-08-17', to: '2026-08-21',
    })).toEqual([{
      key: 'CAG-3052',
      summary: 'Implement: queue a user move',
      statusName: 'In Testing',
      statusCategory: 'indeterminate',
      parentKey: 'CAG-2969',
      parentSummary: 'Allow moving user via SCIM',
      isSubtask: true,
    }])
  })

  it('bỏ điều kiện project khi không chọn project nào', async () => {
    const { client, calls } = fakeClient({ 'POST /rest/api/3/search/jql': { issues: [] } })
    await searchIssuesWithWorklogs(client, {
      projects: [], accountIds: ['u1'], from: '2026-08-17', to: '2026-08-21',
    })
    expect((calls[0]!.body as { jql: string }).jql).not.toContain('project in')
  })

  it('trả rỗng ngay, không gọi Jira, khi không có member nào', async () => {
    // JQL "worklogAuthor in ()" là lỗi cú pháp; chặn ở đây thay vì để Jira 400.
    const { client, calls } = fakeClient({})
    expect(await searchIssuesWithWorklogs(client, {
      projects: ['CAG'], accountIds: [], from: '2026-08-17', to: '2026-08-21',
    })).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('theo hết các trang nextPageToken', async () => {
    let n = 0
    const client: JiraClient = {
      call: vi.fn(async (..._args: unknown[]) => {
        n += 1
        if (n === 1) {
          return { issues: [{ key: 'CAG-1', fields: { summary: 'S1' } }], nextPageToken: 'p2' } as never
        }
        return { issues: [{ key: 'CAG-2', fields: { summary: 'S2' } }] } as never
      }),
    }
    const out = await searchIssuesWithWorklogs(client, {
      projects: ['CAG'], accountIds: ['u1'], from: '2026-08-17', to: '2026-08-21',
    })
    expect(out.map((i) => i.key)).toEqual(['CAG-1', 'CAG-2'])
  })
})

describe('searchMyIssues', () => {
  it('dựng JQL đủ assignee, sprint, project', async () => {
    const { client, calls } = fakeClient({
      'POST /rest/api/3/search/jql': { issues: [{ key: 'CAG-1', fields: { summary: 'S1' } }] },
    })

    const out = await searchMyIssues(client, { projects: ['CAG', 'OPS'] })

    const jql = (calls[0]!.body as { jql: string }).jql
    expect(jql).toContain('assignee = currentUser()')
    expect(jql).toContain('sprint in openSprints()')
    expect(jql).toContain('project in ("CAG","OPS")')
    expect(jql).toContain('ORDER BY updated DESC')
    expect(out).toEqual([flatMeta('CAG-1', 'S1')])
    expect((calls[0]!.body as { fields: string[] }).fields)
      .toEqual(['summary', 'parent', 'status', 'issuetype'])
  })

  it('bỏ điều kiện project khi không chọn project nào', async () => {
    const { client, calls } = fakeClient({ 'POST /rest/api/3/search/jql': { issues: [] } })
    await searchMyIssues(client, { projects: [] })
    expect((calls[0]!.body as { jql: string }).jql).not.toContain('project in')
  })

  it('map issue Jira sang IssueMeta', async () => {
    const { client } = fakeClient({
      'POST /rest/api/3/search/jql': {
        issues: [
          {
            key: 'CAG-1',
            fields: {
              summary: 'Việc 1',
              status: { name: 'Closed', statusCategory: { key: 'done' } },
              issuetype: { subtask: false },
            },
          },
          { key: 'CAG-2', fields: { summary: 'Việc 2' } },
        ],
      },
    })
    expect(await searchMyIssues(client, { projects: [] })).toEqual([
      {
        key: 'CAG-1', summary: 'Việc 1', statusName: 'Closed',
        statusCategory: 'done', parentKey: null, parentSummary: null,
        isSubtask: false,
      },
      // Field thiếu (instance cũ, quyền hạn chế) không được làm vỡ gì.
      flatMeta('CAG-2', 'Việc 2'),
    ])
  })
})

describe('getIssueWorklogs', () => {
  it('map worklog Jira sang Worklog của core, dùng wall-clock', async () => {
    const { client } = fakeClient({
      'GET /rest/api/3/issue/CAG-1/worklog': {
        worklogs: [{
          id: '9001',
          author: { accountId: 'u1' },
          started: '2026-08-19T09:00:00.000+0700',
          timeSpentSeconds: 3600,
          comment: { type: 'doc', version: 1, content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'fix bug' }] },
          ] },
        }],
      },
    })

    const out = await getIssueWorklogs(client, 'CAG-1', 'Summary 1')

    expect(out).toEqual([{
      id: '9001', issueKey: 'CAG-1', issueSummary: 'Summary 1',
      authorAccountId: 'u1', date: '2026-08-19', startMinutes: 540,
      timeSpentSeconds: 3600, comment: 'fix bug',
    }])
  })

  it('comment rỗng hoặc thiếu → chuỗi rỗng, không crash', async () => {
    const { client } = fakeClient({
      'GET /rest/api/3/issue/CAG-1/worklog': {
        worklogs: [{
          id: '1', author: { accountId: 'u1' },
          started: '2026-08-19T09:00:00.000+0700', timeSpentSeconds: 60,
        }],
      },
    })
    expect((await getIssueWorklogs(client, 'CAG-1', 'S'))[0]!.comment).toBe('')
  })

  it('bỏ qua worklog có started không đọc được thay vì làm sập cả bảng', async () => {
    const { client } = fakeClient({
      'GET /rest/api/3/issue/CAG-1/worklog': {
        worklogs: [
          { id: '1', author: { accountId: 'u1' }, started: 'rác', timeSpentSeconds: 60 },
          { id: '2', author: { accountId: 'u1' }, started: '2026-08-19T09:00:00.000+0700', timeSpentSeconds: 60 },
        ],
      },
    })
    const out = await getIssueWorklogs(client, 'CAG-1', 'S')
    expect(out.map((w) => w.id)).toEqual(['2'])
  })
})

describe('addWorklog', () => {
  it('POST đúng payload và tắt notify', async () => {
    const { client, calls } = fakeClient({
      'POST /rest/api/3/issue/CAG-1/worklog': { id: '9002' },
    })

    const out = await addWorklog(client, {
      issueKey: 'CAG-1', startedIso: '2026-08-19T09:00:00.000+0700',
      timeSpentSeconds: 1800, comment: 'daily',
    })

    expect(out).toEqual({ id: '9002' })
    expect(calls[0]!.path).toContain('notifyUsers=false')
    const body = calls[0]!.body as { timeSpentSeconds: number; started: string; comment?: unknown }
    expect(body.timeSpentSeconds).toBe(1800)
    expect(body.started).toBe('2026-08-19T09:00:00.000+0700')
    expect(JSON.stringify(body.comment)).toContain('daily')
  })

  it('không gửi field comment khi comment rỗng', async () => {
    const { client, calls } = fakeClient({ 'POST /rest/api/3/issue/CAG-1/worklog': { id: '1' } })
    await addWorklog(client, {
      issueKey: 'CAG-1', startedIso: '2026-08-19T09:00:00.000+0700',
      timeSpentSeconds: 900, comment: '',
    })
    expect((calls[0]!.body as Record<string, unknown>)['comment']).toBeUndefined()
  })
})

describe('getActiveSprint', () => {
  it('trả sprint đang mở đầu tiên', async () => {
    const { client } = fakeClient({
      'GET /rest/agile/1.0/board/5/sprint': {
        values: [{ id: 42, name: 'Sprint 42', startDate: '2026-08-17T00:00:00.000Z', endDate: '2026-08-28T00:00:00.000Z' }],
      },
    })
    expect((await getActiveSprint(client, 5))?.id).toBe(42)
  })

  it('trả null khi board không có sprint đang mở', async () => {
    const { client } = fakeClient({ 'GET /rest/agile/1.0/board/5/sprint': { values: [] } })
    expect(await getActiveSprint(client, 5)).toBeNull()
  })
})

describe('getSprintIssues', () => {
  it('đọc story points từ custom field được truyền vào', async () => {
    const { client } = fakeClient({
      'GET /rest/agile/1.0/sprint/42/issue': {
        issues: [{
          key: 'CAG-1',
          fields: {
            summary: 'S1', status: { name: 'In Progress' },
            assignee: { displayName: 'Thanh Hoang' },
            timespent: 7200, customfield_10016: 3,
          },
        }],
      },
    })

    const out = await getSprintIssues(client, 42, 'customfield_10016')

    expect(out.issues).toEqual([{
      key: 'CAG-1', summary: 'S1', assigneeName: 'Thanh Hoang',
      status: 'In Progress', storyPoints: 3, timeSpentSeconds: 7200,
    }])
  })

  it('trả kèm map metadata: parent + statusCategory của sub-task', async () => {
    const { client, calls } = fakeClient({
      'GET /rest/agile/1.0/sprint/42/issue': {
        issues: [
          {
            key: 'CAG-3065',
            fields: {
              summary: 'Daily Scrum',
              parent: { key: 'CAG-3063', fields: { summary: 'S34 - Sprint activities' } },
              status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
              issuetype: { subtask: true },
              assignee: null, timespent: 900,
            },
          },
        ],
      },
    })
    const out = await getSprintIssues(client, 42, null)
    expect(out.meta['CAG-3065']).toEqual({
      key: 'CAG-3065', summary: 'Daily Scrum', statusName: 'In Progress',
      statusCategory: 'indeterminate', parentKey: 'CAG-3063',
      parentSummary: 'S34 - Sprint activities', isSubtask: true,
    })
    // SprintIssue KHÔNG đổi hình dạng — buildPointsTable ăn nó nguyên vẹn.
    expect(out.issues[0]!.timeSpentSeconds).toBe(900)
    expect(calls[0]!.path).toContain('fields=summary,parent,status,issuetype,assignee,timespent')
  })

  it('storyPoints null khi không biết field id', async () => {
    const { client } = fakeClient({
      'GET /rest/agile/1.0/sprint/42/issue': {
        issues: [{ key: 'CAG-1', fields: { summary: 'S1', status: { name: 'Open' }, assignee: null, timespent: null } }],
      },
    })
    const out = await getSprintIssues(client, 42, null)
    expect(out.issues[0]).toEqual({
      key: 'CAG-1', summary: 'S1', assigneeName: null,
      status: 'Open', storyPoints: null, timeSpentSeconds: 0,
    })
  })
})


describe('getActiveSprints', () => {
  it('trả TẤT CẢ sprint đang active — lúc rollover có thể hai cái', async () => {
    const { client } = fakeClient({
      'GET /rest/agile/1.0/board/42/sprint': {
        values: [
          { id: 34, name: 'S34', startDate: '2026-08-17T02:00:00.000Z', endDate: '2026-08-28T02:00:00.000Z' },
          { id: 35, name: 'S35', startDate: '2026-08-31T02:00:00.000Z', endDate: '2026-09-11T02:00:00.000Z' },
        ],
      },
    })
    const out = await getActiveSprints(client, 42)
    expect(out.map((s) => s.id)).toEqual([34, 35])
    expect(out[1]!.startDate).toBe('2026-08-31T02:00:00.000Z')
  })

  it('sprint thiếu startDate/endDate → chuỗi rỗng, không undefined', async () => {
    const { client } = fakeClient({
      'GET /rest/agile/1.0/board/42/sprint': { values: [{ id: 34, name: 'S34' }] },
    })
    expect((await getActiveSprints(client, 42))[0]).toEqual({
      id: 34, name: 'S34', startDate: '', endDate: '',
    })
  })

  it('không có sprint active → mảng rỗng, getActiveSprint trả null', async () => {
    const { client } = fakeClient({ 'GET /rest/agile/1.0/board/42/sprint': { values: [] } })
    expect(await getActiveSprints(client, 42)).toEqual([])
    const { client: c2 } = fakeClient({ 'GET /rest/agile/1.0/board/42/sprint': { values: [] } })
    expect(await getActiveSprint(c2, 42)).toBeNull()
  })
})

describe('searchSprintSubtasks', () => {
  const routes = {
    'POST /rest/api/3/search/jql': {
      issues: [
        { key: 'CAG-3065', fields: { summary: 'Daily Scrum' } },
        { key: 'CAG-3067', fields: { summary: 'Sprint Retro' } },
      ],
    },
  }

  it('MỘT request cho tất cả tên: các summary được OR trong cùng một JQL', async () => {
    const { client, calls } = fakeClient(routes)
    await searchSprintSubtasks(client, {
      projects: ['CAG'], summaries: ['Daily Scrum', 'Sprint Retro', 'Sprint Review'],
    })
    expect(calls).toHaveLength(1)
    const jql = (calls[0]!.body as { jql: string }).jql
    expect(jql).toContain('issuetype = Sub-task')
    expect(jql).toContain('sprint in openSprints()')
    expect(jql).toContain('project in ("CAG")')
    expect(jql).toContain(
      '(summary ~ "Daily Scrum" OR summary ~ "Sprint Retro" OR summary ~ "Sprint Review")',
    )
  })

  it('không truyền summaries → lấy toàn bộ sub-task của sprint (dropdown Options)', async () => {
    const { client, calls } = fakeClient(routes)
    const out = await searchSprintSubtasks(client, { projects: ['CAG'] })
    const jql = (calls[0]!.body as { jql: string }).jql
    expect(jql).not.toContain('summary ~')
    expect(out).toEqual([
      { key: 'CAG-3065', summary: 'Daily Scrum' },
      { key: 'CAG-3067', summary: 'Sprint Retro' },
    ])
  })

  it('bỏ summary rỗng thay vì sinh `summary ~ ""`', async () => {
    const { client, calls } = fakeClient(routes)
    await searchSprintSubtasks(client, { projects: [], summaries: ['', '  ', 'Daily Scrum'] })
    const jql = (calls[0]!.body as { jql: string }).jql
    expect(jql).toContain('(summary ~ "Daily Scrum")')
    expect(jql).not.toContain('""')
  })

  it('không có project nào → không thêm clause project', async () => {
    const { client, calls } = fakeClient(routes)
    await searchSprintSubtasks(client, { projects: [], summaries: ['Daily Scrum'] })
    expect((calls[0]!.body as { jql: string }).jql).not.toContain('project in')
  })

  it('escape dấu ngoặc kép trong tên — không làm vỡ cú pháp JQL', async () => {
    const { client, calls } = fakeClient(routes)
    await searchSprintSubtasks(client, { projects: [], summaries: ['Daily "Scrum"'] })
    expect((calls[0]!.body as { jql: string }).jql)
      .toContain('summary ~ "Daily \\"Scrum\\""')
  })
})

describe('filterKeysInSprint', () => {
  it('hỏi đúng một sprint id và chỉ những key đã tìm được', async () => {
    const { client, calls } = fakeClient({
      'POST /rest/api/3/search/jql': { issues: [{ key: 'CAG-3071' }] },
    })
    const out = await filterKeysInSprint(client, ['CAG-3065', 'CAG-3071'], 35)
    const jql = (calls[0]!.body as { jql: string }).jql
    expect(jql).toBe('sprint = 35 AND key in ("CAG-3065","CAG-3071")')
    expect(out).toEqual(['CAG-3071'])
  })

  it('không có key nào → không gọi Jira', async () => {
    const { client, calls } = fakeClient({})
    expect(await filterKeysInSprint(client, [], 35)).toEqual([])
    expect(calls).toHaveLength(0)
  })
})
