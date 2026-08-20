// src/core/event-resolve.ts
//
// Ghép sprint event (cấu hình) với sub-task ceremony THẬT trong sprint đang mở.
//
// Vì sao cần lớp này: ceremony ở Jira của team là Sub-task nằm dưới một Task
// "Sprint activities" ĐƯỢC TẠO LẠI mỗi sprint. Hardcode issueKey nghĩa là từ
// sprint sau trở đi mọi giờ ceremony chảy vào sub-task của sprint TRƯỚC — im
// lặng, không lỗi, chỉ phát hiện ra khi có người thắc mắc sao sprint mới không
// có giờ ceremony. Nên issue key được tra tại runtime theo TÊN sub-task.
//
// Vì sao đối chiếu ở client chứ không tin JQL: `~` của Jira là fuzzy match theo
// TỪ, nên `summary ~ "Sprint Review"` cũng kéo cả "Sprint Retro" về (chung từ
// "Sprint"). Một request duy nhất OR tất cả tên lại càng trộn kết quả của mọi
// event vào một rổ. Vì vậy: so sánh TÊN CHÍNH XÁC ở đây, và không bao giờ tin
// thứ tự Jira trả về.
//
// File thuần: không chrome, không fetch, không react.

import type { SprintEvent } from './config-schema'

// Một sub-task ứng viên do Jira trả về, kèm sprint mà nó thuộc về. sprintId /
// sprintStartDate có thể null khi không xác định được sprint — khi đó nó không
// thể THẮNG một tie-break, nhưng vẫn dùng được nếu là ứng viên duy nhất.
export type CeremonyCandidate = {
  key: string
  summary: string
  sprintId: number | null
  sprintStartDate: string | null
}

export type ResolvedSprintEvent = {
  name: string
  /** null = không xác định được issue → UI PHẢI khoá nút. */
  issueKey: string | null
  /** Lý do đọc được (tiếng Việt) khi issueKey null. */
  reason: string | null
  defaultMinutes: number
  comment: string
  /** 'manual' = issueKey ghim trong config; 'summary' = tra theo tên sub-task. */
  source: 'manual' | 'summary'
}

// Chuẩn hoá để so sánh: gộp mọi khoảng trắng (kể cả NBSP mà Jira hay chèn) về
// một space, cắt hai đầu, hạ chữ thường. "  Daily   Scrum " === "daily scrum".
export function normalizeSummary(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

const quote = (s: string) => `"${s}"`

// Điểm thời gian của sprint chứa ứng viên. NaN = không biết → không được dùng
// để thắng tie-break (xem pickCandidate).
const startedAt = (c: CeremonyCandidate): number =>
  c.sprintStartDate === null || c.sprintStartDate === '' ? NaN : Date.parse(c.sprintStartDate)

// Gộp các ứng viên TRÙNG KEY. Cùng một issue xuất hiện hai lần (ví dụ nó nằm
// trong cả hai sprint đang mở, hoặc Jira trả trùng) KHÔNG phải nhập nhằng —
// vẫn là một issue. Giữ bản có sprint mới nhất để tie-break sau này dùng đúng
// mốc thời gian.
function dedupeByKey(cands: CeremonyCandidate[]): CeremonyCandidate[] {
  const best = new Map<string, CeremonyCandidate>()
  for (const c of cands) {
    const prev = best.get(c.key)
    if (prev === undefined) { best.set(c.key, c); continue }
    const a = startedAt(c)
    const b = startedAt(prev)
    if (Number.isFinite(a) && (!Number.isFinite(b) || a > b)) best.set(c.key, c)
  }
  return [...best.values()]
}

type Pick =
  | { key: string }
  | { key: null; ambiguousCount: number }

// Chọn một ứng viên trong nhóm đã khớp TÊN CHÍNH XÁC.
//
// Tie-break khi có nhiều sprint đang mở (lúc chuyển sprint Jira có thể có hai
// sprint active cùng lúc, và cùng một tên ceremony tồn tại ở cả hai): ưu tiên
// ứng viên thuộc sprint có startDate MUỘN NHẤT. Nếu vẫn không phân biệt được
// (bằng nhau, hoặc không biết startDate) thì trả null — ghi giờ vào sprint sai
// tệ hơn là bắt người dùng chọn tay một lần.
function pickCandidate(cands: CeremonyCandidate[]): Pick {
  const uniq = dedupeByKey(cands)
  const only = uniq[0]
  if (only === undefined) return { key: null, ambiguousCount: 0 }
  if (uniq.length === 1) return { key: only.key }

  const sorted = [...uniq].sort((a, b) => {
    const x = startedAt(a)
    const y = startedAt(b)
    // Ứng viên không biết startDate luôn xuống cuối: nó không được thắng.
    if (!Number.isFinite(x) && !Number.isFinite(y)) return a.key.localeCompare(b.key)
    if (!Number.isFinite(x)) return 1
    if (!Number.isFinite(y)) return -1
    return y - x || a.key.localeCompare(b.key)
  })

  const first = sorted[0]!
  const second = sorted[1]!
  const t1 = startedAt(first)
  const t2 = startedAt(second)
  // Chỉ thắng khi CHẮC CHẮN muộn hơn: biết mốc của mình, và mốc đó lớn hơn hẳn
  // mốc của ứng viên kế tiếp (hoặc ứng viên kế tiếp không rõ mốc nào cả).
  if (Number.isFinite(t1) && (!Number.isFinite(t2) || t1 > t2)) return { key: first.key }
  return { key: null, ambiguousCount: uniq.length }
}

export type ResolveOptions = {
  /**
   * Lý do KHÔNG tra được sub-task lần này (chưa có sprint đang mở, Jira lỗi,
   * chưa chọn board…). Khi có, mọi event tra-theo-tên bị khoá kèm lý do này;
   * event có issueKey ghim tay vẫn chạy bình thường.
   */
  unavailable?: string
}

// Trả về mảng SONG SONG với `events` (cùng thứ tự, cùng độ dài) để UI render
// trực tiếp. Không bao giờ im lặng rơi về issueKey cũ khi tra theo tên thất
// bại — đó chính là cái bug đang sửa.
export function resolveSprintEvents(
  events: SprintEvent[],
  candidates: CeremonyCandidate[],
  opts: ResolveOptions = {},
): ResolvedSprintEvent[] {
  // Nhóm ứng viên theo tên đã chuẩn hoá. Đây là chỗ kết quả fuzzy của Jira bị
  // loại: sub-task nào không khớp CHÍNH XÁC tên nào cả thì không vào nhóm nào.
  const byName = new Map<string, CeremonyCandidate[]>()
  for (const c of candidates) {
    const n = normalizeSummary(c.summary)
    const list = byName.get(n)
    if (list === undefined) byName.set(n, [c])
    else list.push(c)
  }

  return events.map((e) => {
    const base = {
      name: e.name,
      defaultMinutes: e.defaultMinutes,
      comment: e.comment,
    }
    const manualKey = e.issueKey.trim()
    const want = e.matchSummary.trim()

    // matchSummary rỗng → hành vi CŨ y nguyên: dùng issueKey.
    if (want === '') {
      return manualKey === ''
        ? {
            ...base, source: 'manual' as const, issueKey: null,
            reason: 'event chưa có issue key và cũng chưa chọn sub-task — sửa trong Options',
          }
        : { ...base, source: 'manual' as const, issueKey: manualKey, reason: null }
    }

    if (opts.unavailable !== undefined) {
      return {
        ...base, source: 'summary' as const, issueKey: null,
        reason: `${opts.unavailable} — không tra được sub-task ${quote(want)}`,
      }
    }

    const picked = pickCandidate(byName.get(normalizeSummary(want)) ?? [])
    if (picked.key !== null) {
      return { ...base, source: 'summary' as const, issueKey: picked.key, reason: null }
    }
    return {
      ...base, source: 'summary' as const, issueKey: null,
      reason: picked.ambiguousCount === 0
        ? `không tìm thấy ${quote(want)} trong sprint hiện tại`
        : `có ${picked.ambiguousCount} sub-task tên ${quote(want)} trong các sprint đang mở` +
          ' — không biết chọn cái nào, hãy nhập issue key thủ công',
    }
  })
}

// --- cache key -------------------------------------------------------------

export const CEREMONY_KEY_PREFIX = 'ceremony:'

// Key gắn với SPRINT ID đang active, nên nó TỰ hết hạn khi sang sprint mới —
// không cần TTL và không có cửa sổ nào mà cache của sprint cũ còn được dùng.
// Gộp thêm projects + danh sách tên: đổi cấu hình event cũng phải tra lại,
// không thì người dùng sửa tên trong Options mà nút vẫn trỏ chỗ cũ.
export function ceremonyCacheKey(
  sprintId: number, projects: string[], matchSummaries: string[],
): string {
  const p = [...projects].sort().join(',')
  const s = [...new Set(matchSummaries.map(normalizeSummary))].filter((x) => x !== '').sort().join('|')
  return `${CEREMONY_KEY_PREFIX}${sprintId}|${p}|${s}`
}

// Chỉ sprint hiện tại có ý nghĩa, nên mọi key ceremony khác đều là rác. Trả về
// danh sách cần xoá để storage.local không phình theo số sprint đã trôi qua.
export function ceremonyKeysToDrop(allKeys: string[], keepKey: string): string[] {
  return allKeys.filter((k) => k.startsWith(CEREMONY_KEY_PREFIX) && k !== keepKey)
}
