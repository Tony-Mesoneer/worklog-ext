// src/core/deficit.ts
//
// Phép tính "ngày này còn thiếu bao nhiêu giờ, và lấp được bao nhiêu" cho lối
// tắt log-bù trong side panel. Thuần số học trên các khoảng phút — không biết
// hôm nay là ngày nào, không biết ai là ai: NGÀY và MỤC TIÊU là input, đúng
// như buildCoverage.
//
// Ở cạnh nextFreeStart / findOverlaps / splitAroundBreaks trong timeline.ts và
// dùng chung quy ước nửa mở [start, end) của chúng: kề nhau KHÔNG phải chồng.
import { mergeBreaks, nextFreeStart, type Break, type DayEntry } from './timeline'

// Một khoảng phút kể từ nửa đêm, nửa mở [start, end).
export type Interval = { startMinutes: number; endMinutes: number }

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export const intervalMinutes = (list: Interval[]): number =>
  list.reduce((sum, i) => sum + Math.max(0, i.endMinutes - i.startMinutes), 0)

// Gộp các khoảng chồng/dính nhau. Cùng luật với mergeBreaks nhưng cho Interval
// bất kỳ (worklog có thể chồng nhau — findOverlaps tồn tại vì thế).
function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list
    .filter((i) => Number.isFinite(i.startMinutes) && Number.isFinite(i.endMinutes))
    .filter((i) => i.endMinutes > i.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes)

  const out: Interval[] = []
  for (const i of sorted) {
    const last = out[out.length - 1]
    if (last && i.startMinutes <= last.endMinutes) {
      last.endMinutes = Math.max(last.endMinutes, i.endMinutes)
    } else {
      out.push({ ...i })
    }
  }
  return out
}

// `base` trừ đi `holes`. Cả hai phải đã gộp và sắp xếp.
function subtract(base: Interval[], holes: Interval[]): Interval[] {
  const out: Interval[] = []
  for (const b of base) {
    let cursor = b.startMinutes
    for (const h of holes) {
      if (h.endMinutes <= cursor) continue
      if (h.startMinutes >= b.endMinutes) break
      if (h.startMinutes > cursor) out.push({ startMinutes: cursor, endMinutes: h.startMinutes })
      cursor = Math.max(cursor, h.endMinutes)
      if (cursor >= b.endMinutes) break
    }
    if (cursor < b.endMinutes) out.push({ startMinutes: cursor, endMinutes: b.endMinutes })
  }
  return out
}

// Giờ làm việc thật của một ngày: [workdayStart, dayEnd) trừ giờ nghỉ. Giờ nghỉ
// KHÔNG BAO GIỜ được tính là thời gian rảnh — đó là lý do hàm này tồn tại tách
// khỏi findFreeGaps.
export function workIntervals(
  workdayStartMinutes: number,
  dayEndMinutes: number,
  breaks: Break[],
): Interval[] {
  if (dayEndMinutes <= workdayStartMinutes) return []
  const span: Interval[] = [{ startMinutes: workdayStartMinutes, endMinutes: dayEndMinutes }]
  return subtract(span, mergeBreaks(breaks).map((b) => ({
    startMinutes: b.startMinutes,
    endMinutes: b.endMinutes,
  })))
}

// Các khoảng còn TRỐNG trong ngày: giờ làm việc, trừ giờ nghỉ, trừ worklog đã
// có. Worklog nằm ngoài giờ làm việc bị kẹp về biên chứ không bị bỏ — người
// dùng log 07:00–09:00 thì 08:30–09:00 đã bị chiếm thật.
export function findFreeGaps(
  entries: DayEntry[],
  workdayStartMinutes: number,
  dayEndMinutes: number,
  breaks: Break[] = [],
): Interval[] {
  const work = workIntervals(workdayStartMinutes, dayEndMinutes, breaks)
  if (work.length === 0) return []

  const occupied = mergeIntervals(
    entries
      .filter((e) => e.durationMinutes > 0)
      .map((e) => ({
        startMinutes: clamp(e.startMinutes, workdayStartMinutes, dayEndMinutes),
        endMinutes: clamp(e.startMinutes + e.durationMinutes, workdayStartMinutes, dayEndMinutes),
      })),
  )
  return subtract(work, occupied)
}

export type DayShortfall = {
  /** Mục tiêu của ngày, phút. Đến từ hoursPerDay của chính người dùng. */
  targetMinutes: number
  /** Tổng thời lượng worklog đã có (TỔNG duration, không phải vùng bị chiếm). */
  loggedMinutes: number
  /**
   * Thời gian còn trống TỪ MỐC ĐỀ XUẤT (proposedStartMinutes) TRỞ ĐI, không
   * phải tổng thời gian trống cả ngày — xem quyết định bên dưới.
   */
  freeMinutes: number
  /** Thiếu so với mục tiêu, chưa kẹp. Không bao giờ âm. */
  missingMinutes: number
  /** Con số nên prefill = min(missing, free). Không bao giờ âm. */
  fillMinutes: number
  /** true khi fill < missing: từ mốc đề xuất tới hết ngày không chứa nổi phần còn thiếu. */
  capped: boolean
  /** Mốc bắt đầu mà nút lấp-giờ sẽ prefill — cùng giá trị nextFreeStart trả về. */
  proposedStartMinutes: number
}

// Ngày này thiếu bao nhiêu, và lấp được bao nhiêu.
//
// Quyết định: `fillMinutes` bị kẹp bởi thời gian còn trống TÍNH TỪ MỐC ĐỀ
// XUẤT (nextFreeStart) TRỞ ĐI, KHÔNG phải tổng thời gian trống cả ngày. Nút
// lấp-giờ luôn prefill bắt đầu từ nextFreeStart — phần trống nằm TRƯỚC mốc đó
// (ví dụ một khoảng hở giữa hai worklog cũ) có thật, nhưng không ai với tới
// được từ mốc bắt đầu mà nút đề xuất, nên cộng nó vào là đưa ra một đề xuất
// tràn qua giờ tan làm. Vì nextFreeStart luôn đứng SAU worklog kết thúc muộn
// nhất, từ đó tới hết ngày chắc chắn không còn worklog nào chắn nữa — nên
// findFreeGaps từ mốc này chỉ còn trừ giờ nghỉ, không trừ worklog. Đề xuất một
// thời lượng mà đoạn còn lại của ngày không chứa nổi là mời người dùng ghi giờ
// vượt giờ tan làm; khi bị kẹp, UI phải NÓI RA chứ không im lặng đưa số nhỏ hơn.
export function dayShortfall(args: {
  entries: DayEntry[]
  targetMinutes: number
  workdayStartMinutes: number
  slotMinutes: number
  dayEndMinutes: number
  breaks?: Break[]
}): DayShortfall {
  const { entries, targetMinutes, workdayStartMinutes, slotMinutes, dayEndMinutes } = args
  const breaks = args.breaks ?? []

  const loggedMinutes = entries
    .filter((e) => e.durationMinutes > 0)
    .reduce((sum, e) => sum + e.durationMinutes, 0)
  // Mốc mà nút lấp-giờ THẬT SỰ sẽ prefill — phải cùng một phép tính với
  // nextFreeStart dùng trong SidePanel, không thì số hiện ra và số được ghi
  // lệch nhau.
  const proposedStartMinutes = nextFreeStart(entries, workdayStartMinutes, slotMinutes, dayEndMinutes, breaks)
  const freeMinutes = intervalMinutes(findFreeGaps(entries, proposedStartMinutes, dayEndMinutes, breaks))
  // Math.max(0, …): log VƯỢT mục tiêu là chuyện thường (OT), và nó không bao
  // giờ được biến thành một con số âm chảy vào ô duration.
  const missingMinutes = Math.max(0, Math.round(targetMinutes) - loggedMinutes)
  const fillMinutes = Math.min(missingMinutes, freeMinutes)

  return {
    targetMinutes: Math.round(targetMinutes),
    loggedMinutes,
    freeMinutes,
    missingMinutes,
    fillMinutes,
    capped: fillMinutes < missingMinutes,
    proposedStartMinutes,
  }
}

// Mục tiêu giờ/ngày của chính người dùng. `members` mang hoursPerDay riêng cho
// người làm bán thời gian; không có entry khớp thì rơi về 8h. Hardcode 8h cho
// mọi người là cách chắc chắn nhất để người làm 4h/ngày bị báo thiếu giờ MỖI
// NGÀY, rồi học cách bỏ qua mọi cảnh báo của extension.
export function myDailyTargetMinutes(
  members: { accountId: string; hoursPerDay: number }[],
  myAccountId: string,
  fallbackHours = 8,
): number {
  const me = members.find((m) => m.accountId === myAccountId)
  const hours = me && Number.isFinite(me.hoursPerDay) && me.hoursPerDay > 0
    ? me.hoursPerDay
    : fallbackHours
  return Math.round(hours * 60)
}
