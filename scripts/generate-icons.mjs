// Sinh icon PNG (16/32/48/128) từ assets/icon-template.html bằng Chromium
// headless. Không thêm dependency npm nào — chỉ cần một binary Chromium có
// trên máy. Chạy: `node scripts/generate-icons.mjs`
//
// Vì sao không dùng generator tự vẽ PNG như trước: cần render chữ "Meso" bằng
// font thật, và tự vẽ glyph bằng tay cho ra chữ tệ ở mọi kích thước.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'icons')
const TEMPLATE = path.join(ROOT, 'assets', 'icon-template.html')

// Chromium nào cũng được; lấy cái đầu tiên tìm thấy.
const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  process.env.CHROME_PATH,
].filter(Boolean)

const browser = CANDIDATES.find((p) => existsSync(p))
if (!browser) {
  console.error('Không tìm thấy Chromium. Đặt CHROME_PATH rồi chạy lại.')
  process.exit(1)
}

// 16 và 32 chỉ dùng chữ M: "Meso" ở 16px là ~4px mỗi ký tự, thành vệt mờ.
const SPECS = [
  { size: 16, text: 'M', font: 12, radius: 3.5 },
  { size: 32, text: 'M', font: 23, radius: 7 },
  { size: 48, text: 'Meso', font: 16, radius: 10.5 },
  { size: 128, text: 'Meso', font: 42, radius: 28 },
]

mkdirSync(OUT, { recursive: true })
const profile = path.join(process.env.TMPDIR || '/tmp', 'icon-render-profile')

for (const { size, text, font, radius } of SPECS) {
  const url = `file://${TEMPLATE}?size=${size}&text=${encodeURIComponent(text)}&font=${font}&radius=${radius}`
  const out = path.join(OUT, `icon${size}.png`)
  // Chromium ghi file rồi có thể không tự thoát; đừng chờ exit, chỉ cần file.
  try {
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--virtual-time-budget=800',
      `--user-data-dir=${profile}`,
      '--default-background-color=00000000',
      `--window-size=${size},${size}`,
      `--screenshot=${out}`,
      url,
    ], { stdio: 'pipe', timeout: 20000 })
  } catch (e) {
    if (!existsSync(out)) throw e
  }
  if (!existsSync(out)) throw new Error(`không render được icon${size}.png`)
  console.log(`icon${size}.png — "${text}"`)
}
rmSync(profile, { recursive: true, force: true })
console.log('xong')
