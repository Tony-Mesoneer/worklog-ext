import {
  snapshotKey, isStale, snapshotKeysToEvict, parseSnapshotKey,
  SNAPSHOT_TTL_MS, SNAPSHOT_MAX_KEYS, type Scope,
} from '@/core/snapshot-key'
import type { Worklog } from '@/core/coverage'
import type { IssueMetaMap } from '@/core/issue-hierarchy'

// `meta` OPTIONAL có chủ ý: snapshot đã nằm trong storage.local từ trước khi có
// tính năng cha/con không có field này, và một cache cũ phải đọc được chứ không
// được làm cả dashboard vỡ. Thiếu = rỗng (xem snapshotMeta).
//
// Snapshot ghi trước khi scope bỏ `projects` mang key hình dạng CŨ (xem
// SNAPSHOT_SCOPE_VERSION), nên nó không bao giờ được đọc lên dưới hình dạng
// mới — không có đường nào để dữ liệu ĐÃ LỌC theo project bị hiểu là dữ liệu
// không lọc. Chúng chỉ còn chờ pruneSnapshots dọn.
export type Snapshot = {
  fetchedAt: number
  worklogs: Worklog[]
  meta?: IssueMetaMap
}

/** Map metadata của một snapshot; snapshot cũ (không có field) → rỗng. */
export const snapshotMeta = (s: Snapshot): IssueMetaMap => s.meta ?? {}

export async function readSnapshot(
  scope: Scope,
): Promise<{ snapshot: Snapshot; stale: boolean } | null> {
  const key = snapshotKey(scope)
  const res = await chrome.storage.local.get(key)
  const snapshot = res[key] as Snapshot | undefined
  if (!snapshot) return null
  return { snapshot, stale: isStale(snapshot.fetchedAt, Date.now(), SNAPSHOT_TTL_MS) }
}

export async function writeSnapshot(
  scope: Scope, worklogs: Worklog[], now: number, meta: IssueMetaMap = {},
): Promise<void> {
  await chrome.storage.local.set({
    [snapshotKey(scope)]: { fetchedAt: now, worklogs, meta } satisfies Snapshot,
  })
}

// Sau khi log hoặc undo, patch tại chỗ thay vì refetch: side panel phải phản hồi
// tức thì, và một worklog vừa ghi thì ta đã biết đủ thông tin về nó.
export async function patchSnapshot(
  scope: Scope, add: Worklog[], removeIds: string[],
): Promise<void> {
  const existing = await readSnapshot(scope)
  if (!existing) return
  const remove = new Set(removeIds)
  const worklogs = [
    ...existing.snapshot.worklogs.filter((w) => !remove.has(w.id)),
    ...add,
  ]
  await chrome.storage.local.set({
    [snapshotKey(scope)]: {
      fetchedAt: existing.snapshot.fetchedAt, worklogs,
      // Giữ nguyên meta: patch chỉ thêm/bớt worklog, không biết gì mới về issue.
      meta: snapshotMeta(existing.snapshot),
    } satisfies Snapshot,
  })
}

/**
 * Bỏ những worklog vừa bị xoá khỏi MỌI snapshot đang chứa chúng.
 *
 * Vì sao phải quét hết: service worker không biết dashboard đang xem khoảng ngày
 * nào — scope do UI chọn, và một worklog có thể nằm trong nhiều snapshot cùng
 * lúc (sprint, tuần này, tháng này). Không dọn thì dashboard còn hiện giờ ĐÃ XOÁ
 * cho tới khi hết TTL, và đó là loại sai mà người dùng báo lỗi ngay.
 *
 * Lọc theo ID CHỨ KHÔNG theo khoảng ngày/tác giả: worklog id là duy nhất trong
 * một Jira instance, nên "snapshot nào chứa id này" đã là câu trả lời chính xác.
 * Lọc thêm theo scope chỉ thêm một đường để bỏ sót — và cần `date` + `accountId`
 * mà message `worklog/delete` không mang.
 *
 * Chỉ làm phía XOÁ, không làm phía thêm: patch một worklog MỚI vào snapshot cần
 * `issueSummary` mà handler không có (message `worklog/add` chỉ mang issue key),
 * và ghi vào đó chuỗi rỗng sẽ hiện một hàng issue trắng trong dashboard — tệ hơn
 * một hàng cũ 5 phút.
 *
 * fetchedAt và meta giữ nguyên: đây là sửa tại chỗ, không phải một lần fetch mới.
 */
export async function removeWorklogsFromSnapshots(worklogIds: string[]): Promise<void> {
  if (worklogIds.length === 0) return
  const remove = new Set(worklogIds)
  const all = await chrome.storage.local.get(null)

  const patch: Record<string, Snapshot> = {}
  for (const [key, value] of Object.entries(all)) {
    // Key lạ, hoặc scope version cũ (không bao giờ được đọc lên) → bỏ qua.
    if (parseSnapshotKey(key) === null) continue
    const snapshot = value as Snapshot
    if (!Array.isArray(snapshot.worklogs)) continue
    const worklogs = snapshot.worklogs.filter((w) => !remove.has(w.id))
    if (worklogs.length === snapshot.worklogs.length) continue
    patch[key] = {
      fetchedAt: snapshot.fetchedAt, worklogs, meta: snapshotMeta(snapshot),
    }
  }
  if (Object.keys(patch).length > 0) await chrome.storage.local.set(patch)
}

// Dọn snapshot cũ: mỗi (from, to, accountIds) là một key vĩnh viễn,
// không dọn thì storage.local đầy dần tới lúc quota vỡ. Chỉ chạm key có prefix
// `snapshot:` — `config` không bao giờ bị xoá.
export async function pruneSnapshots(cap: number = SNAPSHOT_MAX_KEYS): Promise<void> {
  const all = await chrome.storage.local.get(null)
  const metas = Object.entries(all)
    .filter(([k]) => k.startsWith('snapshot:'))
    .map(([key, value]) => ({
      key,
      fetchedAt:
        typeof value === 'object' && value !== null && typeof (value as Snapshot).fetchedAt === 'number'
          ? (value as Snapshot).fetchedAt
          : 0,
    }))
  const evict = snapshotKeysToEvict(metas, cap)
  if (evict.length > 0) await chrome.storage.local.remove(evict)
}
