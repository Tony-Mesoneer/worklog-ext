#!/usr/bin/env node
// Đọc conventional commits từ tag gần nhất tới HEAD và quyết định mức bump.
//
//   node scripts/next-version.mjs [--github-output]
//
// Luật:
//   BREAKING CHANGE / type!:  → major (nhưng khi còn 0.x thì chỉ lên minor,
//                               để không tự ý công bố "1.0 stable")
//   feat:                     → minor
//   fix: / perf:              → patch
//   còn lại (docs, chore, refactor, test, style, ci, build) → không bump
import { readFileSync } from 'node:fs'
import { appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' })

const current = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')).version

let lastTag = null
try {
  lastTag = git('describe', '--tags', '--abbrev=0', '--match', 'v*').trim()
} catch {
  // Chưa có tag nào — xét toàn bộ history.
}

const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
// %x00 phân tách các commit; %B là subject + body đầy đủ.
const messages = git('log', range, '--no-merges', '--format=%B%x00')
  .split('\0')
  .map((m) => m.trim())
  .filter(Boolean)

const HEADER = /^(\w+)(\([^)]*\))?(!)?:\s/

let level = null
const rank = { patch: 1, minor: 2, major: 3 }
const raise = (next) => {
  if (!level || rank[next] > rank[level]) level = next
}
const reasons = []

for (const message of messages) {
  const subject = message.split('\n')[0] ?? ''
  const match = HEADER.exec(subject)
  const type = match?.[1]?.toLowerCase()
  const bang = Boolean(match?.[3])
  const breaking = bang || /^BREAKING[ -]CHANGE:/m.test(message)

  if (breaking) {
    raise('major')
    reasons.push(`major ← ${subject}`)
  } else if (type === 'feat') {
    raise('minor')
    reasons.push(`minor ← ${subject}`)
  } else if (type === 'fix' || type === 'perf') {
    raise('patch')
    reasons.push(`patch ← ${subject}`)
  }
}

const [major, minor, patch] = current.split('.').map(Number)

// Trong giai đoạn 0.x, breaking không đẩy lên 1.0.0.
let effective = level
if (level === 'major' && major === 0) {
  effective = 'minor'
  reasons.push('major → minor (đang ở 0.x, không tự lên 1.0.0)')
}

const next =
  effective === 'major'
    ? `${major + 1}.0.0`
    : effective === 'minor'
      ? `${major}.${minor + 1}.0`
      : effective === 'patch'
        ? `${major}.${minor}.${patch + 1}`
        : null

console.log(`Từ ${lastTag ?? '(chưa có tag)'} tới HEAD: ${messages.length} commit`)
for (const reason of reasons) console.log(`  ${reason}`)
console.log(next ? `→ bump ${effective}: ${current} → ${next}` : '→ không có gì để release')

if (process.argv.includes('--github-output') && process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `level=${effective ?? ''}\ncurrent=${current}\nnext=${next ?? ''}\ntag=${next ? `v${next}` : ''}\n`,
  )
}
