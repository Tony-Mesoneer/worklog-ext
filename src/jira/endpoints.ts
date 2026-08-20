// src/jira/endpoints.ts
import type { JiraClient } from './client'
import { parseStarted } from '@/core/jiraTime'
import type { Worklog } from '@/core/coverage'
import type { IssueMeta, IssueMetaMap } from '@/core/issue-hierarchy'
import { toStatusCategory } from '@/core/issue-hierarchy'
import type { SprintIssue } from '@/core/points'

// --- ADF helpers -----------------------------------------------------------
// Jira Cloud v3 dùng Atlassian Document Format cho comment. Ta chỉ cần một
// đoạn văn bản phẳng ở cả hai chiều.
type Adf = { type: string; content?: Adf[]; text?: string }

const toAdf = (text: string): Adf => ({
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
} as Adf)

const adfToText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return ''
  const n = node as Adf
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.content)) return n.content.map(adfToText).join('')
  return ''
}

// --- identity & fields -----------------------------------------------------
export async function getMyself(c: JiraClient) {
  return c.call<{ accountId: string; displayName: string; timeZone: string }>({
    method: 'GET', path: '/rest/api/3/myself',
  })
}

const STORY_POINT_NAMES = ['Story Points', 'Story point estimate']

// Id của field Story Points khác nhau giữa các Jira instance, nên dò thay vì
// hardcode. Kết quả được cache vào config.storyPointsFieldId.
export async function findStoryPointsFieldId(c: JiraClient): Promise<string | null> {
  const fields = await c.call<{ id: string; name: string }[]>({
    method: 'GET', path: '/rest/api/3/field',
  })
  for (const name of STORY_POINT_NAMES) {
    const hit = fields.find((f) => f.name === name)
    if (hit) return hit.id
  }
  return null
}

// --- issue metadata --------------------------------------------------------
// Bốn field này KHÔNG tốn request nào thêm: chúng chỉ được thêm vào `fields` của
// những search vốn đã chạy.
//   - `parent`     → { key, fields: { summary } } trên sub-task, thiếu ở issue
//                    cấp trên. Đây là nguồn duy nhất của quan hệ cha/con.
//   - `status`     → tên workflow thật + statusCategory.key để chọn màu.
//   - `issuetype`  → cờ `subtask`.
//   - `project`    → { key } — project THẬT của issue. Đây là lý do không cắt
//                    tiền tố của issue key: xem IssueMeta.projectKey.
export const ISSUE_META_FIELDS = ['summary', 'parent', 'status', 'issuetype', 'project'] as const

type IssueFields = {
  summary?: unknown
  parent?: { key?: unknown; fields?: { summary?: unknown } } | null
  status?: { name?: unknown; statusCategory?: { key?: unknown } | null } | null
  issuetype?: { subtask?: unknown } | null
  project?: { key?: unknown } | null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// Một chỗ duy nhất map fields của Jira sang IssueMeta, dùng cho cả ba search.
// Mọi field đều được coi là CÓ THỂ THIẾU: instance cũ, issue type lạ, hoặc field
// bị khoá quyền đều làm Jira bỏ field ra khỏi response mà không báo lỗi.
export function toIssueMeta(key: string, fields: IssueFields | undefined): IssueMeta {
  const f = fields ?? {}
  const parentKey = str(f.parent?.key)
  const projectKey = str(f.project?.key)
  return {
    key,
    summary: str(f.summary),
    statusName: str(f.status?.name),
    statusCategory: toStatusCategory(f.status?.statusCategory?.key),
    projectKey: projectKey === '' ? null : projectKey,
    parentKey: parentKey === '' ? null : parentKey,
    parentSummary: parentKey === '' ? null : str(f.parent?.fields?.summary),
    isSubtask: f.issuetype?.subtask === true,
  }
}

export const toIssueMetaMap = (items: readonly IssueMeta[]): IssueMetaMap =>
  Object.fromEntries(items.map((m) => [m.key, m]))

// --- worklog search --------------------------------------------------------
export async function searchIssuesWithWorklogs(
  c: JiraClient,
  args: { projects: string[]; accountIds: string[]; from: string; to: string },
): Promise<IssueMeta[]> {
  // "worklogAuthor in ()" là lỗi cú pháp JQL — chặn trước khi gọi Jira.
  if (args.accountIds.length === 0) return []

  const authors = args.accountIds.map((a) => `"${a}"`).join(',')
  const clauses = [
    `worklogDate >= "${args.from}"`,
    `worklogDate <= "${args.to}"`,
    `worklogAuthor in (${authors})`,
  ]
  if (args.projects.length > 0) {
    clauses.push(`project in (${args.projects.map((p) => `"${p}"`).join(',')})`)
  }
  const jql = clauses.join(' AND ')

  const out: IssueMeta[] = []
  let nextPageToken: string | undefined

  do {
    const page = await c.call<{
      issues: { key: string; fields: IssueFields }[]
      nextPageToken?: string
    }>({
      method: 'POST',
      path: '/rest/api/3/search/jql',
      body: { jql, fields: [...ISSUE_META_FIELDS], maxResults: 100, nextPageToken },
    })
    for (const i of page.issues) out.push(toIssueMeta(i.key, i.fields))
    nextPageToken = page.nextPageToken
  } while (nextPageToken)

  return out
}

// Danh sách issue của chính người dùng trong sprint hiện tại, dùng làm lựa
// chọn mặc định ở side panel (spec §7) thay vì bắt gõ ≥2 ký tự.
export async function searchMyIssues(
  c: JiraClient, args: { projects: string[] },
): Promise<IssueMeta[]> {
  const clauses = ['assignee = currentUser()', 'sprint in openSprints()']
  if (args.projects.length > 0) {
    clauses.push(`project in (${args.projects.map((p) => `"${p}"`).join(',')})`)
  }
  const jql = `${clauses.join(' AND ')} ORDER BY updated DESC`

  const res = await c.call<{
    issues: { key: string; fields: IssueFields }[]
  }>({
    method: 'POST',
    path: '/rest/api/3/search/jql',
    body: { jql, fields: [...ISSUE_META_FIELDS], maxResults: 50 },
  })
  return res.issues.map((i) => toIssueMeta(i.key, i.fields))
}

export async function getIssueWorklogs(
  c: JiraClient, issueKey: string, issueSummary: string,
): Promise<Worklog[]> {
  const res = await c.call<{
    worklogs: {
      id: string
      author?: { accountId?: string }
      started: string
      timeSpentSeconds: number
      comment?: unknown
    }[]
  }>({ method: 'GET', path: `/rest/api/3/issue/${issueKey}/worklog` })

  const out: Worklog[] = []
  for (const w of res.worklogs) {
    let parsed: { date: string; minutes: number }
    try {
      parsed = parseStarted(w.started)
    } catch {
      // Một worklog rác không được làm sập cả bảng của team.
      console.warn(`[jira] bỏ qua worklog ${w.id} của ${issueKey}: started không đọc được`)
      continue
    }
    out.push({
      id: w.id,
      issueKey,
      issueSummary,
      authorAccountId: w.author?.accountId ?? '',
      date: parsed.date,
      startMinutes: parsed.minutes,
      timeSpentSeconds: w.timeSpentSeconds,
      comment: adfToText(w.comment),
    })
  }
  return out
}

export async function addWorklog(
  c: JiraClient,
  args: { issueKey: string; startedIso: string; timeSpentSeconds: number; comment: string },
): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    timeSpentSeconds: args.timeSpentSeconds,
    started: args.startedIso,
  }
  if (args.comment !== '') body['comment'] = toAdf(args.comment)

  return c.call<{ id: string }>({
    method: 'POST',
    path: `/rest/api/3/issue/${args.issueKey}/worklog?notifyUsers=false`,
    body,
  })
}

export async function deleteWorklog(
  c: JiraClient, issueKey: string, worklogId: string,
): Promise<void> {
  await c.call<null>({
    method: 'DELETE',
    path: `/rest/api/3/issue/${issueKey}/worklog/${worklogId}?notifyUsers=false`,
  })
}

// --- pickers ---------------------------------------------------------------
export async function pickIssues(
  c: JiraClient, query: string,
): Promise<{ key: string; summary: string }[]> {
  const res = await c.call<{
    sections: { issues: { key: string; summaryText: string }[] }[]
  }>({
    method: 'GET',
    path: `/rest/api/3/issue/picker?query=${encodeURIComponent(query)}`,
  })
  const seen = new Set<string>()
  const out: { key: string; summary: string }[] = []
  for (const section of res.sections ?? []) {
    for (const i of section.issues ?? []) {
      if (seen.has(i.key)) continue
      seen.add(i.key)
      out.push({ key: i.key, summary: i.summaryText })
    }
  }
  return out
}

export async function searchUsers(
  c: JiraClient, query: string,
): Promise<{ accountId: string; displayName: string }[]> {
  const res = await c.call<{ accountId: string; displayName: string }[]>({
    method: 'GET',
    path: `/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=50`,
  })
  return res.map((u) => ({ accountId: u.accountId, displayName: u.displayName }))
}

// --- agile -----------------------------------------------------------------
export async function getBoards(
  c: JiraClient, projectKey: string,
): Promise<{ id: number; name: string }[]> {
  const res = await c.call<{ values: { id: number; name: string }[] }>({
    method: 'GET',
    path: `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}`,
  })
  return res.values
}

export type Sprint = { id: number; name: string; startDate: string; endDate: string }

// TẤT CẢ sprint đang active, không chỉ cái đầu. Lúc chuyển sprint Jira có thể
// có hai sprint active cùng lúc — biết cả hai là điều kiện để tie-break
// ceremony (xem core/event-resolve).
export async function getActiveSprints(
  c: JiraClient, boardId: number,
): Promise<Sprint[]> {
  const res = await c.call<{
    values: { id: number; name: string; startDate?: string; endDate?: string }[]
  }>({ method: 'GET', path: `/rest/agile/1.0/board/${boardId}/sprint?state=active` })

  return res.values.map((s) => ({
    id: s.id, name: s.name,
    startDate: s.startDate ?? '', endDate: s.endDate ?? '',
  }))
}

export async function getActiveSprint(
  c: JiraClient, boardId: number,
): Promise<Sprint | null> {
  return (await getActiveSprints(c, boardId))[0] ?? null
}

// --- ceremony sub-task -----------------------------------------------------

// Chuỗi trong JQL: `\` và `"` phải escape, không thì một tên chứa dấu ngoặc kép
// làm cả query sai cú pháp và Jira trả 400 không đọc được.
const jqlString = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

// MỘT request cho TẤT CẢ ceremony: các tên được OR vào cùng một JQL thay vì mỗi
// event một round-trip. Đổi lại, kết quả là một rổ trộn — `~` của Jira là fuzzy
// match theo từ nên "Sprint Review" cũng kéo "Sprint Retro" về. Việc đối chiếu
// tên chính xác nằm ở core/event-resolve, KHÔNG ở đây.
//
// `summaries` rỗng → lấy toàn bộ sub-task trong sprint đang mở (dropdown Options).
//
// Trả IssueMeta (chứ không chỉ key + summary) vì `parent` đi kèm KHÔNG tốn
// request nào thêm — nó chỉ là một field nữa trong search vốn đã chạy — và
// dropdown ở Options cần tên cha để phân biệt các sub-task trùng tên. Đường
// tra ceremony vẫn chỉ dùng key + summary.
export async function searchSprintSubtasks(
  c: JiraClient, args: { projects: string[]; summaries?: string[] },
): Promise<IssueMeta[]> {
  const clauses = ['issuetype = Sub-task', 'sprint in openSprints()']
  if (args.projects.length > 0) {
    clauses.push(`project in (${args.projects.map((p) => jqlString(p)).join(',')})`)
  }
  const wanted = (args.summaries ?? []).map((s) => s.trim()).filter((s) => s !== '')
  if (wanted.length > 0) {
    clauses.push(`(${wanted.map((s) => `summary ~ ${jqlString(s)}`).join(' OR ')})`)
  }
  const jql = `${clauses.join(' AND ')} ORDER BY summary ASC`

  const res = await c.call<{
    issues: { key: string; fields: IssueFields }[]
  }>({
    method: 'POST',
    path: '/rest/api/3/search/jql',
    body: { jql, fields: [...ISSUE_META_FIELDS], maxResults: 100 },
  })
  return res.issues.map((i) => toIssueMeta(i.key, i.fields))
}

// Lọc ra những key thuộc đúng một sprint. Chỉ cần khi có NHIỀU sprint đang mở:
// lúc đó phải biết ứng viên nào của sprint nào mới tie-break được. Một sprint
// đang mở (trường hợp thường ngày) thì không tốn request nào.
export async function filterKeysInSprint(
  c: JiraClient, keys: string[], sprintId: number,
): Promise<string[]> {
  if (keys.length === 0) return []
  const jql =
    `sprint = ${sprintId} AND key in (${keys.map((k) => jqlString(k)).join(',')})`
  const res = await c.call<{ issues: { key: string }[] }>({
    method: 'POST',
    path: '/rest/api/3/search/jql',
    body: { jql, fields: ['summary'], maxResults: 100 },
  })
  return res.issues.map((i) => i.key)
}

export async function getSprintIssues(
  c: JiraClient, sprintId: number, storyPointsFieldId: string | null,
): Promise<{ issues: SprintIssue[]; meta: IssueMetaMap }> {
  const fields = [...ISSUE_META_FIELDS, 'assignee', 'timespent']
  if (storyPointsFieldId) fields.push(storyPointsFieldId)

  const res = await c.call<{
    issues: { key: string; fields: Record<string, unknown> }[]
  }>({
    method: 'GET',
    path: `/rest/agile/1.0/sprint/${sprintId}/issue?fields=${fields.join(',')}&maxResults=100`,
  })

  const issues = res.issues.map((i) => {
    const f = i.fields
    const sp = storyPointsFieldId ? f[storyPointsFieldId] : null
    const assignee = f['assignee'] as { displayName?: string } | null
    const status = f['status'] as { name?: string } | null
    return {
      key: i.key,
      summary: String(f['summary'] ?? ''),
      assigneeName: assignee?.displayName ?? null,
      status: status?.name ?? '',
      storyPoints: typeof sp === 'number' ? sp : null,
      timeSpentSeconds: typeof f['timespent'] === 'number' ? f['timespent'] : 0,
    }
  })

  // `SprintIssue` KHÔNG đổi (buildPointsTable ăn nó nguyên vẹn); metadata đi
  // thành map riêng bên cạnh, đúng như ở đường coverage.
  const meta = toIssueMetaMap(
    res.issues.map((i) => toIssueMeta(i.key, i.fields as IssueFields)),
  )
  return { issues, meta }
}
