// tests/jira/client.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createClient, JiraError, jiraErrorMessage } from '@/jira/client'
import { cookieAuth } from '@/jira/auth'

const ok = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })

const base = { baseUrl: 'https://x.atlassian.net', auth: cookieAuth, sleep: async () => {} }

describe('createClient', () => {
  it('gọi đúng URL và trả data đã parse', async () => {
    const fetchImpl = vi.fn(async (..._args: unknown[]) => ok({ accountId: 'u1' }))
    const client = createClient({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })

    const data = await client.call<{ accountId: string }>({ method: 'GET', path: '/rest/api/3/myself' })

    expect(data.accountId).toBe('u1')
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://x.atlassian.net/rest/api/3/myself')
  })

  it('gửi header auth và credentials của Auth', async () => {
    const fetchImpl = vi.fn(async (..._args: unknown[]) => ok({}))
    const client = createClient({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })

    await client.call({ method: 'GET', path: '/x' })

    const init = fetchImpl.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>)['X-Atlassian-Token']).toBe('no-check')
    expect(init.credentials).toBe('include')
  })

  it('trả null cho 204 No Content', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const client = createClient({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.call({ method: 'DELETE', path: '/x' })).resolves.toBeNull()
  })

  it('retry 429 và tôn trọng Retry-After', async () => {
    const sleep = vi.fn(async () => {})
    let n = 0
    const fetchImpl = vi.fn(async () => {
      n += 1
      if (n === 1) return new Response('rate limited', { status: 429, headers: { 'Retry-After': '2' } })
      return ok({ done: true })
    })
    const client = createClient({ ...base, sleep, fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.call<{ done: boolean }>({ method: 'GET', path: '/x' })).resolves.toEqual({ done: true })
    expect(sleep).toHaveBeenCalledWith(2000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('bỏ cuộc sau maxRetries lần 429', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate limited', { status: 429 }))
    const client = createClient({
      ...base, maxRetries: 2, fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await expect(client.call({ method: 'GET', path: '/x' })).rejects.toBeInstanceOf(JiraError)
    // 1 lần đầu + 2 lần retry
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('KHÔNG retry 401, và gọi onUnauthorized', async () => {
    const onUnauthorized = vi.fn()
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 401 }))
    const client = createClient({
      ...base, onUnauthorized, fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await expect(client.call({ method: 'GET', path: '/x' })).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('403 cũng gọi onUnauthorized và không retry', async () => {
    const onUnauthorized = vi.fn()
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 403 }))
    const client = createClient({
      ...base, onUnauthorized, fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await expect(client.call({ method: 'GET', path: '/x' })).rejects.toMatchObject({ status: 403 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('KHÔNG retry 400 — lỗi payload thì retry vô nghĩa', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 400 }))
    const client = createClient({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.call({ method: 'POST', path: '/x', body: {} })).rejects.toMatchObject({ status: 400 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('giữ nguyên body lỗi của Jira trong JiraError', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('{"errorMessages":["Issue does not exist"]}', { status: 404 }))
    const client = createClient({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.call({ method: 'GET', path: '/x' }))
      .rejects.toMatchObject({ status: 404, body: '{"errorMessages":["Issue does not exist"]}' })
  })

  it('không bao giờ chạy quá maxConcurrent request cùng lúc', async () => {
    let inFlight = 0
    let peak = 0
    const fetchImpl = vi.fn(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return ok({})
    })
    const client = createClient({
      ...base, maxConcurrent: 2, fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await Promise.all(
      Array.from({ length: 10 }, (_, i) => client.call({ method: 'GET', path: `/x/${i}` })),
    )

    expect(peak).toBeLessThanOrEqual(2)
    expect(fetchImpl).toHaveBeenCalledTimes(10)
  })

  it('giải phóng slot semaphore cả khi request lỗi', async () => {
    // Nếu slot bị giữ khi throw, request thứ hai sẽ treo mãi.
    let n = 0
    const fetchImpl = vi.fn(async () => {
      n += 1
      if (n === 1) return new Response('bad', { status: 400 })
      return ok({ ok: true })
    })
    const client = createClient({
      ...base, maxConcurrent: 1, fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await expect(client.call({ method: 'GET', path: '/a' })).rejects.toBeInstanceOf(JiraError)
    await expect(client.call<{ ok: boolean }>({ method: 'GET', path: '/b' })).resolves.toEqual({ ok: true })
  })

  it('ghép baseUrl có dấu / ở cuối mà không sinh //', async () => {
    const fetchImpl = vi.fn(async (..._args: unknown[]) => ok({}))
    const client = createClient({
      ...base, baseUrl: 'https://x.atlassian.net/', fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await client.call({ method: 'GET', path: '/rest/api/3/myself' })

    expect(fetchImpl.mock.calls[0]![0]).toBe('https://x.atlassian.net/rest/api/3/myself')
  })
})

describe('jiraErrorMessage', () => {
  it('lấy errorMessages — đây là thứ người dùng cần để sửa input', () => {
    expect(jiraErrorMessage(400, JSON.stringify({
      errorMessages: ['Issue does not exist or you do not have permission to see it.'],
      errors: {},
    }))).toBe('Jira 400 — Issue does not exist or you do not have permission to see it.')
  })

  it('lấy cả errors theo field', () => {
    expect(jiraErrorMessage(400, JSON.stringify({
      errorMessages: [],
      errors: { timeSpentSeconds: 'Worklog time must be greater than zero.' },
    }))).toBe('Jira 400 — timeSpentSeconds: Worklog time must be greater than zero.')
  })

  it('body rỗng hoặc HTML thì chỉ còn status', () => {
    expect(jiraErrorMessage(500, '')).toBe('Jira 500')
    expect(jiraErrorMessage(502, '<!DOCTYPE html><html>gateway</html>')).toBe('Jira 502')
  })

  it('body không phải JSON thì dùng nguyên text', () => {
    expect(jiraErrorMessage(400, 'nope')).toBe('Jira 400 — nope')
  })

  it('cắt body dài, không đổ blob vào banner', () => {
    const msg = jiraErrorMessage(400, JSON.stringify({ errorMessages: ['x'.repeat(1000)] }))
    expect(msg.length).toBeLessThan(340)
    expect(msg.endsWith('…')).toBe(true)
  })

  it('JiraError của client mang message đã có text gốc', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ errorMessages: ['boom'] }), { status: 400 },
    ))
    const c = createClient({
      baseUrl: 'https://x.atlassian.net', auth: cookieAuth,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(c.call({ method: 'GET', path: '/x' })).rejects.toThrow('Jira 400 — boom')
  })
})
