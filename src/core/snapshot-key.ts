export const SNAPSHOT_TTL_MS = 5 * 60 * 1000

/**
 * Phạm vi của một snapshot coverage: TÁC GIẢ + KHOẢNG NGÀY, không có project.
 *
 * `projects` đã bị bỏ khỏi đây cùng lúc với việc bỏ mệnh đề `project in (…)`
 * khỏi query — hai thứ phải đi cùng nhau. Nếu scope còn mang projects trong khi
 * query không lọc nữa, một snapshot ĐÃ LỌC cũ và một snapshot KHÔNG LỌC mới sẽ
 * chung key: lead thấy dữ liệu bị lọc dưới nhãn "tất cả project", thiếu giờ
 * thật mà không có lỗi nào ở đâu cả.
 */
export type Scope = {
  from: string
  to: string
  accountIds: string[]
}

/**
 * Phiên bản HÌNH DẠNG của scope, nằm ngay trong key. Snapshot ghi trước thay
 * đổi này có key kiểu `snapshot:CAG|…` nên không bao giờ khớp `snapshot:v2|…`
 * — nó đơn giản là KHÔNG TỒN TẠI với readSnapshot, đúng lối "cache cũ = thiếu,
 * không phải lỗi" mà migrateConfig và `Snapshot.meta` đang dùng. pruneSnapshots
 * vẫn nhặt chúng theo prefix `snapshot:` nên chúng không nằm lại mãi.
 */
export const SNAPSHOT_SCOPE_VERSION = 'v2'

// Sort trước khi ghép: UI có thể trả về thứ tự khác nhau cho cùng một lựa chọn,
// và ta không muốn cache miss chỉ vì thứ tự.
export function snapshotKey(scope: Scope): string {
  const a = [...scope.accountIds].sort().join(',')
  return `snapshot:${SNAPSHOT_SCOPE_VERSION}|${scope.from}|${scope.to}|${a}`
}

export function isStale(fetchedAt: number, now: number, ttlMs: number): boolean {
  const age = now - fetchedAt
  // age < 0 nghĩa là đồng hồ nhảy về quá khứ; coi là stale để fetch lại cho chắc.
  return age < 0 || age >= ttlMs
}

// Trần số snapshot được giữ. Mỗi tuple (from, to, accountIds) sinh
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
