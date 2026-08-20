import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { fileURLToPath, URL } from 'node:url'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      // dashboard không được manifest tham chiếu (mở bằng chrome.tabs.create),
      // nên crxjs không tự nhận ra — phải khai báo entry thủ công để có mặt trong dist/.
      input: {
        dashboard: fileURLToPath(
          new URL('./src/ui/dashboard/index.html', import.meta.url),
        ),
      },
    },
  },
})
