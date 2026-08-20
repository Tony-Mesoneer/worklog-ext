// src/jira/client.ts
import type { Auth } from './auth'

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message)
    this.name = 'JiraError'
  }
}

// Jira trả {"errorMessages":[...]} hoặc {"errors":{field:msg}} cho phần lớn lỗi
// 400 — và những message đó là thứ người dùng cần để sửa input ("issue does not
// exist", "worklog time must be greater than zero"). Body HTML (proxy, trang
// login) không mang thông tin gì nên bỏ. Cắt độ dài để banner không thành blob.
const MAX_DETAIL = 300

export function jiraErrorDetail(body: string): string {
  const text = body.trim()
  if (text === '' || text.startsWith('<')) return ''
  const cap = (s: string) => (s.length > MAX_DETAIL ? `${s.slice(0, MAX_DETAIL)}…` : s)

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return cap(text)
  }
  if (typeof parsed !== 'object' || parsed === null) return cap(text)

  const r = parsed as Record<string, unknown>
  const parts: string[] = []
  if (Array.isArray(r['errorMessages'])) {
    for (const m of r['errorMessages']) if (typeof m === 'string' && m !== '') parts.push(m)
  }
  const errors = r['errors']
  if (typeof errors === 'object' && errors !== null && !Array.isArray(errors)) {
    for (const [field, msg] of Object.entries(errors as Record<string, unknown>)) {
      if (typeof msg === 'string' && msg !== '') parts.push(`${field}: ${msg}`)
    }
  }
  if (parts.length === 0 && typeof r['message'] === 'string' && r['message'] !== '') {
    parts.push(r['message'])
  }
  return parts.length === 0 ? cap(text) : cap(parts.join('; '))
}

// Message phải tự đủ nghĩa: sw chỉ serialize `e.message` qua sendMessage, `body`
// không bao giờ ra khỏi service worker.
export function jiraErrorMessage(status: number, body: string): string {
  const detail = jiraErrorDetail(body)
  return detail === '' ? `Jira ${status}` : `Jira ${status} — ${detail}`
}

export type ClientDeps = {
  baseUrl: string
  auth: Auth
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  maxConcurrent?: number
  maxRetries?: number
  timeoutMs?: number
  onUnauthorized?: () => void
}

export type JiraClient = {
  call<T>(req: { method: string; path: string; body?: unknown }): Promise<T>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Semaphore đơn giản: đủ cho nhu cầu ở đây, không đáng thêm dependency.
function createSemaphore(limit: number) {
  let active = 0
  const queue: (() => void)[] = []
  const release = () => {
    active -= 1
    queue.shift()?.()
  }
  return async function acquire(): Promise<() => void> {
    if (active >= limit) await new Promise<void>((r) => queue.push(r))
    active += 1
    return release
  }
}

export function createClient(deps: ClientDeps): JiraClient {
  const {
    baseUrl, auth,
    fetchImpl = fetch,
    sleep = defaultSleep,
    maxConcurrent = 5,
    maxRetries = 3,
    timeoutMs = 15_000,
    onUnauthorized,
  } = deps

  const acquire = createSemaphore(maxConcurrent)
  const root = baseUrl.replace(/\/+$/, '')

  async function once(method: string, path: string, body?: unknown): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetchImpl(root + path, {
        method,
        credentials: auth.credentials,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...auth.headers() },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } finally {
      clearTimeout(timer)
    }
  }

  async function call<T>(req: { method: string; path: string; body?: unknown }): Promise<T> {
    const release = await acquire()
    try {
      for (let attempt = 0; ; attempt += 1) {
        const res = await once(req.method, req.path, req.body)

        if (res.status === 401 || res.status === 403) {
          onUnauthorized?.()
          const body = await res.text()
          throw new JiraError(jiraErrorMessage(res.status, body), res.status, body)
        }

        if (res.status === 429 && attempt < maxRetries) {
          const retryAfter = Number(res.headers.get('Retry-After'))
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 500 * 2 ** attempt
          await sleep(waitMs)
          continue
        }

        if (!res.ok) {
          const body = await res.text()
          throw new JiraError(jiraErrorMessage(res.status, body), res.status, body)
        }

        if (res.status === 204) return null as T
        const text = await res.text()
        return (text === '' ? null : JSON.parse(text)) as T
      }
    } finally {
      // Phải nằm trong finally: nếu không, một request lỗi sẽ giữ slot vĩnh viễn
      // và mọi request sau treo im lặng.
      release()
    }
  }

  return { call }
}
