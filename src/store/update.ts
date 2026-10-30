// src/store/update.ts
//
// Kết quả lần check update gần nhất, trên chrome.storage.local.
//
// Vì sao phải lưu: service worker MV3 bị kill liên tục, nên không giữ được state
// trong bộ nhớ. Side panel mở lên phải biết ngay "có bản mới" mà không cần đợi
// một round-trip ra GitHub — và `lastCheckedAt` là thứ duy nhất chặn việc mỗi
// lần mở panel lại đốt một lượt rate limit.
import type { DownloadKind, ReleaseInfo } from '@/core/version'
import { ext } from '@/platform/ext'

const KEY = 'update'

export type UpdateStore = {
  lastCheckedAt: number
  /** Lỗi lần check gần nhất; null = lần gần nhất thành công. */
  lastError: string | null
  latest: ReleaseInfo | null
  /** Version người dùng đã tắt banner. Bản mới hơn vẫn hiện lại. */
  dismissedVersion: string | null
}

export const emptyUpdateStore: UpdateStore = {
  lastCheckedAt: 0,
  lastError: null,
  latest: null,
  dismissedVersion: null,
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isDownloadKind = (v: unknown): v is DownloadKind =>
  v === 'dmg' || v === 'windows-zip' || v === 'zip'

// Khoan dung như migrateConfig: hình dạng lạ → default. Cache update hỏng không
// bao giờ được là lý do side panel không mở lên được.
export async function readUpdateStore(): Promise<UpdateStore> {
  const res = await ext.storage.local.get(KEY)
  const raw = res[KEY]
  if (!isRecord(raw)) return { ...emptyUpdateStore }
  const latest = raw['latest']
  return {
    lastCheckedAt: typeof raw['lastCheckedAt'] === 'number' ? raw['lastCheckedAt'] : 0,
    lastError: typeof raw['lastError'] === 'string' ? raw['lastError'] : null,
    latest: isRecord(latest) && typeof latest['version'] === 'string'
      ? {
          ...(latest as unknown as ReleaseInfo),
          // Cache ghi bởi bản trước khi có hai field này: thiếu → coi như chỉ có
          // zip store, đúng như những gì bản đó từng chọn.
          downloadKind: isDownloadKind(latest['downloadKind'])
            ? latest['downloadKind']
            : typeof latest['downloadUrl'] === 'string' ? 'zip' : null,
          exeUrl: typeof latest['exeUrl'] === 'string' ? latest['exeUrl'] : null,
        }
      : null,
    dismissedVersion:
      typeof raw['dismissedVersion'] === 'string' ? raw['dismissedVersion'] : null,
  }
}

export async function writeUpdateStore(patch: Partial<UpdateStore>): Promise<UpdateStore> {
  const next = { ...(await readUpdateStore()), ...patch }
  await ext.storage.local.set({ [KEY]: next })
  return next
}
