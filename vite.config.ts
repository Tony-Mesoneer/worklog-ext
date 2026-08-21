import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { fileURLToPath, URL } from 'node:url'
import { manifestFor, type Target } from './manifest.config'

// Target đọc từ env chứ không phải vite `mode`: mode còn mang nghĩa
// development/production, gộp hai trục vào một biến sẽ khiến `--mode firefox`
// vô tình tắt tối ưu production.
const target: Target = process.env['TARGET'] === 'firefox' ? 'firefox' : 'chrome'

// Chrome giữ `dist/` như trước — đổi đường dẫn sẽ buộc mọi người đang dùng phải
// trỏ lại "Load unpacked". Firefox là thư mục riêng. Bất đối xứng có chủ ý.
const outDir = target === 'firefox' ? 'dist-firefox' : 'dist'

export default defineConfig({
  // `browser` là thứ làm crxjs đổi background.service_worker (Chrome) thành
  // background.scripts (Firefox) — Firefox MV3 không có service worker.
  plugins: [react(), crx({ manifest: manifestFor(target), browser: target })],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir,
    rollupOptions: {
      // dashboard không được manifest tham chiếu (mở bằng tabs.create), nên
      // crxjs không tự nhận ra — phải khai báo entry thủ công để có mặt trong
      // thư mục build.
      input: {
        dashboard: fileURLToPath(
          new URL('./src/ui/dashboard/index.html', import.meta.url),
        ),
      },
    },
  },
})
