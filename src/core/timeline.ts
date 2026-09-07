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

// Khoảng nghỉ chứa MỐC THỜI GIAN này, hoặc null. Dùng cho mốc bắt đầu (nhãn
// trong dropdown "Bắt đầu", nextFreeStart) — không phải cho một khoảng thời
// lượng: một worklog bắt đầu 11:45 là hợp lệ dù nó sẽ bị cắt ở 12:00.
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
// Quyết định cho trường hợp mốc bắt đầu nằm TRONG giờ nghỉ (vd 12:15): coi đó
// là "hôm nay làm xuyên trưa" và BỎ HẲN khoảng nghỉ đó khỏi phép cắt — không
// đẩy tiến tới 13:00, không lùi về trước. Lý do: dropdown "Bắt đầu" có mời mốc
// này (xem buildSlots), nên chọn 12:15 là một khai báo có chủ ý của người dùng,
// và dịch nó đi là ghi khác điều họ vừa nói. Các khoảng nghỉ SAU đó vẫn cắt
// bình thường: chỉ đúng khoảng mà người dùng bước vào mới bị bỏ qua.
export function splitAroundBreaks(
  startMinutes: number,
  durationMinutes: number,
  breaks: Break[],
): Segment[] {
  if (durationMinutes <= 0) return []
  const merged = mergeBreaks(breaks)
  // Bắt đầu trong giờ nghỉ → làm xuyên khoảng đó: bỏ nó khỏi danh sách.
  const inside = breakAt(startMinutes, merged)
  const bs = inside ? merged.filter((b) => b !== inside) : merged

  let cursor = startMinutes
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
// nextFreeStart chọn trực tiếp từ buildSlots nên nó không cần hàm này để kẹp,
// đây chỉ còn là tiện ích mô tả biên của lưới.
export function lastSlotStart(
  workdayStartMinutes: number,
  slotMinutes: number,
  dayEndMinutes: number,
): number {
  if (slotMinutes <= 0 || dayEndMinutes <= workdayStartMinutes) return workdayStartMinutes
  const count = Math.ceil((dayEndMinutes - workdayStartMinutes) / slotMinutes)
  return workdayStartMinutes + (count - 1) * slotMinutes
}

// Các mốc bắt đầu hợp lệ — TOÀN BỘ lưới, kể cả mốc rơi vào giờ nghỉ. Giờ nghỉ
// không bị loại ở đây vì "làm xuyên trưa" là chuyện có thật: người dùng phải
// chọn được 12:15 khi hôm nay họ làm qua bữa trưa. Cái mà giờ nghỉ chi phối là
// giá trị MẶC ĐỊNH (nextFreeStart), không phải tập giá trị hợp lệ; dropdown tự
// gắn nhãn cho những mốc này (xem LogForm) để chọn nhầm không âm thầm.
export function buildSlots(
  fromMinutes: number,
  toMinutes: number,
  slotMinutes: number,
): number[] {
  if (slotMinutes <= 0) return []
  const slots: number[] = []
  for (let m = fromMinutes; m < toMinutes; m += slotMinutes) slots.push(m)
  return slots
}

// Start time mặc định = ngay sau worklog kết thúc muộn nhất trong ngày, snap lên
// lưới, rồi lấy mốc đầu tiên từ chính buildSlots mà KHÔNG rơi vào giờ nghỉ.
// Mặc định không bao giờ mời người dùng bắt đầu giữa bữa trưa; muốn vậy thì họ
// tự chọn trong dropdown.
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

  const bs = mergeBreaks(breaks)
  // Lọc giờ nghỉ Ở ĐÂY chứ không trong buildSlots: dropdown vẫn phải có đủ lưới.
  const free = buildSlots(workdayStartMinutes, dayEndMinutes, slotMinutes)
    .filter((s) => !breakAt(s, bs))
  // Lưới rỗng (giờ tan làm <= giờ bắt đầu, hoặc cả ngày là giờ nghỉ): không có
  // mốc nào để trả, giữ nguyên giờ bắt đầu ngày làm việc.
  if (free.length === 0) return workdayStartMinutes
  // Ngày đã kín tới cuối lưới thì kẹp về slot làm-việc cuối; cảnh báo chồng giờ
  // sẽ tự bật, đó là thông tin đúng.
  return free.find((s) => s >= candidate) ?? free[free.length - 1]!
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

// --- lưới của dropdown "Bắt đầu" -------------------------------------------

// Biên của dropdown "Bắt đầu", KHÔNG phải giờ làm việc. Giờ làm việc trong
// config quyết định giá trị MẶC ĐỊNH và các cảnh báo; hai mốc dưới đây chỉ nới
// tập giá trị người dùng CHỌN ĐƯỢC. Lý do: đi sớm 07:30 hay ở lại tới 18:00 là
// chuyện có thật, và trước đây dropdown chặn hẳn nên phần giờ đó không log được
// từ panel. Cùng lối xử lý với giờ nghỉ trưa: mời chọn, gắn nhãn, không mặc định.
export const PICKER_FLOOR_MINUTES = 7 * 60 + 30 // 07:30
export const PICKER_CEIL_MINUTES = 18 * 60 // 18:00

// Lưới cho dropdown: rộng hơn giờ làm việc, nhưng VẪN NEO VÀO workdayStart.
//
// Neo là bắt buộc, không phải chi tiết thẩm mỹ: nextFreeStart trả về một phần
// tử của buildSlots(workdayStart, …), và <select> có value ngoài danh sách
// option sẽ hiện option ĐẦU TIÊN trong khi state giữ giá trị khác. Nếu lưới này
// bắt đầu đúng 07:30 thì với workdayStart 08:20 (slot 15) nó sẽ là 07:30/07:45/…
// — không chứa 08:20, và panel hiện một giờ còn POST một giờ khác. Vì vậy mốc
// đầu được lùi TỪNG SLOT từ workdayStart xuống tới khi chạm/qua sàn.
export function buildPickerSlots(
  workdayStartMinutes: number,
  dayEndMinutes: number,
  slotMinutes: number,
  floorMinutes: number = PICKER_FLOOR_MINUTES,
  ceilMinutes: number = PICKER_CEIL_MINUTES,
): number[] {
  if (slotMinutes <= 0) return []
  const back = Math.max(0, Math.ceil((workdayStartMinutes - floorMinutes) / slotMinutes))
  const from = workdayStartMinutes - back * slotMinutes
  return buildSlots(from, Math.max(dayEndMinutes, ceilMinutes), slotMinutes)
}
