import { describe, it, expect, beforeEach, vi } from 'vitest'
import { snapshotKey, type Scope } from '@/core/snapshot-key'
import type { Worklog } from '@/core/coverage'

// chrome giả tối thiểu: chỉ storage.local — cùng khuôn với tests/store/config.
// get(null) trả toàn bộ store, đúng như API thật, vì pruneSnapshots cần nó.
const makeChrome = () => {
  const data: Record<string, unknown> = {}
  return {
    data,
    api: {
      storage: {
        local: {
          get: vi.fn(async (keys: string[] | string | null) => {
            if (keys === null) return { ...data }
            const list = Array.isArray(keys) ? keys : [keys]
            return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, data[k]]))
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(data, items)
          }),
          remove: vi.fn(async (keys: string[] | string) => {
            for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k]
          }),
        },
      },
    },
  }
}

const scope: Scope = {
  projects: ['CAG'],
  from: '2026-08-17',
  to: '2026-08-21',
  accountIds: ['u1'],
}

const wl = (id: string): Worklog => ({
  id,
  issueKey: 'CAG-1',
  issueSummary: 'x',
  authorAccountId: 'u1',
  date: '2026-08-17',
  startMinutes: 540,
  timeSpentSeconds: 3600,
  comment: '',
})

describe('store/snapshot', () => {
  let fake: ReturnType<typeof makeChrome>

  beforeEach(() => {
    fake = makeChrome()
    vi.stubGlobal('chrome', fake.api)
    vi.resetModules()
  })

  it('readSnapshot trả null khi chưa có cache', async () => {
    const { readSnapshot } = await import('@/store/snapshot')
    expect(await readSnapshot(scope)).toBeNull()
  })

  it('writeSnapshot rồi readSnapshot vòng lại được và chưa stale', async () => {
    const { writeSnapshot, readSnapshot } = await import('@/store/snapshot')
    await writeSnapshot(scope, [wl('1')], Date.now())
    const res = await readSnapshot(scope)
    expect(res?.snapshot.worklogs.map((w) => w.id)).toEqual(['1'])
    expect(res?.stale).toBe(false)
  })

  it('writeSnapshot lưu kèm meta và đọc lại được', async () => {
    const { writeSnapshot, readSnapshot, snapshotMeta } = await import('@/store/snapshot')
    await writeSnapshot(scope, [wl('1')], 1000, {
      'CAG-1': {
        key: 'CAG-1', summary: 'x', statusName: 'In Testing',
        statusCategory: 'indeterminate', parentKey: 'CAG-0',
        parentSummary: 'parent', isSubtask: true,
      },
    })
    const res = await readSnapshot(scope)
    expect(snapshotMeta(res!.snapshot)['CAG-1']!.parentKey).toBe('CAG-0')
  })

  it('snapshot cũ KHÔNG có meta đọc được, meta thành rỗng', async () => {
    // Cache đã nằm trong storage.local từ trước tính năng cha/con. Nó phải đọc
    // được và cho map rỗng, không được ném lỗi hay làm dashboard trắng.
    const { readSnapshot, snapshotMeta } = await import('@/store/snapshot')
    fake.data[snapshotKey(scope)] = { fetchedAt: Date.now(), worklogs: [wl('1')] }
    const res = await readSnapshot(scope)
    expect(res!.snapshot.worklogs).toHaveLength(1)
    expect(snapshotMeta(res!.snapshot)).toEqual({})
  })

  it('patchSnapshot giữ nguyên meta đã lưu', async () => {
    const { writeSnapshot, patchSnapshot, readSnapshot, snapshotMeta } =
      await import('@/store/snapshot')
    await writeSnapshot(scope, [wl('1')], 1000, {
      'CAG-1': {
        key: 'CAG-1', summary: 'x', statusName: 'Open', statusCategory: 'new',
        parentKey: null, parentSummary: null, isSubtask: false,
      },
    })
    await patchSnapshot(scope, [wl('2')], [])
    const res = await readSnapshot(scope)
    expect(Object.keys(snapshotMeta(res!.snapshot))).toEqual(['CAG-1'])
  })

  it('patchSnapshot không làm gì khi chưa có cache', async () => {
    const { patchSnapshot } = await import('@/store/snapshot')
    await patchSnapshot(scope, [wl('1')], [])
    expect(fake.data[snapshotKey(scope)]).toBeUndefined()
  })

  it('patchSnapshot thêm và xoá theo id', async () => {
    const { writeSnapshot, patchSnapshot, readSnapshot } = await import('@/store/snapshot')
    await writeSnapshot(scope, [wl('1'), wl('2')], 1000)
    await patchSnapshot(scope, [wl('3')], ['1'])
    const res = await readSnapshot(scope)
    expect(res?.snapshot.worklogs.map((w) => w.id).sort()).toEqual(['2', '3'])
  })

  it('patchSnapshot GIỮ NGUYÊN fetchedAt', async () => {
    // Nếu patch làm mới fetchedAt, một snapshot cũ sẽ trông như vừa fetch và
    // dashboard bỏ qua refresh trong 5 phút tiếp theo.
    const { writeSnapshot, patchSnapshot } = await import('@/store/snapshot')
    await writeSnapshot(scope, [wl('1')], 1000)
    await patchSnapshot(scope, [wl('2')], [])
    expect((fake.data[snapshotKey(scope)] as { fetchedAt: number }).fetchedAt).toBe(1000)
  })

  it('pruneSnapshots xoá snapshot cũ nhất và không chạm key khác', async () => {
    const { pruneSnapshots } = await import('@/store/snapshot')
    fake.data['config'] = { version: 1 }
    fake.data['snapshot:a'] = { fetchedAt: 100, worklogs: [] }
    fake.data['snapshot:b'] = { fetchedAt: 200, worklogs: [] }
    fake.data['snapshot:c'] = { fetchedAt: 300, worklogs: [] }
    await pruneSnapshots(2)
    expect(Object.keys(fake.data).sort()).toEqual(['config', 'snapshot:b', 'snapshot:c'])
  })

  it('pruneSnapshots không gọi remove khi chưa quá trần', async () => {
    const { pruneSnapshots } = await import('@/store/snapshot')
    fake.data['snapshot:a'] = { fetchedAt: 100, worklogs: [] }
    await pruneSnapshots(5)
    expect(fake.api.storage.local.remove).not.toHaveBeenCalled()
  })
})
