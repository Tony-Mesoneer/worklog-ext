export type SprintIssue = {
  key: string
  summary: string
  assigneeName: string | null
  status: string
  storyPoints: number | null
  timeSpentSeconds: number
}

export type PointsRow = SprintIssue & {
  hoursPerPoint: number | null
  isOutlier: boolean
}

export type PointsTable = {
  rows: PointsRow[]
  noEstimate: PointsRow[]
  medianHoursPerPoint: number | null
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]!
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}

const OUTLIER_FACTOR = 2

export function buildPointsTable(issues: SprintIssue[]): PointsTable {
  const withRatio = issues.map((i) => {
    const points = i.storyPoints
    // Chỉ tính khi CÓ points VÀ ĐÃ log giờ. Hai điều kiện này khác nhau và
    // được phân biệt có chủ ý: chưa estimate ≠ chưa làm.
    const hoursPerPoint =
      points !== null && points > 0 && i.timeSpentSeconds > 0
        ? i.timeSpentSeconds / 3600 / points
        : null
    return { ...i, hoursPerPoint, isOutlier: false }
  })

  const med = median(
    withRatio.map((r) => r.hoursPerPoint).filter((v): v is number => v !== null),
  )

  const rows = withRatio
    .map((r) => ({
      ...r,
      isOutlier:
        med !== null && r.hoursPerPoint !== null &&
        r.hoursPerPoint > med * OUTLIER_FACTOR,
    }))
    .sort((a, b) => {
      if (a.hoursPerPoint === null && b.hoursPerPoint === null) return 0
      if (a.hoursPerPoint === null) return 1
      if (b.hoursPerPoint === null) return -1
      return b.hoursPerPoint - a.hoursPerPoint
    })

  const noEstimate = rows.filter(
    (r) => r.storyPoints === null || r.storyPoints === 0,
  )

  return { rows, noEstimate, medianHoursPerPoint: med }
}
