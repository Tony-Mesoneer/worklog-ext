// src/core/wheel-step.ts
//
// Biến một chuỗi wheel event thành các BƯỚC rời rạc (+1 / -1) cho ô Duration.
// Thuần, không đụng DOM, để test được bằng chuỗi delta giả lập.
//
// Ba điều làm cho lăn "mượt" — thiếu cái nào cũng giật:
//  1. GIỮ PHẦN DƯ. Trackpad bắn hàng chục event vài px; reset về 0 sau mỗi
//     bước làm nhịp bước lúc nhanh lúc chậm. Phần dư được giữ (tối đa một
//     ngưỡng, để nấc chuột lớn không dồn thành loạt bước bù về sau).
//  2. GIÃN CÁCH TỐI THIỂU giữa hai bước. Cú vuốt mạnh hay quán tính của
//     trackpad bắn delta lớn ở 60fps; không giãn cách thì một cú vuốt nhảy
//     hàng chục bước. Giãn cách cho tốc độ đều, đoán được.
//  3. ĐỔI CHIỀU hoặc DỪNG một lúc thì bắt đầu lại: không mang phần dư của cú
//     lăn trước sang cú sau, nên nấc đầu tiên luôn phản hồi ngay.

export type WheelStepperOptions = {
  /** Quãng lăn (px) cho một bước. */
  thresholdPx: number
  /** Khoảng cách tối thiểu giữa hai bước (ms). */
  minIntervalMs: number
  /** Ngừng lăn quá lâu này (ms) thì coi cú lăn tiếp theo là cú mới. */
  idleResetMs: number
}

export const DEFAULT_WHEEL_STEPPER: WheelStepperOptions = {
  thresholdPx: 40,
  minIntervalMs: 70,
  idleResetMs: 250,
}

/** deltaY của WheelEvent quy về px. Firefox báo theo DÒNG (deltaMode 1). */
export function wheelDeltaPx(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * 33
  if (deltaMode === 2) return deltaY * 400
  return deltaY
}

/**
 * Trả về hàm nhận (deltaPx, now) và cho ra +1 (lăn lên = tăng), -1, hoặc 0
 * (chưa đủ để bước). Mỗi event cho tối đa MỘT bước.
 */
export function createWheelStepper(opts: WheelStepperOptions = DEFAULT_WHEEL_STEPPER) {
  let acc = 0
  let lastEventAt = -Infinity
  let lastStepAt = -Infinity

  return (deltaPx: number, now: number): 1 | -1 | 0 => {
    if (deltaPx === 0) return 0
    if (now - lastEventAt > opts.idleResetMs) {
      acc = 0
      lastStepAt = -Infinity
    }
    lastEventAt = now
    if (acc !== 0 && Math.sign(deltaPx) !== Math.sign(acc)) acc = 0

    acc += deltaPx
    if (Math.abs(acc) < opts.thresholdPx) return 0
    if (now - lastStepAt < opts.minIntervalMs) {
      // Chưa tới lượt: giữ tối đa một ngưỡng, phần còn lại bỏ.
      acc = Math.sign(acc) * Math.min(Math.abs(acc), opts.thresholdPx)
      return 0
    }

    const sign = Math.sign(acc)
    acc = sign * Math.min(Math.abs(acc) - opts.thresholdPx, opts.thresholdPx)
    lastStepAt = now
    // deltaY âm = lăn LÊN = tăng thời lượng.
    return sign < 0 ? 1 : -1
  }
}
