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

// Helper dùng ở cả ba bề mặt UI. Nó ném Error với message đọc được để
// component chỉ cần try/catch một chỗ.
export async function send<T>(message: Message): Promise<T> {
  const reply = (await chrome.runtime.sendMessage(message)) as Reply | undefined
  if (!reply) throw new Error('Service worker không trả lời')
  if (!reply.ok) throw new Error(reply.error)
  return reply.data as T
}
