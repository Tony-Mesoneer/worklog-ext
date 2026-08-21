import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defaultConfig, type Config } from '@/core/config-schema'

// Chỉ mock đúng biên Jira. Việc cắt đoạn, chia giây và rollback là logic của
// handler nên nó phải chạy thật ở đây.
const addWorklog = vi.fn()
const deleteWorklog = vi.fn()

vi.mock('@/jira/client', () => ({ createClient: () => ({ call: vi.fn() }) }))
vi.mock('@/jira/auth', () => ({ cookieAuth: {}, tokenAuth: () => ({}) }))
vi.mock('@/jira/endpoints', () => ({
  addWorklog: (...a: unknown[]) => addWorklog(...a),
  deleteWorklog: (...a: unknown[]) => deleteWorklog(...a),
}))

const { handle } = await import('@/sw/handlers')

const setConfig = (patch: Partial<Config>) => {
  const stored = { ...defaultConfig, jiraBaseUrl: 'https://x.atlassian.net', ...patch }
  const data: Record<string, unknown> = { config: stored }
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (k: string | string[]) => {
          const list = Array.isArray(k) ? k : [k]
          return Object.fromEntries(list.filter((x) => x in data).map((x) => [x, data[x]]))
        },
        set: async (items: Record<string, unknown>) => Object.assign(data, items),
      },
    },
  }
}

const add = (startMinutes: number, timeSpentSeconds: number) =>
  handle({
    type: 'worklog/add', issueKey: 'CAG-1', date: '2026-08-19',
    startMinutes, timeSpentSeconds, comment: '',
  })

// Đối số POST đọc ra dạng "started|seconds" cho dễ soi.
const posted = () =>
  addWorklog.mock.calls.map((c) => `${c[1].startedIso}|${c[1].timeSpentSeconds}`)

describe('worklog/add cắt quanh giờ nghỉ', () => {
  beforeEach(() => {
    addWorklog.mockReset()
    deleteWorklog.mockReset()
    let n = 0
    addWorklog.mockImplementation(async () => ({ id: `w${++n}` }))
    deleteWorklog.mockResolvedValue(undefined)
    setConfig({}) // default: 08:30–18:00, nghỉ 12:00–13:30
  })

  it('không đi qua giờ nghỉ → đúng MỘT POST, như trước', async () => {
    const res = await add(9 * 60, 5400)
    expect(posted()).toEqual(['2026-08-19T09:00:00.000+0000|5400'])
    expect(res).toEqual({ ids: ['w1'] })
  })

  it('đi qua giờ nghỉ → hai POST, tổng giây giữ nguyên', async () => {
    const res = await add(11 * 60, 3 * 3600)
    expect(posted()).toEqual([
      '2026-08-19T11:00:00.000+0000|3600',
      '2026-08-19T13:30:00.000+0000|7200',
    ])
    expect(res).toEqual({ ids: ['w1', 'w2'] })
  })

  it('tổng giây luôn khớp tuyệt đối, kể cả thời lượng lẻ giây', async () => {
    await add(11 * 60, 3 * 3600 + 37)
    const total = addWorklog.mock.calls.reduce((t, c) => t + c[1].timeSpentSeconds, 0)
    expect(total).toBe(3 * 3600 + 37)
  })

  it('kết thúc đúng 12:00 → không cắt', async () => {
    await add(11 * 60, 3600)
    expect(addWorklog).toHaveBeenCalledTimes(1)
  })

  it('config không có giờ nghỉ → hành vi y như trước', async () => {
    setConfig({ breaks: [] })
    await add(11 * 60, 3 * 3600)
    expect(posted()).toEqual(['2026-08-19T11:00:00.000+0000|10800'])
  })

  it('thời lượng 0 → không POST gì', async () => {
    await expect(add(11 * 60, 0)).rejects.toThrow('Thời lượng phải lớn hơn 0')
    expect(addWorklog).not.toHaveBeenCalled()
  })

  it('POST thứ hai lỗi → xoá POST thứ nhất, báo lỗi gốc, không để lại một nửa', async () => {
    addWorklog.mockReset()
    addWorklog.mockResolvedValueOnce({ id: 'w1' })
    addWorklog.mockRejectedValueOnce(new Error('Jira: worklog nằm ngoài sprint'))

    await expect(add(11 * 60, 3 * 3600)).rejects.toThrow(
      /Jira: worklog nằm ngoài sprint.*Đã hoàn tác/s,
    )
    expect(deleteWorklog).toHaveBeenCalledWith(expect.anything(), 'CAG-1', 'w1')
  })

  it('rollback cũng lỗi → lỗi PHẢI nêu id worklog mồ côi và issue key', async () => {
    addWorklog.mockReset()
    addWorklog.mockResolvedValueOnce({ id: 'w1' })
    addWorklog.mockRejectedValueOnce(new Error('Jira 400'))
    deleteWorklog.mockRejectedValue(new Error('Jira 403'))

    const err = await add(11 * 60, 3 * 3600).catch((e: Error) => e)
    expect(String(err)).toContain('w1')
    expect(String(err)).toContain('CAG-1')
    expect(String(err)).toContain('xoá tay trong Jira')
  })

  it('POST ĐẦU TIÊN lỗi → không xoá gì cả', async () => {
    addWorklog.mockReset()
    addWorklog.mockRejectedValueOnce(new Error('Jira 400'))
    await expect(add(11 * 60, 3 * 3600)).rejects.toThrow('Jira 400')
    expect(deleteWorklog).not.toHaveBeenCalled()
  })
})
