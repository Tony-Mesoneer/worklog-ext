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

  it('cache của bản cũ (chưa có downloadKind) được điền mặc định', async () => {
    // Bản trước chỉ biết zip store — downloadUrl có nghĩa là zip store.
    store['update'] = { latest: { version: '0.12.0', url: 'https://x', downloadUrl: 'https://x/w.zip' } }
    const latest = (await readUpdateStore()).latest
    expect(latest?.downloadKind).toBe('zip')

    store['update'] = { latest: { version: '0.12.0', url: 'https://x', downloadUrl: null } }
    expect((await readUpdateStore()).latest?.downloadKind).toBeNull()
  })

  it('downloadKind hợp lệ được giữ, rác bị thay', async () => {
    store['update'] = {
      latest: { version: '0.13.0', downloadUrl: 'https://x/w.zip', downloadKind: 'windows-zip' },
    }
    expect((await readUpdateStore()).latest?.downloadKind).toBe('windows-zip')

    store['update'] = { latest: { version: '0.13.0', downloadUrl: 'https://x/w.zip', downloadKind: 'rác' } }
    expect((await readUpdateStore()).latest?.downloadKind).toBe('zip')
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
