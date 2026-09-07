import { describe, it, expect } from 'vitest'
import {
  parseHhMm, formatMinutes, snapUp, nextFreeStart, lastSlotStart,
  buildSlots, buildPickerSlots, occupiedBy, findOverlaps, type DayEntry,
  PICKER_FLOOR_MINUTES, PICKER_CEIL_MINUTES,
} from '@/core/timeline'

// Giờ tan làm dùng cho các test cũ. Trước đây đây là hằng số DAY_END_MINUTES
// trong core; giờ giá trị này đến từ config.workdayEnd, nên test tự khai nó.
const DAY_END = 20 * 60

const entry = (id: string, startMinutes: number, durationMinutes: number): DayEntry =>
  ({ id, issueKey: `CAG-${id}`, startMinutes, durationMinutes })

describe('parseHhMm / formatMinutes', () => {
  it('vòng lại được', () => {
    expect(parseHhMm('09:00')).toBe(540)
    expect(parseHhMm('00:15')).toBe(15)
    expect(parseHhMm('23:45')).toBe(1425)
    expect(formatMinutes(540)).toBe('09:00')
    expect(formatMinutes(15)).toBe('00:15')
  })
})

describe('snapUp', () => {
  it('làm tròn LÊN về lưới', () => {
    expect(snapUp(540, 15)).toBe(540)   // đã đúng lưới thì giữ nguyên
    expect(snapUp(541, 15)).toBe(555)
    expect(snapUp(554, 15)).toBe(555)
  })
})

describe('nextFreeStart', () => {
  it('ngày trống → workdayStart', () => {
    expect(nextFreeStart([], 540, 15, DAY_END)).toBe(540)
  })

  it('có worklog → ngay sau worklog cuối, snap lên lưới', () => {
    // 09:00 + 90m = 10:30
    expect(nextFreeStart([entry('a', 540, 90)], 540, 15, DAY_END)).toBe(630)
  })

  it('lấy điểm kết thúc MUỘN NHẤT, không phải entry cuối trong mảng', () => {
    // Mảng không được sắp xếp; entry dài hơn kết thúc muộn hơn.
    const entries = [entry('a', 600, 30), entry('b', 540, 180)]
    expect(nextFreeStart(entries, 540, 15, DAY_END)).toBe(720) // 09:00 + 3h = 12:00
  })

  it('snap lên khi worklog kết thúc lệch lưới', () => {
    // 09:00 + 20m = 09:20 → snap lên 09:30
    expect(nextFreeStart([entry('a', 540, 20)], 540, 15, DAY_END)).toBe(570)
  })

  it('không bao giờ trả về trước workdayStart', () => {
    // Worklog lúc 07:00 xong 07:30, nhưng ngày làm việc bắt đầu 09:00.
    expect(nextFreeStart([entry('a', 420, 30)], 540, 15, DAY_END)).toBe(540)
  })

  it('clamp về slot cuối khi ngày đã kín tới cuối lưới', () => {
    // 09:00 + 10h30 = 19:30 → còn trong lưới.
    expect(nextFreeStart([entry('a', 540, 630)], 540, 15, DAY_END)).toBe(1170)
    // 09:00 + 11h = 20:00 → ngoài lưới, phải kẹp về 19:45.
    expect(nextFreeStart([entry('a', 540, 660)], 540, 15, DAY_END)).toBe(1185)
    // Qua nửa đêm: không được trả 24:15 (formatStarted sẽ sinh T24:15 và Jira
    // trả 400 không đọc được).
    expect(nextFreeStart([entry('a', 540, 900)], 540, 15, DAY_END)).toBe(1185)
  })

  it('snap theo lưới tính từ workdayStart, không từ nửa đêm', () => {
    // workdayStart 09:30, slot 60 → lưới 09:30/10:30/…; kết thúc 10:00 phải ra
    // 10:30, không phải 10:00 (10:00 không có trong dropdown).
    expect(nextFreeStart([entry('a', 570, 30)], 570, 60, DAY_END)).toBe(630)
  })

  // INVARIANT: dropdown "Bắt đầu" chỉ có option trong buildSlots(...). Nếu
  // nextFreeStart trả giá trị ngoài đó, <select> hiện option đầu tiên trong khi
  // state giữ giá trị khác — panel hiện 09:00 nhưng POST giờ khác.
  it('kết quả LUÔN là một slot của buildSlots', () => {
    const cases: { entries: DayEntry[]; start: number; slot: number }[] = []
    for (const start of [480, 540, 570]) {
      for (const slot of [15, 30, 60]) {
        for (const dur of [0, 20, 90, 300, 630, 660, 900, 1500]) {
          cases.push({ entries: dur === 0 ? [] : [entry('a', start, dur)], start, slot })
        }
      }
    }
    for (const c of cases) {
      const slots = buildSlots(c.start, DAY_END, c.slot)
      const got = nextFreeStart(c.entries, c.start, c.slot, DAY_END)
      expect(slots, `start=${c.start} slot=${c.slot}`).toContain(got)
    }
  })
})

describe('lastSlotStart', () => {
  it('trùng với phần tử cuối của buildSlots', () => {
    for (const start of [480, 540, 555]) {
      for (const slot of [15, 30, 45, 60]) {
        const slots = buildSlots(start, DAY_END, slot)
        expect(lastSlotStart(start, slot, DAY_END)).toBe(slots[slots.length - 1])
      }
    }
  })

  it('lưới rỗng thì trả về chính workdayStart', () => {
    expect(lastSlotStart(1200, 15, 1200)).toBe(1200)
    expect(lastSlotStart(540, 0, DAY_END)).toBe(540)
  })
})

describe('buildSlots', () => {
  it('sinh các mốc bắt đầu slot, không gồm mốc cuối', () => {
    expect(buildSlots(540, 600, 15)).toEqual([540, 555, 570, 585])
  })

  it('trả mảng rỗng khi from >= to', () => {
    expect(buildSlots(600, 600, 15)).toEqual([])
    expect(buildSlots(600, 540, 15)).toEqual([])
  })
})

describe('occupiedBy', () => {
  const entries = [entry('a', 540, 60)] // 09:00–10:00

  it('trả entry khi slot nằm trong khoảng đã log', () => {
    expect(occupiedBy(entries, 540, 15)?.id).toBe('a')
    expect(occupiedBy(entries, 585, 15)?.id).toBe('a')
  })

  it('trả null cho slot ngay sau khi kết thúc', () => {
    // Entry kết thúc đúng 10:00, nên slot 10:00 là trống.
    expect(occupiedBy(entries, 600, 15)).toBeNull()
  })

  it('trả null cho slot trước khi bắt đầu', () => {
    expect(occupiedBy(entries, 525, 15)).toBeNull()
  })
})

describe('findOverlaps', () => {
  const entries = [entry('a', 540, 60), entry('b', 660, 30)] // 09-10, 11-11:30

  it('không có gì chồng thì trả rỗng', () => {
    expect(findOverlaps(entries, 600, 60)).toEqual([]) // 10:00–11:00
  })

  it('phát hiện chồng một phần', () => {
    expect(findOverlaps(entries, 570, 60).map((e) => e.id)).toEqual(['a'])
  })

  it('phát hiện chồng nhiều entry', () => {
    expect(findOverlaps(entries, 540, 180).map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('kề nhau không tính là chồng', () => {
    // 10:00–11:00 chạm đầu chạm cuối cả hai nhưng không chồng.
    expect(findOverlaps(entries, 600, 60)).toEqual([])
  })
})

describe('buildPickerSlots', () => {
  const at = (hhmm: string): number => parseHhMm(hhmm)

  it('nới ra ngoài giờ làm việc: chọn được từ 07:30 tới 17:45', () => {
    const slots = buildPickerSlots(at('08:30'), at('18:00'), 15)
    expect(slots[0]).toBe(PICKER_FLOOR_MINUTES)
    expect(slots[slots.length - 1]).toBe(PICKER_CEIL_MINUTES - 15)
    expect(slots).toContain(at('07:45'))
    expect(slots).toContain(at('12:15'))
  })

  it('nới cả phần đuôi khi giờ tan làm sớm hơn 18:00', () => {
    const slots = buildPickerSlots(at('08:00'), at('16:00'), 30)
    expect(slots[slots.length - 1]).toBe(at('17:30'))
  })

  it('giờ làm việc dài hơn biên mặc định thì không bị cắt', () => {
    const slots = buildPickerSlots(at('07:00'), at('20:00'), 60)
    expect(slots[0]).toBe(at('07:00'))
    expect(slots[slots.length - 1]).toBe(at('19:00'))
  })

  // INVARIANT giống nextFreeStart: <select> có value ngoài danh sách option sẽ
  // hiện option đầu tiên trong khi state giữ giá trị khác.
  it('luôn chứa nextFreeStart, kể cả khi workdayStart lệch lưới', () => {
    const cases = [
      { start: at('08:20'), slot: 15 },
      { start: at('09:00'), slot: 60 },
      { start: at('07:45'), slot: 25 },
      { start: at('06:00'), slot: 45 },
    ]
    for (const c of cases) {
      const slots = buildPickerSlots(c.start, DAY_END, c.slot)
      expect(slots).toContain(nextFreeStart([], c.start, c.slot, DAY_END))
      expect(slots).toContain(nextFreeStart([entry('a', c.start, 200)], c.start, c.slot, DAY_END))
      expect(slots[0]).toBeLessThanOrEqual(Math.max(PICKER_FLOOR_MINUTES, c.start))
    }
  })

  it('slot <= 0 → rỗng', () => {
    expect(buildPickerSlots(at('08:30'), at('18:00'), 0)).toEqual([])
  })
})
