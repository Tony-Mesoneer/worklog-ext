import {
  snapshotKey, isStale, snapshotKeysToEvict,
  SNAPSHOT_TTL_MS, SNAPSHOT_MAX_KEYS, type Scope,
} from '@/core/snapshot-key'
import type { Worklog } from '@/core/coverage'

export type Snapshot = { fetchedAt: number; worklogs: Worklog[] }

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
  scope: Scope, worklogs: Worklog[], now: number,
): Promise<void> {
  await chrome.storage.local.set({
    [snapshotKey(scope)]: { fetchedAt: now, worklogs } satisfies Snapshot,
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
    } satisfies Snapshot,
  })
}

// Dọn snapshot cũ: mỗi (projects, from, to, accountIds) là một key vĩnh viễn,
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
