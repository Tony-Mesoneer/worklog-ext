// tests/core/ceremony-options.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildCeremonyOptions, duplicateSummaries, isAmbiguousSummary, summaryCounts,
  type CeremonySubtask,
} from '@/core/ceremony-options'
import { resolveSprintEvents, type CeremonyCandidate } from '@/core/event-resolve'
import type { SprintEvent } from '@/core/config-schema'

const sub = (
  key: string, summary: string,
  parentKey: string | null = null, parentSummary: string | null = null,
): CeremonySubtask => ({ key, summary, parentKey, parentSummary })

// Tình huống THẬT đã làm người dùng chọn sai: một "Sprint Review" ceremony dưới
// task container, và BA "Security Review" — mỗi story một cái — trong cùng sprint.
const REAL_SPRINT: CeremonySubtask[] = [
  sub('CAG-3066', 'Sprint Review', 'CAG-3063', 'S34 - Sprint activities'),
  sub('CAG-3065', 'Daily Scrum', 'CAG-3063', 'S34 - Sprint activities'),
  sub('CAG-3078', 'Security Review', 'CAG-2727', 'SCIM user sync hardening'),
  sub('CAG-3073', 'Security Review', 'CAG-2969', 'Allow moving user via SCIM user sync'),
  sub('CAG-3050', 'Security Review', 'CAG-3011', 'Graph API secret rotation'),
]

describe('duplicateSummaries', () => {
  it('ba sub-task cùng tên → tên đó bị đánh dấu trùng', () => {
    expect(duplicateSummaries(REAL_SPRINT)).toEqual(new Set(['security review']))
  })

  it('tên duy nhất KHÔNG bị đánh dấu', () => {
    const dups = duplicateSummaries(REAL_SPRINT)
    expect(dups.has('sprint review')).toBe(false)
    expect(dups.has('daily scrum')).toBe(false)
  })

  it('so sánh bỏ qua hoa/thường và khoảng trắng thừa, y như resolve', () => {
    const items = [
      sub('A-1', 'Security Review'),
      sub('A-2', '  security   REVIEW '),
    ]
    expect(duplicateSummaries(items)).toEqual(new Set(['security review']))
  })

  it('danh sách rỗng → không có tên trùng nào', () => {
    expect(duplicateSummaries([])).toEqual(new Set())
  })

  it('cùng một issue trả về hai lần KHÔNG phải trùng', () => {
    // Jira (và cache) có thể lặp cùng một key; đếm hai lần sẽ khoá oan một tên
    // hoàn toàn dùng được.
    const items = [sub('CAG-3066', 'Sprint Review'), sub('CAG-3066', 'Sprint Review')]
    expect(duplicateSummaries(items)).toEqual(new Set())
    expect(summaryCounts(items).get('sprint review')).toBe(1)
  })
})

describe('buildCeremonyOptions', () => {
  it('danh sách rỗng → không có dòng nào', () => {
    expect(buildCeremonyOptions([])).toEqual([])
  })

  it('ba tên giống nhau → CẢ BA dòng không dùng được', () => {
    const rows = buildCeremonyOptions(REAL_SPRINT)
    const dup = rows.filter((r) => r.value === 'Security Review')
    expect(dup).toHaveLength(3)
    expect(dup.every((r) => r.usable === false)).toBe(true)
    expect(dup.every((r) => r.duplicateCount === 3)).toBe(true)
    // Cha là thứ duy nhất phân biệt chúng — phải khác nhau cả ba.
    expect(new Set(dup.map((r) => r.parentLabel)).size).toBe(3)
  })

  it('tên duy nhất vẫn dùng được và mang tên cha', () => {
    const rows = buildCeremonyOptions(REAL_SPRINT)
    const one = rows.find((r) => r.value === 'Sprint Review')
    expect(one).toBeDefined()
    expect(one!.usable).toBe(true)
    expect(one!.duplicateCount).toBe(1)
    expect(one!.issueKey).toBe('CAG-3066')
    expect(one!.label).toBe('Sprint Review — S34 - Sprint activities')
  })

  it('một dòng cho MỖI sub-task, không phải mỗi tên', () => {
    expect(buildCeremonyOptions(REAL_SPRINT)).toHaveLength(5)
  })

  it('sub-task không có cha vẫn hiện, nói rõ là không rõ cha', () => {
    const rows = buildCeremonyOptions([sub('CAG-1', 'Sprint Retro')])
    expect(rows[0]!.parentLabel).toBeNull()
    expect(rows[0]!.label).toBe('Sprint Retro — không rõ task cha')
  })

  it('chỉ có parentKey (Jira không trả tên cha) → hiện key', () => {
    const rows = buildCeremonyOptions([sub('CAG-1', 'Sprint Retro', 'CAG-3063', '')])
    expect(rows[0]!.parentLabel).toBe('CAG-3063')
    expect(rows[0]!.label).toBe('Sprint Retro — CAG-3063')
  })

  it('sub-task không có tên bị loại — matchSummary rỗng nghĩa là "dùng issueKey"', () => {
    expect(buildCeremonyOptions([sub('CAG-1', '   ')])).toEqual([])
  })

  it('các dòng cùng tên nằm cạnh nhau, sắp theo tên rồi theo cha', () => {
    const rows = buildCeremonyOptions(REAL_SPRINT)
    expect(rows.map((r) => `${r.value}|${r.parentLabel ?? ''}`)).toEqual([
      'Daily Scrum|S34 - Sprint activities',
      'Security Review|Allow moving user via SCIM user sync',
      'Security Review|Graph API secret rotation',
      'Security Review|SCIM user sync hardening',
      'Sprint Review|S34 - Sprint activities',
    ])
  })

  it('giá trị lưu là summary THÔ (đã trim), không phải bản chuẩn hoá', () => {
    const rows = buildCeremonyOptions([sub('CAG-1', '  Daily Scrum  ')])
    expect(rows[0]!.value).toBe('Daily Scrum')
  })
})

describe('isAmbiguousSummary', () => {
  it('tên đã lưu bị trùng → true', () => {
    expect(isAmbiguousSummary('Security Review', REAL_SPRINT)).toBe(true)
  })

  it('không phân biệt hoa thường / khoảng trắng', () => {
    expect(isAmbiguousSummary('  security   review ', REAL_SPRINT)).toBe(true)
  })

  it('tên duy nhất, tên không có trong sprint, tên rỗng → false', () => {
    expect(isAmbiguousSummary('Sprint Review', REAL_SPRINT)).toBe(false)
    expect(isAmbiguousSummary('Backlog Refinement', REAL_SPRINT)).toBe(false)
    expect(isAmbiguousSummary('', REAL_SPRINT)).toBe(false)
  })
})

// Cảnh báo ở Options chỉ có giá trị nếu nó khớp với thứ resolve THẬT SỰ làm.
// Test này ràng hai lớp lại: cái gì bị đánh dấu không dùng được thì resolve
// cũng phải trả issueKey null.
describe('khớp với resolveSprintEvents', () => {
  const toCandidate = (s: CeremonySubtask): CeremonyCandidate => ({
    key: s.key, summary: s.summary,
    sprintId: 34, sprintStartDate: '2026-08-17T02:00:00.000Z',
  })
  const ev = (matchSummary: string): SprintEvent => ({
    name: 'Review', issueKey: '', matchSummary, defaultMinutes: 60, comment: '',
  })

  it('mọi tên bị đánh dấu trùng đều resolve ra null', () => {
    const dups = [...duplicateSummaries(REAL_SPRINT)]
    const resolved = resolveSprintEvents(
      dups.map(ev), REAL_SPRINT.map(toCandidate),
    )
    expect(resolved.every((r) => r.issueKey === null)).toBe(true)
  })

  it('tên dùng được thì resolve ra đúng issue', () => {
    const [r] = resolveSprintEvents([ev('Sprint Review')], REAL_SPRINT.map(toCandidate))
    expect(r!.issueKey).toBe('CAG-3066')
  })
})
