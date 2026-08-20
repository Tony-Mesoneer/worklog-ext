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
      workdayStart: '08:30',
    })
    expect(c.jiraBaseUrl).toBe('https://mesoneerag.atlassian.net')
    expect(c.projects).toEqual(['CAG'])
    expect(c.workdayStart).toBe('08:30')
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
