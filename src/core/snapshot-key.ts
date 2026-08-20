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

// Trần số snapshot được giữ. Mỗi tuple (projects, from, to, accountIds) sinh
// một key mới và không có gì tự xoá, nên không có trần thì storage.local đầy
// dần cho tới khi quota ~10MB vỡ.
export const SNAPSHOT_MAX_KEYS = 30

export type SnapshotMeta = { key: string; fetchedAt: number }

// Trả về các key cần xoá để còn lại tối đa `cap` snapshot, loại cũ nhất trước.
// Thuần logic để test được không cần chrome.
export function snapshotKeysToEvict(
  metas: SnapshotMeta[],
  cap: number = SNAPSHOT_MAX_KEYS,
): string[] {
  if (cap <= 0) return metas.map((m) => m.key)
  if (metas.length <= cap) return []
  // fetchedAt tăng dần → phần đầu là cũ nhất. Tie-break theo key để kết quả
  // ổn định, tránh test và hành vi phụ thuộc thứ tự Object.entries.
  const sorted = [...metas].sort(
    (a, b) => a.fetchedAt - b.fetchedAt || a.key.localeCompare(b.key),
  )
  return sorted.slice(0, metas.length - cap).map((m) => m.key)
}
