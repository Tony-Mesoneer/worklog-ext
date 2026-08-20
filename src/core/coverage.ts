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
  /**
   * Capacity của những ngày làm việc ĐÃ XẢY RA (tính tới hết `today`). Đây là
   * mốc duy nhất mà `status` và thanh tiến độ được so vào — hỏi "đã log đủ
   * phần việc đến giờ chưa", không phải "đã log đủ cả sprint chưa".
   */
  capacityToDateSeconds: number
  /**
   * Capacity của TOÀN khoảng ngày, kể cả ngày chưa tới. Chỉ để hiển thị bối
   * cảnh ("… · 276h cả sprint") — không bao giờ dùng để phán ai thiếu giờ.
   */
  capacityFullRangeSeconds: number
  /**
   * @deprecated Bí danh của `capacityToDateSeconds`, chỉ còn để caller cũ
   * không vỡ. Code mới phải chọn rõ một trong hai field ở trên: đọc
   * `capacitySeconds` là tự nhận không biết mình đang đo tới hôm nay hay cả kỳ.
   */
  capacitySeconds: number
  status: 'ok' | 'under' | 'empty'
  issues: CoverageIssueRow[]
}

export type CoverageTable = {
  dates: string[]
  rows: CoverageRow[]
  totalPerDay: Record<string, number>
  grandTotal: number
  /** `today` mà caller truyền vào, hoặc null nếu không cắt theo hôm nay. */
  today: string | null
  /** Những ngày trong `dates` đã xảy ra (<= today). Bằng `dates` khi today=null. */
  datesToDate: string[]
  /** Tổng `capacityToDateSeconds` của mọi member — mốc của hàng tóm tắt. */
  capacityToDateSeconds: number
  /** Tổng `capacityFullRangeSeconds` của mọi member — chỉ để hiển thị. */
  capacityFullRangeSeconds: number
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
  /**
   * "YYYY-MM-DD" hôm nay theo timezone của profile Jira. Tuỳ chọn: khi thiếu,
   * mọi ngày trong khoảng được coi là đã xảy ra — tức hành vi y như trước.
   * Core KHÔNG tự biết hôm nay là ngày nào (giữ src/core thuần và test được);
   * ngày là input, và caller phải lấy nó từ timezone Jira chứ không phải của
   * browser, nếu không lead ở múi giờ khác sẽ thấy số của ngày hôm qua.
   */
  today?: string
}): CoverageTable {
  const { worklogs, members, dates, daysOff, today } = args
  // Chuỗi YYYY-MM-DD so sánh từ điển đúng bằng so sánh thời gian.
  // today ngoài khoảng vẫn đúng: trước khoảng → rỗng, sau khoảng → cả khoảng.
  const datesToDate = today === undefined ? dates : dates.filter((d) => d <= today)
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
    // Cuối tuần và ngày nghỉ của CHÍNH member đó bị loại trước, rồi mới cắt
    // theo hôm nay — nên hôm nay là T7/CN hay ngày nghỉ của người này thì nó
    // đơn giản không nằm trong tập đếm, không cần trường hợp riêng.
    const workingDay = (d: string): boolean => !isWeekend(d) && !off.has(d)
    const perDaySeconds = m.hoursPerDay * 3600
    const capacityFullRangeSeconds = m.active
      ? dates.filter(workingDay).length * perDaySeconds
      : 0
    const capacityToDateSeconds = m.active
      ? datesToDate.filter(workingDay).length * perDaySeconds
      : 0

    // status so vào capacity TỚI HÔM NAY.
    //
    // capacityToDate = 0 (khoảng nằm hoàn toàn ở tương lai, hoặc member
    // inactive) thì `total < capacity` luôn false → không ai bị 'under'. Đúng
    // ý: chưa tới ngày nào thì chưa có gì để log, báo thiếu là báo sai.
    //
    // Chưa log gì vẫn là 'empty' — kể cả khi capacity = 0. 'empty' là một SỰ
    // KIỆN ("ô này trống"), không phải một cảnh báo; consumer nào muốn cảnh
    // báo thì phải tự lọc thêm capacityToDateSeconds > 0. Giữ vậy để hàng
    // member inactive không đổi nghĩa.
    //
    // Log giờ trong khi capacityToDate = 0 (làm vào ngày nghỉ) → 'ok': không
    // trừ ra số âm, không tạo tỉ lệ > 100% để rồi đọc như lỗi.
    const status: CoverageRow['status'] =
      total === 0 ? 'empty' : total < capacityToDateSeconds ? 'under' : 'ok'

    return {
      member: m,
      perDay,
      total,
      capacityToDateSeconds,
      capacityFullRangeSeconds,
      capacitySeconds: capacityToDateSeconds,
      status,
      issues: [...issueMap.values()].sort((a, b) => b.total - a.total),
    }
  })

  return {
    dates,
    rows,
    totalPerDay,
    grandTotal,
    today: today ?? null,
    datesToDate,
    capacityToDateSeconds: rows.reduce((s, r) => s + r.capacityToDateSeconds, 0),
    capacityFullRangeSeconds: rows.reduce((s, r) => s + r.capacityFullRangeSeconds, 0),
  }
}
