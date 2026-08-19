// tests/jira/endpoints.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  findStoryPointsFieldId, searchIssuesWithWorklogs, getIssueWorklogs,
  addWorklog, getSprintIssues, getActiveSprint,
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
    expect(out).toEqual([{ key: 'CAG-1', summary: 'S1' }])
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

    expect(out).toEqual([{
      key: 'CAG-1', summary: 'S1', assigneeName: 'Thanh Hoang',
      status: 'In Progress', storyPoints: 3, timeSpentSeconds: 7200,
    }])
  })

  it('storyPoints null khi không biết field id', async () => {
    const { client } = fakeClient({
      'GET /rest/agile/1.0/sprint/42/issue': {
        issues: [{ key: 'CAG-1', fields: { summary: 'S1', status: { name: 'Open' }, assignee: null, timespent: null } }],
      },
    })
    const out = await getSprintIssues(client, 42, null)
    expect(out[0]).toEqual({
      key: 'CAG-1', summary: 'S1', assigneeName: null,
      status: 'Open', storyPoints: null, timeSpentSeconds: 0,
    })
  })
})
