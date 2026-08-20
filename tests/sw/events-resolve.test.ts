// tests/sw/events-resolve.test.ts
//
// Đường đi thật của `events/resolve`: cache, số request, và việc quy ứng viên về
// sprint nào khi có nhiều sprint đang mở. Chỉ mock đúng biên Jira.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defaultConfig, type Config } from '@/core/config-schema'
import type { EventsResolveResult } from '@/sw/messages'

const getActiveSprints = vi.fn()
const searchSprintSubtasks = vi.fn()
const filterKeysInSprint = vi.fn()

vi.mock('@/jira/client', () => ({ createClient: () => ({ call: vi.fn() }) }))
vi.mock('@/jira/auth', () => ({ cookieAuth: {}, tokenAuth: () => ({}) }))
vi.mock('@/jira/endpoints', () => ({
  getActiveSprints: (...a: unknown[]) => getActiveSprints(...a),
  searchSprintSubtasks: (...a: unknown[]) => searchSprintSubtasks(...a),
  filterKeysInSprint: (...a: unknown[]) => filterKeysInSprint(...a),
}))

const { handle } = await import('@/sw/handlers')

let store: Record<string, unknown> = {}

const setConfig = (patch: Partial<Config>) => {
  store = { config: { ...defaultConfig, jiraBaseUrl: 'https://x.atlassian.net', ...patch } }
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (k: string | string[] | null) => {
          if (k === null) return { ...store }
          const list = Array.isArray(k) ? k : [k]
          return Object.fromEntries(list.filter((x) => x in store).map((x) => [x, store[x]]))
        },
        set: async (items: Record<string, unknown>) => { Object.assign(store, items) },
        remove: async (keys: string[] | string) => {
          for (const x of Array.isArray(keys) ? keys : [keys]) delete store[x]
        },
      },
    },
  }
}

const event = (name: string, matchSummary: string, issueKey = '') =>
  ({ name, matchSummary, issueKey, defaultMinutes: 15, comment: '' })

const S34 = { id: 34, name: 'S34', startDate: '2026-08-17T02:00:00.000Z', endDate: '' }
const S35 = { id: 35, name: 'S35', startDate: '2026-08-31T02:00:00.000Z', endDate: '' }

const resolve = (force = false) =>
  handle({ type: 'events/resolve', force }) as Promise<EventsResolveResult>

describe('events/resolve', () => {
  beforeEach(() => {
    getActiveSprints.mockReset()
    searchSprintSubtasks.mockReset()
    filterKeysInSprint.mockReset()
  })

  it('không event nào tra theo tên → KHÔNG gọi Jira, dùng issueKey như trước', async () => {
    setConfig({ primaryBoardId: 42, sprintEvents: [event('Daily', '', 'CAG-100')] })
    const res = await resolve()
    expect(getActiveSprints).not.toHaveBeenCalled()
    expect(searchSprintSubtasks).not.toHaveBeenCalled()
    expect(res.events[0]!.issueKey).toBe('CAG-100')
  })

  it('một sprint đang mở → hai request, không cần filterKeysInSprint', async () => {
    setConfig({
      primaryBoardId: 42, projects: ['CAG'],
      sprintEvents: [event('Daily', 'Daily Scrum'), event('Retro', 'Sprint Retro')],
    })
    getActiveSprints.mockResolvedValue([S34])
    searchSprintSubtasks.mockResolvedValue([
      { key: 'CAG-3065', summary: 'Daily Scrum' },
      { key: 'CAG-3067', summary: 'Sprint Retro' },
    ])

    const res = await resolve()
    expect(searchSprintSubtasks).toHaveBeenCalledTimes(1)
    expect(filterKeysInSprint).not.toHaveBeenCalled()
    expect(res.sprintName).toBe('S34')
    expect(res.events.map((e) => e.issueKey)).toEqual(['CAG-3065', 'CAG-3067'])
  })

  it('gửi TẤT CẢ tên trong một lần search', async () => {
    setConfig({
      primaryBoardId: 42, projects: ['CAG'],
      sprintEvents: [event('Daily', 'Daily Scrum'), event('Retro', 'Sprint Retro')],
    })
    getActiveSprints.mockResolvedValue([S34])
    searchSprintSubtasks.mockResolvedValue([])
    await resolve()
    expect(searchSprintSubtasks.mock.calls[0]![1]).toEqual({
      projects: ['CAG'], summaries: ['Daily Scrum', 'Sprint Retro'],
    })
  })

  it('lần thứ hai đọc cache — không gọi Jira lại', async () => {
    setConfig({
      primaryBoardId: 42, projects: ['CAG'], sprintEvents: [event('Daily', 'Daily Scrum')],
    })
    getActiveSprints.mockResolvedValue([S34])
    searchSprintSubtasks.mockResolvedValue([{ key: 'CAG-3065', summary: 'Daily Scrum' }])

    await resolve()
    const res = await resolve()
    expect(searchSprintSubtasks).toHaveBeenCalledTimes(1)
    expect(res.events[0]!.issueKey).toBe('CAG-3065')
  })

  it('sprint đổi (rollover) → cache miss, tra lại và ra sub-task MỚI', async () => {
    setConfig({
      primaryBoardId: 42, projects: ['CAG'], sprintEvents: [event('Daily', 'Daily Scrum')],
    })
    getActiveSprints.mockResolvedValue([S34])
    searchSprintSubtasks.mockResolvedValue([{ key: 'CAG-3065', summary: 'Daily Scrum' }])
    expect((await resolve()).events[0]!.issueKey).toBe('CAG-3065')

    getActiveSprints.mockResolvedValue([S35])
    searchSprintSubtasks.mockResolvedValue([{ key: 'CAG-3071', summary: 'Daily Scrum' }])
    const res = await resolve()
    expect(res.events[0]!.issueKey).toBe('CAG-3071')
    expect(res.sprintName).toBe('S35')
  })

  it('force bỏ qua cache', async () => {
    setConfig({
      primaryBoardId: 42, projects: ['CAG'], sprintEvents: [event('Daily', 'Daily Scrum')],
    })
    getActiveSprints.mockResolvedValue([S34])
    searchSprintSubtasks.mockResolvedValue([{ key: 'CAG-3065', summary: 'Daily Scrum' }])
    await resolve()
    await resolve(true)
    expect(searchSprintSubtasks).toHaveBeenCalledTimes(2)
  })

  it('hai sprint đang mở → quy ứng viên về sprint và chọn sprint muộn nhất', async () => {
    setConfig({
      primaryBoardId: 42, projects: ['CAG'], sprintEvents: [event('Daily', 'Daily Scrum')],
    })
    getActiveSprints.mockResolvedValue([S34, S35])
    searchSprintSubtasks.mockResolvedValue([
      { key: 'CAG-3065', summary: 'Daily Scrum' },
      { key: 'CAG-3071', summary: 'Daily Scrum' },
    ])
    filterKeysInSprint.mockImplementation(async (_c: unknown, _k: string[], id: number) =>
      id === 34 ? ['CAG-3065'] : ['CAG-3071'])

    const res = await resolve()
    expect(filterKeysInSprint).toHaveBeenCalledTimes(2)
    expect(res.events[0]!.issueKey).toBe('CAG-3071')
    // Cache gắn với sprint MUỘN NHẤT — đó là cái tie-break sẽ chọn.
    expect(res.sprintName).toBe('S35')
  })

  it('hai sprint mở, không quy được ứng viên nào về sprint nào → khoá, không đoán', async () => {
    setConfig({
      primaryBoardId: 42, projects: ['CAG'], sprintEvents: [event('Daily', 'Daily Scrum')],
    })
    getActiveSprints.mockResolvedValue([S34, S35])
    searchSprintSubtasks.mockResolvedValue([
      { key: 'CAG-3065', summary: 'Daily Scrum' },
      { key: 'CAG-3071', summary: 'Daily Scrum' },
    ])
    filterKeysInSprint.mockResolvedValue([])

    const res = await resolve()
    expect(res.events[0]!.issueKey).toBeNull()
    expect(res.events[0]!.reason).toContain('có 2 sub-task')
  })

  it('không có sprint nào đang mở → khoá event tra-theo-tên, event ghim key vẫn chạy', async () => {
    setConfig({
      primaryBoardId: 42, projects: ['CAG'],
      sprintEvents: [event('Daily', 'Daily Scrum'), event('Ghim', '', 'CAG-100')],
    })
    getActiveSprints.mockResolvedValue([])

    const res = await resolve()
    expect(searchSprintSubtasks).not.toHaveBeenCalled()
    expect(res.events[0]!.issueKey).toBeNull()
    expect(res.events[0]!.reason).toContain('không có sprint nào đang mở')
    expect(res.events[1]!.issueKey).toBe('CAG-100')
  })

  it('chưa chọn board → khoá kèm lý do chỉ về Options, không throw', async () => {
    setConfig({ primaryBoardId: null, sprintEvents: [event('Daily', 'Daily Scrum')] })
    const res = await resolve()
    expect(res.events[0]!.issueKey).toBeNull()
    expect(res.events[0]!.reason).toContain('board chính')
  })

  it('ceremony bị đổi tên → khoá, KHÔNG rơi về issueKey đã ghim', async () => {
    setConfig({
      primaryBoardId: 42, projects: ['CAG'],
      sprintEvents: [event('Daily', 'Daily Scrum', 'CAG-3065')],
    })
    getActiveSprints.mockResolvedValue([S34])
    searchSprintSubtasks.mockResolvedValue([{ key: 'CAG-3200', summary: 'Daily Standup' }])

    const res = await resolve()
    expect(res.events[0]!.issueKey).toBeNull()
    expect(res.events[0]!.reason).toContain('không tìm thấy')
  })
})
