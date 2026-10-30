#!/usr/bin/env node
// Đóng gói thư mục build thành zip.
//
//   node scripts/pack.mjs                    → dist/        → worklog-ext-<v>.zip
//   node scripts/pack.mjs --target firefox   → dist-firefox → worklog-ext-<v>-firefox.zip
//   node scripts/pack.mjs --target windows   → dist/        → worklog-ext-<v>-windows.zip
//
// Hai zip đầu đúng dạng store yêu cầu: manifest.json nằm ở gốc zip, không bọc
// thêm thư mục. Zip `windows` thì NGƯỢC LẠI — bọc đúng MỘT thư mục `Worklog
// Extension`, để kéo thư mục đó từ Explorer thả vào Documents, hoặc "Extract
// All…" với đích Documents, đều ra `Documents\Worklog Extension` — cùng một
// đường dẫn ở mọi lần cập nhật. Nó cũng là đầu vào của .dmg và .exe (xem
// .github/workflows/installers.yml), nên ba gói luôn cùng nội dung.
import { cpSync, existsSync, mkdirSync, readFileSync, appendFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const targetIndex = process.argv.indexOf('--target')
const target = targetIndex === -1 ? 'chrome' : process.argv[targetIndex + 1]
if (target !== 'chrome' && target !== 'firefox' && target !== 'windows') {
  console.error(`✗ Target không biết: ${target} (chrome | firefox | windows)`)
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
const name = target === 'chrome'
  ? `worklog-ext-${version}`
  : `worklog-ext-${version}-${target}`
const zip = join(outDir, `${name}.zip`)

mkdirSync(outDir, { recursive: true })
rmSync(zip, { force: true })

// -r đệ quy, -q im lặng, -X bỏ metadata của macOS cho zip tái lập được.
if (target === 'windows') {
  // Tên thư mục là hợp đồng với README, installer .exe và .dmg — đổi là người
  // dùng thả bản mới vào một thư mục khác với cái Chrome đang load.
  const folder = 'Worklog Extension'
  const stage = join(outDir, '.stage-windows')
  rmSync(stage, { recursive: true, force: true })
  cpSync(dist, join(stage, folder), { recursive: true })
  execFileSync('zip', ['-rqX', zip, folder], { cwd: stage, stdio: 'inherit' })
  rmSync(stage, { recursive: true, force: true })
} else {
  execFileSync('zip', ['-rqX', zip, '.'], { cwd: dist, stdio: 'inherit' })
}

console.log(`✓ ${zip}`)

if (process.argv.includes('--github-output') && process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `zip=${zip}\nname=${name}\nversion=${version}\ntarget=${target}\n`,
  )
}
