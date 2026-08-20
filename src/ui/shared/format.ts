import { formatDuration, formatHhMm } from '@/core/duration'

export const hoursLabel = (seconds: number): string =>
  seconds === 0 ? '–' : formatDuration(seconds)

export const cellLabel = (seconds: number): string =>
  seconds === 0 ? '' : formatHhMm(seconds)

// Chuỗi "YYYY-MM-DD" → Date ở UTC. Bắt buộc đi qua Date.UTC: `new Date(s)` với
// chuỗi ngày trần cũng là UTC nhưng khi format lại theo timezone máy sẽ lệch
// một ngày ở múi giờ âm.
const utcDate = (date: string): Date => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d))
}

const WEEKDAY = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', timeZone: 'UTC' })

// "Thứ Năm, 20/08" — thay cho ISO trần `2026-08-20` trong header side panel.
// Intl vi-VN trả "thứ năm" chữ thường, ta hoa hoá chữ đầu.
export const weekdayLabel = (date: string): string => {
  const w = WEEKDAY.format(utcDate(date))
  return w.charAt(0).toUpperCase() + w.slice(1)
}

// Ghép tay thay vì Intl: ICU của vi-VN cho ra "20-08" khi chỉ xin day+month,
// còn người Việt viết "20/08".
export const dayMonthLabel = (date: string): string =>
  `${date.slice(8, 10)}/${date.slice(5, 7)}`

export const longDateLabel = (date: string): string =>
  `${weekdayLabel(date)}, ${dayMonthLabel(date)}`

// Nhãn khoảng ngày cho header dashboard: "17/08 – 28/08/2026".
export const rangeLabel = (from: string, to: string): string => {
  if (from === '' || to === '') return ''
  return `${dayMonthLabel(from)} – ${dayMonthLabel(to)}/${to.slice(0, 4)}`
}

// Phần trăm làm tròn, dùng cho hàng summary coverage.
export const percentLabel = (value: number, max: number): string =>
  max <= 0 ? '–' : `${Math.round((value / max) * 100)}%`
