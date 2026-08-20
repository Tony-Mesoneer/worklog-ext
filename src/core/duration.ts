// Chấp nhận: "1h30", "1h30m", "1h 30m", "2h", "90m", "1.5h", "45" (= 45 phút).
// Từ chối: rỗng, âm, 0, đơn vị lạ ("1d"), đơn vị lặp ("1h2h").
const PATTERN = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m?)?$/

export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (s === '') return null

  const m = PATTERN.exec(s)
  if (!m) return null

  const [, hoursRaw, restRaw] = m
  if (hoursRaw === undefined && restRaw === undefined) return null

  const hours = hoursRaw === undefined ? 0 : Number(hoursRaw)
  // Phần thứ hai là phút trong cả hai trường hợp: có "h" đứng trước ("1h30")
  // hoặc là số trần ("45"). Ta không bao giờ hiểu số trần là giờ.
  const minutes = restRaw === undefined ? 0 : Number(restRaw)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null

  const seconds = Math.floor(hours * 3600 + minutes * 60)
  return seconds > 0 ? seconds : null
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatHhMm(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}:${String(m).padStart(2, '0')}`
}
