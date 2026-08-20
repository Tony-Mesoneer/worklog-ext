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

// Giới hạn cuối của lưới slot. Một hằng số duy nhất cho cả timeline, dropdown
// và nextFreeStart — nếu ba chỗ lệch nhau thì UI hiện một giờ mà state giữ giờ
// khác, rồi POST sai giờ lên Jira.
export const DAY_END_MINUTES = 20 * 60

// Mốc slot cuối cùng mà buildSlots(workdayStart, dayEnd, slot) sinh ra.
export function lastSlotStart(
  workdayStartMinutes: number,
  slotMinutes: number,
  dayEndMinutes: number = DAY_END_MINUTES,
): number {
  if (slotMinutes <= 0 || dayEndMinutes <= workdayStartMinutes) return workdayStartMinutes
  const count = Math.ceil((dayEndMinutes - workdayStartMinutes) / slotMinutes)
  return workdayStartMinutes + (count - 1) * slotMinutes
}

// Start time mặc định = ngay sau worklog kết thúc muộn nhất trong ngày, snap lên
// lưới; nhưng không sớm hơn giờ bắt đầu ngày làm việc và không vượt quá slot
// cuối cùng của lưới. Clamp là bắt buộc: dropdown chỉ có option trong lưới, một
// <select> có value ngoài lưới sẽ hiện option ĐẦU TIÊN trong khi state giữ giá
// trị khác — panel hiện 09:00 nhưng ghi 20:15. Ngày đã kín thì cảnh báo chồng
// giờ sẽ tự bật, đó là thông tin đúng.
export function nextFreeStart(
  entries: DayEntry[],
  workdayStartMinutes: number,
  slotMinutes: number,
  dayEndMinutes: number = DAY_END_MINUTES,
): number {
  const lastEnd = entries.reduce(
    (max, e) => Math.max(max, e.startMinutes + e.durationMinutes),
    0,
  )
  // Snap trên lưới tính TỪ workdayStart, không từ nửa đêm: với workdayStart
  // 09:30 và slot 60 phút thì lưới là 09:30/10:30/…, nên snapUp tuyệt đối sẽ
  // trả 10:00 — một giá trị không có trong dropdown.
  const candidate =
    workdayStartMinutes + snapUp(Math.max(0, lastEnd - workdayStartMinutes), slotMinutes)
  return Math.min(candidate, lastSlotStart(workdayStartMinutes, slotMinutes, dayEndMinutes))
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
