import { describe, it, expect } from 'vitest'
import {
  distinctProjectKeys, groupIssueRowsByParent, groupRowsByProject,
  mergeCoverageIssueRows, toStatusCategory, UNKNOWN_PROJECT,
  type IssueMeta, type IssueMetaMap,
} from '@/core/issue-hierarchy'
import type { CoverageIssueRow } from '@/core/coverage'

const H = 3600

// Row tối giản: grouping chỉ cần key, phần còn lại được mang qua nguyên vẹn.
type Row = { issueKey: string; total: number }
const row = (issueKey: string, total = 0): Row => ({ issueKey, total })
const keyOf = (r: Row): string => r.issueKey

const meta = (
  key: string,
  opts: Partial<Omit<IssueMeta, 'key'>> = {},
): IssueMeta => ({
  key,
  summary: `Summary ${key}`,
  statusName: 'Open',
  statusCategory: 'new',
  projectKey: null,
  parentKey: null,
  parentSummary: null,
  isSubtask: false,
  ...opts,
})

const sub = (key: string, parentKey: string): IssueMeta =>
  meta(key, {
    parentKey,
    parentSummary: `Summary ${parentKey}`,
    isSubtask: true,
  })

const asMap = (...items: IssueMeta[]): IssueMetaMap =>
  Object.fromEntries(items.map((m) => [m.key, m]))

describe('toStatusCategory', () => {
  it('nhận đúng ba key của Jira', () => {
    expect(toStatusCategory('new')).toBe('new')
    expect(toStatusCategory('indeterminate')).toBe('indeterminate')
    expect(toStatusCategory('done')).toBe('done')
  })

  it('key lạ / thiếu rơi về new, không đoán "đang làm" hay "xong"', () => {
    expect(toStatusCategory('undefined')).toBe('new')
    expect(toStatusCategory(undefined)).toBe('new')
    expect(toStatusCategory(null)).toBe('new')
    expect(toStatusCategory(42)).toBe('new')
  })
})

describe('groupIssueRowsByParent', () => {
  it('sub-task nằm dưới cha của nó', () => {
    const rows = [row('CAG-2969'), row('CAG-3052')]
    const groups = groupIssueRowsByParent(
      rows, asMap(meta('CAG-2969'), sub('CAG-3052', 'CAG-2969')), keyOf,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('CAG-2969')
    expect(groups[0]!.isParent).toBe(true)
    expect(groups[0]!.own).toEqual(row('CAG-2969'))
    expect(groups[0]!.children.map(keyOf)).toEqual(['CAG-3052'])
  })

  it('hai sub-task cùng cha gom vào một nhóm', () => {
    const rows = [row('CAG-3052'), row('CAG-3053')]
    const groups = groupIssueRowsByParent(
      rows,
      asMap(sub('CAG-3052', 'CAG-2969'), sub('CAG-3053', 'CAG-2969')),
      keyOf,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.children.map(keyOf)).toEqual(['CAG-3052', 'CAG-3053'])
  })

  it('issue không có cha vẫn ở cấp trên, không sinh nhóm giả', () => {
    const groups = groupIssueRowsByParent(
      [row('CAG-3027')], asMap(meta('CAG-3027')), keyOf,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.isParent).toBe(false)
    expect(groups[0]!.own).toEqual(row('CAG-3027'))
    expect(groups[0]!.children).toEqual([])
  })

  it('cha không có row nào của riêng nó vẫn hiện làm tiêu đề nhóm', () => {
    // CAG-3063 "S34 - Sprint activities" không được log giờ trực tiếp; giờ nằm
    // hết ở sub-task Daily Scrum. Cha vẫn phải hiện, nếu không thì Daily Scrum
    // trông như một issue độc lập.
    const groups = groupIssueRowsByParent(
      [row('CAG-3065')], asMap(sub('CAG-3065', 'CAG-3063')), keyOf,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('CAG-3063')
    expect(groups[0]!.isParent).toBe(true)
    expect(groups[0]!.own).toBeNull()
    expect(groups[0]!.summary).toBe('Summary CAG-3063')
    expect(groups[0]!.children.map(keyOf)).toEqual(['CAG-3065'])
  })

  it('meta thiếu hoàn toàn: mọi row ở cấp trên, không vỡ', () => {
    // Snapshot cache từ trước thay đổi này không có map — phải đọc y như bảng cũ.
    const groups = groupIssueRowsByParent([row('A-1'), row('A-2')], {}, keyOf)
    expect(groups.map((g) => g.key)).toEqual(['A-1', 'A-2'])
    expect(groups.every((g) => !g.isParent && g.children.length === 0)).toBe(true)
    // Không có meta thì không có summary — UI phải chịu được chuỗi rỗng.
    expect(groups[0]!.summary).toBe('')
  })

  it('thứ tự xác định: nhóm theo lần xuất hiện đầu, con theo thứ tự đầu vào', () => {
    const rows = [row('CAG-3027'), row('CAG-3053'), row('CAG-9999'), row('CAG-3052')]
    const groups = groupIssueRowsByParent(
      rows,
      asMap(
        meta('CAG-3027'), meta('CAG-9999'),
        sub('CAG-3053', 'CAG-2969'), sub('CAG-3052', 'CAG-2969'),
      ),
      keyOf,
    )
    expect(groups.map((g) => g.key)).toEqual(['CAG-3027', 'CAG-2969', 'CAG-9999'])
    expect(groups[1]!.children.map(keyOf)).toEqual(['CAG-3053', 'CAG-3052'])
    // Gọi lại với cùng input cho cùng kết quả.
    const again = groupIssueRowsByParent(
      rows,
      asMap(
        meta('CAG-3027'), meta('CAG-9999'),
        sub('CAG-3053', 'CAG-2969'), sub('CAG-3052', 'CAG-2969'),
      ),
      keyOf,
    )
    expect(again).toEqual(groups)
  })

  it('cha xuất hiện SAU con vẫn vào đúng nhóm đã mở', () => {
    const groups = groupIssueRowsByParent(
      [row('CAG-3052'), row('CAG-2969')],
      asMap(sub('CAG-3052', 'CAG-2969'), meta('CAG-2969')),
      keyOf,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.own).toEqual(row('CAG-2969'))
    expect(groups[0]!.children.map(keyOf)).toEqual(['CAG-3052'])
  })

  it('parentKey trỏ vào chính nó bị bỏ qua', () => {
    const groups = groupIssueRowsByParent(
      [row('CAG-1')],
      asMap(meta('CAG-1', { parentKey: 'CAG-1', isSubtask: true })),
      keyOf,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.isParent).toBe(false)
    expect(groups[0]!.own).toEqual(row('CAG-1'))
  })
})

describe('mergeCoverageIssueRows', () => {
  const cov = (
    issueKey: string, perDay: Record<string, number>,
  ): CoverageIssueRow => ({
    issueKey,
    issueSummary: `Summary ${issueKey}`,
    perDay,
    total: Object.values(perDay).reduce((s, v) => s + v, 0),
  })

  it('cộng theo từng ngày và tổng', () => {
    const merged = mergeCoverageIssueRows('CAG-2969', 'Parent', [
      cov('CAG-3052', { '2026-08-17': 8 * H, '2026-08-18': 2 * H }),
      cov('CAG-3053', { '2026-08-18': 3 * H }),
    ])
    expect(merged.issueKey).toBe('CAG-2969')
    expect(merged.issueSummary).toBe('Parent')
    expect(merged.perDay['2026-08-17']).toBe(8 * H)
    expect(merged.perDay['2026-08-18']).toBe(5 * H)
    expect(merged.total).toBe(13 * H)
  })

  it('danh sách rỗng cho dòng tổng bằng 0', () => {
    const merged = mergeCoverageIssueRows('CAG-1', 'X', [])
    expect(merged.total).toBe(0)
    expect(merged.perDay).toEqual({})
  })
})

describe('groupRowsByProject', () => {
  // Meta có project. `sub()` ở trên không đặt projectKey, nên các test dưới đây
  // dựng meta riêng để nói rõ project của từng issue.
  const inProject = (
    key: string, projectKey: string, parentKey: string | null = null,
  ): IssueMeta => meta(key, {
    projectKey,
    parentKey,
    parentSummary: parentKey === null ? null : `Summary ${parentKey}`,
    isSubtask: parentKey !== null,
  })

  it('MỘT project → null: không thêm tầng nào, bảng vẽ phẳng như trước', () => {
    // Đây là trường hợp thường ngày (đo trên Jira thật: từ 2026-06-01 chỉ có 2
    // issue ngoài CAG). Một cái bọc "CAG" duy nhất chỉ thêm thụt lề và không
    // nói gì.
    const rows = [row('CAG-1'), row('CAG-2')]
    expect(groupRowsByProject(
      rows, asMap(inProject('CAG-1', 'CAG'), inProject('CAG-2', 'CAG')), keyOf,
    )).toBeNull()
  })

  it('không có row nào → null', () => {
    expect(groupRowsByProject([], {}, keyOf)).toBeNull()
  })

  it('HAI project → hai nhóm, tổng của từng project đúng', () => {
    const rows = [row('CAG-1', 8 * H), row('ABC-7', 3 * H), row('CAG-2', 2 * H)]
    const groups = groupRowsByProject(
      rows,
      asMap(
        inProject('CAG-1', 'CAG'), inProject('CAG-2', 'CAG'),
        inProject('ABC-7', 'ABC'),
      ),
      keyOf,
    )
    expect(groups).not.toBeNull()
    expect(groups!.map((g) => g.projectKey)).toEqual(['CAG', 'ABC'])
    expect(groups![0]!.rows.map(keyOf)).toEqual(['CAG-1', 'CAG-2'])
    expect(groups![1]!.rows.map(keyOf)).toEqual(['ABC-7'])
    // Tổng theo project: 10h ở CAG, 3h ở ABC — không con nào bị mất.
    const total = (rs: Row[]) => rs.reduce((t, r) => t + r.total, 0)
    expect(total(groups![0]!.rows)).toBe(10 * H)
    expect(total(groups![1]!.rows)).toBe(3 * H)
    expect(total(groups!.flatMap((g) => g.rows))).toBe(13 * H)
  })

  it('project key lấy từ meta, KHÔNG từ tiền tố issue key', () => {
    // Project đổi key vẫn phục vụ key cũ: `CAG-9` thuộc project `CGW`.
    const groups = groupRowsByProject(
      [row('CAG-1'), row('CAG-9')],
      asMap(inProject('CAG-1', 'CAG'), inProject('CAG-9', 'CGW')),
      keyOf,
    )
    expect(groups!.map((g) => g.projectKey)).toEqual(['CAG', 'CGW'])
  })

  it('gom theo cha vẫn hoạt động BÊN TRONG một nhóm project', () => {
    const rows = [row('CAG-3052'), row('CAG-3053'), row('ABC-1')]
    const metaMap = asMap(
      inProject('CAG-3052', 'CAG', 'CAG-2969'),
      inProject('CAG-3053', 'CAG', 'CAG-2969'),
      inProject('ABC-1', 'ABC'),
    )
    const groups = groupRowsByProject(rows, metaMap, keyOf)!
    expect(groups.map((g) => g.projectKey)).toEqual(['CAG', 'ABC'])

    const cag = groupIssueRowsByParent(groups[0]!.rows, metaMap, keyOf)
    expect(cag).toHaveLength(1)
    expect(cag[0]!.key).toBe('CAG-2969')
    expect(cag[0]!.isParent).toBe(true)
    expect(cag[0]!.children.map(keyOf)).toEqual(['CAG-3052', 'CAG-3053'])

    const abc = groupIssueRowsByParent(groups[1]!.rows, metaMap, keyOf)
    expect(abc).toHaveLength(1)
    expect(abc[0]!.isParent).toBe(false)
  })

  it('meta THIẾU HOÀN TOÀN → null: không throw, và bảng phẳng y như bản cũ', () => {
    // Snapshot cache cũ / issue Jira không trả field `project`. Tất cả rơi vào
    // cùng một nhóm "không biết" → đúng một project → không có tầng nào.
    expect(groupRowsByProject([row('A-1'), row('A-2')], {}, keyOf)).toBeNull()
    expect(distinctProjectKeys([row('A-1')], {}, keyOf)).toEqual([UNKNOWN_PROJECT])
  })

  it('issue KHÔNG BIẾT project vẫn có nhóm riêng, không bị bỏ khỏi tổng', () => {
    const rows = [row('CAG-1', 5 * H), row('X-9', 2 * H)]
    // X-9 có mặt trong rows nhưng không có meta.
    const groups = groupRowsByProject(rows, asMap(inProject('CAG-1', 'CAG')), keyOf)!
    expect(groups.map((g) => g.projectKey)).toEqual(['CAG', UNKNOWN_PROJECT])
    expect(groups[1]!.rows.map(keyOf)).toEqual(['X-9'])
    // Tổng cộng lại đúng bằng tổng đầu vào — không row nào bị rơi.
    expect(groups.flatMap((g) => g.rows).reduce((t, r) => t + r.total, 0)).toBe(7 * H)
  })

  it('meta có nhưng projectKey null cũng là "không biết", không throw', () => {
    const groups = groupRowsByProject(
      [row('CAG-1'), row('CAG-2')],
      asMap(inProject('CAG-1', 'CAG'), meta('CAG-2')),
      keyOf,
    )!
    expect(groups.map((g) => g.projectKey)).toEqual(['CAG', UNKNOWN_PROJECT])
  })

  it('thứ tự XÁC ĐỊNH: nhóm theo lần xuất hiện đầu, row theo thứ tự đầu vào', () => {
    const rows = [row('ABC-9'), row('CAG-1'), row('ABC-2'), row('CAG-5')]
    const metaMap = asMap(
      inProject('ABC-9', 'ABC'), inProject('ABC-2', 'ABC'),
      inProject('CAG-1', 'CAG'), inProject('CAG-5', 'CAG'),
    )
    const first = groupRowsByProject(rows, metaMap, keyOf)!
    expect(first.map((g) => g.projectKey)).toEqual(['ABC', 'CAG'])
    expect(first[0]!.rows.map(keyOf)).toEqual(['ABC-9', 'ABC-2'])
    expect(first[1]!.rows.map(keyOf)).toEqual(['CAG-1', 'CAG-5'])
    // Gọi lại cùng input cho cùng kết quả.
    expect(groupRowsByProject(rows, metaMap, keyOf)).toEqual(first)
  })
})
