// tests/sw/worklog-delete.test.ts
//
// Đường đi thật của `worklog/delete`: gọi đúng endpoint, và dọn worklog đã xoá
// khỏi snapshot của dashboard — không dọn thì dashboard còn hiện giờ đã xoá cho
// tới khi hết TTL.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defaultConfig, type Config } from '@/core/config-schema'
import { snapshotKey } from '@/core/snapshot-key'

const deleteWorklog = vi.fn()

vi.mock('@/jira/client', () => ({ createClient: () => ({ call: vi.fn() }) }))
vi.mock('@/jira/auth', () => ({ cookieAuth: {}, tokenAuth: () => ({}) }))
vi.mock('@/jira/endpoints', () => ({
  deleteWorklog: (...a: unknown[]) => deleteWorklog(...a),
}))

const { handle } = await import('@/sw/handlers')

let data: Record<string, unknown> = {}

const setup = (patch: Partial<Config> = {}) => {
  data = { config: { ...defaultConfig, jiraBaseUrl: 'https://x.atlassian.net', ...patch } }
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (k: string | string[] | null) => {
          if (k === null) return { ...data }
          const list = Array.isArray(k) ? k : [k]
          return Object.fromEntries(list.filter((x) => x in data).map((x) => [x, data[x]]))
        },
        set: async (items: Record<string, unknown>) => { Object.assign(data, items) },
        remove: async (keys: string[] | string) => {
          for (const x of Array.isArray(keys) ? keys : [keys]) delete data[x]
        },
      },
    },
  }
}

const wl = (id: string, authorAccountId: string, date: string) => ({
  id, issueKey: 'CAG-1', issueSummary: 'S', authorAccountId, date,
  startMinutes: 540, timeSpentSeconds: 3600, comment: '',
})

const snap = (...worklogs: ReturnType<typeof wl>[]) =>
  ({ fetchedAt: 1, worklogs, meta: {} })

const ids = (key: string): string[] =>
  (data[key] as { worklogs: Array<{ id: string }> }).worklogs.map((w) => w.id)

const del = (issueKey: string, worklogId: string) =>
  handle({ type: 'worklog/delete', issueKey, worklogId })

beforeEach(() => {
  deleteWorklog.mockReset()
  deleteWorklog.mockResolvedValue(undefined)
})

describe('worklog/delete', () => {
  it('gọi endpoint với issue key và worklog id', async () => {
    setup()
    await del('CAG-1', 'w9')
    expect(deleteWorklog).toHaveBeenCalledTimes(1)
    expect(deleteWorklog.mock.calls[0]?.slice(1)).toEqual(['CAG-1', 'w9'])
  })

  it('dọn worklog khỏi snapshot chứa nó, không chạm worklog của người khác', async () => {
    setup()
    const key = snapshotKey({ from: '2026-08-01', to: '2026-08-31', accountIds: ['me', 'other'] })
    data[key] = snap(wl('w9', 'me', '2026-08-15'), wl('w8', 'other', '2026-08-15'))

    await del('CAG-1', 'w9')

    expect(ids(key)).toEqual(['w8'])
  })

  it('dọn khỏi MỌI snapshot chứa id đó — một worklog nằm trong nhiều khoảng ngày', async () => {
    setup()
    const sprint = snapshotKey({ from: '2026-08-01', to: '2026-08-31', accountIds: ['me'] })
    const week = snapshotKey({ from: '2026-08-10', to: '2026-08-16', accountIds: ['me'] })
    data[sprint] = snap(wl('w9', 'me', '2026-08-15'))
    data[week] = snap(wl('w9', 'me', '2026-08-15'))

    await del('CAG-1', 'w9')

    expect(ids(sprint)).toEqual([])
    expect(ids(week)).toEqual([])
  })

  it('lỗi Jira truyền lên nguyên vẹn và KHÔNG dọn snapshot', async () => {
    setup()
    const key = snapshotKey({ from: '2026-08-01', to: '2026-08-31', accountIds: ['me'] })
    data[key] = snap(wl('w9', 'me', '2026-08-15'))
    deleteWorklog.mockRejectedValue(new Error('Jira 403'))

    await expect(del('CAG-1', 'w9')).rejects.toThrow('Jira 403')
    // Xoá thất bại thì worklog vẫn còn trong Jira — bỏ nó khỏi snapshot chỉ là
    // nói dối theo hướng ngược lại.
    expect(ids(key)).toEqual(['w9'])
  })

  it('không có snapshot nào thì xoá vẫn chạy bình thường', async () => {
    setup()
    await expect(del('CAG-1', 'w9')).resolves.toBeNull()
  })
})
