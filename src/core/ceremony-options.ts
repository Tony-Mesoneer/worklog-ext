// src/core/ceremony-options.ts
//
// Biến danh sách sub-task của sprint đang mở thành các DÒNG CHỌN cho dropdown
// "Sub-task trong sprint" ở Options.
//
// Vì sao cần lớp này: dropdown cũ chỉ liệt kê TÊN sub-task, nên trong sprint
// thật nó hiện bốn dòng gần như giống nhau — một "Sprint Review" (ceremony) và
// ba "Security Review" (mỗi story một cái) — và không có gì để phân biệt. Người
// dùng chọn "Security Review", tưởng đã xong, rồi nút trong side panel bị khoá.
//
// Tệ hơn: BẤT KỲ cái nào trong ba "Security Review" cũng CHẮC CHẮN không tra
// được. resolveSprintEvents khớp tên CHÍNH XÁC, và tie-break của nó chỉ thắng
// khi một ứng viên thuộc sprint MUỘN HƠN; ba sub-task cùng tên trong CÙNG một
// sprint thì không có ai thắng → issueKey null → nút khoá. Nghĩa là dropdown
// đang mời người dùng chọn một thứ không thể hoạt động.
//
// Nên ở đây làm hai việc, và CHỈ hai việc:
//   1. gắn TÊN CHA vào mỗi dòng để bốn dòng đó phân biệt được;
//   2. đánh dấu tên bị TRÙNG trong sprint là không dùng được, để UI khoá nó
//      kèm lý do — thay vì để người dùng tự phát hiện rất muộn.
//
// CỐ TÌNH KHÔNG đoán "cái nào mới là ceremony": hai task container của project
// này đặt tên không thống nhất ("S34 - Sprint activities" vs "Sprint activities
// - Sprint 35"), nên mọi heuristic theo tên cha đều mong manh. Hiện dữ liệu ra,
// còn quyền chọn là của người dùng.
//
// File thuần: không chrome, không fetch, không react.

import { normalizeSummary } from './event-resolve'

/**
 * Một sub-task ứng viên cho dropdown. Hình dạng này là TẬP CON của
 * `IssueMeta` (src/core/issue-hierarchy) nên `ceremonies/list` truyền thẳng
 * IssueMeta vào được, không cần type mới ở lớp UI.
 */
export type CeremonySubtask = {
  key: string
  summary: string
  parentKey: string | null
  parentSummary: string | null
}

export type CeremonyOption = {
  /** Issue key của sub-task — dùng làm React key, KHÔNG phải giá trị lưu. */
  issueKey: string
  /** Giá trị commit vào `matchSummary`: summary THÔ, chưa chuẩn hoá. */
  value: string
  /** Phần mô tả cha đã format, null khi sub-task không có cha. */
  parentLabel: string | null
  /** Nhãn đầy đủ để hiển thị: "Sprint Review — S34 - Sprint activities". */
  label: string
  /** Số sub-task KHÁC KEY cùng tên (đã chuẩn hoá) trong danh sách. */
  duplicateCount: number
  /** false = chọn tên này không bao giờ tra được issue → UI PHẢI khoá option. */
  usable: boolean
}

// Không có cha là chuyện BÌNH THƯỜNG, không phải lỗi: Jira bỏ `fields.parent`
// khi issue không phải sub-task, hoặc khi field bị khoá quyền. Nói ra "không
// biết cha" còn hơn để dòng trống trông như lỗi render.
const NO_PARENT = 'không rõ task cha'

// Cha hiện bằng TÊN khi có (người dùng nhận ra "S34 - Sprint activities"), rơi
// về key khi Jira chỉ trả key. Hai thứ này là toàn bộ những gì IssueMeta có.
function parentLabelOf(s: CeremonySubtask): string | null {
  const summary = (s.parentSummary ?? '').trim()
  if (summary !== '') return summary
  const key = (s.parentKey ?? '').trim()
  return key === '' ? null : key
}

// Gộp ứng viên TRÙNG KEY trước khi đếm — cùng nước đi như dedupeByKey của
// event-resolve. Một issue trả về hai lần KHÔNG phải nhập nhằng, và nếu đếm nó
// hai lần thì một tên duy nhất sẽ bị khoá oan.
function dedupeByKey(items: readonly CeremonySubtask[]): CeremonySubtask[] {
  const seen = new Map<string, CeremonySubtask>()
  for (const s of items) {
    if (!seen.has(s.key)) seen.set(s.key, s)
  }
  return [...seen.values()]
}

// Sub-task không có tên thì không thể là giá trị của matchSummary (resolve coi
// matchSummary rỗng là "dùng issueKey"), nên nó không được vào dropdown.
const named = (s: CeremonySubtask): boolean => normalizeSummary(s.summary) !== ''

/**
 * Đếm số sub-task theo tên đã CHUẨN HOÁ. So sánh bỏ qua hoa/thường và mọi
 * khoảng trắng thừa — y hệt cách resolveSprintEvents so tên, không thì UI báo
 * "ổn" cho một tên mà resolve vẫn coi là trùng.
 */
export function summaryCounts(items: readonly CeremonySubtask[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const s of dedupeByKey(items).filter(named)) {
    const n = normalizeSummary(s.summary)
    counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  return counts
}

/** Các tên (đã chuẩn hoá) xuất hiện từ HAI sub-task trở lên trong sprint. */
export function duplicateSummaries(items: readonly CeremonySubtask[]): Set<string> {
  const out = new Set<string>()
  for (const [n, count] of summaryCounts(items)) {
    if (count > 1) out.add(n)
  }
  return out
}

/**
 * Tên này có bị trùng trong sprint không — dùng cho cấu hình ĐÃ LƯU, để Options
 * cảnh báo ngay tại dòng đó thay vì đợi người dùng thấy nút bị khoá ở side panel.
 */
export function isAmbiguousSummary(
  summary: string, items: readonly CeremonySubtask[],
): boolean {
  const n = normalizeSummary(summary)
  if (n === '') return false
  return (summaryCounts(items).get(n) ?? 0) > 1
}

/**
 * MỘT DÒNG CHO MỖI SUB-TASK, không phải một dòng cho mỗi tên: ba "Security
 * Review" dưới ba story khác nhau là ba dòng, vì đó đúng là những gì tồn tại
 * trong Jira và cha là thứ duy nhất phân biệt được chúng. Cả ba mang cùng
 * `value` và cùng `usable: false`.
 *
 * Sắp xếp theo tên rồi theo cha để các dòng cùng tên nằm cạnh nhau — người dùng
 * thấy ngay "à, có ba cái giống nhau".
 */
export function buildCeremonyOptions(
  items: readonly CeremonySubtask[],
): CeremonyOption[] {
  const counts = summaryCounts(items)

  return dedupeByKey(items)
    .filter(named)
    .map((s) => {
      const value = s.summary.trim()
      const parentLabel = parentLabelOf(s)
      const duplicateCount = counts.get(normalizeSummary(s.summary)) ?? 1
      return {
        issueKey: s.key,
        value,
        parentLabel,
        label: `${value} — ${parentLabel ?? NO_PARENT}`,
        duplicateCount,
        usable: duplicateCount <= 1,
      }
    })
    .sort((a, b) =>
      a.value.localeCompare(b.value) ||
      (a.parentLabel ?? '').localeCompare(b.parentLabel ?? '') ||
      a.issueKey.localeCompare(b.issueKey))
}
