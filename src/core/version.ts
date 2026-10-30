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

/**
 * Hệ điều hành, chỉ ở độ mịn mà việc chọn asset cần. Linux/ChromeOS/BSD đều là
 * `other`: chúng nhận zip store như trước giờ.
 */
export type ReleaseOs = 'mac' | 'win' | 'other'

/**
 * Loại file `downloadUrl` trỏ tới — quyết định câu hướng dẫn trên banner.
 * `dmg`: macOS, kéo thư mục vào Documents. `windows-zip`: zip có MỘT thư mục gốc
 * `Worklog Extension`. `zip`: zip dạng store (manifest ở gốc) — Chrome trên
 * Linux, Firefox, hoặc release cũ chưa có hai loại trên.
 */
export type DownloadKind = 'dmg' | 'windows-zip' | 'zip'

export type ReleaseInfo = {
  version: string
  tag: string
  url: string
  downloadUrl: string | null
  downloadKind: DownloadKind | null
  publishedAt: string
  notes: string
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// Tên asset trong một release (xem .github/workflows/release.yml):
//
//   worklog-ext-<v>.zip           zip store, manifest ở gốc     — Chrome
//   worklog-ext-<v>-firefox.zip   zip store                     — Firefox
//   worklog-ext-<v>-windows.zip   MỘT thư mục `Worklog Extension` — Chrome/Windows
//   worklog-ext-<v>.dmg           thư mục `Worklog Extension`   — Chrome/macOS
//
// Vì thế không thể lấy "cái .zip đầu tiên": làm vậy là mời người dùng Firefox
// tải bản Chrome, hoặc đưa zip Windows (có thư mục bọc) cho người đang dùng zip
// store. Chọn theo HẬU TỐ tên, không theo thứ tự asset.
//
// Chỉ nhận asset CÓ url: asset đang upload dở vẫn xuất hiện trong payload nhưng
// chưa có browser_download_url, và một link chết còn tệ hơn không có link.
//
// Firefox không khớp được thì trả null CHỦ Ý, không rơi về zip của nền tảng
// khác: đưa file Chrome cho người dùng Firefox tệ hơn là không đưa gì — banner
// sẽ rơi về link trang release. Còn Chrome thì có đường lùi: dmg/zip Windows
// chỉ có từ khi các asset đó được thêm, release cũ hơn chỉ có zip store, và zip
// store cài được trên mọi hệ điều hành.
type Asset = { name: string; url: string }

const readAssets = (raw: unknown): Asset[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isRecord)
    .map((a) => ({ name: str(a['name']).toLowerCase(), url: str(a['browser_download_url']) }))
    .filter((a) => a.url !== '')
}

const isFirefoxZip = (n: string) => n.endsWith('.zip') && n.includes('firefox')
const isWindowsZip = (n: string) => n.endsWith('-windows.zip')
const isStoreZip = (n: string) => n.endsWith('.zip') && !isFirefoxZip(n) && !isWindowsZip(n)
const isDmg = (n: string) => n.endsWith('.dmg')

const find = (assets: Asset[], match: (name: string) => boolean): string | null =>
  assets.find((a) => match(a.name))?.url ?? null

function pickDownload(
  assets: Asset[],
  firefox: boolean,
  os: ReleaseOs,
): { downloadUrl: string | null; downloadKind: DownloadKind | null } {
  if (firefox) {
    const url = find(assets, isFirefoxZip)
    return { downloadUrl: url, downloadKind: url ? 'zip' : null }
  }
  const preferred = os === 'mac'
    ? { url: find(assets, isDmg), kind: 'dmg' as const }
    : os === 'win'
      ? { url: find(assets, isWindowsZip), kind: 'windows-zip' as const }
      : { url: null, kind: 'zip' as const }
  if (preferred.url) return { downloadUrl: preferred.url, downloadKind: preferred.kind }
  const store = find(assets, isStoreZip)
  return { downloadUrl: store, downloadKind: store ? 'zip' : null }
}

/**
 * Đọc payload /releases/latest của GitHub. Khoan dung như migrateConfig: chỉ
 * `tag_name` phải đọc được thành version, còn lại thiếu thì rỗng — không throw,
 * vì đây là dữ liệu ngoài tầm kiểm soát và một update check fail không được làm
 * vỡ service worker.
 */
export function parseRelease(
  raw: unknown,
  // Mặc định Chrome trên `other` (zip store): nó cài được ở mọi nơi, và giữ mặc
  // định này nghĩa là mọi chỗ gọi cũ không đổi hành vi. Chỗ duy nhất truyền giá
  // trị thật là service worker, sau khi tự phát hiện nền tảng — xem platform/ext.
  opts: { firefox?: boolean; os?: ReleaseOs } = {},
): ReleaseInfo | null {
  if (!isRecord(raw)) return null
  const tag = str(raw['tag_name']).trim()
  const version = stripTagPrefix(tag)
  if (parseVersion(version) === null) return null
  return {
    version,
    tag,
    url: str(raw['html_url']),
    ...pickDownload(readAssets(raw['assets']), opts.firefox === true, opts.os ?? 'other'),
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
