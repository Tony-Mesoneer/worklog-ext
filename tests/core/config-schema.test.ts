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
      jiraBaseUrl: 'https://your-site.atlassian.net',
      projects: ['CAG'],
      workdayStart: '07:45',
    })
    expect(c.jiraBaseUrl).toBe('https://your-site.atlassian.net')
    expect(c.projects).toEqual(['CAG'])
    // Không dùng '08:30' ở đây nữa: nó đã là default, nên test sẽ pass kể cả
    // khi migrate bỏ mất field.
    expect(c.workdayStart).toBe('07:45')
  })

  it('default giờ làm việc: 08:30–18:00, nghỉ 12:00–13:30', () => {
    const c = migrateConfig({})
    expect(c.workdayStart).toBe('08:30')
    expect(c.workdayEnd).toBe('18:00')
    expect(c.breaks).toEqual([{ start: '12:00', end: '13:30' }])
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
    it('config cũ hơn CONFIG_VERSION được nâng lên giờ làm việc mặc định mới', () => {
      // Mô phỏng config v1 thật: workdayStart cũ '09:00', chưa từng có
      // workdayEnd/breaks vì hai field này chỉ xuất hiện từ v1 nhưng không có
      // UI để set — nghĩa là bất kỳ giá trị nào ở đây cũng chỉ có thể là cũ.
      const c = migrateConfig({ version: 1, workdayStart: '09:00' })
      expect(c.version).toBe(CONFIG_VERSION)
      expect(c.workdayStart).toBe('08:30')
      expect(c.workdayEnd).toBe('18:00')
      expect(c.breaks).toEqual([{ start: '12:00', end: '13:30' }])
    })

    it('v2 → v3: giờ nghỉ 12:00–13:00 đã lưu được ghi đè thành 12:00–13:30', () => {
      // Đây là chỗ ĐÚNG của bug đã báo: đổi default một mình không sửa gì cho
      // người đang dùng, vì config của họ đã ở v2 và migration cũ chỉ chạy khi
      // version < 2 — họ vẫn bị đề xuất log vào 13:00.
      const c = migrateConfig({ version: 2, breaks: [{ start: '12:00', end: '13:00' }] })
      expect(c.breaks).toEqual([{ start: '12:00', end: '13:30' }])
      expect(c.version).toBe(CONFIG_VERSION)
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
  it('thiếu → default trỏ về repo gốc', () => {
    expect(migrateConfig({}).updateRepo).toBe('Tony-Mesoneer/worklog-ext')
  })

  it('rỗng được GIỮ rỗng — đó là cách người dùng tắt việc check update', () => {
    expect(migrateConfig({ updateRepo: '' }).updateRepo).toBe('')
  })

  it('được trim, vì dán từ URL rất dễ lẫn khoảng trắng', () => {
    expect(migrateConfig({ updateRepo: '  o/r  ' }).updateRepo).toBe('o/r')
  })

  it('sai kiểu → default', () => {
    expect(migrateConfig({ updateRepo: 42 }).updateRepo).toBe('Tony-Mesoneer/worklog-ext')
  })
})

describe('locale', () => {
  it('thiếu → en', () => {
    expect(migrateConfig({}).locale).toBe('en')
  })

  it('giữ locale hợp lệ', () => {
    expect(migrateConfig({ locale: 'vi' }).locale).toBe('vi')
  })

  it('locale lạ → en, không throw', () => {
    for (const junk of ['fr', 'EN', '', 42, null]) {
      expect(migrateConfig({ locale: junk }).locale, String(junk)).toBe('en')
    }
  })
})

describe('ghi đè giờ làm việc KHÔNG đi theo CONFIG_VERSION', () => {
  // Đây là cái bẫy mà việc đưa giờ làm việc vào Options mở ra: nếu điều kiện
  // migration là `< CONFIG_VERSION` thì lần bump version sau sẽ XOÁ giờ người
  // dùng tự đặt. Test này chết ngay nếu ai đổi lại thành CONFIG_VERSION.
  it('config ĐÚNG v3 giữ nguyên giờ đã đặt, không bị ghi đè', () => {
    const c = migrateConfig({
      version: 3,
      workdayStart: '09:15',
      workdayEnd: '17:45',
      breaks: [{ start: '12:00', end: '13:00' }],
    })
    expect(c.workdayStart).toBe('09:15')
    expect(c.workdayEnd).toBe('17:45')
    expect(c.breaks).toEqual([{ start: '12:00', end: '13:00' }])
  })

  it('config version CAO HƠN v3 cũng giữ nguyên', () => {
    // Mô phỏng tương lai: CONFIG_VERSION lên 4 vì một lý do không liên quan.
    const c = migrateConfig({ version: 99, workdayStart: '10:00' })
    expect(c.workdayStart).toBe('10:00')
  })

  it('config CŨ HƠN v3 vẫn bị ghi đè — migration lịch sử không đổi', () => {
    const c = migrateConfig({ version: 2, workdayStart: '09:15' })
    expect(c.workdayStart).toBe('08:30')
  })
})
