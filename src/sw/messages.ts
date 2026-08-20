import type { Config } from '@/core/config-schema'
import type { Worklog } from '@/core/coverage'
import type { ResolvedSprintEvent } from '@/core/event-resolve'
import type { IssueMeta, IssueMetaMap } from '@/core/issue-hierarchy'
import type { SprintIssue } from '@/core/points'
import type { Scope } from '@/core/snapshot-key'

export type Message =
  | { type: 'config/load' }
  | { type: 'config/save'; patch: Partial<Config> }
  | { type: 'auth/probe' }
  | { type: 'permission/request'; origin: string }
  | { type: 'day/load'; date: string }
  | { type: 'worklog/add'; issueKey: string; date: string; startMinutes: number; timeSpentSeconds: number; comment: string }
  | { type: 'worklog/delete'; issueKey: string; worklogId: string }
  | { type: 'issues/pick'; query: string }
  | { type: 'issues/mine' }
  | { type: 'users/search'; query: string }
  | { type: 'boards/load'; projectKey: string }
  | { type: 'sprint/current' }
  // Tra issue key cho sprint event theo TÊN sub-task. `force` bỏ qua cache khi
  // người dùng bấm thử lại (cache không có TTL, nên đây là đường làm mới duy nhất).
  | { type: 'events/resolve'; force: boolean }
  // Danh sách sub-task trong sprint đang mở — nguồn cho dropdown ở Options, để
  // người dùng CHỌN tên chứ không gõ tay (một lỗi chính tả = nút chết im lặng).
  // Mang theo cả `parent`: nhiều sub-task trong cùng sprint có thể TRÙNG TÊN
  // ("Security Review" mỗi story một cái), và cha là thứ duy nhất phân biệt.
  | { type: 'ceremonies/list' }
  | { type: 'coverage/load'; scope: Scope; force: boolean }
  | { type: 'points/load' }
  | { type: 'dashboard/open' }
  // Trạng thái update ĐÃ BIẾT, đọc từ cache, không gọi mạng — UI gọi cái này
  // lúc mở lên. `update/check` mới là đường ra GitHub; `force` phân biệt lượt
  // tự động (tôn trọng interval) với lượt người dùng bấm "Kiểm tra ngay".
  | { type: 'update/status' }
  | { type: 'update/check'; force: boolean }
  | { type: 'update/dismiss'; version: string }

export type Reply =
  | { ok: true; data: unknown }
  | { ok: false; error: string; status?: number }

export type AuthProbeResult = {
  mode: 'cookie' | 'token'
  accountId: string
  displayName: string
  timeZone: string
}

// Một `worklog/add` có thể sinh NHIỀU worklog khi yêu cầu đi qua giờ nghỉ.
// Trả về mảng id (theo thứ tự thời gian) để undo xoá được hết.
export type WorklogAddResult = { ids: string[] }

// `meta` đi CẠNH worklogs, không nằm trong Worklog: xem src/core/issue-hierarchy.
// Khoá theo issue key, và issue nào không có trong map thì UI coi là "chưa biết"
// — snapshot cache từ trước thay đổi này đơn giản trả về map rỗng.
export type DayLoadResult = { worklogs: Worklog[]; meta: IssueMetaMap }
export type CoverageLoadResult = {
  worklogs: Worklog[]
  meta: IssueMetaMap
  fetchedAt: number
  stale: boolean
}
export type PointsLoadResult = {
  sprintName: string
  issues: SprintIssue[]
  meta: IssueMetaMap
}
// Danh sách "issue của tôi trong sprint" mang đủ status + parent, vì nó đi qua
// /search/jql. Đường GÕ TÌM (`issues/pick`) dùng /issue/picker và chỉ có key +
// summary — bất đối xứng CÓ CHỦ Ý, xem IssuePicker.
export type IssuesMineResult = IssueMeta[]
export type SprintCurrentResult = { name: string; from: string; to: string } | null

// `events` song song với config.sprintEvents (cùng thứ tự, cùng độ dài).
// issueKey null = UI PHẢI khoá nút và hiện `reason`.
export type EventsResolveResult = {
  sprintName: string
  events: ResolvedSprintEvent[]
}
// Dùng lại IssueMeta thay vì một type riêng: nó đã mang parentKey/parentSummary,
// và `parent` nằm sẵn trong field list của search sub-task.
export type CeremoniesListResult = IssueMeta[]

// Lỗi mang theo HTTP status. Không có nó thì UI không phân biệt được 401/403
// (cần banner "session hết hạn" + link Options theo spec §13) với lỗi thường.
export class MessageError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'MessageError'
  }
}

// Helper dùng ở cả ba bề mặt UI. Nó ném MessageError với message đọc được để
// component chỉ cần try/catch một chỗ.
export async function send<T>(message: Message): Promise<T> {
  const reply = (await chrome.runtime.sendMessage(message)) as Reply | undefined
  if (!reply) throw new MessageError('Service worker không trả lời')
  if (!reply.ok) throw new MessageError(reply.error, reply.status)
  return reply.data as T
}
