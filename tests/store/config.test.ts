import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defaultConfig } from '@/core/config-schema'

// chrome giả tối thiểu: chỉ storage.local, đủ cho store/.
const makeChrome = () => {
  const data: Record<string, unknown> = {}
  return {
    data,
    api: {
      storage: {
        local: {
          get: vi.fn(async (keys: string[] | string) => {
            const list = Array.isArray(keys) ? keys : [keys]
            return Object.fromEntries(
              list.filter((k) => k in data).map((k) => [k, data[k]]),
            )
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(data, items)
          }),
        },
      },
    },
  }
}

describe('store/config', () => {
  let fake: ReturnType<typeof makeChrome>

  beforeEach(() => {
    fake = makeChrome()
    vi.stubGlobal('chrome', fake.api)
    vi.resetModules()
  })

  it('loadConfig trả default khi storage rỗng', async () => {
    const { loadConfig } = await import('@/store/config')
    expect(await loadConfig()).toEqual(defaultConfig)
  })

  it('loadConfig chạy migrate qua dữ liệu cũ', async () => {
    fake.data['config'] = { projects: 'sai kiểu' }
    const { loadConfig } = await import('@/store/config')
    expect((await loadConfig()).projects).toEqual([])
  })

  it('saveConfig merge patch chứ không ghi đè cả object', async () => {
    const { saveConfig, loadConfig } = await import('@/store/config')
    await saveConfig({ projects: ['CAG'] })
    await saveConfig({ workdayStart: '08:00' })
    const c = await loadConfig()
    expect(c.projects).toEqual(['CAG'])
    expect(c.workdayStart).toBe('08:00')
  })

  it('saveConfig trả về config sau khi merge', async () => {
    const { saveConfig } = await import('@/store/config')
    expect((await saveConfig({ projects: ['CAG'] })).projects).toEqual(['CAG'])
  })

  it('luôn ghi vào storage.local, không bao giờ storage.sync', async () => {
    const { saveConfig } = await import('@/store/config')
    await saveConfig({ projects: ['CAG'] })
    expect(fake.api.storage.local.set).toHaveBeenCalled()
    expect('sync' in fake.api.storage).toBe(false)
  })
})
