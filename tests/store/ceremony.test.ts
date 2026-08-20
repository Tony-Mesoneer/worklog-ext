// tests/store/ceremony.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ceremonyCacheKey, type CeremonyCandidate } from '@/core/event-resolve'
import type { CeremonyCache } from '@/store/ceremony'

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
          set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(data, items) }),
          remove: vi.fn(async (keys: string[] | string) => {
            for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k]
          }),
        },
      },
    },
  }
}

const cand = (key: string, summary: string): CeremonyCandidate =>
  ({ key, summary, sprintId: 34, sprintStartDate: '2026-08-17T02:00:00.000Z' })

const cache = (candidates: CeremonyCandidate[], sprintName = 'S34'): CeremonyCache =>
  ({ fetchedAt: 1_700_000_000_000, sprintName, candidates })

const ARGS_34 = { sprintId: 34, projects: ['CAG'], matchSummaries: ['Daily Scrum'] }
const ARGS_35 = { sprintId: 35, projects: ['CAG'], matchSummaries: ['Daily Scrum'] }

describe('store/ceremony', () => {
  let fake: ReturnType<typeof makeChrome>

  beforeEach(() => {
    fake = makeChrome()
    vi.stubGlobal('chrome', fake.api)
    vi.resetModules()
  })

  it('miss khi chưa có gì', async () => {
    const { readCeremonyCache } = await import('@/store/ceremony')
    expect(await readCeremonyCache(ARGS_34)).toBeNull()
  })

  it('ghi rồi đọc lại được đúng ứng viên', async () => {
    const { readCeremonyCache, writeCeremonyCache } = await import('@/store/ceremony')
    await writeCeremonyCache(ARGS_34, cache([cand('CAG-3065', 'Daily Scrum')]))
    const hit = await readCeremonyCache(ARGS_34)
    expect(hit!.candidates).toEqual([cand('CAG-3065', 'Daily Scrum')])
    expect(hit!.sprintName).toBe('S34')
  })

  it('sang sprint mới là MISS — key gắn sprint id nên tự vô hiệu, không cần TTL', async () => {
    const { readCeremonyCache, writeCeremonyCache } = await import('@/store/ceremony')
    await writeCeremonyCache(ARGS_34, cache([cand('CAG-3065', 'Daily Scrum')]))
    expect(await readCeremonyCache(ARGS_35)).toBeNull()
  })

  it('đổi tập matchSummaries là MISS — sửa Options phải tra lại', async () => {
    const { readCeremonyCache, writeCeremonyCache } = await import('@/store/ceremony')
    await writeCeremonyCache(ARGS_34, cache([cand('CAG-3065', 'Daily Scrum')]))
    expect(await readCeremonyCache({
      ...ARGS_34, matchSummaries: ['Daily Scrum', 'Sprint Retro'],
    })).toBeNull()
  })

  it('ghi cache sprint mới thì DỌN key ceremony của sprint cũ', async () => {
    const { writeCeremonyCache } = await import('@/store/ceremony')
    await writeCeremonyCache(ARGS_34, cache([cand('CAG-3065', 'Daily Scrum')]))
    await writeCeremonyCache(ARGS_35, cache([cand('CAG-3071', 'Daily Scrum')], 'S35'))
    expect(ceremonyCacheKey(34, ['CAG'], ['Daily Scrum']) in fake.data).toBe(false)
    expect(ceremonyCacheKey(35, ['CAG'], ['Daily Scrum']) in fake.data).toBe(true)
  })

  it('không đụng vào config hay snapshot khi dọn', async () => {
    fake.data['config'] = { version: 2 }
    fake.data['snapshot:CAG|a|b|u1'] = { fetchedAt: 1, worklogs: [] }
    const { writeCeremonyCache } = await import('@/store/ceremony')
    await writeCeremonyCache(ARGS_35, cache([]))
    expect(fake.data['config']).toEqual({ version: 2 })
    expect('snapshot:CAG|a|b|u1' in fake.data).toBe(true)
  })

  it('dữ liệu sai hình dạng trong storage → coi như miss, không throw', async () => {
    fake.data[ceremonyCacheKey(34, ['CAG'], ['Daily Scrum'])] = { fetchedAt: 1 }
    const { readCeremonyCache } = await import('@/store/ceremony')
    expect(await readCeremonyCache(ARGS_34)).toBeNull()
  })

  it('luôn dùng storage.local, không bao giờ storage.sync', async () => {
    const { writeCeremonyCache } = await import('@/store/ceremony')
    await writeCeremonyCache(ARGS_34, cache([]))
    expect(fake.api.storage.local.set).toHaveBeenCalled()
    expect('sync' in fake.api.storage).toBe(false)
  })
})
