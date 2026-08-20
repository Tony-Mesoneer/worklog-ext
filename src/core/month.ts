// src/core/month.ts
//
// Lưới tháng cho date picker. Nằm ở core vì đây đúng loại logic dễ sai mà lại
// test được không cần browser: đầu tuần là thứ Hai, tháng nào cũng phải đủ
// tuần 7 ngày, và những ngày đệm của tháng trước/sau phải nhận ra được để UI
// làm mờ chúng.
//
// Không import chrome / fetch / react. Phép cộng ngày dùng lại addDays (UTC),
// nên DST của máy không thể làm lệch một ô nào.
import { addDays } from './jiraTime'

export type MonthCell = {
  date: string // "YYYY-MM-DD"
  /** false = ngày đệm của tháng trước hoặc tháng sau. */
  inMonth: boolean
}

const pad = (n: number): string => String(n).padStart(2, '0')

// Số ngày trong tháng. Date.UTC(y, month, 0) = ngày cuối của tháng `month`
// (month ở đây tính từ 1, nên index 0 của tháng kế tiếp).
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// Thứ trong tuần với thứ Hai = 0 … Chủ nhật = 6. Cùng quy ước với mondayOf của
// FilterBar — hai chỗ lệch nhau thì lưới lệch một cột so với bộ lọc dashboard.
function mondayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/**
 * Lưới tháng, mỗi tuần đúng 7 ô, tuần bắt đầu thứ Hai.
 * @param month 1–12.
 */
export function monthGrid(year: number, month: number): MonthCell[][] {
  const first = `${year}-${pad(month)}-01`
  const lead = mondayIndex(first)
  const total = lead + daysInMonth(year, month)
  const weeks = Math.ceil(total / 7)
  const start = addDays(first, -lead)
  const prefix = `${year}-${pad(month)}-`

  const out: MonthCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const week: MonthCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d)
      week.push({ date, inMonth: date.startsWith(prefix) })
    }
    out.push(week)
  }
  return out
}

// Lùi/tiến một tháng, giữ ngày nếu tháng đích có ngày đó, nếu không thì kẹp về
// ngày cuối tháng. Không có clamp thì "31/03 lùi một tháng" ra 31/02 → không
// tồn tại, và addDays sẽ nhảy sang tháng Ba.
export function shiftMonth(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const total = (y * 12 + (m - 1)) + delta
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`
}
