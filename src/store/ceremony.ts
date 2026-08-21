// src/store/ceremony.ts
//
// Cache ứng viên sub-task ceremony của sprint đang mở.
//
// KHÔNG có TTL: key gắn với sprint id (xem ceremonyCacheKey), nên sang sprint
// mới là key mới và cache cũ không còn đường nào được đọc lại. TTL sẽ tạo ra
// đúng cái cửa sổ nguy hiểm mà thay đổi này đang loại bỏ — vài giờ đầu sprint
// mới vẫn trỏ vào sub-task sprint cũ.
//
// Cache ỨNG VIÊN THÔ chứ không phải map đã resolve: việc đối chiếu là hàm thuần
// và gần như miễn phí, nên chạy lại mỗi lần giữ đúng một nguồn sự thật duy nhất
// và không có nguy cơ map cache lệch với danh sách event hiện tại.
import {
  ceremonyCacheKey, ceremonyKeysToDrop, type CeremonyCandidate,
} from '@/core/event-resolve'
import { ext } from '@/platform/ext'

export type CeremonyCache = {
  fetchedAt: number
  sprintName: string
  candidates: CeremonyCandidate[]
}

type Args = { sprintId: number; projects: string[]; matchSummaries: string[] }

export async function readCeremonyCache(args: Args): Promise<CeremonyCache | null> {
  const key = ceremonyCacheKey(args.sprintId, args.projects, args.matchSummaries)
  const res = await ext.storage.local.get(key)
  const hit = res[key] as CeremonyCache | undefined
  // Hình dạng lạ (bản cũ, storage bị sửa tay) → coi như miss, fetch lại.
  if (!hit || !Array.isArray(hit.candidates)) return null
  return hit
}

// Ghi cache của sprint hiện tại rồi dọn mọi key ceremony khác: chỉ sprint đang
// mở có ý nghĩa, giữ lại key của sprint cũ chỉ làm storage phình theo số sprint
// đã trôi qua.
export async function writeCeremonyCache(
  args: Args, value: CeremonyCache,
): Promise<void> {
  const key = ceremonyCacheKey(args.sprintId, args.projects, args.matchSummaries)
  await ext.storage.local.set({ [key]: value })
  const all = await ext.storage.local.get(null)
  const drop = ceremonyKeysToDrop(Object.keys(all), key)
  if (drop.length > 0) await ext.storage.local.remove(drop)
}
