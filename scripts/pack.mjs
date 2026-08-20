#!/usr/bin/env node
// Đóng gói dist/ thành zip đúng dạng Chrome Web Store yêu cầu: manifest.json
// nằm ở gốc zip, không bọc thêm thư mục.
import { existsSync, mkdirSync, readFileSync, appendFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const outDir = join(root, 'release')

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('✗ Không thấy dist/manifest.json — chạy `npm run build` trước.')
  process.exit(1)
}

const version = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')).version
const name = `worklog-ext-${version}`
const zip = join(outDir, `${name}.zip`)

mkdirSync(outDir, { recursive: true })
rmSync(zip, { force: true })

// -r đệ quy, -q im lặng, -X bỏ metadata của macOS cho zip tái lập được.
execFileSync('zip', ['-rqX', zip, '.'], { cwd: dist, stdio: 'inherit' })

console.log(`✓ ${zip}`)

if (process.argv.includes('--github-output') && process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `zip=${zip}\nname=${name}\nversion=${version}\n`,
  )
}
