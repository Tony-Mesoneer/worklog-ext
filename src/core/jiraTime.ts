// src/core/jiraTime.ts

// Jira trả started dạng 2026-08-19T09:00:00.000+0700.
// Ta đọc wall-clock NGUYÊN VĂN, không qua new Date(): xem ghi chú quyết định
// trong plan/spec §12. Offset chỉ dùng khi GHI, không dùng khi đọc.
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
const OFFSET = /(?:(Z)|([+-])(\d{2}):?(\d{2}))$/

export function parseStarted(started: string): { date: string; minutes: number } {
  const m = ISO.exec(started)
  if (!m) throw new Error(`started không phải ISO: ${started}`)
  const [, y, mo, d, hh, mm] = m
  return {
    date: `${y}-${mo}-${d}`,
    minutes: Number(hh) * 60 + Number(mm),
  }
}

export function parseOffsetMinutes(iso: string): number | null {
  const m = OFFSET.exec(iso.trim())
  if (!m) return null
  const [, z, sign, hh, mm] = m
  if (z) return 0
  const magnitude = Number(hh) * 60 + Number(mm)
  return sign === '-' ? -magnitude : magnitude
}

export function formatStarted(date: string, minutes: number, offsetMinutes: number): string {
  const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0')
  const hh = Math.floor(minutes / 60)
  const mm = minutes % 60
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const offH = Math.floor(Math.abs(offsetMinutes) / 60)
  const offM = Math.abs(offsetMinutes) % 60
  return `${date}T${pad(hh)}:${pad(mm)}:00.000${sign}${pad(offH)}${pad(offM)}`
}

// Lấy offset của một IANA timezone tại một ngày cụ thể. Dùng Intl thay vì thêm
// date library: Intl có sẵn trong cả Chrome và node, và nó biết DST.
export function offsetMinutesForZone(timeZone: string, date: string): number {
  // Lấy giữa trưa để tránh biên DST chuyển lúc nửa đêm.
  const probe = new Date(`${date}T12:00:00.000Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(probe)
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00'
  if (name === 'GMT') return 0
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  if (!m) return 0
  const [, sign, hh, mm] = m
  const magnitude = Number(hh) * 60 + Number(mm)
  return sign === '-' ? -magnitude : magnitude
}

export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  // Dùng UTC để phép cộng ngày không bị DST của máy làm lệch.
  const t = Date.UTC(y, m - 1, d) + delta * 86400000
  const dt = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export function todayInZone(timeZone: string, now: Date): string {
  // en-CA cho ra đúng YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
