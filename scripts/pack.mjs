#!/usr/bin/env node
// Đóng gói thư mục build thành zip đúng dạng store yêu cầu: manifest.json nằm ở
// gốc zip, không bọc thêm thư mục.
//
//   node scripts/pack.mjs                    → dist/       → worklog-ext-<v>.zip
//   node scripts/pack.mjs --target firefox   → dist-firefox → worklog-ext-<v>-firefox.zip
import { existsSync, mkdirSync, readFileSync, appendFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const targetIndex = process.argv.indexOf('--target')
const target = targetIndex === -1 ? 'chrome' : process.argv[targetIndex + 1]
if (target !== 'chrome' && target !== 'firefox') {
  console.error(`✗ Target không biết: ${target} (chrome | firefox)`)
  process.exit(1)
}

// Chrome giữ `dist/` để không ai phải trỏ lại Load unpacked — xem vite.config.
const dist = join(root, target === 'firefox' ? 'dist-firefox' : 'dist')
const outDir = join(root, 'release')

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error(`✗ Không thấy ${dist}/manifest.json — chạy build cho ${target} trước.`)
  process.exit(1)
}

// Version đọc từ manifest ĐÃ BUILD, không từ package.json: nếu hai chỗ lệch thì
// cái được ship mới là sự thật (check-version-sync là chỗ chặn việc lệch).
const version = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')).version
// Zip Chrome giữ nguyên tên cũ — nó là asset mà tính năng check-update đang tìm.
const name = target === 'firefox'
  ? `worklog-ext-${version}-firefox`
  : `worklog-ext-${version}`
const zip = join(outDir, `${name}.zip`)

mkdirSync(outDir, { recursive: true })
rmSync(zip, { force: true })

// -r đệ quy, -q im lặng, -X bỏ metadata của macOS cho zip tái lập được.
execFileSync('zip', ['-rqX', zip, '.'], { cwd: dist, stdio: 'inherit' })

console.log(`✓ ${zip}`)

if (process.argv.includes('--github-output') && process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `zip=${zip}\nname=${name}\nversion=${version}\ntarget=${target}\n`,
  )
}
