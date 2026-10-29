// tests/sw/sprint-current.test.ts
//
// `sprint/current` phải đổi mốc UTC của Jira sang NGÀY theo timeZone cấu hình.
// Jira lưu sprint kết thúc "2026-10-01T17:00:00Z" = 00:00 ngày 2/10 giờ VN, tức
// thứ Sáu 2/10 là ngày cuối. Cắt 10 ký tự chuỗi UTC ra 1/10 → bảng thiếu một ngày.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defaultConfig, type Config } from '@/core/config-schema'
import type { SprintCurrentResult } from '@/sw/messages'

const getActiveSprints = vi.fn()

vi.mock('@/jira/client', () => ({ createClient: () => ({ call: vi.fn() }) }))
vi.mock('@/jira/auth', () => ({ cookieAuth: {}, tokenAuth: () => ({}) }))
vi.mock('@/jira/endpoints', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/jira/endpoints')>()),
  getActiveSprints: (...a: unknown[]) => getActiveSprints(...a),
  getActiveSprint: async (...a: unknown[]) => (await getActiveSprints(...a))[0] ?? null,
}))

const { handle } = await import('@/sw/handlers')

const setConfig = (patch: Partial<Config>) => {
  const store: Record<string, unknown> = {
    config: { ...defaultConfig, jiraBaseUrl: 'https://x.atlassian.net', ...patch },
  }
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (k: string | string[] | null) => {
          if (k === null) return { ...store }
          const list = Array.isArray(k) ? k : [k]
          return Object.fromEntries(list.filter((x) => x in store).map((x) => [x, store[x]]))
        },
        set: async (items: Record<string, unknown>) => { Object.assign(store, items) },
        remove: async () => {},
      },
    },
  }
}

const current = () => handle({ type: 'sprint/current' }) as Promise<SprintCurrentResult>

describe('sprint/current', () => {
  beforeEach(() => getActiveSprints.mockReset())

  it('đổi mốc UTC sang ngày theo timeZone: kết thúc 00:00 ngày 2/10 VN → to = 2/10', async () => {
    setConfig({ primaryBoardId: 619, timeZone: 'Asia/Ho_Chi_Minh' })
    getActiveSprints.mockResolvedValue([{
      id: 21537, name: 'Sprint 37',
      startDate: '2026-09-21T03:09:55.720Z', endDate: '2026-10-01T17:00:00.000Z',
    }])
    expect(await current()).toEqual({ name: 'Sprint 37', from: '2026-09-21', to: '2026-10-02' })
  })

  it('bắt đầu sáng sớm giờ VN nhưng còn là hôm trước theo UTC → from vẫn là ngày VN', async () => {
    setConfig({ primaryBoardId: 619, timeZone: 'Asia/Ho_Chi_Minh' })
    getActiveSprints.mockResolvedValue([{
      id: 1, name: 'S', startDate: '2026-09-20T23:30:00.000Z', endDate: '2026-10-04T10:00:00.000Z',
    }])
    expect(await current()).toEqual({ name: 'S', from: '2026-09-21', to: '2026-10-04' })
  })

  it('timeZone UTC → giữ nguyên ngày UTC', async () => {
    setConfig({ primaryBoardId: 619, timeZone: 'UTC' })
    getActiveSprints.mockResolvedValue([{
      id: 1, name: 'S', startDate: '2026-09-21T03:09:55.720Z', endDate: '2026-10-01T17:00:00.000Z',
    }])
    expect(await current()).toEqual({ name: 'S', from: '2026-09-21', to: '2026-10-01' })
  })

  it('sprint thiếu ngày → null, không ném lỗi', async () => {
    setConfig({ primaryBoardId: 619, timeZone: 'Asia/Ho_Chi_Minh' })
    getActiveSprints.mockResolvedValue([{ id: 1, name: 'S', startDate: '', endDate: '' }])
    expect(await current()).toBeNull()
  })
})
