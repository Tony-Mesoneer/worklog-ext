import { snapshotKey, isStale, SNAPSHOT_TTL_MS, type Scope } from '@/core/snapshot-key'
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
