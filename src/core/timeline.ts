export type DayEntry = {
  id: string
  issueKey: string
  startMinutes: number
  durationMinutes: number
}

export function parseHhMm(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function formatMinutes(m: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export function snapUp(minutes: number, slotMinutes: number): number {
  return Math.ceil(minutes / slotMinutes) * slotMinutes
}

// Start time mặc định = ngay sau worklog kết thúc muộn nhất trong ngày, snap lên
// lưới; nhưng không sớm hơn giờ bắt đầu ngày làm việc.
export function nextFreeStart(
  entries: DayEntry[],
  workdayStartMinutes: number,
  slotMinutes: number,
): number {
  const lastEnd = entries.reduce(
    (max, e) => Math.max(max, e.startMinutes + e.durationMinutes),
    0,
  )
  return Math.max(workdayStartMinutes, snapUp(lastEnd, slotMinutes))
}

export function buildSlots(fromMinutes: number, toMinutes: number, slotMinutes: number): number[] {
  const slots: number[] = []
  for (let m = fromMinutes; m < toMinutes; m += slotMinutes) slots.push(m)
  return slots
}

export function occupiedBy(
  entries: DayEntry[],
  slotStart: number,
  slotMinutes: number,
): DayEntry | null {
  const slotEnd = slotStart + slotMinutes
  for (const e of entries) {
    const end = e.startMinutes + e.durationMinutes
    if (e.startMinutes < slotEnd && end > slotStart) return e
  }
  return null
}

// Kề nhau (end === start) KHÔNG tính là chồng — đó là trường hợp bình thường
// nhất khi lấp kín ngày.
export function findOverlaps(
  entries: DayEntry[],
  startMinutes: number,
  durationMinutes: number,
): DayEntry[] {
  const end = startMinutes + durationMinutes
  return entries.filter((e) => {
    const eEnd = e.startMinutes + e.durationMinutes
    return e.startMinutes < end && eEnd > startMinutes
  })
}
