#!/usr/bin/env node
// Bump version ở cả package.json, package-lock.json và manifest.json cùng lúc,
// rồi commit + tag. Push tag lên là workflow Release chạy.
//
//   node scripts/bump-version.mjs patch|minor|major|<x.y.z> [--no-commit] [--dry-run]
//
// Chrome chỉ nhận version dạng số (tối đa 4 nhóm), không có prerelease —
// nên ở đây chỉ cho phép x.y.z.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const noCommit = args.includes('--no-commit')
const bump = args.find((a) => !a.startsWith('--'))

if (!bump) {
  console.error('Dùng: node scripts/bump-version.mjs patch|minor|major|<x.y.z>')
  process.exit(1)
}

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim()

if (!dryRun && !noCommit && git('status', '--porcelain') !== '') {
  console.error('✗ Working tree không sạch — commit hoặc stash trước khi bump.')
  process.exit(1)
}

const manifestPath = join(root, 'manifest.json')
const manifestRaw = readFileSync(manifestPath, 'utf8')
const current = JSON.parse(manifestRaw).version

const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
  if (!m) throw new Error(`Version không đúng dạng x.y.z: ${v}`)
  return m.slice(1, 4).map(Number)
}

let next
if (['patch', 'minor', 'major'].includes(bump)) {
  const [major, minor, patch] = parse(current)
  next =
    bump === 'major'
      ? `${major + 1}.0.0`
      : bump === 'minor'
        ? `${major}.${minor + 1}.0`
        : `${major}.${minor}.${patch + 1}`
} else {
  parse(bump)
  next = bump
}

// Thay đúng field "version" ở cấp cao nhất, giữ nguyên format phần còn lại của file.
const replaceTopLevelVersion = (raw, value) => {
  const re = /^(\s*"version"\s*:\s*")[^"]*(")/m
  if (!re.test(raw)) throw new Error('Không tìm thấy field "version"')
  return raw.replace(re, `$1${value}$2`)
}

// Landing page không phải JSON: version nằm trong text của những phần tử mang
// attribute `data-version`. Thay token vX.Y.Z bên trong chúng, không đụng số
// version nào khác trên trang (vd tên file zip trong hướng dẫn cài).
// Regex dựng MỚI mỗi lần gọi, không dùng chung một hằng: một regex /g giữ
// `lastIndex` giữa các lần .test(), nên dùng lại nó là mời một bug im lặng.
const htmlVersionRe = () => /(<[^>]*\bdata-version\b[^>]*>[^<]*?)v\d+\.\d+\.\d+/g
const replaceHtmlVersion = (raw, value) => {
  if (!htmlVersionRe().test(raw)) {
    throw new Error('Không tìm thấy phần tử data-version nào trong docs/index.html')
  }
  return raw.replace(htmlVersionRe(), `$1v${value}`)
}

// docs/index.html nằm trong danh sách vì trang này ĐANG nói version cho người
// dùng đọc. Trước đây nó không được bump, nên landing page đứng yên ở v0.5.0
// suốt tới v0.10.0 — quảng cáo sai một bản đã cũ 5 release.
const targets = ['package.json', 'manifest.json', 'package-lock.json', 'docs/index.html']
const tag = `v${next}`

console.log(`${current} → ${next}`)

if (dryRun) {
  console.log('(dry run, không sửa file)')
  process.exit(0)
}

for (const file of targets) {
  const path = join(root, file)
  const raw = readFileSync(path, 'utf8')
  // package-lock.json có version ở cả gói gốc và packages[""].
  const updated =
    file === 'docs/index.html'
      ? replaceHtmlVersion(raw, next)
      : file === 'package-lock.json'
      ? replaceTopLevelVersion(raw, next).replace(
          /("":\s*\{\s*\n\s*"name":[^\n]*\n\s*"version":\s*")[^"]*(")/,
          `$1${next}$2`,
        )
      : replaceTopLevelVersion(raw, next)
  writeFileSync(path, updated)
  console.log(`  ✓ ${file}`)
}

if (noCommit) {
  console.log('(--no-commit: chưa commit, chưa tag)')
  process.exit(0)
}

git('add', ...targets)
git('commit', '-m', `chore(release): ${tag}`)
git('tag', '-a', tag, '-m', tag)

console.log(`\n✓ Đã commit và tag ${tag}`)
console.log(`  Push để chạy release: git push origin HEAD --follow-tags`)
