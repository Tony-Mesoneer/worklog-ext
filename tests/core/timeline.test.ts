import { describe, it, expect } from 'vitest'
import {
  parseHhMm, formatMinutes, snapUp, nextFreeStart,
  buildSlots, occupiedBy, findOverlaps, type DayEntry,
} from '@/core/timeline'

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
    expect(nextFreeStart([], 540, 15)).toBe(540)
  })

  it('có worklog → ngay sau worklog cuối, snap lên lưới', () => {
    // 09:00 + 90m = 10:30
    expect(nextFreeStart([entry('a', 540, 90)], 540, 15)).toBe(630)
  })

  it('lấy điểm kết thúc MUỘN NHẤT, không phải entry cuối trong mảng', () => {
    // Mảng không được sắp xếp; entry dài hơn kết thúc muộn hơn.
    const entries = [entry('a', 600, 30), entry('b', 540, 180)]
    expect(nextFreeStart(entries, 540, 15)).toBe(720) // 09:00 + 3h = 12:00
  })

  it('snap lên khi worklog kết thúc lệch lưới', () => {
    // 09:00 + 20m = 09:20 → snap lên 09:30
    expect(nextFreeStart([entry('a', 540, 20)], 540, 15)).toBe(570)
  })

  it('không bao giờ trả về trước workdayStart', () => {
    // Worklog lúc 07:00 xong 07:30, nhưng ngày làm việc bắt đầu 09:00.
    expect(nextFreeStart([entry('a', 420, 30)], 540, 15)).toBe(540)
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
