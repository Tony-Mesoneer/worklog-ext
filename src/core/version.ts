// src/core/version.ts
//
// Version của extension và việc so nó với GitHub Release mới nhất.
//
// Extension này cài bằng "Load unpacked", nên Chrome KHÔNG tự update: không có
// update_url, chrome.runtime.requestUpdateCheck() chỉ có nghĩa với bản cài từ
// Web Store. Cái duy nhất làm được là tự đi hỏi GitHub xem có tag mới hơn
// không, rồi nói cho người dùng biết và đưa link zip. Việc thay thư mục dist/
// và bấm Reload vẫn là thao tác tay — xem README.
//
// Tất cả ở đây là hàm thuần: không fetch, không chrome.*. Phần I/O nằm ở
// src/sw/update.ts và src/store/update.ts.

/** Bao lâu thì tự đi hỏi lại GitHub. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

// Chrome chỉ nhận version là 1–4 nhóm số nguyên (không prerelease, không hậu
// tố). Regex này cũng là hợp đồng của scripts/bump-version.mjs.
const CHROME_VERSION = /^\d+(\.\d+){0,3}$/

/** "0.2.0" → [0, 2, 0]. Không đúng dạng Chrome → null. */
export function parseVersion(raw: unknown): number[] | null {
  if (typeof raw !== 'string' || !CHROME_VERSION.test(raw)) return null
  return raw.split('.').map(Number)
}

/**
 * -1 / 0 / 1 theo từng nhóm số. Nhóm thiếu coi như 0, nên "1.0" == "1.0.0".
 * Version không đọc được → 0: cái gì không hiểu thì coi như bằng nhau, để
 * không bao giờ báo "có bản mới" dựa trên rác.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return 0
  for (let i = 0; i < 4; i++) {
    const x = left[i] ?? 0
    const y = right[i] ?? 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

/** Chỉ true khi `latest` thực sự lớn hơn `current`. */
export const isNewerVersion = (latest: string, current: string): boolean =>
  compareVersions(latest, current) === 1

/** "v0.3.0" → "0.3.0". */
export const stripTagPrefix = (tag: string): string =>
  tag.trim().replace(/^v/, '')

const REPO_SLUG = /^[\w.-]+\/[\w.-]+$/

/** `owner/name` — không nhận URL, không nhận chuỗi rỗng. */
export const isRepoSlug = (value: string): boolean => REPO_SLUG.test(value)

export const releaseApiUrl = (repo: string): string =>
  `https://api.github.com/repos/${repo}/releases/latest`

export type ReleaseInfo = {
  version: string
  tag: string
  url: string
  downloadUrl: string | null
  publishedAt: string
  notes: string
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// Từ v0.6.0 mỗi release có HAI zip: bản Chrome (`worklog-ext-<v>.zip`) và bản
// Firefox (`worklog-ext-<v>-firefox.zip`). Nên không thể lấy "cái .zip đầu tiên"
// nữa — làm vậy là mời người dùng Firefox tải bản Chrome.
//
// Chỉ nhận asset CÓ url: asset đang upload dở vẫn xuất hiện trong payload nhưng
// chưa có browser_download_url, và một link chết còn tệ hơn không có link.
//
// Không khớp được thì trả null CHỦ Ý, không rơi về zip của nền tảng khác: đưa
// file Chrome cho người dùng Firefox tệ hơn là không đưa gì — banner sẽ rơi về
// link trang release, nơi họ tự thấy có những gì. Release cũ (v0.2–v0.5) chỉ có
// zip Chrome nên người dùng Firefox rơi vào đúng nhánh này.
const pickZip = (raw: unknown, firefox: boolean): string | null => {
  if (!Array.isArray(raw)) return null
  for (const asset of raw) {
    if (!isRecord(asset)) continue
    const name = str(asset['name']).toLowerCase()
    const url = str(asset['browser_download_url'])
    if (!name.endsWith('.zip') || url === '') continue
    if (name.includes('firefox') === firefox) return url
  }
  return null
}

/**
 * Đọc payload /releases/latest của GitHub. Khoan dung như migrateConfig: chỉ
 * `tag_name` phải đọc được thành version, còn lại thiếu thì rỗng — không throw,
 * vì đây là dữ liệu ngoài tầm kiểm soát và một update check fail không được làm
 * vỡ service worker.
 */
export function parseRelease(
  raw: unknown,
  // Mặc định Chrome: nó là số đông, và giữ mặc định này nghĩa là mọi chỗ gọi cũ
  // không đổi hành vi. Chỗ duy nhất truyền `true` là service worker, sau khi tự
  // phát hiện nền tảng — xem platform/ext.
  opts: { firefox?: boolean } = {},
): ReleaseInfo | null {
  if (!isRecord(raw)) return null
  const tag = str(raw['tag_name']).trim()
  const version = stripTagPrefix(tag)
  if (parseVersion(version) === null) return null
  return {
    version,
    tag,
    url: str(raw['html_url']),
    downloadUrl: pickZip(raw['assets'], opts.firefox === true),
    publishedAt: str(raw['published_at']),
    notes: str(raw['body']),
  }
}

export type UpdateState = 'unknown' | 'current' | 'available' | 'dismissed'

/**
 * `dismissed` chỉ áp cho ĐÚNG version đã tắt: tắt banner của 0.3.0 không được
 * che 0.4.0. So bằng compareVersions chứ không phải `===` để tag "v0.3" và
 * "0.3.0" không thành hai thứ khác nhau.
 */
export function decideUpdate(
  current: string,
  latest: ReleaseInfo | null,
  dismissedVersion: string | null,
): { state: UpdateState; latestVersion: string | null } {
  if (!latest) return { state: 'unknown', latestVersion: null }
  if (!isNewerVersion(latest.version, current)) {
    return { state: 'current', latestVersion: latest.version }
  }
  if (dismissedVersion && compareVersions(dismissedVersion, latest.version) >= 0) {
    return { state: 'dismissed', latestVersion: latest.version }
  }
  return { state: 'available', latestVersion: latest.version }
}

/**
 * `lastCheckedAt` ở TƯƠNG LAI cũng phải check lại: đồng hồ máy bị đổi (hoặc
 * storage mang giá trị rác) mà chỉ so `now - last < interval` sẽ khoá việc
 * check vĩnh viễn.
 */
export function shouldCheck(
  lastCheckedAt: number,
  now: number,
  interval: number = UPDATE_CHECK_INTERVAL_MS,
): boolean {
  if (!Number.isFinite(lastCheckedAt) || lastCheckedAt <= 0) return true
  if (lastCheckedAt > now) return true
  return now - lastCheckedAt >= interval
}
