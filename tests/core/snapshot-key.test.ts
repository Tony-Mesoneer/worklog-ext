import { describe, it, expect } from 'vitest'
import {
  snapshotKey, isStale, snapshotKeysToEvict,
  SNAPSHOT_TTL_MS, SNAPSHOT_MAX_KEYS,
} from '@/core/snapshot-key'

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
    // Phải đảo thứ tự THẬT: truyền lại ['CAG'] thì test không quan sát được gì.
    expect(snapshotKey({ ...scope, projects: ['CAG', 'ZZZ'] }))
      .toBe(snapshotKey({ ...scope, projects: ['ZZZ', 'CAG'] }))
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

describe('snapshotKeysToEvict', () => {
  const meta = (key: string, fetchedAt: number) => ({ key, fetchedAt })

  it('dưới trần thì không xoá gì', () => {
    expect(snapshotKeysToEvict([meta('a', 1), meta('b', 2)], 3)).toEqual([])
    expect(snapshotKeysToEvict([meta('a', 1), meta('b', 2)], 2)).toEqual([])
  })

  it('xoá cái cũ nhất trước, đủ để về đúng trần', () => {
    const metas = [meta('new', 300), meta('old', 100), meta('mid', 200)]
    expect(snapshotKeysToEvict(metas, 1)).toEqual(['old', 'mid'])
  })

  it('fetchedAt bằng nhau thì thứ tự ổn định theo key', () => {
    expect(snapshotKeysToEvict([meta('b', 5), meta('a', 5), meta('c', 9)], 1))
      .toEqual(['a', 'b'])
  })

  it('cap 0 xoá tất cả', () => {
    expect(snapshotKeysToEvict([meta('a', 1)], 0)).toEqual(['a'])
  })

  it('cap mặc định là SNAPSHOT_MAX_KEYS', () => {
    const metas = Array.from({ length: SNAPSHOT_MAX_KEYS + 2 }, (_, i) => meta(`k${i}`, i))
    expect(snapshotKeysToEvict(metas)).toEqual(['k0', 'k1'])
  })
})
