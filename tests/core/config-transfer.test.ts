// tests/core/config-transfer.test.ts
//
// Export/Import config là đường DUY NHẤT mang config qua lần đổi extension ID
// (thêm `key` vào manifest, hoặc đổi thư mục Load unpacked). Một file xuất ra mà
// nhập lại không được y nguyên là người dùng mất cấu hình đúng lúc chuyển.
import { describe, it, expect } from 'vitest'
import { defaultConfig, migrateConfig, CONFIG_VERSION, type Config } from '@/core/config-schema'
import {
  CONFIG_EXPORT_KIND, configExportFileName, parseConfigImport, serializeConfigExport,
} from '@/core/config-transfer'

const now = new Date(2026, 9, 30, 14, 5)

const config: Config = migrateConfig({
  version: CONFIG_VERSION,
  jiraBaseUrl: 'https://your-site.atlassian.net',
  authMode: 'token',
  token: { email: 'me@example.com', apiToken: 'secret' },
  projects: ['CAG'],
  primaryBoardId: 42,
  members: [{ accountId: 'u1', displayName: 'An', hoursPerDay: 6, active: true }],
  sprintEvents: [{ name: 'Daily', issueKey: '', matchSummary: 'Daily Scrum', defaultMinutes: 15, comment: '' }],
  workdayStart: '07:45',
  locale: 'en',
})

describe('serializeConfigExport → parseConfigImport', () => {
  it('nhập lại được ĐÚNG config đã xuất, kể cả token', () => {
    const text = serializeConfigExport(config, { now, extensionVersion: '0.12.0' })
    const result = parseConfigImport(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config).toEqual(config)
    // Token Atlassian không xem lại được — mất nó là phải đi tạo token mới.
    expect(result.config.token).toEqual({ email: 'me@example.com', apiToken: 'secret' })
    expect(result.extensionVersion).toBe('0.12.0')
    expect(result.exportedAt).toBe(now.toISOString())
  })

  it('file mang dấu nhận dạng và đọc được bằng mắt', () => {
    const text = serializeConfigExport(config, { now, extensionVersion: '0.12.0' })
    expect(JSON.parse(text).kind).toBe(CONFIG_EXPORT_KIND)
    expect(text).toContain('\n  "config": {')
  })
})

describe('parseConfigImport', () => {
  it('không phải JSON → reason json', () => {
    expect(parseConfigImport('không phải json')).toEqual({ ok: false, reason: 'json' })
    expect(parseConfigImport('')).toEqual({ ok: false, reason: 'json' })
  })

  it('JSON nhưng không phải file xuất từ extension → reason format', () => {
    // Nhập nhầm một JSON bất kỳ mà vẫn "thành công" là thay config bằng default
    // — xoá sạch cấu hình mà không báo gì.
    for (const bad of ['null', '[]', '{}', '{"jiraBaseUrl":"https://x"}',
      `{"kind":"${CONFIG_EXPORT_KIND}"}`, `{"kind":"${CONFIG_EXPORT_KIND}","config":[]}`,
      '{"kind":"khác","config":{}}']) {
      expect(parseConfigImport(bad), bad).toEqual({ ok: false, reason: 'format' })
    }
  })

  it('config trong file đi qua migrateConfig: field sai kiểu rơi về default', () => {
    const text = JSON.stringify({
      kind: CONFIG_EXPORT_KIND,
      config: { jiraBaseUrl: 'https://x.atlassian.net', projects: 'sai kiểu', workdayStart: '25:00' },
    })
    const result = parseConfigImport(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.jiraBaseUrl).toBe('https://x.atlassian.net')
    expect(result.config.projects).toEqual([])
    expect(result.config.workdayStart).toBe(defaultConfig.workdayStart)
    // Thiếu metadata thì rỗng, không làm hỏng lần nhập.
    expect(result.exportedAt).toBe('')
    expect(result.extensionVersion).toBe('')
  })

  it('file không có token: kết quả không có token', () => {
    const { token: _, ...noToken } = config
    const text = serializeConfigExport({ ...noToken, authMode: 'cookie' }, { now, extensionVersion: '0.12.0' })
    const result = parseConfigImport(text)
    expect(result.ok && result.config.token).toBeUndefined()
  })
})

describe('configExportFileName', () => {
  it('theo ngày của giờ máy, có số 0 đệm', () => {
    expect(configExportFileName(new Date(2026, 0, 5, 23, 59))).toBe('worklog-config-2026-01-05.json')
    expect(configExportFileName(now)).toBe('worklog-config-2026-10-30.json')
  })
})
