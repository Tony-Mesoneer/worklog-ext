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

  // Các test breaks bên dưới cố tình gắn version: CONFIG_VERSION — chúng kiểm
  // tra logic PARSE breaks trên một config đã ở v2, tách biệt với việc
  // ghi đè khi nâng version từ v1 (xem nhóm test "migration v1 → v2" bên dưới).
  it('giữ giờ nghỉ người dùng đã set, kể cả nhiều khoảng', () => {
    const c = migrateConfig({
      version: CONFIG_VERSION,
      breaks: [{ start: '12:00', end: '13:00' }, { start: '15:00', end: '15:15' }],
    })
    expect(c.breaks).toEqual([
      { start: '12:00', end: '13:00' }, { start: '15:00', end: '15:15' },
    ])
  })

  it('breaks = [] là lựa chọn hợp lệ (ngày không có giờ nghỉ), không bị thay bằng default', () => {
    expect(migrateConfig({ version: CONFIG_VERSION, breaks: [] }).breaks).toEqual([])
  })

  it('breaks sai kiểu → default; phần tử rác bị bỏ, phần tử tốt được giữ', () => {
    expect(migrateConfig({ version: CONFIG_VERSION, breaks: 'trưa' }).breaks).toEqual(defaultConfig.breaks)
    expect(migrateConfig({ version: CONFIG_VERSION, breaks: {} }).breaks).toEqual(defaultConfig.breaks)
    const c = migrateConfig({
      version: CONFIG_VERSION,
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
    expect(migrateConfig({ version: CONFIG_VERSION, workdayStart: 'sáng' }).workdayStart).toBe('08:30')
    expect(migrateConfig({ version: CONFIG_VERSION, workdayStart: '8h30' }).workdayStart).toBe('08:30')
    expect(migrateConfig({ version: CONFIG_VERSION, workdayEnd: '99:99' }).workdayEnd).toBe('18:00')
  })

  it('giờ tan làm không sau giờ bắt đầu → về default', () => {
    const c = migrateConfig({ version: CONFIG_VERSION, workdayStart: '09:00', workdayEnd: '08:00' })
    expect(c.workdayStart).toBe('09:00')
    expect(c.workdayEnd).toBe('18:00')
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

  it('lọc sprint event không có cả issueKey lẫn matchSummary', () => {
    const c = migrateConfig({
      sprintEvents: [
        { name: 'Daily', issueKey: 'CAG-1', defaultMinutes: 15, comment: '' },
        { name: 'Retro' },
      ],
    })
    expect(c.sprintEvents).toHaveLength(1)
  })

  describe('sprintEvents.matchSummary', () => {
    it('config cũ chỉ có issueKey vẫn chạy nguyên vẹn, matchSummary thành \'\'', () => {
      const c = migrateConfig({
        sprintEvents: [{ name: 'Daily', issueKey: 'CAG-3065', defaultMinutes: 15, comment: 'x' }],
      })
      expect(c.sprintEvents).toEqual([
        { name: 'Daily', issueKey: 'CAG-3065', matchSummary: '', defaultMinutes: 15, comment: 'x' },
      ])
    })

    it('event chỉ có matchSummary (không issueKey) được GIỮ — đây là hình dạng mới', () => {
      const c = migrateConfig({
        sprintEvents: [{ name: 'Daily', matchSummary: 'Daily Scrum', defaultMinutes: 15, comment: '' }],
      })
      expect(c.sprintEvents).toEqual([
        { name: 'Daily', issueKey: '', matchSummary: 'Daily Scrum', defaultMinutes: 15, comment: '' },
      ])
    })

    it('matchSummary sai kiểu → \'\' chứ không throw', () => {
      const c = migrateConfig({
        sprintEvents: [{ name: 'Daily', issueKey: 'CAG-1', matchSummary: 42 }],
      })
      expect(c.sprintEvents[0]!.matchSummary).toBe('')
    })

    it('trim khoảng trắng ở cả issueKey và matchSummary', () => {
      const c = migrateConfig({
        sprintEvents: [{ name: 'Daily', issueKey: ' CAG-1 ', matchSummary: ' Daily Scrum ' }],
      })
      expect(c.sprintEvents[0]!.issueKey).toBe('CAG-1')
      expect(c.sprintEvents[0]!.matchSummary).toBe('Daily Scrum')
    })

    it('entry chỉ có khoảng trắng ở cả hai field bị loại — không để lại dòng rỗng', () => {
      const c = migrateConfig({
        sprintEvents: [{ name: 'Daily', issueKey: '   ', matchSummary: ' ' }],
      })
      expect(c.sprintEvents).toEqual([])
    })

    it('thiếu name thì lấy matchSummary làm tên, không phải chuỗi rỗng', () => {
      const c = migrateConfig({ sprintEvents: [{ matchSummary: 'Daily Scrum' }] })
      expect(c.sprintEvents[0]!.name).toBe('Daily Scrum')
    })
  })

  it('default không chứa token', () => {
    expect(defaultConfig.token).toBeUndefined()
  })

  describe('migration v1 → v2 (giờ làm việc/giờ nghỉ)', () => {
    it('config v1 (không có version, hoặc version < 2) được nâng lên giờ làm việc mặc định mới', () => {
      // Mô phỏng config v1 thật: workdayStart cũ '09:00', chưa từng có
      // workdayEnd/breaks vì hai field này chỉ xuất hiện từ v1 nhưng không có
      // UI để set — nghĩa là bất kỳ giá trị nào ở đây cũng chỉ có thể là cũ.
      const c = migrateConfig({ version: 1, workdayStart: '09:00' })
      expect(c.version).toBe(CONFIG_VERSION)
      expect(c.workdayStart).toBe('08:30')
      expect(c.workdayEnd).toBe('18:00')
      expect(c.breaks).toEqual([{ start: '12:00', end: '13:00' }])
    })

    it('migration v1 → v2 không đụng vào field khác — projects/members/sprintEvents/daysOff/primaryBoardId nguyên vẹn', () => {
      const c = migrateConfig({
        version: 1,
        workdayStart: '09:00',
        projects: ['CAG'],
        primaryBoardId: 42,
        daysOff: { u1: ['2026-01-01'] },
        members: [{ accountId: 'u1', displayName: 'A', hoursPerDay: 8, active: true }],
        sprintEvents: [{ name: 'Daily', issueKey: 'CAG-1', defaultMinutes: 15, comment: '' }],
      })
      expect(c.projects).toEqual(['CAG'])
      expect(c.primaryBoardId).toBe(42)
      expect(c.daysOff).toEqual({ u1: ['2026-01-01'] })
      expect(c.members).toEqual([{ accountId: 'u1', displayName: 'A', hoursPerDay: 8, active: true }])
      expect(c.sprintEvents).toEqual([
        { name: 'Daily', issueKey: 'CAG-1', matchSummary: '', defaultMinutes: 15, comment: '' },
      ])
    })

    it('config đã ở v2 với giờ làm việc tuỳ chỉnh thì giữ nguyên, không bị ghi đè lại', () => {
      const c = migrateConfig({
        version: CONFIG_VERSION,
        workdayStart: '07:00',
        workdayEnd: '16:00',
        breaks: [{ start: '11:30', end: '12:30' }],
      })
      expect(c.workdayStart).toBe('07:00')
      expect(c.workdayEnd).toBe('16:00')
      expect(c.breaks).toEqual([{ start: '11:30', end: '12:30' }])
    })
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

describe('updateRepo', () => {
  it('thiếu → rỗng (tính năng check update tắt)', () => {
    expect(migrateConfig({}).updateRepo).toBe('')
  })

  it('được trim, vì dán từ URL rất dễ lẫn khoảng trắng', () => {
    expect(migrateConfig({ updateRepo: '  o/r  ' }).updateRepo).toBe('o/r')
  })

  it('sai kiểu → rỗng', () => {
    expect(migrateConfig({ updateRepo: 42 }).updateRepo).toBe('')
  })
})
