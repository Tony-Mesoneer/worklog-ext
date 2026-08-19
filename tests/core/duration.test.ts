import { describe, it, expect } from 'vitest'
import { parseDuration, formatDuration, formatHhMm } from '@/core/duration'

describe('parseDuration', () => {
  it('parse dạng giờ + phút liền nhau', () => {
    expect(parseDuration('1h30')).toBe(5400)
    expect(parseDuration('1h30m')).toBe(5400)
    expect(parseDuration('1h 30m')).toBe(5400)
  })

  it('parse chỉ giờ hoặc chỉ phút', () => {
    expect(parseDuration('2h')).toBe(7200)
    expect(parseDuration('90m')).toBe(5400)
    expect(parseDuration('15m')).toBe(900)
  })

  it('parse giờ thập phân', () => {
    expect(parseDuration('1.5h')).toBe(5400)
    expect(parseDuration('0.25h')).toBe(900)
  })

  it('số trần được hiểu là phút', () => {
    // Người dùng gõ "45" hầu như luôn có ý 45 phút, không phải 45 giờ.
    expect(parseDuration('45')).toBe(2700)
  })

  it('không phân biệt hoa thường và bỏ qua khoảng trắng', () => {
    expect(parseDuration('  2H 15M ')).toBe(8100)
  })

  it('trả null cho input không hợp lệ', () => {
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
    expect(parseDuration('-1h')).toBeNull()
    expect(parseDuration('1h2h')).toBeNull()
    expect(parseDuration('1d')).toBeNull()
  })

  it('trả null cho 0 — Jira từ chối worklog 0 giây', () => {
    expect(parseDuration('0')).toBeNull()
    expect(parseDuration('0m')).toBeNull()
    expect(parseDuration('0h')).toBeNull()
  })

  it('làm tròn xuống giây, không trả số thập phân', () => {
    // 0.1h = 360s đúng; 1.234h phải ra số nguyên
    expect(Number.isInteger(parseDuration('1.234h')!)).toBe(true)
  })
})

describe('formatDuration', () => {
  it('format giờ và phút', () => {
    expect(formatDuration(5400)).toBe('1h 30m')
    expect(formatDuration(7200)).toBe('2h')
    expect(formatDuration(2700)).toBe('45m')
    expect(formatDuration(0)).toBe('0m')
  })
})

describe('formatHhMm', () => {
  it('format dạng h:mm cho ô bảng', () => {
    expect(formatHhMm(5400)).toBe('1:30')
    expect(formatHhMm(7200)).toBe('2:00')
    expect(formatHhMm(2700)).toBe('0:45')
    expect(formatHhMm(0)).toBe('0:00')
  })
})
