import { describe, it, expect } from 'vitest'
import { snapshotKey, isStale, SNAPSHOT_TTL_MS } from '@/core/snapshot-key'

const scope = {
  projects: ['CAG'],
  from: '2026-08-17',
  to: '2026-08-21',
  accountIds: ['u1', 'u2'],
}

describe('snapshotKey', () => {
  it('cùng scope → cùng key', () => {
    expect(snapshotKey(scope)).toBe(snapshotKey({ ...scope }))
  })

  it('không phụ thuộc thứ tự project và accountId', () => {
    // Nếu thứ tự ảnh hưởng key, cache miss vô cớ mỗi lần UI đổi thứ tự chọn.
    expect(snapshotKey({ ...scope, accountIds: ['u2', 'u1'] })).toBe(snapshotKey(scope))
    expect(snapshotKey({ ...scope, projects: ['CAG'] })).toBe(snapshotKey(scope))
  })

  it('đổi date range → khác key', () => {
    expect(snapshotKey({ ...scope, to: '2026-08-22' })).not.toBe(snapshotKey(scope))
  })

  it('đổi member → khác key', () => {
    expect(snapshotKey({ ...scope, accountIds: ['u1'] })).not.toBe(snapshotKey(scope))
  })

  it('key có prefix nhận dạng được để dọn cache', () => {
    expect(snapshotKey(scope).startsWith('snapshot:')).toBe(true)
  })
})

describe('isStale', () => {
  it('mới fetch thì chưa stale', () => {
    expect(isStale(1000, 1000 + SNAPSHOT_TTL_MS - 1, SNAPSHOT_TTL_MS)).toBe(false)
  })

  it('đúng hoặc quá TTL thì stale', () => {
    expect(isStale(1000, 1000 + SNAPSHOT_TTL_MS, SNAPSHOT_TTL_MS)).toBe(true)
  })

  it('fetchedAt trong tương lai (đồng hồ máy nhảy) coi là stale', () => {
    expect(isStale(5000, 1000, SNAPSHOT_TTL_MS)).toBe(true)
  })
})
