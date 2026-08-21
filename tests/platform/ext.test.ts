// tests/platform/ext.test.ts
//
// Shim này tồn tại vì trên Firefox `chrome.*` là callback-based: `await
// chrome.storage.local.get(k)` trả `undefined` chứ không throw. Test khoá ba
// điều mà một lỗi ở đây sẽ làm vỡ im lặng: chọn đúng API, KHÔNG chốt giá trị
// lúc module load, và báo lỗi rõ khi không có API nào.
import { describe, it, expect, afterEach } from 'vitest'
import { ext } from '@/platform/ext'

type G = { browser?: unknown; chrome?: unknown }
const g = globalThis as G

afterEach(() => { delete g.browser; delete g.chrome })

const fake = (tag: string) => ({ storage: { local: { get: async () => tag } }, tag })

describe('ext', () => {
  it('dùng chrome khi không có browser (Chrome)', async () => {
    g.chrome = fake('chrome')
    expect(await ext.storage.local.get('k')).toBe('chrome')
  })

  it('ưu tiên browser khi có (Firefox)', async () => {
    // Firefox expose CẢ HAI. Phải chọn `browser` — `chrome` ở đó là bản
    // callback-based, await sẽ ra undefined.
    g.chrome = fake('chrome')
    g.browser = fake('browser')
    expect(await ext.storage.local.get('k')).toBe('browser')
  })

  it('KHÔNG chốt giá trị lúc import: API lắp sau vẫn thấy', async () => {
    // Đây là lý do shim là Proxy chứ không phải `const ext = browser ?? chrome`.
    // Test trong repo này lắp globalThis.chrome trong beforeEach, tức SAU khi
    // module đã import — chốt sớm là mọi test chạm storage đều vỡ.
    expect(g.chrome).toBeUndefined()
    g.chrome = fake('muộn')
    expect(await ext.storage.local.get('k')).toBe('muộn')
  })

  it('đổi API giữa lúc chạy thì lần gọi sau lấy bản mới', async () => {
    g.chrome = fake('một')
    expect(await ext.storage.local.get('k')).toBe('một')
    g.chrome = fake('hai')
    expect(await ext.storage.local.get('k')).toBe('hai')
  })

  it('không có API nào → lỗi nói rõ, không phải undefined lặng lẽ', () => {
    expect(() => ext.storage).toThrow(/WebExtension API/)
  })

  it('`in` và Object.keys phản ánh API thật, không phải object rỗng', () => {
    // Thiếu bẫy has/ownKeys thì mọi feature detection (`'sidePanel' in ext`)
    // đều trả false — đúng thứ cần dùng khi thêm Firefox.
    g.chrome = fake('chrome')
    expect('storage' in ext).toBe(true)
    expect('sidePanel' in ext).toBe(false)
    expect(Object.keys(ext)).toContain('storage')
  })
})
