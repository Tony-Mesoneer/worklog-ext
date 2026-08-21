import { describe, it, expect } from 'vitest'
import {
  splitAroundBreaks, mergeBreaks, normalizeBreaks, breakAt, segmentsEnd,
  buildSlots, nextFreeStart, formatMinutes, type Break, type DayEntry,
} from '@/core/timeline'

// LUNCH ở đây là hằng số CỦA TEST (12:00–13:00), không phải default của app
// (đã là 12:00–13:30). Test này kiểm LOGIC cắt đoạn với một khoảng nghỉ cho
// trước, nên nó không đổi khi default đổi — và không được đọc là tài liệu
// về default.
const START = 8 * 60 + 30
const END = 18 * 60
const LUNCH: Break[] = [{ startMinutes: 12 * 60, endMinutes: 13 * 60 }]
const NONE: Break[] = []

const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h! * 60 + m!
}
// Đọc kết quả bằng "HH:MM+phút" cho dễ soi khi test đỏ.
const show = (segs: { startMinutes: number; durationMinutes: number }[]) =>
  segs.map((s) => `${formatMinutes(s.startMinutes)}+${s.durationMinutes}`)

const entry = (id: string, startMinutes: number, durationMinutes: number): DayEntry =>
  ({ id, issueKey: `CAG-${id}`, startMinutes, durationMinutes })

describe('normalizeBreaks / mergeBreaks', () => {
  it('chuyển "HH:MM" sang phút', () => {
    expect(normalizeBreaks([{ start: '12:00', end: '13:00' }])).toEqual(LUNCH)
  })

  it('bỏ khoảng vô nghĩa (end <= start) thay vì để nó lan xuống split', () => {
    expect(normalizeBreaks([{ start: '13:00', end: '12:00' }])).toEqual([])
    expect(normalizeBreaks([{ start: '12:00', end: '12:00' }])).toEqual([])
  })

  it('sắp xếp theo thời gian', () => {
    const got = mergeBreaks([
      { startMinutes: at('15:00'), endMinutes: at('15:15') },
      { startMinutes: at('12:00'), endMinutes: at('13:00') },
    ])
    expect(got.map((b) => b.startMinutes)).toEqual([at('12:00'), at('15:00')])
  })

  it('gộp khoảng chồng nhau và khoảng dính nhau', () => {
    expect(mergeBreaks([
      { startMinutes: at('12:00'), endMinutes: at('13:00') },
      { startMinutes: at('12:30'), endMinutes: at('13:30') },
    ])).toEqual([{ startMinutes: at('12:00'), endMinutes: at('13:30') }])

    expect(mergeBreaks([
      { startMinutes: at('11:00'), endMinutes: at('12:00') },
      { startMinutes: at('12:00'), endMinutes: at('13:00') },
    ])).toEqual([{ startMinutes: at('11:00'), endMinutes: at('13:00') }])
  })

  it('không gộp hai khoảng rời nhau', () => {
    const two = mergeBreaks([
      { startMinutes: at('12:00'), endMinutes: at('13:00') },
      { startMinutes: at('15:00'), endMinutes: at('15:15') },
    ])
    expect(two).toHaveLength(2)
  })
})

describe('breakAt', () => {
  it('mốc trong giờ nghỉ', () => {
    expect(breakAt(at('12:15'), LUNCH)).toEqual(LUNCH[0])
    expect(breakAt(at('12:00'), LUNCH)).toEqual(LUNCH[0]) // mốc đầu ĐÃ là giờ nghỉ
  })

  it('mốc kết thúc giờ nghỉ đã là giờ làm việc trở lại', () => {
    expect(breakAt(at('13:00'), LUNCH)).toBeNull()
    expect(breakAt(at('11:59'), LUNCH)).toBeNull()
  })

  it('không có giờ nghỉ thì luôn null', () => {
    expect(breakAt(at('12:15'), NONE)).toBeNull()
  })
})

describe('splitAroundBreaks', () => {
  it('gọn trong buổi sáng → một worklog, y như trước', () => {
    expect(show(splitAroundBreaks(at('09:00'), 90, LUNCH))).toEqual(['09:00+90'])
  })

  it('gọn trong buổi chiều → một worklog', () => {
    expect(show(splitAroundBreaks(at('14:00'), 120, LUNCH))).toEqual(['14:00+120'])
  })

  it('đi qua giờ nghỉ → hai đoạn, TỔNG THỜI LƯỢNG giữ nguyên', () => {
    const segs = splitAroundBreaks(at('11:00'), 180, LUNCH)
    expect(show(segs)).toEqual(['11:00+60', '13:00+120'])
    expect(segs.reduce((s, x) => s + x.durationMinutes, 0)).toBe(180)
  })

  it('kết thúc ĐÚNG 12:00 thì KHÔNG cắt — kề nhau không phải chồng', () => {
    expect(show(splitAroundBreaks(at('11:00'), 60, LUNCH))).toEqual(['11:00+60'])
  })

  it('bắt đầu ĐÚNG 13:00 thì KHÔNG cắt', () => {
    expect(show(splitAroundBreaks(at('13:00'), 120, LUNCH))).toEqual(['13:00+120'])
  })

  it('vượt 12:00 đúng 1 phút vẫn cắt thành hai đoạn', () => {
    expect(show(splitAroundBreaks(at('11:00'), 61, LUNCH))).toEqual(['11:00+60', '13:00+1'])
  })

  // Mốc bắt đầu nằm TRONG giờ nghỉ: đẩy TIẾN tới hết giờ nghỉ. Không lùi lại —
  // lùi là tự khai giờ làm sớm hơn người dùng nói và dễ chồng worklog buổi sáng.
  it('bắt đầu TRONG giờ nghỉ → dồn hết sang sau giờ nghỉ, một đoạn', () => {
    expect(show(splitAroundBreaks(at('12:15'), 120, LUNCH))).toEqual(['13:00+120'])
    expect(show(splitAroundBreaks(at('12:00'), 60, LUNCH))).toEqual(['13:00+60'])
  })

  it('đuôi vượt giờ tan làm: đoạn vẫn đúng, không có gì bị chặn ở tầng core', () => {
    const segs = splitAroundBreaks(at('11:00'), 480, LUNCH) // 8h từ 11:00
    expect(show(segs)).toEqual(['11:00+60', '13:00+420'])   // 13:00 + 7h = 20:00
    expect(segmentsEnd(segs)).toBe(at('20:00'))
    expect(segmentsEnd(segs)).toBeGreaterThan(END)
  })

  it('không có giờ nghỉ → hành vi y hệt hôm nay', () => {
    expect(show(splitAroundBreaks(at('11:00'), 180, NONE))).toEqual(['11:00+180'])
    expect(show(splitAroundBreaks(at('12:15'), 30, NONE))).toEqual(['12:15+30'])
  })

  it('NHIỀU giờ nghỉ trong ngày: cắt ở từng khoảng', () => {
    const breaks: Break[] = [
      { startMinutes: at('12:00'), endMinutes: at('13:00') },
      { startMinutes: at('15:00'), endMinutes: at('15:15') },
    ]
    const segs = splitAroundBreaks(at('11:00'), 300, breaks) // 5h
    expect(show(segs)).toEqual(['11:00+60', '13:00+120', '15:15+120'])
    expect(segs.reduce((s, x) => s + x.durationMinutes, 0)).toBe(300)
  })

  it('giờ nghỉ truyền vào lộn xộn/chồng nhau vẫn cho kết quả đúng', () => {
    const messy: Break[] = [
      { startMinutes: at('12:30'), endMinutes: at('13:30') },
      { startMinutes: at('12:00'), endMinutes: at('13:00') },
    ]
    expect(show(splitAroundBreaks(at('11:00'), 120, messy))).toEqual(['11:00+60', '13:30+60'])
  })

  it('thời lượng <= 0 → không có đoạn nào (không POST gì cả)', () => {
    expect(splitAroundBreaks(at('11:00'), 0, LUNCH)).toEqual([])
    expect(splitAroundBreaks(at('11:00'), -30, LUNCH)).toEqual([])
  })

  it('mọi đoạn đều có thời lượng > 0 và không đoạn nào giao giờ nghỉ', () => {
    for (const start of [at('08:30'), at('11:45'), at('12:00'), at('12:59'), at('13:00'), at('17:00')]) {
      for (const dur of [15, 30, 45, 60, 90, 120, 240, 480, 600]) {
        const segs = splitAroundBreaks(start, dur, LUNCH)
        expect(segs.reduce((s, x) => s + x.durationMinutes, 0), `${start}/${dur}`).toBe(dur)
        for (const s of segs) {
          expect(s.durationMinutes, `${start}/${dur}`).toBeGreaterThan(0)
          const e = s.startMinutes + s.durationMinutes
          // Giao với 12:00–13:00 ⇔ start < 13:00 && end > 12:00
          expect(
            s.startMinutes < at('13:00') && e > at('12:00'),
            `${start}/${dur} → ${show(segs).join(' ')}`,
          ).toBe(false)
        }
      }
    }
  })
})

describe('buildSlots có giờ nghỉ', () => {
  it('không mời người dùng bắt đầu vào giữa bữa trưa', () => {
    const slots = buildSlots(START, END, 15, LUNCH)
    expect(slots).toContain(at('11:45'))  // 11:45 vẫn hợp lệ — nó sẽ bị CẮT, không bị cấm
    expect(slots).not.toContain(at('12:00'))
    expect(slots).not.toContain(at('12:45'))
    expect(slots).toContain(at('13:00'))
  })

  it('không truyền breaks → lưới y như trước', () => {
    expect(buildSlots(START, END, 15)).toContain(at('12:00'))
  })

  it('slotMinutes <= 0 → rỗng thay vì treo vòng lặp', () => {
    expect(buildSlots(START, END, 0)).toEqual([])
  })
})

describe('nextFreeStart có giờ nghỉ', () => {
  it('không bao giờ trả về một mốc trong giờ nghỉ', () => {
    // 08:30 + 3h30 = 12:00 → phải nhảy sang 13:00.
    expect(nextFreeStart([entry('a', START, 210)], START, 15, END, LUNCH)).toBe(at('13:00'))
    // 08:30 + 3h45 = 12:15 → 13:00.
    expect(nextFreeStart([entry('a', START, 225)], START, 15, END, LUNCH)).toBe(at('13:00'))
  })

  it('kết quả LUÔN là một slot của buildSlots có cùng giờ nghỉ', () => {
    const slots = buildSlots(START, END, 15, LUNCH)
    for (const dur of [0, 20, 90, 209, 210, 211, 225, 300, 570, 600, 900]) {
      const got = nextFreeStart(
        dur === 0 ? [] : [entry('a', START, dur)], START, 15, END, LUNCH,
      )
      expect(slots, `dur=${dur}`).toContain(got)
    }
  })

  it('ngày kín tới cuối lưới → slot cuối, vẫn không phải giờ nghỉ', () => {
    expect(nextFreeStart([entry('a', START, 900)], START, 15, END, LUNCH)).toBe(at('17:45'))
  })

  it('cả ngày là giờ nghỉ → trả về giờ bắt đầu ngày làm việc', () => {
    const all: Break[] = [{ startMinutes: 0, endMinutes: 24 * 60 }]
    expect(nextFreeStart([], START, 15, END, all)).toBe(START)
  })
})
