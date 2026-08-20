export type DayEntry = {
  id: string
  issueKey: string
  startMinutes: number
  durationMinutes: number
}

// Một khoảng nghỉ trong ngày, tính bằng phút từ nửa đêm. Nửa mở [start, end):
// mốc `end` đã là giờ làm việc trở lại, nên một worklog bắt đầu đúng `end`
// KHÔNG nằm trong khoảng nghỉ — cùng quy ước "kề nhau không phải chồng" mà
// findOverlaps đang dùng.
export type Break = { startMinutes: number; endMinutes: number }

// Một đoạn worklog sẽ được POST. splitAroundBreaks trả về danh sách này.
export type Segment = { startMinutes: number; durationMinutes: number }

export function parseHhMm(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function formatMinutes(m: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export function snapUp(minutes: number, slotMinutes: number): number {
  return Math.ceil(minutes / slotMinutes) * slotMinutes
}

// --- breaks ----------------------------------------------------------------

// Chuyển `config.breaks` (cặp chuỗi "HH:MM") sang phút, bỏ khoảng vô nghĩa,
// sắp xếp và gộp khoảng dính/chồng nhau. Gộp là bắt buộc: splitAroundBreaks đi
// tuần tự qua danh sách, hai khoảng chồng nhau chưa gộp sẽ cắt đoạn thành ba
// mảnh trong đó có mảnh dài 0 phút.
export function normalizeBreaks(list: { start: string; end: string }[]): Break[] {
  return mergeBreaks(
    list.map((b) => ({ startMinutes: parseHhMm(b.start), endMinutes: parseHhMm(b.end) })),
  )
}

export function mergeBreaks(breaks: Break[]): Break[] {
  const sorted = breaks
    .filter((b) => Number.isFinite(b.startMinutes) && Number.isFinite(b.endMinutes))
    .filter((b) => b.endMinutes > b.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes)

  const out: Break[] = []
  for (const b of sorted) {
    const last = out[out.length - 1]
    // Chỉ gộp khi CHỒNG hoặc DÍNH nhau (11–12 và 12–13 là một khoảng 11–13).
    if (last && b.startMinutes <= last.endMinutes) {
      last.endMinutes = Math.max(last.endMinutes, b.endMinutes)
    } else {
      out.push({ ...b })
    }
  }
  return out
}

// Khoảng nghỉ chứa MỐC THỜI GIAN này, hoặc null. Dùng cho mốc bắt đầu (dropdown
// "Bắt đầu", nextFreeStart) — không phải cho một khoảng thời lượng: một worklog
// bắt đầu 11:45 là hợp lệ dù nó sẽ bị cắt ở 12:00.
export function breakAt(minutes: number, breaks: Break[]): Break | null {
  for (const b of breaks) {
    if (minutes >= b.startMinutes && minutes < b.endMinutes) return b
  }
  return null
}

// Cắt một yêu cầu (mốc bắt đầu + thời lượng) thành các đoạn không đi qua giờ
// nghỉ, GIỮ NGUYÊN TỔNG THỜI LƯỢNG: phần bị giờ nghỉ chặn lại được đẩy sang sau
// giờ nghỉ chứ không bị mất.
//
// Quyết định cho trường hợp mốc bắt đầu nằm TRONG giờ nghỉ (vd 12:15, có thể
// đến từ config cũ hoặc value gõ tay): đẩy TIẾN tới hết giờ nghỉ (13:00), không
// lùi về trước. Lý do: lùi lại là tự ý khai giờ làm việc sớm hơn người dùng
// nói, và rất dễ chồng lên worklog đã có trước bữa trưa; đẩy tiến giữ đúng tổng
// thời lượng và chỉ dịch đúng phần thời gian mà chính người dùng đã khai là
// không làm việc.
export function splitAroundBreaks(
  startMinutes: number,
  durationMinutes: number,
  breaks: Break[],
): Segment[] {
  if (durationMinutes <= 0) return []
  const bs = mergeBreaks(breaks)

  let cursor = startMinutes
  // Bắt đầu trong giờ nghỉ → đẩy tới hết giờ nghỉ đó.
  const inside = breakAt(cursor, bs)
  if (inside) cursor = inside.endMinutes

  let remaining = durationMinutes
  const out: Segment[] = []

  while (remaining > 0) {
    const next = bs.find((b) => b.startMinutes > cursor)
    if (!next) {
      out.push({ startMinutes: cursor, durationMinutes: remaining })
      break
    }
    const available = next.startMinutes - cursor
    // `<=` chứ không `<`: kết thúc ĐÚNG mốc giờ nghỉ là kề nhau, không phải đi
    // qua giờ nghỉ, nên không cắt.
    if (remaining <= available) {
      out.push({ startMinutes: cursor, durationMinutes: remaining })
      break
    }
    out.push({ startMinutes: cursor, durationMinutes: available })
    remaining -= available
    cursor = next.endMinutes
  }

  return out
}

// Mốc kết thúc của đoạn cuối. Dùng để cảnh báo (KHÔNG chặn) khi phần đuôi vượt
// quá giờ tan làm.
export function segmentsEnd(segments: Segment[]): number {
  return segments.reduce((max, s) => Math.max(max, s.startMinutes + s.durationMinutes), 0)
}

// --- lưới slot -------------------------------------------------------------

// Mốc slot cuối cùng mà buildSlots(workdayStart, workdayEnd, slot) sinh ra.
// Không tính giờ nghỉ: nextFreeStart mới chọn trực tiếp từ buildSlots nên nó
// không cần hàm này để kẹp, đây chỉ còn là tiện ích mô tả biên của lưới.
export function lastSlotStart(
  workdayStartMinutes: number,
  slotMinutes: number,
  dayEndMinutes: number,
): number {
  if (slotMinutes <= 0 || dayEndMinutes <= workdayStartMinutes) return workdayStartMinutes
  const count = Math.ceil((dayEndMinutes - workdayStartMinutes) / slotMinutes)
  return workdayStartMinutes + (count - 1) * slotMinutes
}

// Các mốc bắt đầu hợp lệ. `breaks` mặc định rỗng để caller cũ không đổi hành vi;
// khi có giờ nghỉ thì mốc nằm trong giờ nghỉ bị loại khỏi lưới — dropdown không
// được mời người dùng bắt đầu một worklog vào giữa bữa trưa.
export function buildSlots(
  fromMinutes: number,
  toMinutes: number,
  slotMinutes: number,
  breaks: Break[] = [],
): number[] {
  if (slotMinutes <= 0) return []
  const slots: number[] = []
  for (let m = fromMinutes; m < toMinutes; m += slotMinutes) {
    if (breakAt(m, breaks)) continue
    slots.push(m)
  }
  return slots
}

// Start time mặc định = ngay sau worklog kết thúc muộn nhất trong ngày, snap lên
// lưới, rồi lấy mốc HỢP LỆ đầu tiên từ chính buildSlots.
//
// INVARIANT: kết quả luôn là một phần tử của buildSlots(...) với cùng tham số.
// Đây là lý do hàm chọn từ danh sách slot thay vì tự tính rồi kẹp: dropdown chỉ
// có option trong lưới, một <select> có value ngoài lưới sẽ hiện option ĐẦU TIÊN
// trong khi state giữ giá trị khác — panel hiện 08:30 nhưng POST giờ khác. Nhờ
// chọn-từ-lưới, việc bỏ qua giờ nghỉ và việc kẹp về cuối ngày là cùng một phép.
export function nextFreeStart(
  entries: DayEntry[],
  workdayStartMinutes: number,
  slotMinutes: number,
  dayEndMinutes: number,
  breaks: Break[] = [],
): number {
  const lastEnd = entries.reduce(
    (max, e) => Math.max(max, e.startMinutes + e.durationMinutes),
    0,
  )
  // Snap trên lưới tính TỪ workdayStart, không từ nửa đêm: với workdayStart
  // 09:30 và slot 60 phút thì lưới là 09:30/10:30/…, nên snapUp tuyệt đối sẽ
  // trả 10:00 — một giá trị không có trong dropdown.
  const candidate =
    workdayStartMinutes + snapUp(Math.max(0, lastEnd - workdayStartMinutes), slotMinutes)

  const slots = buildSlots(workdayStartMinutes, dayEndMinutes, slotMinutes, breaks)
  // Lưới rỗng (giờ tan làm <= giờ bắt đầu, hoặc cả ngày là giờ nghỉ): không có
  // mốc nào để trả, giữ nguyên giờ bắt đầu ngày làm việc.
  if (slots.length === 0) return workdayStartMinutes
  // Ngày đã kín tới cuối lưới thì kẹp về slot cuối; cảnh báo chồng giờ sẽ tự
  // bật, đó là thông tin đúng.
  return slots.find((s) => s >= candidate) ?? slots[slots.length - 1]!
}

export function occupiedBy(
  entries: DayEntry[],
  slotStart: number,
  slotMinutes: number,
): DayEntry | null {
  const slotEnd = slotStart + slotMinutes
  for (const e of entries) {
    const end = e.startMinutes + e.durationMinutes
    if (e.startMinutes < slotEnd && end > slotStart) return e
  }
  return null
}

// Kề nhau (end === start) KHÔNG tính là chồng — đó là trường hợp bình thường
// nhất khi lấp kín ngày.
export function findOverlaps(
  entries: DayEntry[],
  startMinutes: number,
  durationMinutes: number,
): DayEntry[] {
  const end = startMinutes + durationMinutes
  return entries.filter((e) => {
    const eEnd = e.startMinutes + e.durationMinutes
    return e.startMinutes < end && eEnd > startMinutes
  })
}
