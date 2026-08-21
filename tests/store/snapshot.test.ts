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
        parentSummary: 'parent', isSubtask: true, projectKey: 'CAG',
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
        parentKey: null, parentSummary: null, isSubtask: false, projectKey: 'CAG',
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

describe('removeWorklogsFromSnapshots', () => {
  let fake: ReturnType<typeof makeChrome>

  beforeEach(() => {
    fake = makeChrome()
    vi.stubGlobal('chrome', fake.api)
    vi.resetModules()
  })

  const key = (from: string, to: string, ids: string[]) =>
    snapshotKey({ from, to, accountIds: ids })

  const snap = (worklogs: Array<{ id: string; authorAccountId: string; date: string }>) => ({
    fetchedAt: 1000,
    worklogs: worklogs.map((w) => ({
      ...w, issueKey: 'CAG-1', issueSummary: 'S', startMinutes: 540,
      timeSpentSeconds: 3600, comment: '',
    })),
    meta: {},
  })

  const ids = (k: string): string[] =>
    (fake.data[k] as { worklogs: Array<{ id: string }> }).worklogs.map((w) => w.id)

  it('bỏ worklog khỏi mọi snapshot PHỦ nó', async () => {
    const wide = key('2026-08-01', '2026-08-31', ['a', 'b'])
    const narrow = key('2026-08-10', '2026-08-16', ['a'])
    fake.data[wide] = snap([
      { id: '1', authorAccountId: 'a', date: '2026-08-15' },
      { id: '2', authorAccountId: 'b', date: '2026-08-15' },
    ])
    fake.data[narrow] = snap([{ id: '1', authorAccountId: 'a', date: '2026-08-15' }])

    const { removeWorklogsFromSnapshots } = await import('@/store/snapshot')
    await removeWorklogsFromSnapshots(['1'])

    expect(ids(wide)).toEqual(['2'])
    expect(ids(narrow)).toEqual([])
  })

  it('không chạm snapshot không chứa id nào bị xoá', async () => {
    const other = key('2026-07-01', '2026-07-31', ['a'])
    const notMine = key('2026-08-01', '2026-08-31', ['b'])
    fake.data[other] = snap([{ id: '9', authorAccountId: 'a', date: '2026-07-15' }])
    fake.data[notMine] = snap([{ id: '8', authorAccountId: 'b', date: '2026-08-15' }])

    const { removeWorklogsFromSnapshots } = await import('@/store/snapshot')
    await removeWorklogsFromSnapshots(['7'])

    expect(ids(other)).toEqual(['9'])
    expect(ids(notMine)).toEqual(['8'])
  })

  it('giữ nguyên fetchedAt và meta: patch không phải một lần fetch mới', async () => {
    const k = key('2026-08-01', '2026-08-31', ['a'])
    fake.data[k] = {
      ...snap([{ id: '1', authorAccountId: 'a', date: '2026-08-15' }]),
      meta: { 'CAG-1': { key: 'CAG-1' } },
    }

    const { removeWorklogsFromSnapshots } = await import('@/store/snapshot')
    await removeWorklogsFromSnapshots(['1'])

    const after = fake.data[k] as { fetchedAt: number; meta: Record<string, unknown> }
    expect(after.fetchedAt).toBe(1000)
    expect(after.meta).toEqual({ 'CAG-1': { key: 'CAG-1' } })
  })

  it('bỏ qua key lạ và key scope version cũ, không throw', async () => {
    const legacy = 'snapshot:CAG|2026-08-01|2026-08-31|a'
    fake.data['config'] = { jiraBaseUrl: 'x' }
    fake.data[legacy] = snap([{ id: '1', authorAccountId: 'a', date: '2026-08-15' }])

    const { removeWorklogsFromSnapshots } = await import('@/store/snapshot')
    await removeWorklogsFromSnapshots(['1'])

    expect(fake.data['config']).toEqual({ jiraBaseUrl: 'x' })
    // Key version cũ không bao giờ được đọc lên, nên cũng không cần sửa.
    expect(ids(legacy)).toEqual(['1'])
  })

  it('không có snapshot nào thì không ghi gì', async () => {
    const { removeWorklogsFromSnapshots } = await import('@/store/snapshot')
    await removeWorklogsFromSnapshots(['1'])
    expect(fake.api.storage.local.set).not.toHaveBeenCalled()
  })
})
