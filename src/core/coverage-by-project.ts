// src/core/coverage-by-project.ts
//
// Tách bảng coverage thành từng project, cho dashboard vẽ mỗi project một card
// rồi một card tổng ở cuối.
//
// Vì sao cần: coverage query không lọc theo project (xem fetchWorklogs), nên khi
// bộ lọc để "tất cả" thì mọi project cộng chung vào một con số. Với team làm
// nhiều project, con số đó không trả lời được câu hỏi thật — "tuần này ai đổ
// giờ vào project nào".
//
// CAPACITY KHÔNG CHIA ĐƯỢC THEO PROJECT. `hoursPerDay` của một member là 8h/ngày
// cho cả ngày làm việc, không phải 8h cho MỖI project. Mọi cách chia đều là bịa:
// pro-rate theo giờ đã log cho ra tỉ lệ ~100% ở mọi nhóm (mẫu số suy ra từ tử
// số), chia đều cho số project thì ai dồn giờ vào một project sẽ bị báo thiếu ở
// project kia. Nên `CoverageTable` của mỗi nhóm VẪN mang capacity mà
// buildCoverage tính (đó là capacity thật của member trong khoảng ngày, không
// phải của project) — và UI chỉ hiển thị nó ở nhóm "Tổng theo member", nơi một
// hàng phủ hết mọi project.
import { buildCoverage, type CoverageTable, type Member, type Worklog } from './coverage'
import { UNKNOWN_PROJECT, type IssueMetaMap } from './issue-hierarchy'

export type ProjectCoverage = {
  /** Project key từ Jira, hoặc `UNKNOWN_PROJECT` khi meta không có. */
  projectKey: string
  table: CoverageTable
}

const projectOf = (issueKey: string, meta: IssueMetaMap): string =>
  meta[issueKey]?.projectKey ?? UNKNOWN_PROJECT

/**
 * `null` = "không cần tách": đúng một project, hoặc không có worklog nào. Cùng
 * quy ước với groupRowsByProject, nên UI chỉ có một nhánh điều kiện và trường
 * hợp thường ngày (một project) vẽ y như trước.
 *
 * Mỗi nhóm gọi lại `buildCoverage` trên đúng worklog của project đó, với cùng
 * members/dates/daysOff/today — không nhân bản một dòng logic tính toán nào.
 *
 * Member không có giờ trong một project thì bị loại khỏi nhóm đó: card liệt kê
 * cả team với toàn số 0 không đọc được, và "ai làm project này" là chính thông
 * tin mà việc tách nhóm phải trả lời.
 */
export function buildCoverageByProject(args: {
  worklogs: Worklog[]
  members: Member[]
  dates: string[]
  daysOff: Record<string, string[]>
  meta: IssueMetaMap
  today?: string
}): ProjectCoverage[] | null {
  const { worklogs, members, dates, daysOff, meta, today } = args

  const byProject = new Map<string, Worklog[]>()
  for (const w of worklogs) {
    const p = projectOf(w.issueKey, meta)
    const list = byProject.get(p)
    if (list) list.push(w)
    else byProject.set(p, [w])
  }
  if (byProject.size <= 1) return null

  const groups: ProjectCoverage[] = []
  for (const [projectKey, list] of byProject) {
    // Chỉ member CÓ giờ trong project này. Lọc trước khi gọi buildCoverage, để
    // `rows` của bảng không chứa hàng rỗng nào ngay từ đầu.
    const authors = new Set(list.map((w) => w.authorAccountId))
    groups.push({
      projectKey,
      table: buildCoverage({
        worklogs: list,
        members: members.filter((m) => authors.has(m.accountId)),
        dates,
        daysOff,
        ...(today === undefined ? {} : { today }),
      }),
    })
  }

  // Nhiều giờ nhất lên trước — card đầu tiên là project đang chiếm phần lớn
  // thời gian của team. Bằng nhau thì theo key để thứ tự luôn xác định (Map
  // giữ thứ tự chèn, tức thứ tự worklog đầu vào — không phải thứ tự để đọc).
  // Nhóm "không rõ project" luôn xuống cuối bất kể giờ: nó là dữ liệu thiếu
  // meta, không phải một project để so sánh.
  return groups.sort((x, y) => {
    if (x.projectKey === UNKNOWN_PROJECT) return 1
    if (y.projectKey === UNKNOWN_PROJECT) return -1
    return y.table.grandTotal - x.table.grandTotal
      || x.projectKey.localeCompare(y.projectKey)
  })
}
