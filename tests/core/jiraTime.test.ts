// tests/core/jiraTime.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseStarted, formatStarted, parseOffsetMinutes,
  offsetMinutesForZone, addDays, todayInZone,
} from '@/core/jiraTime'

describe('parseStarted', () => {
  it('đọc wall-clock nguyên văn, không dịch timezone', () => {
    expect(parseStarted('2026-08-19T09:00:00.000+0700'))
      .toEqual({ date: '2026-08-19', minutes: 540 })
  })

  it('không bị ảnh hưởng bởi offset — offset chỉ là metadata', () => {
    // Cùng wall-clock, khác offset → cùng kết quả. Đây là hành vi có chủ ý.
    expect(parseStarted('2026-08-19T09:00:00.000+0200'))
      .toEqual({ date: '2026-08-19', minutes: 540 })
  })

  it('xử lý giờ sát nửa đêm mà không nhảy ngày', () => {
    expect(parseStarted('2026-08-19T23:45:00.000+0700'))
      .toEqual({ date: '2026-08-19', minutes: 1425 })
    expect(parseStarted('2026-08-19T00:15:00.000+0700'))
      .toEqual({ date: '2026-08-19', minutes: 15 })
  })

  it('chấp nhận dạng offset có dấu hai chấm và dạng Z', () => {
    expect(parseStarted('2026-08-19T09:30:00.000+07:00'))
      .toEqual({ date: '2026-08-19', minutes: 570 })
    expect(parseStarted('2026-08-19T09:30:00.000Z'))
      .toEqual({ date: '2026-08-19', minutes: 570 })
  })

  it('ném lỗi cho chuỗi không phải ISO — dữ liệu lạ phải ồn ào, không âm thầm', () => {
    expect(() => parseStarted('hôm qua')).toThrow()
  })
})

describe('parseOffsetMinutes', () => {
  it('đọc offset ra phút', () => {
    expect(parseOffsetMinutes('2026-08-19T09:00:00.000+0700')).toBe(420)
    expect(parseOffsetMinutes('2026-08-19T09:00:00.000+07:00')).toBe(420)
    expect(parseOffsetMinutes('2026-08-19T09:00:00.000-0330')).toBe(-210)
    expect(parseOffsetMinutes('2026-08-19T09:00:00.000Z')).toBe(0)
  })

  it('trả null khi không có offset', () => {
    expect(parseOffsetMinutes('2026-08-19T09:00:00.000')).toBeNull()
  })
})

describe('formatStarted', () => {
  it('ra đúng format Jira yêu cầu', () => {
    expect(formatStarted('2026-08-19', 540, 420))
      .toBe('2026-08-19T09:00:00.000+0700')
  })

  it('pad đủ chữ số và xử lý offset âm', () => {
    expect(formatStarted('2026-01-05', 15, -210))
      .toBe('2026-01-05T00:15:00.000-0330')
  })

  it('vòng lại được qua parseStarted', () => {
    const s = formatStarted('2026-08-19', 1425, 420)
    expect(parseStarted(s)).toEqual({ date: '2026-08-19', minutes: 1425 })
  })
})

describe('offsetMinutesForZone', () => {
  it('trả offset của timezone tại một ngày cụ thể', () => {
    expect(offsetMinutesForZone('Asia/Jakarta', '2026-08-19')).toBe(420)
    expect(offsetMinutesForZone('UTC', '2026-08-19')).toBe(0)
  })

  it('theo đúng DST của ngày được hỏi, không dùng ngày hôm nay', () => {
    // Zurich: UTC+2 mùa hè, UTC+1 mùa đông.
    expect(offsetMinutesForZone('Europe/Zurich', '2026-07-15')).toBe(120)
    expect(offsetMinutesForZone('Europe/Zurich', '2026-01-15')).toBe(60)
  })
})

describe('addDays', () => {
  it('cộng trừ ngày qua biên tháng và năm', () => {
    expect(addDays('2026-08-19', 1)).toBe('2026-08-20')
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })
})

describe('todayInZone', () => {
  it('trả ngày theo timezone Jira, không theo timezone máy', () => {
    // 2026-08-19T23:00Z là 2026-08-20 ở UTC+7
    const now = new Date('2026-08-19T23:00:00.000Z')
    expect(todayInZone('Asia/Jakarta', now)).toBe('2026-08-20')
    expect(todayInZone('UTC', now)).toBe('2026-08-19')
  })
})
