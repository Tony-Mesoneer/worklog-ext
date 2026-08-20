import { addDays } from './jiraTime'

export type Worklog = {
  id: string
  issueKey: string
  issueSummary: string
  authorAccountId: string
  date: string           // "YYYY-MM-DD" theo wall-clock của worklog
  startMinutes: number
  timeSpentSeconds: number
  comment: string
}

export type Member = {
  accountId: string
  displayName: string
  hoursPerDay: number
  active: boolean
}

export type CoverageIssueRow = {
  issueKey: string
  issueSummary: string
  perDay: Record<string, number>
  total: number
}

export type CoverageRow = {
  member: Member
  perDay: Record<string, number>
  total: number
  capacitySeconds: number
  status: 'ok' | 'under' | 'empty'
  issues: CoverageIssueRow[]
}

export type CoverageTable = {
  dates: string[]
  rows: CoverageRow[]
  totalPerDay: Record<string, number>
  grandTotal: number
}

export function enumerateDates(from: string, to: string): string[] {
  const out: string[] = []
  let d = from
  // Chuỗi YYYY-MM-DD so sánh từ điển đúng bằng so sánh thời gian.
  while (d <= to) {
    out.push(d)
    d = addDays(d, 1)
  }
  return out
}

export function isWeekend(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 || day === 6
}

export function buildCoverage(args: {
  worklogs: Worklog[]
  members: Member[]
  dates: string[]
  daysOff: Record<string, string[]>
}): CoverageTable {
  const { worklogs, members, dates, daysOff } = args
  const dateSet = new Set(dates)
  const zeros = (): Record<string, number> =>
    Object.fromEntries(dates.map((d) => [d, 0]))

  const totalPerDay = zeros()
  let grandTotal = 0

  const rows: CoverageRow[] = members.map((m) => {
    const perDay = zeros()
    const issueMap = new Map<string, CoverageIssueRow>()
    let total = 0

    for (const w of worklogs) {
      if (w.authorAccountId !== m.accountId) continue
      if (!dateSet.has(w.date)) continue

      perDay[w.date] = (perDay[w.date] ?? 0) + w.timeSpentSeconds
      total += w.timeSpentSeconds
      totalPerDay[w.date] = (totalPerDay[w.date] ?? 0) + w.timeSpentSeconds
      grandTotal += w.timeSpentSeconds

      let issue = issueMap.get(w.issueKey)
      if (!issue) {
        issue = {
          issueKey: w.issueKey,
          issueSummary: w.issueSummary,
          perDay: zeros(),
          total: 0,
        }
        issueMap.set(w.issueKey, issue)
      }
      issue.perDay[w.date] = (issue.perDay[w.date] ?? 0) + w.timeSpentSeconds
      issue.total += w.timeSpentSeconds
    }

    // Member inactive không có capacity: họ đã rời team, báo đỏ là nhiễu.
    const off = new Set(daysOff[m.accountId] ?? [])
    const workingDays = m.active
      ? dates.filter((d) => !isWeekend(d) && !off.has(d)).length
      : 0
    const capacitySeconds = workingDays * m.hoursPerDay * 3600

    const status: CoverageRow['status'] =
      total === 0 ? 'empty' : total < capacitySeconds ? 'under' : 'ok'

    return {
      member: m,
      perDay,
      total,
      capacitySeconds,
      status,
      issues: [...issueMap.values()].sort((a, b) => b.total - a.total),
    }
  })

  return { dates, rows, totalPerDay, grandTotal }
}
