export const SNAPSHOT_TTL_MS = 5 * 60 * 1000

export type Scope = {
  projects: string[]
  from: string
  to: string
  accountIds: string[]
}

// Sort trước khi ghép: UI có thể trả về thứ tự khác nhau cho cùng một lựa chọn,
// và ta không muốn cache miss chỉ vì thứ tự.
export function snapshotKey(scope: Scope): string {
  const p = [...scope.projects].sort().join(',')
  const a = [...scope.accountIds].sort().join(',')
  return `snapshot:${p}|${scope.from}|${scope.to}|${a}`
}

export function isStale(fetchedAt: number, now: number, ttlMs: number): boolean {
  const age = now - fetchedAt
  // age < 0 nghĩa là đồng hồ nhảy về quá khứ; coi là stale để fetch lại cho chắc.
  return age < 0 || age >= ttlMs
}
