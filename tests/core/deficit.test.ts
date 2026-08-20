import { describe, it, expect } from 'vitest'
import {
  findFreeGaps, workIntervals, intervalMinutes, dayShortfall, myDailyTargetMinutes,
} from '@/core/deficit'
import { segmentsEnd, splitAroundBreaks, type Break, type DayEntry } from '@/core/timeline'

// Giờ làm việc mặc định: 08:30–18:00, nghỉ trưa 12:00–13:00 → 8h30 khả dụng.
const START = 8 * 60 + 30
const END = 18 * 60
const LUNCH: Break[] = [{ startMinutes: 12 * 60, endMinutes: 13 * 60 }]
const NONE: Break[] = []
const TARGET_8H = 8 * 60

const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h! * 60 + m!
}

let seq = 0
const e = (from: string, to: string, issueKey = 'CAG-1'): DayEntry => ({
  id: `w${++seq}`,
  issueKey,
  startMinutes: at(from),
  durationMinutes: at(to) - at(from),
})

const gaps = (entries: DayEntry[], breaks = LUNCH) =>
  findFreeGaps(entries, START, END, breaks).map((g) => [g.startMinutes, g.endMinutes])

// slotMinutes = 15 chỉ để dayShortfall tính được proposedStartMinutes (tham
// số bắt buộc, khớp config-schema mặc định) — KHÔNG đổi assertion nào.
const SLOT = 15
const shortfall = (entries: DayEntry[], targetMinutes = TARGET_8H, breaks = LUNCH) =>
  dayShortfall({
    entries, targetMinutes, workdayStartMinutes: START, slotMinutes: SLOT, dayEndMinutes: END, breaks,
  })

describe('workIntervals', () => {
  it('cắt giờ nghỉ ra khỏi ngày làm việc', () => {
    expect(workIntervals(START, END, LUNCH)).toEqual([
      { startMinutes: START, endMinutes: at('12:00') },
      { startMinutes: at('13:00'), endMinutes: END },
    ])
    expect(intervalMinutes(workIntervals(START, END, LUNCH))).toBe(8 * 60 + 30)
  })

  it('không có giờ nghỉ thì là một khoảng liền', () => {
    expect(workIntervals(START, END, NONE)).toEqual([{ startMinutes: START, endMinutes: END }])
  })

  it('giờ tan làm <= giờ bắt đầu → rỗng', () => {
    expect(workIntervals(END, START, LUNCH)).toEqual([])
  })
})

describe('findFreeGaps', () => {
  it('ngày trống → toàn bộ giờ làm việc, giờ nghỉ bị loại', () => {
    expect(gaps([])).toEqual([[START, at('12:00')], [at('13:00'), END]])
  })

  it('một worklog ở giữa buổi sáng chia đúng hai khoảng', () => {
    expect(gaps([e('09:00', '10:00')])).toEqual([
      [START, at('09:00')], [at('10:00'), at('12:00')], [at('13:00'), END],
    ])
  })

  it('worklog kề nhau không sinh khoảng trống 0 phút', () => {
    expect(gaps([e('08:30', '10:00'), e('10:00', '12:00')])).toEqual([[at('13:00'), END]])
  })

  it('worklog chồng nhau được gộp trước khi trừ', () => {
    expect(gaps([e('09:00', '11:00'), e('10:00', '12:00')])).toEqual([
      [START, at('09:00')], [at('13:00'), END],
    ])
  })

  it('worklog đi qua giờ nghỉ chỉ chiếm phần giờ làm việc', () => {
    // 11:00–14:00 (3h) chiếm 11:00–12:00 và 13:00–14:00; giờ nghỉ vẫn không
    // bao giờ là thời gian rảnh.
    expect(gaps([e('11:00', '14:00')])).toEqual([[START, at('11:00')], [at('14:00'), END]])
  })

  it('worklog ngoài giờ làm việc bị kẹp về biên', () => {
    expect(gaps([e('07:00', '09:00'), e('17:00', '20:00')])).toEqual([
      [at('09:00'), at('12:00')], [at('13:00'), at('17:00')],
    ])
  })

  it('worklog 0 phút bị bỏ qua', () => {
    expect(gaps([{ id: 'z', issueKey: 'X', startMinutes: at('09:00'), durationMinutes: 0 }]))
      .toEqual([[START, at('12:00')], [at('13:00'), END]])
  })
})

describe('dayShortfall', () => {
  it('ngày trống → thiếu đủ mục tiêu, và mục tiêu vừa trong ngày', () => {
    const s = shortfall([])
    expect(s.loggedMinutes).toBe(0)
    expect(s.freeMinutes).toBe(8 * 60 + 30)
    expect(s.missingMinutes).toBe(8 * 60)
    expect(s.fillMinutes).toBe(8 * 60)
    expect(s.capped).toBe(false)
  })

  it('ngày log kín mục tiêu → không thiếu gì', () => {
    // 08:30–12:00 (3h30) + 13:00–17:30 (4h30) = 8h.
    const s = shortfall([e('08:30', '12:00'), e('13:00', '17:30')])
    expect(s.loggedMinutes).toBe(8 * 60)
    expect(s.missingMinutes).toBe(0)
    expect(s.fillMinutes).toBe(0)
    expect(s.capped).toBe(false)
  })

  it('một khoảng trống duy nhất → thiếu đúng bằng khoảng đó', () => {
    // Thiếu 1h30, và 16:00–17:30 đang trống → lấp đúng 1h30.
    const s = shortfall([e('08:30', '12:00'), e('13:00', '16:00')])
    expect(s.missingMinutes).toBe(90)
    expect(s.fillMinutes).toBe(90)
    expect(s.capped).toBe(false)
  })

  it('các khoảng trống bị giờ nghỉ chia ra được cộng đúng, giờ nghỉ không tính', () => {
    // Đã log 09:00–11:00 (2h) và 14:00–16:00 (2h) = 4h. nextFreeStart = 16:00
    // (ngay sau worklog kết thúc muộn nhất). Từ 16:00 trở đi chỉ còn
    // 16:00–18:00 (120) — 08:30–09:00, 11:00–12:00, 13:00–14:00 có thật nhưng
    // nằm TRƯỚC 16:00 nên nút lấp-giờ (luôn bắt đầu tại nextFreeStart) không
    // với tới được.
    //
    // SỬA: trước đây freeMinutes cộng cả các khoảng trống trước 16:00
    // (= 4h30), khiến fillMinutes = 240 → đề xuất bắt đầu 16:00 và dài 240
    // phút, chạy tới 20:00 — vượt 18:00 (workdayEnd). Số cũ (270/240/false)
    // chính là lỗi tràn ngày; số mới đúng vì bị kẹp bởi phần còn lại của
    // ngày kể từ mốc đề xuất.
    const s = shortfall([e('09:00', '11:00'), e('14:00', '16:00')])
    expect(s.freeMinutes).toBe(2 * 60)
    expect(s.missingMinutes).toBe(4 * 60)
    expect(s.fillMinutes).toBe(2 * 60)
    expect(s.capped).toBe(true)
  })

  it('bị kẹp bởi thời gian còn trống, không phải bởi mục tiêu', () => {
    // Mục tiêu 10h; đã log 09:00–12:00 (3h) + 13:00–17:00 (4h) = 7h → thiếu 3h.
    // nextFreeStart = 17:00 (ngay sau worklog kết thúc muộn nhất). Từ 17:00
    // trở đi ngày chỉ còn 17:00–18:00 (60) — khoảng 08:30–09:00 có thật nhưng
    // nằm TRƯỚC 17:00 nên không với tới được từ mốc nút sẽ prefill.
    //
    // SỬA: số cũ (90) cộng cả 08:30–09:00 (trước nextFreeStart) vào phần
    // trống, nên "kẹp" ở 90 phút vẫn đề xuất bắt đầu 17:00 và dài 90 phút,
    // chạy tới 18:30 — vượt 18:00 (workdayEnd), đúng cái lỗi tràn ngày mà
    // fix này sửa. Số mới (60) là phần ngày thật sự còn lại kể từ mốc đề xuất.
    const s = shortfall([e('09:00', '12:00'), e('13:00', '17:00')], 10 * 60)
    expect(s.missingMinutes).toBe(3 * 60)
    expect(s.freeMinutes).toBe(60)
    expect(s.fillMinutes).toBe(60)
    expect(s.capped).toBe(true)
  })

  it('có khoảng trống TRƯỚC nextFreeStart: fillMinutes chỉ tính phần trống TỪ ĐÓ TRỞ ĐI, đề xuất không vượt giờ tan làm', () => {
    // Ca cụ thể của quyết định sửa: log 08:30–09:00 và 11:00–12:00. Trống là
    // 09:00–11:00 (2h, TRƯỚC nextFreeStart — không với tới được) và 13:00–18:00
    // (5h, sau nextFreeStart). nextFreeStart nhảy qua giờ nghỉ nên = 13:00, KHÔNG
    // phải 12:00. Mục tiêu cố tình rất lớn để phần thiếu luôn vượt cả ngày —
    // phép kẹp phải lộ ra ở freeMinutes/fillMinutes, không phải ở missingMinutes.
    const entries = [e('08:30', '09:00'), e('11:00', '12:00')]
    const s = shortfall(entries, 20 * 60)
    expect(s.proposedStartMinutes).toBe(at('13:00'))
    // Không phải 2h + 5h = 7h (tổng cả ngày) — 2h đầu nằm trước nextFreeStart.
    expect(s.freeMinutes).toBe(5 * 60)
    expect(s.fillMinutes).toBe(5 * 60)
    expect(s.capped).toBe(true)
    // Bất biến của phép sửa: đề xuất (bắt đầu tại proposedStartMinutes, dài
    // fillMinutes) không bao giờ vượt quá giờ tan làm.
    expect(s.proposedStartMinutes + s.fillMinutes).toBeLessThanOrEqual(END)
    expect(s.proposedStartMinutes + s.fillMinutes).toBe(END)
  })

  it('trống nằm hoàn toàn SAU nextFreeStart: hành vi không đổi so với trước khi sửa', () => {
    // Log liền mạch từ đầu ngày (chỉ ngắt bởi giờ nghỉ) tới 15:00 — không có
    // khoảng hở nào trước nextFreeStart, nên tổng-trống-cả-ngày (cách tính cũ)
    // và trống-từ-nextFreeStart (cách tính mới) trùng nhau tuyệt đối.
    const entries = [e('08:30', '12:00'), e('13:00', '15:00')]
    const s = shortfall(entries)
    expect(s.proposedStartMinutes).toBe(at('15:00'))
    expect(s.freeMinutes).toBe(3 * 60)
    expect(s.missingMinutes).toBe(150)
    expect(s.fillMinutes).toBe(150)
    expect(s.capped).toBe(false)
  })

  it('giờ nghỉ không bao giờ được tính là trống, kể cả khi đề xuất hợp lệ đi qua nó', () => {
    // Log 08:30–11:00. nextFreeStart = 11:00. Từ 11:00 tới hết ngày còn
    // 11:00–12:00 (60) + 13:00–18:00 (300) = 360 phút — KHÔNG phải 420 phút
    // (18:00 − 11:00), tức giờ nghỉ 12:00–13:00 (60 phút) đã bị loại đúng.
    const entries = [e('08:30', '11:00')]
    const s = shortfall(entries, 6 * 60)
    expect(s.proposedStartMinutes).toBe(at('11:00'))
    expect(s.freeMinutes).toBe(360)
    expect(s.freeMinutes).not.toBe(END - s.proposedStartMinutes)
    expect(s.fillMinutes).toBe(210)
    expect(s.capped).toBe(false)

    // Đề xuất (11:00, 210 phút) hợp lệ đi qua giờ nghỉ — splitAroundBreaks vẫn
    // cắt thành hai đoạn quanh 12:00–13:00 y như trước khi có phép sửa này.
    const segments = splitAroundBreaks(s.proposedStartMinutes, s.fillMinutes, LUNCH)
    expect(segments).toEqual([
      { startMinutes: at('11:00'), durationMinutes: 60 },
      { startMinutes: at('13:00'), durationMinutes: 150 },
    ])
    expect(segmentsEnd(segments)).toBeLessThanOrEqual(END)
  })

  it('mục tiêu nhỏ hơn của người bán thời gian cho ra số thiếu nhỏ hơn', () => {
    const entries = [e('09:00', '11:00')]
    const full = shortfall(entries, myDailyTargetMinutes([{ accountId: 'u1', hoursPerDay: 8 }], 'u1'))
    const part = shortfall(entries, myDailyTargetMinutes([{ accountId: 'u1', hoursPerDay: 4 }], 'u1'))
    expect(full.missingMinutes).toBe(6 * 60)
    expect(part.missingMinutes).toBe(2 * 60)
    expect(part.fillMinutes).toBe(2 * 60)
  })

  it('log vượt mục tiêu → không thiếu, và không bao giờ âm', () => {
    const s = shortfall([e('08:30', '12:00'), e('13:00', '18:00')])
    expect(s.loggedMinutes).toBe(8 * 60 + 30)
    expect(s.missingMinutes).toBe(0)
    expect(s.fillMinutes).toBe(0)
    expect(s.capped).toBe(false)
  })

  it('ngày không có giờ nghỉ thì khả dụng là cả ngày làm việc', () => {
    const s = shortfall([], 10 * 60, NONE)
    expect(s.freeMinutes).toBe(9 * 60 + 30)
    expect(s.fillMinutes).toBe(9 * 60 + 30)
    expect(s.capped).toBe(true)
  })
})

describe('myDailyTargetMinutes', () => {
  const members = [
    { accountId: 'u1', displayName: 'A', hoursPerDay: 8 },
    { accountId: 'u3', displayName: 'C', hoursPerDay: 4 },
  ]

  it('lấy hoursPerDay của chính mình', () => {
    expect(myDailyTargetMinutes(members, 'u3')).toBe(4 * 60)
  })

  it('không có entry khớp → rơi về 8h', () => {
    expect(myDailyTargetMinutes(members, 'unknown')).toBe(8 * 60)
    expect(myDailyTargetMinutes([], '')).toBe(8 * 60)
  })

  it('hoursPerDay rác → rơi về 8h chứ không ra 0 hay NaN', () => {
    expect(myDailyTargetMinutes([{ accountId: 'u1', hoursPerDay: 0 }], 'u1')).toBe(8 * 60)
    expect(myDailyTargetMinutes([{ accountId: 'u1', hoursPerDay: NaN }], 'u1')).toBe(8 * 60)
  })

  it('nửa giờ vẫn đúng: 7.5h → 450 phút', () => {
    expect(myDailyTargetMinutes([{ accountId: 'u1', hoursPerDay: 7.5 }], 'u1')).toBe(450)
  })
})
