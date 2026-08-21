// tests/sw/update.test.ts
//
// Đường đi thật của check update: cache/interval, dịch lỗi HTTP, badge, và việc
// một lượt check tự động thất bại KHÔNG được ném ra ngoài.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { defaultConfig, type Config } from '@/core/config-schema'
import { UPDATE_CHECK_INTERVAL_MS } from '@/core/version'

const { checkForUpdate, updateStatus, dismissUpdate } = await import('@/sw/update')

let store: Record<string, unknown> = {}
let badge: { text: string; color?: string } = { text: '' }
const fetchMock = vi.fn()

// `sidebarAction` có mặt = Firefox (xem platform/ext isFirefox). Nó quyết định
// asset nào được chọn trong release, nên phải test được cả hai nhánh.
const setup = (config: Partial<Config>, version = '0.2.0', firefox = false) => {
  store = { config: { ...defaultConfig, ...config } }
  badge = { text: '' }
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    ...(firefox ? { sidebarAction: { open: async () => {}, close: async () => {} } } : {}),
    runtime: { getManifest: () => ({ version }) },
    action: {
      setBadgeText: async ({ text }: { text: string }) => { badge.text = text },
      setBadgeBackgroundColor: async ({ color }: { color: string }) => { badge.color = color },
    },
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
  vi.stubGlobal('fetch', fetchMock)
}

const release = (tag: string) => {
  const v = tag.replace(/^v/, '')
  return {
    tag_name: tag,
    html_url: `https://github.com/o/r/releases/tag/${tag}`,
    published_at: '2026-08-20T10:00:00Z',
    body: '',
    assets: [
      { name: `worklog-ext-${v}.zip`, browser_download_url: 'https://x/w.zip' },
      { name: `worklog-ext-${v}-firefox.zip`, browser_download_url: 'https://x/w-ff.zip' },
    ],
  }
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const fail = (status: number) => ({ ok: false, status, json: async () => ({}) })

beforeEach(() => { fetchMock.mockReset() })
afterEach(() => { vi.unstubAllGlobals() })

describe('checkForUpdate', () => {
  it('repo chưa cấu hình: lượt tự động không throw, lượt force thì throw', async () => {
    setup({ updateRepo: '' })
    const auto = await checkForUpdate(false)
    expect(auto.state).toBe('unknown')
    expect(auto.lastError).toMatch(/Chưa cấu hình repo/)
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(checkForUpdate(true)).rejects.toThrow(/Chưa cấu hình repo/)
  })

  it('repo dạng URL bị coi như chưa cấu hình', async () => {
    setup({ updateRepo: 'https://github.com/o/r' })
    expect((await checkForUpdate(false)).state).toBe('unknown')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('có bản mới hơn → available, badge sáng lên', async () => {
    setup({ updateRepo: 'o/r' })
    fetchMock.mockResolvedValue(ok(release('v0.3.0')))
    const r = await checkForUpdate(false)
    expect(r.state).toBe('available')
    expect(r.latest?.downloadUrl).toBe('https://x/w.zip')
    expect(badge.text).toBe('↑')
    expect(fetchMock.mock.calls[0]?.[0])
      .toBe('https://api.github.com/repos/o/r/releases/latest')
  })

  it('đang ở bản mới nhất → current, badge trống', async () => {
    setup({ updateRepo: 'o/r' }, '0.3.0')
    fetchMock.mockResolvedValue(ok(release('v0.3.0')))
    expect((await checkForUpdate(false)).state).toBe('current')
    expect(badge.text).toBe('')
  })

  it('lượt tự động thứ hai trong cùng interval không gọi mạng', async () => {
    setup({ updateRepo: 'o/r' })
    fetchMock.mockResolvedValue(ok(release('v0.3.0')))
    await checkForUpdate(false)
    await checkForUpdate(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('force luôn gọi mạng dù chưa tới hạn', async () => {
    setup({ updateRepo: 'o/r' })
    fetchMock.mockResolvedValue(ok(release('v0.3.0')))
    await checkForUpdate(false)
    await checkForUpdate(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('quá interval thì lượt tự động gọi lại', async () => {
    setup({ updateRepo: 'o/r' })
    fetchMock.mockResolvedValue(ok(release('v0.3.0')))
    await checkForUpdate(false)
    // Đẩy lastCheckedAt về quá khứ, mô phỏng 6 giờ sau.
    const saved = store['update'] as { lastCheckedAt: number }
    store['update'] = { ...saved, lastCheckedAt: Date.now() - UPDATE_CHECK_INTERVAL_MS - 1 }
    await checkForUpdate(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('404 → câu nói được repo sai/chưa release, lượt tự động không throw', async () => {
    setup({ updateRepo: 'o/r' })
    fetchMock.mockResolvedValue(fail(404))
    const r = await checkForUpdate(false)
    expect(r.lastError).toMatch(/Không thấy release nào ở o\/r/)
    expect(r.state).toBe('unknown')
  })

  it('403 → nói về rate limit', async () => {
    setup({ updateRepo: 'o/r' })
    fetchMock.mockResolvedValue(fail(403))
    expect((await checkForUpdate(false)).lastError).toMatch(/giới hạn số lần gọi/)
  })

  it('lỗi mạng: lastCheckedAt không nhích, nên lần sau vẫn thử lại', async () => {
    setup({ updateRepo: 'o/r' })
    fetchMock.mockRejectedValue(new Error('network down'))
    const r = await checkForUpdate(false)
    expect(r.lastError).toBe('network down')
    expect(r.lastCheckedAt).toBe(0)
    await checkForUpdate(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('lỗi mạng ở lượt force thì throw để UI hiện được', async () => {
    setup({ updateRepo: 'o/r' })
    fetchMock.mockRejectedValue(new Error('network down'))
    await expect(checkForUpdate(true)).rejects.toThrow('network down')
  })

  it('tag không phải version → coi là lỗi, không ghi latest', async () => {
    setup({ updateRepo: 'o/r' })
    fetchMock.mockResolvedValue(ok({ ...release('v0.3.0'), tag_name: 'nightly' }))
    const r = await checkForUpdate(false)
    expect(r.latest).toBeNull()
    expect(r.lastError).toMatch(/không có tag dạng version/)
  })

  it('release cũ hơn bản đang chạy không bao giờ thành available', async () => {
    setup({ updateRepo: 'o/r' }, '0.5.0')
    fetchMock.mockResolvedValue(ok(release('v0.3.0')))
    expect((await checkForUpdate(false)).state).toBe('current')
  })
})

describe('updateStatus', () => {
  it('đọc cache, không gọi mạng, và vẽ lại badge', async () => {
    setup({ updateRepo: 'o/r' })
    fetchMock.mockResolvedValue(ok(release('v0.3.0')))
    await checkForUpdate(false)
    badge.text = ''
    fetchMock.mockReset()

    const r = await updateStatus()
    expect(r.state).toBe('available')
    expect(badge.text).toBe('↑')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('dismissUpdate', () => {
  it('tắt banner cho đúng version đó và tắt badge', async () => {
    setup({ updateRepo: 'o/r' })
    fetchMock.mockResolvedValue(ok(release('v0.3.0')))
    await checkForUpdate(false)

    const r = await dismissUpdate('0.3.0')
    expect(r.state).toBe('dismissed')
    expect(badge.text).toBe('')

    // Bản mới hơn xuất hiện thì banner sống lại — dismiss không phải "tắt vĩnh viễn".
    fetchMock.mockResolvedValue(ok(release('v0.4.0')))
    expect((await checkForUpdate(true)).state).toBe('available')
  })
})

describe('chọn asset theo nền tảng', () => {
  it('Chrome nhận zip Chrome', async () => {
    setup({ updateRepo: 'o/r' })
    fetchMock.mockResolvedValue(ok(release('v0.3.0')))
    expect((await checkForUpdate(false)).latest?.downloadUrl).toBe('https://x/w.zip')
  })

  it('Firefox nhận zip Firefox', async () => {
    setup({ updateRepo: 'o/r' }, '0.2.0', true)
    fetchMock.mockResolvedValue(ok(release('v0.3.0')))
    expect((await checkForUpdate(false)).latest?.downloadUrl).toBe('https://x/w-ff.zip')
  })

  it('release cũ chỉ có zip Chrome: Firefox không nhận link file nào', async () => {
    setup({ updateRepo: 'o/r' }, '0.2.0', true)
    const r = release('v0.3.0')
    fetchMock.mockResolvedValue(ok({ ...r, assets: [r.assets[0]] }))
    const res = await checkForUpdate(false)
    // Vẫn báo CÓ bản mới; chỉ là không có file để tải trực tiếp, UI rơi về
    // link trang release.
    expect(res.state).toBe('available')
    expect(res.latest?.downloadUrl).toBeNull()
    expect(res.latest?.url).toContain('/releases/tag/v0.3.0')
  })
})
