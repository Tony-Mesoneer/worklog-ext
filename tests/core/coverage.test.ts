import { describe, it, expect } from 'vitest'
import {
  enumerateDates, isWeekend, buildCoverage,
  type Worklog, type Member,
} from '@/core/coverage'

const H = 3600

const member = (accountId: string, hoursPerDay = 8, active = true): Member =>
  ({ accountId, displayName: `User ${accountId}`, hoursPerDay, active })

const wl = (
  authorAccountId: string, date: string, hours: number,
  issueKey = 'CAG-1', id = `${authorAccountId}-${date}-${issueKey}-${hours}`,
): Worklog => ({
  id, issueKey, issueSummary: `Summary ${issueKey}`, authorAccountId, date,
  startMinutes: 540, timeSpentSeconds: hours * H, comment: '',
})

describe('enumerateDates', () => {
  it('liệt kê ngày bao gồm cả hai đầu', () => {
    expect(enumerateDates('2026-08-17', '2026-08-19'))
      .toEqual(['2026-08-17', '2026-08-18', '2026-08-19'])
  })

  it('một ngày duy nhất', () => {
    expect(enumerateDates('2026-08-19', '2026-08-19')).toEqual(['2026-08-19'])
  })

  it('trả rỗng khi from > to', () => {
    expect(enumerateDates('2026-08-19', '2026-08-17')).toEqual([])
  })
})

describe('isWeekend', () => {
  it('nhận thứ Bảy và Chủ nhật', () => {
    expect(isWeekend('2026-08-22')).toBe(true)  // thứ Bảy
    expect(isWeekend('2026-08-23')).toBe(true)  // Chủ nhật
    expect(isWeekend('2026-08-21')).toBe(false) // thứ Sáu
    expect(isWeekend('2026-08-24')).toBe(false) // thứ Hai
  })
})

describe('buildCoverage', () => {
  const dates = enumerateDates('2026-08-17', '2026-08-21') // Hai → Sáu

  it('cộng giờ theo member và theo ngày', () => {
    const table = buildCoverage({
      worklogs: [wl('u1', '2026-08-17', 8), wl('u1', '2026-08-18', 4)],
      members: [member('u1')], dates, daysOff: {},
    })
    const row = table.rows[0]!
    expect(row.perDay['2026-08-17']).toBe(8 * H)
    expect(row.perDay['2026-08-18']).toBe(4 * H)
    expect(row.total).toBe(12 * H)
  })

  it('cộng nhiều worklog cùng ngày cùng issue', () => {
    const table = buildCoverage({
      worklogs: [
        wl('u1', '2026-08-17', 2, 'CAG-1', 'a'),
        wl('u1', '2026-08-17', 3, 'CAG-1', 'b'),
      ],
      members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows[0]!.perDay['2026-08-17']).toBe(5 * H)
    expect(table.rows[0]!.issues).toHaveLength(1)
    expect(table.rows[0]!.issues[0]!.total).toBe(5 * H)
  })

  it('gộp theo issue trong hàng con, sort theo tổng giảm dần', () => {
    const table = buildCoverage({
      worklogs: [
        wl('u1', '2026-08-17', 1, 'CAG-1'),
        wl('u1', '2026-08-18', 6, 'CAG-2'),
      ],
      members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows[0]!.issues.map((i) => i.issueKey)).toEqual(['CAG-2', 'CAG-1'])
  })

  it('hàng total theo ngày và grand total', () => {
    const table = buildCoverage({
      worklogs: [wl('u1', '2026-08-17', 8), wl('u2', '2026-08-17', 4)],
      members: [member('u1'), member('u2')], dates, daysOff: {},
    })
    expect(table.totalPerDay['2026-08-17']).toBe(12 * H)
    expect(table.grandTotal).toBe(12 * H)
  })

  it('capacity loại cuối tuần', () => {
    // Hai→Sáu = 5 ngày làm việc × 8h
    const table = buildCoverage({
      worklogs: [], members: [member('u1')],
      dates: enumerateDates('2026-08-17', '2026-08-23'), // gồm cả T7, CN
      daysOff: {},
    })
    expect(table.rows[0]!.capacitySeconds).toBe(5 * 8 * H)
  })

  it('capacity loại ngày nghỉ phép của đúng member đó', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1'), member('u2')], dates,
      daysOff: { u1: ['2026-08-18'] },
    })
    expect(table.rows[0]!.capacitySeconds).toBe(4 * 8 * H)
    expect(table.rows[1]!.capacitySeconds).toBe(5 * 8 * H)
  })

  it('capacity theo hoursPerDay riêng của member part-time', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1', 4)], dates, daysOff: {},
    })
    expect(table.rows[0]!.capacitySeconds).toBe(5 * 4 * H)
  })

  it('status: empty khi chưa log gì', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows[0]!.status).toBe('empty')
  })

  it('status: under khi log thiếu so với capacity', () => {
    const table = buildCoverage({
      worklogs: [wl('u1', '2026-08-17', 8)], members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows[0]!.status).toBe('under')
  })

  it('status: ok khi đủ hoặc vượt capacity', () => {
    const table = buildCoverage({
      worklogs: dates.map((d) => wl('u1', d, 8)),
      members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows[0]!.status).toBe('ok')
  })

  it('member inactive: vẫn hiện, nhưng capacity = 0 nên không bị báo thiếu', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1', 8, false)], dates, daysOff: {},
    })
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0]!.capacitySeconds).toBe(0)
    expect(table.rows[0]!.status).toBe('empty')
  })

  it('bỏ qua worklog ngoài khoảng ngày', () => {
    const table = buildCoverage({
      worklogs: [wl('u1', '2026-09-01', 8)], members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows[0]!.total).toBe(0)
  })

  it('bỏ qua worklog của người không có trong danh sách member', () => {
    // Người đã rời team nhưng worklog cũ còn đó — không tự thêm hàng mới.
    const table = buildCoverage({
      worklogs: [wl('ghost', '2026-08-17', 8)], members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows).toHaveLength(1)
    expect(table.grandTotal).toBe(0)
  })

  it('giữ đúng thứ tự member được truyền vào', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u2'), member('u1')], dates, daysOff: {},
    })
    expect(table.rows.map((r) => r.member.accountId)).toEqual(['u2', 'u1'])
  })

  it('mọi ngày đều có key trong perDay, kể cả ngày 0 giờ', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1')], dates, daysOff: {},
    })
    for (const d of dates) expect(table.rows[0]!.perDay[d]).toBe(0)
  })
})
