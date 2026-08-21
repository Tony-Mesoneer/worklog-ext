import { formatDuration, formatHhMm } from '@/core/duration'
import { intlLocale, type Locale } from '@/i18n/locale'

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

// Intl.DateTimeFormat khá đắt để tạo, và các nhãn này được gọi cho MỖI Ô trong
// bảng dashboard (~30 cột × N member). Cache theo locale thay vì tạo mới mỗi
// lần — nhưng không thể là hằng số module nữa, vì locale giờ là dữ liệu chạy.
const cache = <T>(make: (tag: string) => T) => {
  const map = new Map<string, T>()
  return (locale: Locale): T => {
    const tag = intlLocale(locale)
    let hit = map.get(tag)
    if (hit === undefined) { hit = make(tag); map.set(tag, hit) }
    return hit
  }
}

const weekdayFmt = cache((tag) =>
  new Intl.DateTimeFormat(tag, { weekday: 'long', timeZone: 'UTC' }))

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

// "Thứ Năm" / "Thursday". Intl vi-VN trả "thứ năm" chữ thường, ta hoa hoá chữ
// đầu; en-US đã hoa sẵn nên capitalize là no-op.
export const weekdayLabel = (locale: Locale, date: string): string =>
  capitalize(weekdayFmt(locale).format(utcDate(date)))

// Ghép tay thay vì Intl: ICU của vi-VN cho ra "20-08" khi chỉ xin day+month,
// còn người Việt viết "20/08". Thứ tự ngày/tháng theo locale — "08/20" ở en-US
// và "20/08" ở vi-VN; đọc sai thứ tự này là đọc sai cả cột trong dashboard.
export const dayMonthLabel = (locale: Locale, date: string): string => {
  const day = date.slice(8, 10)
  const month = date.slice(5, 7)
  return locale === 'en' ? `${month}/${day}` : `${day}/${month}`
}

export const longDateLabel = (locale: Locale, date: string): string =>
  `${weekdayLabel(locale, date)}, ${dayMonthLabel(locale, date)}`

// Nhãn đầy đủ cho aria-label của ô lịch: "Thứ Năm, 20/08/2026".
export const fullDateLabel = (locale: Locale, date: string): string =>
  `${weekdayLabel(locale, date)}, ${dayMonthLabel(locale, date)}/${date.slice(0, 4)}`

const monthYearFmt = cache((tag) =>
  new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }))

// "tháng 8 năm 2026" / "August 2026" → hoa hoá chữ đầu cho tiêu đề popover lịch.
export const monthYearLabel = (locale: Locale, date: string): string =>
  capitalize(monthYearFmt(locale).format(utcDate(date)))

// Nhãn khoảng ngày cho header dashboard: "17/08 – 28/08/2026".
export const rangeLabel = (locale: Locale, from: string, to: string): string => {
  if (from === '' || to === '') return ''
  return `${dayMonthLabel(locale, from)} – ${dayMonthLabel(locale, to)}/${to.slice(0, 4)}`
}

// Phần trăm làm tròn, dùng cho hàng summary coverage.
export const percentLabel = (value: number, max: number): string =>
  max <= 0 ? '–' : `${Math.round((value / max) * 100)}%`
