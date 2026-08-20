// tests/core/event-resolve.test.ts
import { describe, it, expect } from 'vitest'
import {
  resolveSprintEvents, normalizeSummary, ceremonyCacheKey, ceremonyKeysToDrop,
  CEREMONY_KEY_PREFIX, type CeremonyCandidate,
} from '@/core/event-resolve'
import type { SprintEvent } from '@/core/config-schema'

const ev = (p: Partial<SprintEvent>): SprintEvent => ({
  name: 'E', issueKey: '', matchSummary: '', defaultMinutes: 15, comment: '', ...p,
})

const cand = (
  key: string, summary: string, sprintId: number | null = 1,
  sprintStartDate: string | null = '2026-08-17T02:00:00.000Z',
): CeremonyCandidate => ({ key, summary, sprintId, sprintStartDate })

// Dữ liệu thật của team: sub-task ceremony dưới Task "S34 - Sprint activities".
const SPRINT_34 = [
  cand('CAG-3064', 'Sprint Planning'),
  cand('CAG-3065', 'Daily Scrum'),
  cand('CAG-3066', 'Sprint Review'),
  cand('CAG-3067', 'Sprint Retro'),
  cand('CAG-3068', 'Backlog Refinement'),
]

describe('normalizeSummary', () => {
  it('không phân biệt hoa thường và khoảng trắng', () => {
    expect(normalizeSummary('  Daily   Scrum ')).toBe('daily scrum')
    expect(normalizeSummary('DAILY SCRUM')).toBe(normalizeSummary('daily scrum'))
  })

  it('gộp cả non-breaking space mà Jira hay chèn', () => {
    expect(normalizeSummary('Daily Scrum')).toBe('daily scrum')
  })
})

describe('resolveSprintEvents — khớp tên chính xác', () => {
  it('khớp CHÍNH XÁC thắng, bỏ qua ứng viên fuzzy gần giống', () => {
    // Jira `~` kéo về cả những sub-task chỉ chung từ. Chúng phải bị loại.
    const candidates = [
      cand('CAG-9001', 'Daily Scrum notes'),
      cand('CAG-9002', 'Prepare Daily'),
      cand('CAG-3065', 'Daily Scrum'),
    ]
    const [r] = resolveSprintEvents([ev({ name: 'Daily', matchSummary: 'Daily Scrum' })], candidates)
    expect(r!.issueKey).toBe('CAG-3065')
    expect(r!.reason).toBeNull()
    expect(r!.source).toBe('summary')
  })

  it('hai event chung từ ("Sprint Review" / "Sprint Retro") ra đúng issue của mình', () => {
    const events = [
      ev({ name: 'Review', matchSummary: 'Sprint Review' }),
      ev({ name: 'Retro', matchSummary: 'Sprint Retro' }),
    ]
    const out = resolveSprintEvents(events, SPRINT_34)
    expect(out.map((r) => r.issueKey)).toEqual(['CAG-3066', 'CAG-3067'])
  })

  it('không phụ thuộc thứ tự Jira trả về', () => {
    const events = [
      ev({ name: 'Review', matchSummary: 'Sprint Review' }),
      ev({ name: 'Retro', matchSummary: 'Sprint Retro' }),
    ]
    const reversed = [...SPRINT_34].reverse()
    expect(resolveSprintEvents(events, reversed).map((r) => r.issueKey))
      .toEqual(resolveSprintEvents(events, SPRINT_34).map((r) => r.issueKey))
  })

  it('cả năm ceremony của sprint hiện tại resolve đúng', () => {
    const events = [
      ev({ name: 'Planning', matchSummary: 'Sprint Planning' }),
      ev({ name: 'Daily', matchSummary: 'Daily Scrum' }),
      ev({ name: 'Review', matchSummary: 'Sprint Review' }),
      ev({ name: 'Retro', matchSummary: 'Sprint Retro' }),
      ev({ name: 'Refinement', matchSummary: 'Backlog Refinement' }),
    ]
    expect(resolveSprintEvents(events, SPRINT_34).map((r) => r.issueKey))
      .toEqual(['CAG-3064', 'CAG-3065', 'CAG-3066', 'CAG-3067', 'CAG-3068'])
  })

  it('so khớp bỏ qua hoa thường và khoảng trắng thừa ở cả hai phía', () => {
    const [r] = resolveSprintEvents(
      [ev({ matchSummary: '  daily   scrum  ' })],
      [cand('CAG-3065', 'Daily Scrum ')],
    )
    expect(r!.issueKey).toBe('CAG-3065')
  })
})

describe('resolveSprintEvents — không tra được', () => {
  it('không có ứng viên nào khớp → null + lý do đọc được', () => {
    const [r] = resolveSprintEvents(
      [ev({ name: 'Daily', matchSummary: 'Daily Scrum' })],
      [cand('CAG-9001', 'Daily Scrum notes')],
    )
    expect(r!.issueKey).toBeNull()
    expect(r!.reason).toBe('không tìm thấy "Daily Scrum" trong sprint hiện tại')
  })

  it('ceremony bị đổi tên trong Jira → nút bị khoá, KHÔNG rơi về key cũ', () => {
    const [r] = resolveSprintEvents(
      [ev({ name: 'Daily', issueKey: 'CAG-3065', matchSummary: 'Daily Scrum' })],
      [cand('CAG-3170', 'Daily Standup')],
    )
    expect(r!.issueKey).toBeNull()
    expect(r!.reason).toContain('không tìm thấy')
  })

  it('danh sách ứng viên rỗng → mọi event tra-theo-tên bị khoá', () => {
    const out = resolveSprintEvents([ev({ matchSummary: 'Daily Scrum' })], [])
    expect(out[0]!.issueKey).toBeNull()
  })
})

describe('resolveSprintEvents — tie-break nhiều sprint đang mở', () => {
  const s34 = '2026-08-17T02:00:00.000Z'
  const s35 = '2026-08-31T02:00:00.000Z'

  it('chọn ứng viên thuộc sprint có startDate MUỘN NHẤT', () => {
    const [r] = resolveSprintEvents([ev({ matchSummary: 'Daily Scrum' })], [
      cand('CAG-3065', 'Daily Scrum', 34, s34),
      cand('CAG-3071', 'Daily Scrum', 35, s35),
    ])
    expect(r!.issueKey).toBe('CAG-3071')
  })

  it('thứ tự đầu vào không đổi kết quả tie-break', () => {
    const [r] = resolveSprintEvents([ev({ matchSummary: 'Daily Scrum' })], [
      cand('CAG-3071', 'Daily Scrum', 35, s35),
      cand('CAG-3065', 'Daily Scrum', 34, s34),
    ])
    expect(r!.issueKey).toBe('CAG-3071')
  })

  it('startDate BẰNG NHAU → null, không đoán', () => {
    const [r] = resolveSprintEvents([ev({ matchSummary: 'Daily Scrum' })], [
      cand('CAG-3065', 'Daily Scrum', 34, s34),
      cand('CAG-3071', 'Daily Scrum', 35, s34),
    ])
    expect(r!.issueKey).toBeNull()
    expect(r!.reason).toBe(
      'có 2 sub-task tên "Daily Scrum" trong các sprint đang mở' +
      ' — không biết chọn cái nào, hãy nhập issue key thủ công',
    )
  })

  it('không biết startDate của cả hai → null', () => {
    const [r] = resolveSprintEvents([ev({ matchSummary: 'Daily Scrum' })], [
      cand('CAG-3065', 'Daily Scrum', null, null),
      cand('CAG-3071', 'Daily Scrum', null, ''),
    ])
    expect(r!.issueKey).toBeNull()
    expect(r!.reason).toContain('có 2 sub-task')
  })

  it('biết startDate thắng ứng viên không rõ startDate', () => {
    const [r] = resolveSprintEvents([ev({ matchSummary: 'Daily Scrum' })], [
      cand('CAG-3065', 'Daily Scrum', null, null),
      cand('CAG-3071', 'Daily Scrum', 35, s35),
    ])
    expect(r!.issueKey).toBe('CAG-3071')
  })

  it('một ứng viên duy nhất vẫn dùng được dù không rõ startDate', () => {
    const [r] = resolveSprintEvents(
      [ev({ matchSummary: 'Daily Scrum' })],
      [cand('CAG-3065', 'Daily Scrum', null, null)],
    )
    expect(r!.issueKey).toBe('CAG-3065')
  })

  it('ứng viên TRÙNG KEY không phải nhập nhằng — vẫn là một issue', () => {
    const [r] = resolveSprintEvents([ev({ matchSummary: 'Daily Scrum' })], [
      cand('CAG-3065', 'Daily Scrum', 34, s34),
      cand('CAG-3065', 'Daily Scrum', 35, s35),
    ])
    expect(r!.issueKey).toBe('CAG-3065')
    expect(r!.reason).toBeNull()
  })

  it('ba ứng viên, một sprint muộn nhất duy nhất → chọn nó', () => {
    const [r] = resolveSprintEvents([ev({ matchSummary: 'Daily Scrum' })], [
      cand('CAG-3060', 'Daily Scrum', 33, '2026-08-03T02:00:00.000Z'),
      cand('CAG-3065', 'Daily Scrum', 34, s34),
      cand('CAG-3071', 'Daily Scrum', 35, s35),
    ])
    expect(r!.issueKey).toBe('CAG-3071')
  })
})

describe('resolveSprintEvents — issueKey ghim tay', () => {
  it('không có matchSummary → dùng issueKey y như trước, không cần Jira', () => {
    const [r] = resolveSprintEvents([ev({ name: 'Daily', issueKey: 'CAG-100' })], [])
    expect(r!.issueKey).toBe('CAG-100')
    expect(r!.source).toBe('manual')
    expect(r!.reason).toBeNull()
  })

  it('matchSummary thắng issueKey khi cả hai có', () => {
    const [r] = resolveSprintEvents(
      [ev({ issueKey: 'CAG-3065', matchSummary: 'Daily Scrum' })],
      [cand('CAG-3071', 'Daily Scrum', 35, '2026-08-31T02:00:00.000Z')],
    )
    expect(r!.issueKey).toBe('CAG-3071')
  })

  it('không có cả hai → khoá kèm lý do chỉ về Options', () => {
    const [r] = resolveSprintEvents([ev({})], [])
    expect(r!.issueKey).toBeNull()
    expect(r!.reason).toContain('Options')
  })
})

describe('resolveSprintEvents — unavailable (không sprint / Jira lỗi)', () => {
  it('event tra-theo-tên bị khoá kèm lý do, event ghim key vẫn chạy', () => {
    const out = resolveSprintEvents(
      [ev({ name: 'Daily', matchSummary: 'Daily Scrum' }), ev({ name: 'Ghim', issueKey: 'CAG-100' })],
      [],
      { unavailable: 'chưa có sprint nào đang mở' },
    )
    expect(out[0]!.issueKey).toBeNull()
    expect(out[0]!.reason).toBe('chưa có sprint nào đang mở — không tra được sub-task "Daily Scrum"')
    expect(out[1]!.issueKey).toBe('CAG-100')
  })

  it('unavailable bỏ qua ứng viên có sẵn — không dùng dữ liệu nửa vời', () => {
    const [r] = resolveSprintEvents(
      [ev({ matchSummary: 'Daily Scrum' })], SPRINT_34, { unavailable: 'Jira 500' },
    )
    expect(r!.issueKey).toBeNull()
  })
})

describe('resolveSprintEvents — hình dạng đầu ra', () => {
  it('song song với đầu vào và mang theo defaultMinutes/comment', () => {
    const events = [
      ev({ name: 'A', issueKey: 'CAG-1', defaultMinutes: 15, comment: 'c1' }),
      ev({ name: 'B', matchSummary: 'Daily Scrum', defaultMinutes: 120, comment: 'c2' }),
    ]
    const out = resolveSprintEvents(events, SPRINT_34)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      name: 'A', issueKey: 'CAG-1', reason: null,
      defaultMinutes: 15, comment: 'c1', source: 'manual',
    })
    expect(out[1]).toEqual({
      name: 'B', issueKey: 'CAG-3065', reason: null,
      defaultMinutes: 120, comment: 'c2', source: 'summary',
    })
  })

  it('mảng event rỗng → mảng rỗng', () => {
    expect(resolveSprintEvents([], SPRINT_34)).toEqual([])
  })
})

describe('ceremonyCacheKey', () => {
  it('đổi khi sprint id đổi — tự vô hiệu lúc chuyển sprint', () => {
    expect(ceremonyCacheKey(34, ['CAG'], ['Daily Scrum']))
      .not.toBe(ceremonyCacheKey(35, ['CAG'], ['Daily Scrum']))
  })

  it('không đổi khi chỉ thứ tự / hoa thường / khoảng trắng đổi', () => {
    expect(ceremonyCacheKey(34, ['CAG', 'OPS'], ['Daily Scrum', 'Sprint Retro']))
      .toBe(ceremonyCacheKey(34, ['OPS', 'CAG'], [' sprint  retro ', 'DAILY SCRUM']))
  })

  it('đổi khi tập tên event đổi — sửa Options phải tra lại', () => {
    expect(ceremonyCacheKey(34, ['CAG'], ['Daily Scrum']))
      .not.toBe(ceremonyCacheKey(34, ['CAG'], ['Daily Scrum', 'Sprint Retro']))
  })

  it('bỏ tên rỗng', () => {
    expect(ceremonyCacheKey(34, ['CAG'], ['Daily Scrum', '', '   ']))
      .toBe(ceremonyCacheKey(34, ['CAG'], ['Daily Scrum']))
  })

  it('luôn mang prefix để prune nhận ra', () => {
    expect(ceremonyCacheKey(34, [], [])).toMatch(new RegExp(`^${CEREMONY_KEY_PREFIX}`))
  })
})

describe('ceremonyKeysToDrop', () => {
  it('chỉ xoá key ceremony khác, không đụng key khác trong storage', () => {
    const keep = ceremonyCacheKey(35, ['CAG'], ['Daily Scrum'])
    const old = ceremonyCacheKey(34, ['CAG'], ['Daily Scrum'])
    expect(ceremonyKeysToDrop(['config', 'snapshot:a', old, keep], keep)).toEqual([old])
  })

  it('không có gì để xoá → mảng rỗng', () => {
    const keep = ceremonyCacheKey(35, [], [])
    expect(ceremonyKeysToDrop(['config', keep], keep)).toEqual([])
  })
})
