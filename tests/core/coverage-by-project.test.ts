// tests/core/coverage-by-project.test.ts
//
// Tách bảng coverage thành từng project. Bất biến quan trọng nhất được test ở
// cuối: tổng của mọi nhóm phải bằng tổng của bảng gộp — không mất giờ, không
// đếm đôi.
import { describe, it, expect } from 'vitest'
import { buildCoverage, enumerateDates, type Member, type Worklog } from '@/core/coverage'
import { buildCoverageByProject } from '@/core/coverage-by-project'
import { UNKNOWN_PROJECT } from '@/core/issue-hierarchy'
import type { IssueMeta, IssueMetaMap } from '@/core/issue-hierarchy'

const H = 3600
const DATES = enumerateDates('2026-08-17', '2026-08-18') // T2, T3

const member = (accountId: string, hoursPerDay = 8, active = true): Member =>
  ({ accountId, displayName: `User ${accountId}`, hoursPerDay, active })

const wl = (
  authorAccountId: string, date: string, hours: number, issueKey: string,
): Worklog => ({
  id: `${authorAccountId}-${date}-${issueKey}-${hours}`,
  issueKey, issueSummary: `Summary ${issueKey}`, authorAccountId, date,
  startMinutes: 540, timeSpentSeconds: hours * H, comment: '',
})

const meta = (pairs: Array<[string, string | null]>): IssueMetaMap =>
  Object.fromEntries(pairs.map(([key, projectKey]): [string, IssueMeta] => [key, {
    key, summary: `Summary ${key}`, statusName: 'To Do', statusCategory: 'new',
    projectKey, parentKey: null, parentSummary: null, isSubtask: false,
  }]))

const build = (worklogs: Worklog[], members: Member[], m: IssueMetaMap) =>
  buildCoverageByProject({
    worklogs, members, dates: DATES, daysOff: {}, meta: m, today: '2026-08-18',
  })

describe('buildCoverageByProject — khi nào KHÔNG tách', () => {
  it('không có worklog → null', () => {
    expect(build([], [member('a')], {})).toBeNull()
  })

  it('đúng một project → null (bảng phẳng như trước)', () => {
    const w = [wl('a', '2026-08-17', 8, 'CAG-1'), wl('a', '2026-08-18', 8, 'CAG-2')]
    expect(build(w, [member('a')], meta([['CAG-1', 'CAG'], ['CAG-2', 'CAG']]))).toBeNull()
  })

  it('mọi worklog đều thiếu meta → null: một nhóm "không rõ" không nói gì thêm', () => {
    const w = [wl('a', '2026-08-17', 8, 'X-1'), wl('a', '2026-08-18', 4, 'Y-2')]
    expect(build(w, [member('a')], {})).toBeNull()
  })
})

describe('buildCoverageByProject — tách nhóm', () => {
  const worklogs = [
    wl('a', '2026-08-17', 8, 'CAG-1'),
    wl('b', '2026-08-17', 8, 'CAG-1'),
    wl('a', '2026-08-18', 6, 'CAG-2'),
    wl('a', '2026-08-18', 2, 'ABC-9'),
  ]
  const m = meta([['CAG-1', 'CAG'], ['CAG-2', 'CAG'], ['ABC-9', 'ABC']])
  const members = [member('a'), member('b')]

  it('mỗi project một nhóm, giờ chỉ của project đó', () => {
    const groups = build(worklogs, members, m)!
    expect(groups.map((g) => g.projectKey)).toEqual(['CAG', 'ABC'])
    expect(groups[0]!.table.grandTotal).toBe(22 * H)
    expect(groups[1]!.table.grandTotal).toBe(2 * H)
  })

  it('nhóm xếp theo tổng giờ giảm dần, không theo thứ tự xuất hiện', () => {
    // CAG = 22h và xuất hiện TRƯỚC trong danh sách worklog. Đẩy ABC lên 26h thì
    // ABC phải lên đầu — nếu sort theo lần xuất hiện đầu tiên thì test này fail.
    const heavy = [
      ...worklogs,
      wl('b', '2026-08-17', 8, 'ABC-9'),
      wl('b', '2026-08-18', 8, 'ABC-9'),
      wl('a', '2026-08-17', 8, 'ABC-9'),
    ]
    expect(build(heavy, members, m)!.map((g) => g.projectKey)).toEqual(['ABC', 'CAG'])
  })

  it('tổng giờ bằng nhau thì tie-break theo key, để thứ tự luôn xác định', () => {
    const w = [
      wl('a', '2026-08-17', 4, 'ZED-1'),
      wl('a', '2026-08-18', 4, 'ABC-1'),
    ]
    const groups = build(w, [member('a')], meta([['ZED-1', 'ZED'], ['ABC-1', 'ABC']]))!
    expect(groups.map((g) => g.projectKey)).toEqual(['ABC', 'ZED'])
  })

  it('member không có giờ trong project đó bị loại khỏi nhóm', () => {
    const groups = build(worklogs, members, m)!
    const abc = groups.find((g) => g.projectKey === 'ABC')!
    // Chỉ 'a' log vào ABC. Liệt kê cả team với toàn số 0 làm card không đọc được.
    expect(abc.table.rows.map((r) => r.member.accountId)).toEqual(['a'])
    expect(groups.find((g) => g.projectKey === 'CAG')!.table.rows.map((r) => r.member.accountId))
      .toEqual(['a', 'b'])
  })

  it('member giữ thứ tự như danh sách members truyền vào', () => {
    const groups = build(worklogs, [member('b'), member('a')], m)!
    expect(groups.find((g) => g.projectKey === 'CAG')!.table.rows.map((r) => r.member.accountId))
      .toEqual(['b', 'a'])
  })

  it('nhóm không rõ project luôn xuống cuối, dù nhiều giờ hơn', () => {
    const w = [
      wl('a', '2026-08-17', 2, 'CAG-1'),
      wl('a', '2026-08-18', 8, 'ZZ-1'),   // thiếu meta → UNKNOWN
    ]
    const groups = build(w, [member('a')], meta([['CAG-1', 'CAG']]))!
    expect(groups.map((g) => g.projectKey)).toEqual(['CAG', UNKNOWN_PROJECT])
  })

  it('meta có projectKey null tính vào nhóm không rõ, không biến mất', () => {
    const w = [wl('a', '2026-08-17', 8, 'CAG-1'), wl('a', '2026-08-18', 4, 'Q-1')]
    const groups = build(w, [member('a')], meta([['CAG-1', 'CAG'], ['Q-1', null]]))!
    expect(groups.map((g) => g.projectKey)).toEqual(['CAG', UNKNOWN_PROJECT])
    expect(groups[1]!.table.grandTotal).toBe(4 * H)
  })

  it('dates và today của mọi nhóm giống bảng gộp', () => {
    const groups = build(worklogs, members, m)!
    for (const g of groups) {
      expect(g.table.dates).toEqual(DATES)
      expect(g.table.today).toBe('2026-08-18')
    }
  })
})

describe('buildCoverageByProject — bất biến tổng', () => {
  it('tổng mọi nhóm bằng tổng bảng gộp, theo cả ngày', () => {
    const worklogs = [
      wl('a', '2026-08-17', 8, 'CAG-1'),
      wl('b', '2026-08-17', 3, 'ABC-9'),
      wl('a', '2026-08-18', 5, 'ABC-9'),
      wl('b', '2026-08-18', 4, 'ZZ-1'),   // không rõ project
    ]
    const members = [member('a'), member('b')]
    const m = meta([['CAG-1', 'CAG'], ['ABC-9', 'ABC']])

    const combined = buildCoverage({ worklogs, members, dates: DATES, daysOff: {}, today: '2026-08-18' })
    const groups = build(worklogs, members, m)!

    expect(groups.reduce((s, g) => s + g.table.grandTotal, 0)).toBe(combined.grandTotal)
    for (const d of DATES) {
      expect(groups.reduce((s, g) => s + (g.table.totalPerDay[d] ?? 0), 0))
        .toBe(combined.totalPerDay[d])
    }
  })

  it('một worklog chỉ thuộc đúng một nhóm', () => {
    const worklogs = [
      wl('a', '2026-08-17', 8, 'CAG-1'),
      wl('a', '2026-08-18', 2, 'ABC-9'),
    ]
    const groups = build(worklogs, [member('a')], meta([['CAG-1', 'CAG'], ['ABC-9', 'ABC']]))!
    const ids = groups.flatMap((g) => g.table.rows.flatMap((r) => r.issues.map((i) => i.issueKey)))
    expect(ids).toEqual(['CAG-1', 'ABC-9'])
  })
})
