#!/usr/bin/env node
// Version sống ở 2 chỗ: package.json và manifest.json. Chúng phải luôn bằng nhau,
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

console.log(`✓ version ${manifestVersion}`)
