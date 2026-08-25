#!/usr/bin/env node
// Version sống ở 3 chỗ: package.json, manifest.json và docs/index.html (landing
// page nói version cho người dùng đọc). Chúng phải luôn bằng nhau,
// và khi release thì phải khớp cả git tag. Script này fail sớm để không ship
// bản zip có version lệch với tag.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => JSON.parse(readFileSync(join(root, f), 'utf8'))

const pkgVersion = read('package.json').version
const manifestVersion = read('manifest.json').version

const errors = []
if (pkgVersion !== manifestVersion) {
  errors.push(
    `package.json (${pkgVersion}) khác manifest.json (${manifestVersion}). ` +
      `Chạy: npm run bump -- <patch|minor|major|x.y.z>`,
  )
}

// Landing page: mọi phần tử `data-version` phải nói đúng version đang release.
// Danh sách RỖNG cũng là lỗi — bỏ attribute đi thì trang lại âm thầm đứng yên ở
// một version cũ, đúng cái bug làm nó kẹt ở v0.5.0 tới tận v0.10.0.
const docs = readFileSync(join(root, 'docs/index.html'), 'utf8')
const docsVersions = [
  ...docs.matchAll(/<[^>]*\bdata-version\b[^>]*>[^<]*?v(\d+\.\d+\.\d+)/g),
].map((m) => m[1])

if (docsVersions.length === 0) {
  errors.push(
    'docs/index.html không có phần tử `data-version` nào — bump sẽ không cập ' +
      'nhật được version hiện trên landing page.',
  )
} else {
  for (const v of new Set(docsVersions)) {
    if (v !== manifestVersion) {
      errors.push(
        `docs/index.html (v${v}) khác manifest.json (${manifestVersion}). ` +
          `Chạy: npm run bump -- <patch|minor|major|x.y.z>`,
      )
    }
  }
}

const tagIndex = process.argv.indexOf('--tag')
if (tagIndex !== -1) {
  const raw = process.argv[tagIndex + 1] ?? ''
  const tag = raw.replace(/^refs\/tags\//, '')
  const tagVersion = tag.replace(/^v/, '')
  if (tagVersion !== manifestVersion) {
    errors.push(
      `Tag ${tag} không khớp version trong manifest.json (${manifestVersion}).`,
    )
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`✗ ${e}`)
  process.exit(1)
}

console.log(`✓ version ${manifestVersion} (package.json, manifest.json, docs/index.html)`)
