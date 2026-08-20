import type { Config } from '@/core/config-schema'
import type { Worklog } from '@/core/coverage'
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
  | { type: 'users/search'; query: string }
  | { type: 'boards/load'; projectKey: string }
  | { type: 'sprint/current' }
  | { type: 'coverage/load'; scope: Scope; force: boolean }
  | { type: 'points/load' }
  | { type: 'dashboard/open' }

export type Reply =
  | { ok: true; data: unknown }
  | { ok: false; error: string; status?: number }

export type AuthProbeResult = {
  mode: 'cookie' | 'token'
  accountId: string
  displayName: string
  timeZone: string
}

export type DayLoadResult = { worklogs: Worklog[] }
export type CoverageLoadResult = { worklogs: Worklog[]; fetchedAt: number; stale: boolean }
export type PointsLoadResult = { sprintName: string; issues: SprintIssue[] }
export type SprintCurrentResult = { name: string; from: string; to: string } | null

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
