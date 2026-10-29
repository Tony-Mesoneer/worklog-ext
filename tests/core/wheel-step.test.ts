import { describe, it, expect } from 'vitest'
import { createWheelStepper, wheelDeltaPx } from '@/core/wheel-step'

const opts = { thresholdPx: 40, minIntervalMs: 70, idleResetMs: 250 }

// Chạy một chuỗi [deltaPx, thời điểm ms] và trả tổng số bước.
const run = (events: [number, number][]) => {
  const step = createWheelStepper(opts)
  return events.map(([d, t]) => step(d, t))
}

describe('createWheelStepper', () => {
  it('nấc chuột đầu tiên phản hồi ngay; lăn lên = +1, xuống = -1', () => {
    expect(run([[-100, 0]])).toEqual([1])
    expect(run([[100, 0]])).toEqual([-1])
  })

  it('trackpad: delta nhỏ đều đặn cho bước đều, không mất phần dư', () => {
    // 10px mỗi 16ms → 40px sau 4 event (64ms), nhưng phải chờ đủ 70ms.
    const events: [number, number][] = Array.from({ length: 30 }, (_, i) => [-10, i * 16])
    const steps = run(events).filter((s) => s !== 0)
    // ~480ms lăn liên tục, giãn cách ≥70ms → khoảng 6 bước, không phải 30.
    expect(steps.length).toBeGreaterThanOrEqual(5)
    expect(steps.length).toBeLessThanOrEqual(7)
    expect(steps.every((s) => s === 1)).toBe(true)
  })

  it('cú vuốt mạnh (delta lớn ở 60fps) bị giãn cách, không nhảy mỗi frame', () => {
    const events: [number, number][] = Array.from({ length: 12 }, (_, i) => [-200, i * 16])
    const steps = run(events).filter((s) => s !== 0)
    // 12 frame ≈ 176ms → tối đa 3 bước (0, ≥70, ≥140).
    expect(steps.length).toBe(3)
  })

  it('đổi chiều thì bỏ phần dư của chiều cũ', () => {
    // Mang -30 sang thì 30+30 chỉ còn 30 → chưa bước; bỏ nó thì 60 → bước.
    expect(run([[-30, 0], [30, 10], [30, 20]])).toEqual([0, 0, -1])
    expect(run([[-30, 0], [45, 10]])).toEqual([0, -1])
  })

  it('dừng lâu rồi lăn tiếp: phản hồi ngay, không phải chờ giãn cách', () => {
    expect(run([[-100, 0], [-100, 300]])).toEqual([1, 1])
  })
})

describe('wheelDeltaPx', () => {
  it('quy đổi deltaMode dòng/trang về px', () => {
    expect(wheelDeltaPx(-3, 1)).toBe(-99)
    expect(wheelDeltaPx(1, 2)).toBe(400)
    expect(wheelDeltaPx(-120, 0)).toBe(-120)
  })
})
