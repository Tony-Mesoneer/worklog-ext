// src/platform/ext.ts
//
// Một cửa duy nhất tới WebExtension API, để code không gọi `chrome.*` trực tiếp.
//
// VÌ SAO: Firefox expose `browser.*` (promise-based) và CŨNG expose `chrome.*`
// nhưng callback-based. Nghĩa là `await chrome.storage.local.get(k)` trên Firefox
// trả về `undefined` — không throw, không cảnh báo, chỉ là dữ liệu rỗng lặng lẽ.
// Đó là loại lỗi tốn nhất để tìm, và mọi dòng `await chrome.…` viết thêm từ giờ
// là thêm một chỗ phải sửa sau. Chuyển sang `ext.*` bây giờ để code mới viết
// đúng ngay, dù việc hỗ trợ Firefox thật (sidebar_action, background.scripts)
// còn nằm ở phía trước.
//
// Trên Chrome `globalThis.browser` không tồn tại nên `ext` chính là `chrome` —
// không đổi một hành vi nào.
//
// VÌ SAO LÀ PROXY chứ không phải `const ext = browser ?? chrome`:
//
//   1. Không được chốt giá trị lúc module load. Test lắp `globalThis.chrome`
//      trong `beforeEach`, tức SAU khi module đã được import — chốt sớm sẽ bắt
//      được `undefined` và mọi test chạm storage sẽ vỡ.
//   2. Không được đọc `chrome` như một identifier trần. Khi `globalThis.chrome`
//      không tồn tại (môi trường test trước khi setup), tham chiếu trần ném
//      ReferenceError chứ không trả undefined.
//
// Proxy chỉ một tầng: `ext.storage` trả về đúng object `storage` thật, từ đó
// `.local.get(…)` đi thẳng, không qua thêm lớp nào.
type Ext = typeof chrome

const root = globalThis as { browser?: Ext; chrome?: Ext }

const resolve = (): Ext => {
  const api = root.browser ?? root.chrome
  if (!api) throw new Error('Không có WebExtension API (browser/chrome) trong môi trường này')
  return api
}

export const ext: Ext = new Proxy({} as Ext, {
  get: (_target, key) => resolve()[key as keyof Ext],
  // `'storage' in ext` và Object.keys(ext) phải phản ánh API thật, không phải
  // object rỗng — nếu không thì mọi phép kiểm tra feature detection đều sai.
  has: (_target, key) => key in resolve(),
  ownKeys: () => Reflect.ownKeys(resolve()),
  getOwnPropertyDescriptor: (_target, key) =>
    Reflect.getOwnPropertyDescriptor(resolve(), key)
    ?? { configurable: true, enumerable: true, value: resolve()[key as keyof Ext] },
})

/**
 * Nền tảng này là Firefox (theo nghĩa "dùng sidebarAction thay vì sidePanel").
 *
 * Phát hiện bằng SỰ CÓ MẶT của API, không sniff user agent: UA sai ngay khi một
 * bên đổi chuỗi, còn câu hỏi thật ta cần trả lời luôn là "API nào có ở đây".
 *
 * Dùng để chọn asset trong release (bản Chrome hay bản Firefox) — xem
 * core/version pickZip.
 */
export const isFirefox = (): boolean => 'sidebarAction' in ext
