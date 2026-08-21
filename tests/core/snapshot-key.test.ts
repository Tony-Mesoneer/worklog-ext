import { describe, it, expect } from 'vitest'
import {
  snapshotKey, isStale, snapshotKeysToEvict, parseSnapshotKey,
  SNAPSHOT_TTL_MS, SNAPSHOT_MAX_KEYS, SNAPSHOT_SCOPE_VERSION,
} from '@/core/snapshot-key'

const scope = {
  from: '2026-08-17',
  to: '2026-08-21',
  accountIds: ['u1', 'u2'],
}

describe('snapshotKey', () => {
  it('cùng scope → cùng key', () => {
    expect(snapshotKey(scope)).toBe(snapshotKey({ ...scope }))
  })

  it('không phụ thuộc thứ tự accountId', () => {
    // Nếu thứ tự ảnh hưởng key, cache miss vô cớ mỗi lần UI đổi thứ tự chọn.
    expect(snapshotKey({ ...scope, accountIds: ['u2', 'u1'] })).toBe(snapshotKey(scope))
  })

  it('mang version hình dạng, nên key CŨ (có project) không bao giờ khớp', () => {
    // Đây là cái bẫy chính của thay đổi bỏ lọc project: snapshot cũ là dữ liệu
    // ĐÃ LỌC. Nếu nó khớp key mới, lead thấy số bị lọc dưới nhãn "tất cả
    // project" mà không có lỗi nào ở đâu. Key phải khác hình dạng hoàn toàn.
    const key = snapshotKey(scope)
    expect(key).toContain(`|${SNAPSHOT_SCOPE_VERSION}|`.slice(1, -1))
    const legacy = `snapshot:CAG|${scope.from}|${scope.to}|${scope.accountIds.join(',')}`
    expect(key).not.toBe(legacy)
    // …và vẫn giữ prefix để pruneSnapshots dọn được cả key cũ.
    expect(legacy.startsWith('snapshot:')).toBe(true)
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

describe('parseSnapshotKey', () => {
  it('vòng tròn: snapshotKey rồi parse lại ra đúng scope', () => {
    const scope = { from: '2026-08-01', to: '2026-08-31', accountIds: ['b', 'a'] }
    // accountIds được sort trong key, nên parse ra bản đã sort — đó là cùng một
    // scope, và snapshotKey của nó bằng nhau.
    const parsed = parseSnapshotKey(snapshotKey(scope))
    expect(parsed).toEqual({ from: '2026-08-01', to: '2026-08-31', accountIds: ['a', 'b'] })
    expect(snapshotKey(parsed!)).toBe(snapshotKey(scope))
  })

  it('key của scope version cũ → null, không đoán bừa', () => {
    expect(parseSnapshotKey('snapshot:CAG|2026-08-01|2026-08-31|a')).toBeNull()
    expect(parseSnapshotKey('snapshot:v1|2026-08-01|2026-08-31|a')).toBeNull()
  })

  it('key không phải snapshot, hoặc thiếu phần → null', () => {
    for (const bad of ['config', 'snapshot:v2|2026-08-01', 'snapshot:v2', '', 'snapshot:v2|a|b|c|d']) {
      expect(parseSnapshotKey(bad), bad).toBeNull()
    }
  })

  it('accountIds rỗng đọc ra mảng rỗng, không phải một phần tử rỗng', () => {
    expect(parseSnapshotKey('snapshot:v2|2026-08-01|2026-08-31|')?.accountIds).toEqual([])
  })
})
