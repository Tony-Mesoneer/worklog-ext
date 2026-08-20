import { describe, it, expect } from 'vitest'
import { migrateConfig, defaultConfig, CONFIG_VERSION } from '@/core/config-schema'

describe('migrateConfig', () => {
  it('undefined → default', () => {
    expect(migrateConfig(undefined)).toEqual(defaultConfig)
  })

  it('object rỗng → default', () => {
    expect(migrateConfig({})).toEqual(defaultConfig)
  })

  it('giữ giá trị người dùng đã set', () => {
    const c = migrateConfig({
      version: CONFIG_VERSION,
      jiraBaseUrl: 'https://mesoneerag.atlassian.net',
      projects: ['CAG'],
      workdayStart: '07:45',
    })
    expect(c.jiraBaseUrl).toBe('https://mesoneerag.atlassian.net')
    expect(c.projects).toEqual(['CAG'])
    // Không dùng '08:30' ở đây nữa: nó đã là default, nên test sẽ pass kể cả
    // khi migrate bỏ mất field.
    expect(c.workdayStart).toBe('07:45')
  })

  it('default giờ làm việc: 08:30–18:00, nghỉ 12:00–13:00', () => {
    const c = migrateConfig({})
    expect(c.workdayStart).toBe('08:30')
    expect(c.workdayEnd).toBe('18:00')
    expect(c.breaks).toEqual([{ start: '12:00', end: '13:00' }])
  })

  it('giữ giờ nghỉ người dùng đã set, kể cả nhiều khoảng', () => {
    const c = migrateConfig({
      breaks: [{ start: '12:00', end: '13:00' }, { start: '15:00', end: '15:15' }],
    })
    expect(c.breaks).toEqual([
      { start: '12:00', end: '13:00' }, { start: '15:00', end: '15:15' },
    ])
  })

  it('breaks = [] là lựa chọn hợp lệ (ngày không có giờ nghỉ), không bị thay bằng default', () => {
    expect(migrateConfig({ breaks: [] }).breaks).toEqual([])
  })

  it('breaks sai kiểu → default; phần tử rác bị bỏ, phần tử tốt được giữ', () => {
    expect(migrateConfig({ breaks: 'trưa' }).breaks).toEqual(defaultConfig.breaks)
    expect(migrateConfig({ breaks: {} }).breaks).toEqual(defaultConfig.breaks)
    const c = migrateConfig({
      breaks: [
        { start: '12:00', end: '13:00' },
        { start: 'trưa', end: '13:00' },   // không phải HH:MM
        { start: '25:00', end: '26:00' },  // giờ không tồn tại
        { start: '13:00', end: '12:00' },  // end trước start
        { start: '9:00', end: '12:00' },   // so sánh phải theo PHÚT, không theo chuỗi
      ],
    })
    expect(c.breaks).toEqual([{ start: '12:00', end: '13:00' }, { start: '9:00', end: '12:00' }])
  })

  it('giờ làm việc sai định dạng → default, không để NaN lan xuống', () => {
    expect(migrateConfig({ workdayStart: 'sáng' }).workdayStart).toBe('08:30')
    expect(migrateConfig({ workdayStart: '8h30' }).workdayStart).toBe('08:30')
    expect(migrateConfig({ workdayEnd: '99:99' }).workdayEnd).toBe('18:00')
  })

  it('giờ tan làm không sau giờ bắt đầu → về default', () => {
    expect(migrateConfig({ workdayStart: '09:00', workdayEnd: '08:00' }).workdayEnd).toBe('18:00')
  })

  it('điền field thiếu bằng default, không xoá field đã có', () => {
    const c = migrateConfig({ version: CONFIG_VERSION, projects: ['CAG'] })
    expect(c.projects).toEqual(['CAG'])
    expect(c.slotMinutes).toBe(defaultConfig.slotMinutes)
    expect(c.durationPresets).toEqual(defaultConfig.durationPresets)
  })

  it('bỏ giá trị sai kiểu thay vì để nó lan xuống runtime', () => {
    const c = migrateConfig({ version: CONFIG_VERSION, projects: 'CAG', slotMinutes: 'nhiều' })
    expect(c.projects).toEqual(defaultConfig.projects)
    expect(c.slotMinutes).toBe(defaultConfig.slotMinutes)
  })

  it('luôn trả về version hiện tại', () => {
    expect(migrateConfig({ version: 0 }).version).toBe(CONFIG_VERSION)
  })

  it('không bao giờ trả authMode lạ', () => {
    expect(migrateConfig({ authMode: 'magic' }).authMode).toBe('cookie')
  })

  it('lọc member sai cấu trúc, giữ member hợp lệ', () => {
    const c = migrateConfig({
      members: [
        { accountId: 'u1', displayName: 'A', hoursPerDay: 8, active: true },
        { displayName: 'thiếu accountId' },
      ],
    })
    expect(c.members).toHaveLength(1)
    expect(c.members[0]!.accountId).toBe('u1')
  })

  it('điền active và hoursPerDay cho member thiếu field', () => {
    const c = migrateConfig({ members: [{ accountId: 'u1', displayName: 'A' }] })
    expect(c.members[0]).toEqual({ accountId: 'u1', displayName: 'A', hoursPerDay: 8, active: true })
  })

  it('lọc sprint event thiếu issueKey', () => {
    const c = migrateConfig({
      sprintEvents: [
        { name: 'Daily', issueKey: 'CAG-1', defaultMinutes: 15, comment: '' },
        { name: 'Retro' },
      ],
    })
    expect(c.sprintEvents).toHaveLength(1)
  })

  it('default không chứa token', () => {
    expect(defaultConfig.token).toBeUndefined()
  })

  it('dedupe member trùng accountId, giữ bản đầu tiên', () => {
    const c = migrateConfig({
      members: [
        { accountId: 'u1', displayName: 'A', hoursPerDay: 8, active: true },
        { accountId: 'u1', displayName: 'A trùng', hoursPerDay: 4, active: false },
      ],
    })
    expect(c.members).toHaveLength(1)
    expect(c.members[0]!.displayName).toBe('A')
  })
})
