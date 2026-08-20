// tests/store/update.test.ts
//
// Cache update phải đọc được cả khi storage chứa rác: nó là thứ side panel đọc
// lúc mở lên, hỏng ở đây là panel không mở được.
import { describe, it, expect, beforeEach } from 'vitest'
import { readUpdateStore, writeUpdateStore, emptyUpdateStore } from '@/store/update'

let store: Record<string, unknown> = {}

beforeEach(() => {
  store = {}
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (k: string) => (k in store ? { [k]: store[k] } : {}),
        set: async (items: Record<string, unknown>) => { Object.assign(store, items) },
      },
    },
  }
})

describe('readUpdateStore', () => {
  it('chưa có gì → default', async () => {
    expect(await readUpdateStore()).toEqual(emptyUpdateStore)
  })

  it('hình dạng lạ → default, không throw', async () => {
    for (const junk of ['string', 42, [], null]) {
      store['update'] = junk
      expect(await readUpdateStore()).toEqual(emptyUpdateStore)
    }
  })

  it('field sai kiểu bị thay bằng default, field đúng được giữ', async () => {
    store['update'] = {
      lastCheckedAt: 'hôm qua',
      lastError: 42,
      dismissedVersion: '0.3.0',
      latest: { version: '0.3.0', url: 'https://x' },
    }
    const s = await readUpdateStore()
    expect(s.lastCheckedAt).toBe(0)
    expect(s.lastError).toBeNull()
    expect(s.dismissedVersion).toBe('0.3.0')
    expect(s.latest?.version).toBe('0.3.0')
  })

  it('latest thiếu version → null (không tin được thì bỏ)', async () => {
    store['update'] = { latest: { url: 'https://x' } }
    expect((await readUpdateStore()).latest).toBeNull()
  })
})

describe('writeUpdateStore', () => {
  it('merge patch, không xoá field khác', async () => {
    await writeUpdateStore({ lastCheckedAt: 100 })
    await writeUpdateStore({ dismissedVersion: '0.3.0' })
    const s = await readUpdateStore()
    expect(s).toMatchObject({ lastCheckedAt: 100, dismissedVersion: '0.3.0' })
  })
})
