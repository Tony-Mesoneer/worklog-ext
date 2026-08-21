// src/sw/update.ts
//
// Đi hỏi GitHub Releases xem có bản mới hơn không.
//
// Không có auth: repo là public, và /releases/latest cho phép gọi vô danh
// (60 request/giờ/IP). `shouldCheck` + cache trong storage là thứ giữ ta ở rất
// xa hạn mức đó — mỗi 6 giờ một request, kể cả khi người dùng mở panel liên tục.
import {
  decideUpdate, isRepoSlug, parseRelease, releaseApiUrl, shouldCheck,
  type ReleaseInfo, type UpdateState,
} from '@/core/version'
import { loadConfig } from '@/store/config'
import { readUpdateStore, writeUpdateStore } from '@/store/update'
import { MessageError } from './messages'
import { ext } from '@/platform/ext'

export type UpdateStatusResult = {
  state: UpdateState
  currentVersion: string
  latest: ReleaseInfo | null
  lastCheckedAt: number
  lastError: string | null
  repo: string
}

/** Version đang chạy, đọc từ manifest — không hardcode ở đâu khác. */
export const currentVersion = (): string => ext.runtime.getManifest().version

const REQUEST_TIMEOUT_MS = 10_000

// Badge trên icon là tín hiệu duy nhất thấy được khi không mở panel. Chỉ một
// dấu ↑, không phải số: "có bản mới" là boolean, không phải đếm.
async function paintBadge(state: UpdateState): Promise<void> {
  const available = state === 'available'
  await ext.action.setBadgeText({ text: available ? '↑' : '' })
  if (available) {
    await ext.action.setBadgeBackgroundColor({ color: '#0B7285' })
  }
}

function describe(store: { lastCheckedAt: number; lastError: string | null; latest: ReleaseInfo | null; dismissedVersion: string | null }, repo: string): UpdateStatusResult {
  const current = currentVersion()
  const { state } = decideUpdate(current, store.latest, store.dismissedVersion)
  return {
    state,
    currentVersion: current,
    latest: store.latest,
    lastCheckedAt: store.lastCheckedAt,
    lastError: store.lastError,
    repo,
  }
}

/** Trạng thái đã biết, không gọi mạng. Đây là thứ UI đọc lúc mở lên. */
export async function updateStatus(): Promise<UpdateStatusResult> {
  const [config, store] = await Promise.all([loadConfig(), readUpdateStore()])
  const result = describe(store, config.updateRepo)
  await paintBadge(result.state)
  return result
}

// Lỗi HTTP của GitHub được dịch thành câu người dùng làm được gì với nó. 404
// gần như luôn là repo sai hoặc chưa có release nào, chứ không phải sự cố.
const httpMessage = (status: number, repo: string): string => {
  if (status === 404) return `Không thấy release nào ở ${repo} (repo sai hoặc chưa release)`
  if (status === 403 || status === 429) return 'GitHub đang giới hạn số lần gọi — thử lại sau'
  return `GitHub trả về HTTP ${status}`
}

/**
 * `force = false`: chỉ gọi mạng khi đã quá UPDATE_CHECK_INTERVAL_MS, còn lại
 * trả về cache. `force = true`: người dùng bấm "Kiểm tra ngay", luôn gọi.
 *
 * Lỗi mạng được LƯU vào store rồi trả về, không throw — trừ khi force. Khi
 * check tự động (alarm) thì không có ai đọc exception, và một GitHub tạm sập
 * không được để lại unhandled rejection trong service worker.
 */
export async function checkForUpdate(force: boolean): Promise<UpdateStatusResult> {
  const config = await loadConfig()
  const repo = config.updateRepo
  const store = await readUpdateStore()

  if (!isRepoSlug(repo)) {
    const message = 'Chưa cấu hình repo cập nhật (dạng owner/tên) — mở Options'
    if (force) throw new MessageError(message)
    return { ...describe(store, repo), lastError: message }
  }

  const now = Date.now()
  if (!force && !shouldCheck(store.lastCheckedAt, now)) return describe(store, repo)

  try {
    const res = await fetch(releaseApiUrl(repo), {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) throw new MessageError(httpMessage(res.status, repo), res.status)

    const latest = parseRelease(await res.json())
    if (!latest) throw new MessageError('Release mới nhất không có tag dạng version')

    // lastCheckedAt chỉ nhích khi ĐỌC ĐƯỢC release: fail thì lần mở panel sau
    // vẫn được thử lại thay vì im lặng 6 tiếng.
    const next = await writeUpdateStore({ latest, lastCheckedAt: now, lastError: null })
    const result = describe(next, repo)
    await paintBadge(result.state)
    return result
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.name === 'TimeoutError'
          ? 'Hết thời gian chờ GitHub'
          : e.message
        : String(e)
    const next = await writeUpdateStore({ lastError: message })
    if (force) throw e instanceof MessageError ? e : new MessageError(message)
    return describe(next, repo)
  }
}

/** Tắt banner cho đúng version này. Bản mới hơn sẽ hiện lại. */
export async function dismissUpdate(version: string): Promise<UpdateStatusResult> {
  const config = await loadConfig()
  const next = await writeUpdateStore({ dismissedVersion: version })
  const result = describe(next, config.updateRepo)
  await paintBadge(result.state)
  return result
}
