import { describe, it, expect } from 'vitest'
import { median, buildPointsTable, type SprintIssue } from '@/core/points'

const issue = (
  key: string, storyPoints: number | null, hours: number,
): SprintIssue => ({
  key, summary: `Summary ${key}`, assigneeName: 'User', status: 'In Progress',
  storyPoints, timeSpentSeconds: hours * 3600,
})

describe('median', () => {
  it('số lượng lẻ', () => expect(median([3, 1, 2])).toBe(2))
  it('số lượng chẵn lấy trung bình hai giá trị giữa', () => expect(median([1, 2, 3, 4])).toBe(2.5))
  it('một phần tử', () => expect(median([5])).toBe(5))
  it('mảng rỗng trả null', () => expect(median([])).toBeNull())
})

describe('buildPointsTable', () => {
  it('tính h/point', () => {
    const t = buildPointsTable([issue('CAG-1', 2, 10)])
    expect(t.rows[0]!.hoursPerPoint).toBe(5)
  })

  it('issue không có story points vào noEstimate và h/point là null', () => {
    const t = buildPointsTable([issue('CAG-1', null, 8), issue('CAG-2', 0, 8)])
    expect(t.noEstimate.map((r) => r.key)).toEqual(['CAG-1', 'CAG-2'])
    expect(t.rows.every((r) => r.hoursPerPoint === null)).toBe(true)
  })

  it('issue có points nhưng chưa log giờ: h/point null, KHÔNG vào noEstimate', () => {
    // Chưa log giờ khác hẳn chưa estimate — trộn hai cái là mất tín hiệu.
    const t = buildPointsTable([issue('CAG-1', 3, 0)])
    expect(t.rows[0]!.hoursPerPoint).toBeNull()
    expect(t.noEstimate).toHaveLength(0)
  })

  it('median chỉ tính trên issue có h/point', () => {
    const t = buildPointsTable([
      issue('CAG-1', 1, 2),   // 2
      issue('CAG-2', 1, 4),   // 4
      issue('CAG-3', null, 9),// bỏ qua
      issue('CAG-4', 2, 0),   // bỏ qua (chưa log giờ)
    ])
    expect(t.medianHoursPerPoint).toBe(3)
  })

  it('median null khi không có issue nào tính được', () => {
    expect(buildPointsTable([issue('CAG-1', null, 8)]).medianHoursPerPoint).toBeNull()
  })

  it('đánh dấu outlier khi vượt 2× median', () => {
    const t = buildPointsTable([
      issue('CAG-1', 1, 2),   // 2
      issue('CAG-2', 1, 2),   // 2  → median 2
      issue('CAG-3', 1, 10),  // 10 > 4 → outlier
    ])
    const byKey = Object.fromEntries(t.rows.map((r) => [r.key, r]))
    expect(byKey['CAG-3']!.isOutlier).toBe(true)
    expect(byKey['CAG-1']!.isOutlier).toBe(false)
  })

  it('sort h/point giảm dần, null xuống cuối', () => {
    const t = buildPointsTable([
      issue('CAG-1', 1, 2),
      issue('CAG-2', null, 5),
      issue('CAG-3', 1, 8),
    ])
    expect(t.rows.map((r) => r.key)).toEqual(['CAG-3', 'CAG-1', 'CAG-2'])
  })

  it('mảng rỗng cho bảng rỗng, không ném lỗi', () => {
    const t = buildPointsTable([])
    expect(t.rows).toEqual([])
    expect(t.noEstimate).toEqual([])
    expect(t.medianHoursPerPoint).toBeNull()
  })
})
