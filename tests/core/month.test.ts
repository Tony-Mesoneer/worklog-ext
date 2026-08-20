import { describe, expect, it } from 'vitest'
import { daysInMonth, monthGrid, shiftMonth } from '@/core/month'

const flat = (year: number, month: number): string[] =>
  monthGrid(year, month).flat().map((c) => c.date)

describe('monthGrid', () => {
  it('mỗi tuần đúng 7 ô, ở mọi tháng của hai năm', () => {
    for (const y of [2024, 2026]) {
      for (let m = 1; m <= 12; m++) {
        for (const week of monthGrid(y, m)) expect(week).toHaveLength(7)
      }
    }
  })

  it('tuần bắt đầu thứ Hai — tháng khởi đầu Chủ nhật có 6 ngày đệm ở đầu', () => {
    // 2026-02-01 là Chủ nhật.
    const grid = monthGrid(2026, 2)
    expect(grid[0]?.map((c) => c.date)).toEqual([
      '2026-01-26', '2026-01-27', '2026-01-28', '2026-01-29',
      '2026-01-30', '2026-01-31', '2026-02-01',
    ])
    expect(grid[0]?.slice(0, 6).every((c) => !c.inMonth)).toBe(true)
    expect(grid[0]?.[6]?.inMonth).toBe(true)
  })

  it('tháng khởi đầu thứ Hai không có ngày đệm ở đầu', () => {
    // 2026-06-01 là thứ Hai.
    const grid = monthGrid(2026, 6)
    expect(grid[0]?.[0]).toEqual({ date: '2026-06-01', inMonth: true })
  })

  it('tháng Hai năm nhuận chứa đủ 29 ngày', () => {
    const cells = monthGrid(2024, 2).flat().filter((c) => c.inMonth)
    expect(cells).toHaveLength(29)
    expect(cells[28]?.date).toBe('2024-02-29')
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 2)).toBe(28)
  })

  it('các ô liên tiếp cách nhau đúng một ngày', () => {
    const dates = flat(2026, 8)
    for (let i = 1; i < dates.length; i++) {
      const prev = Date.parse(`${dates[i - 1]}T00:00:00Z`)
      expect(Date.parse(`${dates[i]}T00:00:00Z`) - prev).toBe(86400000)
    }
  })

  it('chứa mọi ngày của tháng và không ngày nào của tháng khác bị gắn inMonth', () => {
    const cells = monthGrid(2026, 8).flat()
    expect(cells.filter((c) => c.inMonth).map((c) => c.date))
      .toEqual(Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`))
  })
})

describe('shiftMonth', () => {
  it('giữ nguyên ngày khi tháng đích có ngày đó', () => {
    expect(shiftMonth('2026-08-20', -1)).toBe('2026-07-20')
    expect(shiftMonth('2026-08-20', 1)).toBe('2026-09-20')
  })

  it('kẹp về ngày cuối tháng khi tháng đích ngắn hơn', () => {
    expect(shiftMonth('2026-03-31', -1)).toBe('2026-02-28')
    expect(shiftMonth('2024-03-31', -1)).toBe('2024-02-29')
  })

  it('vượt biên năm', () => {
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-15')
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-15')
  })
})
