import { describe, it, expect } from 'vitest'
import {
  enumerateDates, isWeekend, buildCoverage, isShortHours,
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
    expect(table.rows[0]!.capacityToDateSeconds).toBe(5 * 8 * H)
  })

  it('capacity loại ngày nghỉ phép của đúng member đó', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1'), member('u2')], dates,
      daysOff: { u1: ['2026-08-18'] },
    })
    expect(table.rows[0]!.capacityToDateSeconds).toBe(4 * 8 * H)
    expect(table.rows[1]!.capacityToDateSeconds).toBe(5 * 8 * H)
  })

  it('capacity theo hoursPerDay riêng của member part-time', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1', 4)], dates, daysOff: {},
    })
    expect(table.rows[0]!.capacityToDateSeconds).toBe(5 * 4 * H)
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
    expect(table.rows[0]!.capacityToDateSeconds).toBe(0)
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

// Capacity tới hôm nay. Lý do có nhóm test này: bản cũ đếm cả ngày chưa xảy ra,
// nên ngày 4 của sprint 12 ngày lead thấy 12% coverage và cả team bị báo thiếu —
// mỗi ngày, suốt sprint. Cảnh báo lúc nào cũng bật là cảnh báo không ai đọc.
describe('buildCoverage — capacity tới hôm nay', () => {
  const dates = enumerateDates('2026-08-17', '2026-08-28') // Hai 17/08 → Sáu 28/08
  // 17–21 (5), 24–28 (5) = 10 ngày làm việc; T7/CN 22–23 bị loại.

  it('không truyền today: tới-hôm-nay = cả khoảng, y như hành vi cũ', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1')], dates, daysOff: {},
    })
    expect(table.today).toBeNull()
    expect(table.datesToDate).toEqual(dates)
    expect(table.capacityToDateSeconds).toBe(10 * 8 * H)
    expect(table.capacityFullRangeSeconds).toBe(10 * 8 * H)
    expect(table.rows[0]!.capacityToDateSeconds).toBe(10 * 8 * H)
  })

  it('khoảng nằm hoàn toàn trong quá khứ: hai con số bằng nhau', () => {
    // Preset "Tuần trước": mọi ngày đã xảy ra nên không có gì phải cắt.
    const past = enumerateDates('2026-08-10', '2026-08-14')
    const table = buildCoverage({
      worklogs: [wl('u1', '2026-08-10', 8)],
      members: [member('u1')], dates: past, daysOff: {}, today: '2026-08-20',
    })
    expect(table.rows[0]!.capacityToDateSeconds).toBe(5 * 8 * H)
    expect(table.rows[0]!.capacityFullRangeSeconds).toBe(5 * 8 * H)
    expect(table.rows[0]!.status).toBe('under')
  })

  it('khoảng nằm hoàn toàn ở tương lai: capacity tới hôm nay = 0', () => {
    const future = enumerateDates('2026-09-01', '2026-09-04')
    const table = buildCoverage({
      worklogs: [], members: [member('u1')], dates: future, daysOff: {}, today: '2026-08-20',
    })
    expect(table.datesToDate).toEqual([])
    expect(table.capacityToDateSeconds).toBe(0)
    expect(table.capacityFullRangeSeconds).toBe(4 * 8 * H)
  })

  it('tương lai + chưa log gì: KHÔNG bị coi là thiếu giờ', () => {
    const future = enumerateDates('2026-09-01', '2026-09-04')
    const table = buildCoverage({
      worklogs: [], members: [member('u1')], dates: future, daysOff: {}, today: '2026-08-20',
    })
    const row = table.rows[0]!
    // 'empty' là sự kiện "ô trống", không phải cảnh báo; điều kiện báo thiếu là
    // status 'under', và nó không được bật khi chưa tới ngày nào.
    expect(row.status).toBe('empty')
    expect(row.status === 'under').toBe(false)
    expect(row.capacityToDateSeconds).toBe(0)
  })

  it('hôm nay nằm giữa khoảng: chỉ đếm ngày làm việc tới hết hôm nay', () => {
    // today = Năm 20/08 → 17, 18, 19, 20 = 4 ngày.
    const table = buildCoverage({
      worklogs: [], members: [member('u1')], dates, daysOff: {}, today: '2026-08-20',
    })
    expect(table.rows[0]!.capacityToDateSeconds).toBe(4 * 8 * H)
    expect(table.rows[0]!.capacityFullRangeSeconds).toBe(10 * 8 * H)
  })

  it('hôm nay tính cả chính nó (inclusive)', () => {
    const a = buildCoverage({
      worklogs: [], members: [member('u1')], dates, daysOff: {}, today: '2026-08-17',
    })
    expect(a.rows[0]!.capacityToDateSeconds).toBe(1 * 8 * H)
  })

  it('hôm nay là cuối tuần: capacity dừng ở ngày làm việc cuối trước đó', () => {
    // today = CN 23/08 → vẫn chỉ 5 ngày (17–21), T7/CN không có capacity.
    const table = buildCoverage({
      worklogs: [], members: [member('u1')], dates, daysOff: {}, today: '2026-08-23',
    })
    expect(table.rows[0]!.capacityToDateSeconds).toBe(5 * 8 * H)
  })

  it('hôm nay là ngày nghỉ của chính member đó: ngày đó không tính capacity', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1'), member('u2')], dates,
      daysOff: { u1: ['2026-08-20'] }, today: '2026-08-20',
    })
    expect(table.rows[0]!.capacityToDateSeconds).toBe(3 * 8 * H) // 17,18,19
    expect(table.rows[1]!.capacityToDateSeconds).toBe(4 * 8 * H) // 17,18,19,20
  })

  it('part-time: hoursPerDay riêng vẫn áp cho cả hai con số', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u3', 4)], dates, daysOff: {}, today: '2026-08-20',
    })
    expect(table.rows[0]!.capacityToDateSeconds).toBe(4 * 4 * H)
    expect(table.rows[0]!.capacityFullRangeSeconds).toBe(10 * 4 * H)
  })

  it('có log nhưng capacity tới hôm nay = 0 (làm ngày nghỉ): ok, không âm', () => {
    const table = buildCoverage({
      worklogs: [wl('u1', '2026-08-22', 3)], // T7
      members: [member('u1')],
      dates: enumerateDates('2026-08-22', '2026-08-28'),
      daysOff: {}, today: '2026-08-23', // CN → chưa có ngày làm việc nào
    })
    const row = table.rows[0]!
    expect(row.capacityToDateSeconds).toBe(0)
    expect(row.total).toBe(3 * H)
    expect(row.status).toBe('ok')
    expect(row.capacityFullRangeSeconds - row.total).toBeGreaterThan(0)
  })

  it('giữa sprint: người log ít bị under, người log đủ tới hôm nay là ok', () => {
    const table = buildCoverage({
      worklogs: [
        ...['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20'].map((d) => wl('u1', d, 8)),
        wl('u2', '2026-08-17', 8),
      ],
      members: [member('u1'), member('u2'), member('u3')],
      dates, daysOff: {}, today: '2026-08-20',
    })
    expect(table.rows[0]!.status).toBe('ok')     // 32h/32h tới hôm nay
    expect(table.rows[1]!.status).toBe('under')  // 8h/32h
    expect(table.rows[2]!.status).toBe('empty')  // chưa log gì
    // Cả kỳ vẫn là 3 × 80h, chỉ để hiển thị.
    expect(table.capacityFullRangeSeconds).toBe(3 * 10 * 8 * H)
    expect(table.capacityToDateSeconds).toBe(3 * 4 * 8 * H)
  })

  it('member inactive: cả hai con số đều 0, không bao giờ under', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1', 8, false)], dates, daysOff: {}, today: '2026-08-20',
    })
    expect(table.rows[0]!.capacityToDateSeconds).toBe(0)
    expect(table.rows[0]!.capacityFullRangeSeconds).toBe(0)
  })

  it('today sau ngày cuối khoảng: bằng cả khoảng', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1')], dates, daysOff: {}, today: '2026-09-30',
    })
    expect(table.rows[0]!.capacityToDateSeconds).toBe(10 * 8 * H)
  })

  // --- ngưỡng "thiếu giờ" ---------------------------------------------------
  // Capacity đếm tới HẾT hôm nay, nên hôm nay luôn tính trọn một ngày: lúc 9h
  // sáng ai cũng đang hụt gần đủ một ngày. Cờ chỉ bật khi hụt HƠN một ngày làm
  // việc của chính member đó. Số hiển thị không đổi, chỉ cờ đổi nghĩa.
  it('hụt đúng một ngày làm việc: KHÔNG bị gắn cờ thiếu giờ', () => {
    // capacity tới hôm nay = 5 × 8h = 40h, đã log 32h → hụt đúng 8h.
    const table = buildCoverage({
      worklogs: [
        ...['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20'].map((d) => wl('u1', d, 8)),
      ],
      members: [member('u1')], dates, daysOff: {}, today: '2026-08-21',
    })
    const row = table.rows[0]!
    expect(row.capacityToDateSeconds - row.total).toBe(8 * H)
    expect(isShortHours(row)).toBe(false)
    expect(row.status).toBe('ok')
  })

  it('hụt hơn một ngày làm việc: bị gắn cờ thiếu giờ', () => {
    const table = buildCoverage({
      worklogs: [
        ...['2026-08-17', '2026-08-18', '2026-08-19'].map((d) => wl('u1', d, 8)),
        wl('u1', '2026-08-20', 7),
      ],
      members: [member('u1')], dates, daysOff: {}, today: '2026-08-21',
    })
    const row = table.rows[0]!
    expect(row.capacityToDateSeconds - row.total).toBe(9 * H)
    expect(isShortHours(row)).toBe(true)
    expect(row.status).toBe('under')
  })

  it('member part-time: ngưỡng là ngày làm việc NGẮN của chính họ', () => {
    // 4h/ngày → capacity tới hôm nay 20h. Hụt 4h là đúng một ngày (không cờ),
    // hụt 5h là hơn một ngày (có cờ) — trong khi cùng con số 5h thì người
    // full-time vẫn chưa bị gắn cờ.
    const exact = buildCoverage({
      worklogs: [wl('u1', '2026-08-17', 16)],
      members: [member('u1', 4)], dates, daysOff: {}, today: '2026-08-21',
    })
    expect(isShortHours(exact.rows[0]!)).toBe(false)

    const over = buildCoverage({
      worklogs: [wl('u1', '2026-08-17', 15)],
      members: [member('u1', 4)], dates, daysOff: {}, today: '2026-08-21',
    })
    expect(over.rows[0]!.capacityToDateSeconds - over.rows[0]!.total).toBe(5 * H)
    expect(isShortHours(over.rows[0]!)).toBe(true)

    const fullTime = buildCoverage({
      worklogs: [wl('u1', '2026-08-17', 35)],
      members: [member('u1', 8)], dates, daysOff: {}, today: '2026-08-21',
    })
    expect(fullTime.rows[0]!.capacityToDateSeconds - fullTime.rows[0]!.total).toBe(5 * H)
    expect(isShortHours(fullTime.rows[0]!)).toBe(false)
  })

  it('chưa log gì: vẫn empty, và vẫn bị coi là thiếu giờ', () => {
    // 'empty' là một SỰ KIỆN riêng, không phải mức nhẹ hơn của 'under': hàng
    // tóm tắt đếm nó vào "thiếu giờ" vì hụt cả 40h thì rõ ràng là quá một ngày.
    const table = buildCoverage({
      worklogs: [], members: [member('u1')], dates, daysOff: {}, today: '2026-08-21',
    })
    expect(table.rows[0]!.status).toBe('empty')
    expect(isShortHours(table.rows[0]!)).toBe(true)
  })

  it('member inactive không bao giờ bị gắn cờ thiếu giờ', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1', 8, false)], dates, daysOff: {}, today: '2026-08-21',
    })
    expect(isShortHours(table.rows[0]!)).toBe(false)
  })
})
