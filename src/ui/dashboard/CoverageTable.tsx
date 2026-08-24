// src/ui/dashboard/CoverageTable.tsx
import { Fragment, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CoverageIssueRow, CoverageRow, CoverageTable as Data } from '@/core/coverage'
import { isWeekend } from '@/core/coverage'
import type { IssueMeta, IssueMetaMap } from '@/core/issue-hierarchy'
import {
  groupIssueRowsByParent, groupRowsByProject, mergeCoverageIssueRows,
  UNKNOWN_PROJECT,
} from '@/core/issue-hierarchy'
import { StatusBadge } from '@/ui/shared/StatusBadge'
import { formatDuration } from '@/core/duration'
import { ProgressBar } from '@/ui/shared/ProgressBar'
import type { ProjectCoverage } from '@/core/coverage-by-project'
import { cellLabel, dayMonthLabel, hoursLabel } from '@/ui/shared/format'
import { colors, table as tableColors, zLayer } from '@/ui/shared/theme'
import { useLocale, useT } from '@/ui/shared/LocaleProvider'
import type { Messages } from '@/i18n'

type Props = {
  data: Data
  /** Metadata issue đi cạnh worklogs (xem core/issue-hierarchy). Rỗng là hợp lệ. */
  meta: IssueMetaMap
  /** accountId → ngày đã đánh dấu nghỉ. Chỉ để VẼ; capacity đã tính ở core. */
  daysOff: Record<string, string[]>
  /**
   * `projectKey` = nhóm project mà ô vừa bấm thuộc về, null khi bảng không gom
   * nhóm. Caller cần nó để panel chi tiết chỉ hiện worklog của project đó —
   * đúng tập số mà ô vừa cộng ra.
   */
  onCellClick: (accountId: string, date: string, projectKey: string | null) => void
  onToggleDayOff: (accountId: string, date: string) => void
  /**
   * Gom thành từng nhóm project trong CÙNG một bảng: một hàng header cho mỗi
   * project, hàng member của project đó bên dưới, và tfoot vẫn là tổng của MỌI
   * project (lấy từ `data`).
   *
   * Sau các nhóm project là nhóm "Tổng theo member": mỗi member một hàng, giờ
   * của MỌI project, và đây là chỗ duy nhất có capacity — xem `memberRow`.
   */
  groups?: ProjectCoverage[]
}

const DAY_COL_WIDTH = 58
const TOTAL_COL_WIDTH = 150

// Nền của một ô theo ngày. Cuối tuần và ngày nghỉ phải phân biệt được với ngày
// làm việc bình thường, nếu không thì "chưa log" và "không phải log" trông y nhau.
const dayCellStyle = (date: string, off: boolean): CSSProperties => ({
  background: off ? tableColors.dayOffBg : isWeekend(date) ? tableColors.bodyWeekendBg : undefined,
  minWidth: DAY_COL_WIDTH,
})

// Ba mức thụt: dòng project (chỉ có khi member log trên nhiều project), nhóm
// cha thụt như hàng issue cũ, sub-task thụt thêm một bậc. Thụt là thứ duy nhất
// diễn tả quan hệ trong một cái bảng — không có nó thì cha và con đọc ra ngang
// hàng, đúng cái khiếu nại ban đầu.
//
// INDENT_GROUP/INDENT_CHILD KHÔNG đổi khi có tầng project: một project duy nhất
// (trường hợp thường ngày) không sinh dòng project nào, nên bảng phải giống
// từng pixel với bản trước.
const INDENT_PROJECT = 14
const INDENT_GROUP = 30
const INDENT_CHILD = 46

const projectLabel = (t: Messages, projectKey: string): string =>
  projectKey === UNKNOWN_PROJECT ? t.dashboard.unknownProject : projectKey

// Một hàng issue trong phần mở rộng của member. Dùng cho cả ba loại hàng —
// issue không cha, dòng tổng của nhóm cha, sub-task — khác nhau ở thụt lề và độ
// đậm, không ở cấu trúc.
function IssueRow({
  row, dates, off, indent, meta, isGroupHeader = false, subtask = false,
  ownOfParent = false,
}: {
  row: CoverageIssueRow
  dates: string[]
  off: Set<string>
  indent: number
  meta: IssueMeta | undefined
  isGroupHeader?: boolean
  subtask?: boolean
  /**
   * Hàng con này chính là issue CHA (cha cũng được log giờ trực tiếp). Dòng
   * nhóm phía trên đã là TỔNG, nên nhắc lại key + summary + badge ở đây đọc ra
   * như dữ liệu bị lặp hai lần; chỉ ghi rõ đây là phần giờ ghi thẳng trên cha.
   */
  ownOfParent?: boolean
}) {
  const t = useT()
  return (
    <tr className="wl-row--sub">
      <th
        scope="row"
        style={{
          paddingLeft: indent,
          fontWeight: 400,
          position: 'sticky', left: 0, background: colors.bg, zIndex: zLayer.sticky,
        }}
      >
        {/* Nội dung chảy theo dòng chữ bình thường (không flex): ở viewport hẹp
            cột này phải WRAP như trước, còn flex thì cắt key giữa từ và làm
            hàng cao gấp mấy lần. Chỉ key được giữ nowrap. */}
        <strong
          style={{ whiteSpace: 'nowrap', color: isGroupHeader ? colors.text : undefined }}
        >
          {subtask ? '↳ ' : ''}{row.issueKey}
        </strong>
        {ownOfParent ? (
          <>{t.dashboard.ownOfParent}</>
        ) : (
          <>
            {meta && (
              <>
                {' '}
                <StatusBadge name={meta.statusName} category={meta.statusCategory} />
              </>
            )}
            {' '}{row.issueSummary}
          </>
        )}
      </th>
      {dates.map((d) => (
        <td key={d} className="wl-table__num" style={dayCellStyle(d, off.has(d))}>
          {cellLabel(row.perDay[d] ?? 0)}
        </td>
      ))}
      <td
        className="wl-table__num"
        style={{ fontWeight: isGroupHeader ? 600 : 400, color: isGroupHeader ? colors.text : undefined }}
      >
        {hoursLabel(row.total)}
      </td>
    </tr>
  )
}

/**
 * Dòng tiêu đề của một project: TỔNG theo từng ngày của mọi issue trong project
 * đó. Chỉ xuất hiện khi member có giờ trên NHIỀU project — quyết định đó nằm ở
 * core (groupRowsByProject trả null khi chỉ có một project).
 */
function ProjectHeaderRow({ row, dates, off, projectKey }: {
  row: CoverageIssueRow
  dates: string[]
  off: Set<string>
  projectKey: string
}) {
  const t = useT()
  return (
    <tr className="wl-row--sub">
      <th
        scope="row"
        style={{
          paddingLeft: INDENT_PROJECT,
          fontWeight: 600,
          position: 'sticky', left: 0, background: tableColors.groupRowBg, zIndex: zLayer.sticky,
        }}
      >
        <span style={{ whiteSpace: 'nowrap' }}>{projectLabel(t, projectKey)}</span>
      </th>
      {dates.map((d) => (
        <td
          key={d}
          className="wl-table__num"
          style={{ ...dayCellStyle(d, off.has(d)), fontWeight: 600 }}
        >
          {cellLabel(row.perDay[d] ?? 0)}
        </td>
      ))}
      <td className="wl-table__num" style={{ fontWeight: 600, color: colors.text }}>
        {hoursLabel(row.total)}
      </td>
    </tr>
  )
}

/**
 * Các hàng issue của MỘT member, đã gom theo cha. Tách ra hàm riêng vì nó được
 * gọi hai chỗ: trực tiếp (một project) và bên trong từng nhóm project.
 */
function parentGroupRows(
  issues: readonly CoverageIssueRow[],
  meta: IssueMetaMap,
  dates: string[],
  off: Set<string>,
  keyPrefix: string,
) {
  return groupIssueRowsByParent(issues, meta, (i) => i.issueKey).map((group) => {
    const rowKey = `${keyPrefix}-${group.key}`
    if (!group.isParent) {
      // Issue không có cha: một hàng, y như trước.
      return (
        <IssueRow
          key={rowKey} row={group.own!} dates={dates} off={off}
          indent={INDENT_GROUP} meta={meta[group.own!.issueKey]}
        />
      )
    }
    // Dòng cha = TỔNG của các con (và của chính cha nếu cha cũng có giờ). Cha
    // không có giờ riêng vẫn hiện làm tiêu đề, nếu không thì sub-task lại trông
    // như issue độc lập.
    const header = mergeCoverageIssueRows(
      group.key, group.summary,
      group.own ? [group.own, ...group.children] : group.children,
    )
    return (
      <Fragment key={rowKey}>
        <IssueRow
          row={header} dates={dates} off={off}
          indent={INDENT_GROUP} meta={meta[group.key]} isGroupHeader
        />
        {(group.own ? [group.own, ...group.children] : group.children).map((child) => (
          <IssueRow
            key={`${rowKey}-${child.issueKey}`} row={child}
            dates={dates} off={off} indent={INDENT_CHILD}
            meta={meta[child.issueKey]} subtask
            ownOfParent={child.issueKey === group.key}
          />
        ))}
      </Fragment>
    )
  })
}

/**
 * Phần mở rộng của một member: project → cha → issue.
 *
 * Quyết định "có cần tầng project không" là PER MEMBER, không phải per bảng:
 * mỗi phần mở rộng là một danh sách riêng, và member chỉ log trong một project
 * (gần như tất cả, theo số đo trên Jira thật) phải đọc ra y như trước — bọc họ
 * trong một cái nhãn "CAG" chỉ vì đồng nghiệp có một issue lạ là thêm nhiễu cho
 * người không liên quan.
 */
function memberIssueRows(
  issues: readonly CoverageIssueRow[],
  meta: IssueMetaMap,
  dates: string[],
  off: Set<string>,
  keyPrefix: string,
) {
  const byProject = groupRowsByProject(issues, meta, (i) => i.issueKey)
  if (byProject === null) return parentGroupRows(issues, meta, dates, off, keyPrefix)

  return byProject.map((pg) => (
    <Fragment key={`${keyPrefix}-p-${pg.projectKey}`}>
      <ProjectHeaderRow
        row={mergeCoverageIssueRows(pg.projectKey, '', pg.rows)}
        dates={dates} off={off} projectKey={pg.projectKey}
      />
      {parentGroupRows(pg.rows, meta, dates, off, `${keyPrefix}-${pg.projectKey}`)}
    </Fragment>
  ))
}

/**
 * Dải phân cách một NHÓM ở tầng ngoài cùng — khác `ProjectHeaderRow` (tầng
 * project BÊN TRONG phần mở rộng của một member, có thụt lề). Cái này không thụt
 * và dùng nền của tfoot, để đọc ra là dải phân cách chứ không phải một hàng dữ
 * liệu ngang hàng với member.
 *
 * `table` optional: nhóm project mang tổng của project đó, còn nhóm "Tổng theo
 * member" thì KHÔNG — số của nó trùng y hệt tfoot ngay bên dưới, in hai lần chỉ
 * làm người đọc phải kiểm tra xem hai dòng có khác nhau không.
 */
function GroupHeaderRow({ label, table, dates }: {
  label: string
  table?: Data
  dates: string[]
}) {
  return (
    <tr>
      <th
        scope="row"
        style={{
          position: 'sticky', left: 0, zIndex: zLayer.sticky,
          background: tableColors.footerBg,
          fontWeight: 700, letterSpacing: '.02em',
        }}
      >
        {label}
      </th>
      {dates.map((d) => (
        <td
          key={d}
          className="wl-table__num"
          style={{
            background: isWeekend(d) ? tableColors.footerWeekendBg : tableColors.footerBg,
            fontWeight: 700,
            minWidth: DAY_COL_WIDTH,
          }}
        >
          {table === undefined ? '' : cellLabel(table.totalPerDay[d] ?? 0)}
        </td>
      ))}
      <td
        className="wl-table__num"
        style={{
          background: tableColors.footerBg, fontWeight: 700,
          width: TOTAL_COL_WIDTH, minWidth: TOTAL_COL_WIDTH,
        }}
      >
        {table === undefined ? '' : hoursLabel(table.grandTotal)}
      </td>
    </tr>
  )
}

export function CoverageTable({
  data, meta, daysOff, onCellClick, onToggleDayOff, groups,
}: Props) {
  // Khoá mở rộng phải mang cả project: cùng một member xuất hiện trong nhiều
  // nhóm, khoá chỉ theo accountId sẽ mở/đóng đồng thời ở mọi nhóm.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const t = useT()
  const locale = useLocale()


  // Khoảng ngày có phần chưa xảy ra → nói rõ thanh đang đo tới hôm nay. Khoảng
  // nằm hoàn toàn trong quá khứ thì hai con số bằng nhau, thêm chữ chỉ gây nhiễu.
  const cutToToday = data.capacityToDateSeconds !== data.capacityFullRangeSeconds

  const toggle = (key: string) => {
    const next = new Set(expanded)
    next.has(key) ? next.delete(key) : next.add(key)
    setExpanded(next)
  }

  const memberRow = (row: CoverageRow, projectKey: string | null) => {
    const off = new Set(daysOff[row.member.accountId] ?? [])
    // Khoá mang cả project: cùng một member có mặt ở nhiều nhóm.
    const rowKey = projectKey === null
      ? row.member.accountId
      : `${projectKey}#${row.member.accountId}`
    const isOpen = expanded.has(rowKey)
    // Capacity chỉ có nghĩa khi hàng này phủ TOÀN BỘ dữ liệu đang xem.
    // `hoursPerDay` là 8h/ngày cho cả ngày làm việc, không phải 8h cho mỗi
    // project — nên hàng trong một nhóm project chỉ hiện giờ trần.
    const withCapacity = projectKey === null
    return (
      <Fragment key={rowKey}>
        <tr>
          <th scope="row" style={{ position: 'sticky', left: 0, background: tableColors.groupRowBg, zIndex: zLayer.sticky }}>
            <button
              type="button"
              className="wl-btn wl-btn--ghost wl-btn--sm"
              onClick={() => toggle(rowKey)}
              aria-expanded={isOpen}
              aria-label={isOpen ? t.dashboard.collapse(row.member.displayName) : t.dashboard.expand(row.member.displayName)}
              style={{ marginRight: 4, padding: '0 4px' }}
            >
              {isOpen ? '▾' : '▸'}
            </button>
            {row.member.displayName}
            {!row.member.active && <span style={{ color: colors.muted }}> (inactive)</span>}
          </th>

          {data.dates.map((d) => {
            const seconds = row.perDay[d] ?? 0
            const isOff = off.has(d)
            return (
              <td key={d} style={dayCellStyle(d, isOff)}>
                {/* <button> thật, không phải <td onClick>: bàn phím tới
                    được và screen reader đọc ra là control. Click phải
                    vẫn là lối tắt đánh dấu nghỉ, nhưng đường bàn phím
                    tương đương nằm trong panel chi tiết. */}
                <button
                  type="button"
                  className={seconds === 0 ? 'wl-cell wl-cell--empty' : 'wl-cell'}
                  onClick={() => onCellClick(row.member.accountId, d, projectKey)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onToggleDayOff(row.member.accountId, d)
                  }}
                  aria-label={t.dashboard.cellAria(
                    row.member.displayName,
                    dayMonthLabel(locale, d),
                    seconds === 0 ? t.dashboard.notLoggedYet : formatDuration(seconds),
                    isOff,
                  )}
                  title={t.dashboard.cellTitle(isOff)}
                >
                  {isOff && seconds === 0 ? t.dashboard.dayOffShort : cellLabel(seconds)}
                </button>
              </td>
            )
          })}

          {/* Tín hiệu TỈ LỆ, không phải cờ nhị phân. Bản cũ tô cam cả bốn
              member vì giữa sprint ai cũng dưới capacity, nên "hơi chậm"
              và "chưa log gì" trông y như nhau.
              Mốc là capacity TỚI HÔM NAY — so với capacity cả kỳ thì
              giữa sprint thanh nào cũng gần rỗng, cũng mất nghĩa y vậy. */}
          <td
            className={withCapacity ? undefined : 'wl-table__num'}
            style={{
              width: TOTAL_COL_WIDTH, minWidth: TOTAL_COL_WIDTH,
              ...(withCapacity ? {} : { fontWeight: 600 }),
            }}
          >
            {withCapacity ? (
              <ProgressBar
                value={row.total}
                max={row.capacityToDateSeconds}
                height={4}
                valueText={`${hoursLabel(row.total)} / ${hoursLabel(row.capacityToDateSeconds)}`}
                label={t.dashboard.memberProgress(
                  row.member.displayName,
                  hoursLabel(row.total),
                  hoursLabel(row.capacityToDateSeconds),
                  cutToToday ? t.dashboard.toDateSuffix : '',
                  hoursLabel(row.capacityFullRangeSeconds),
                )}
              />
            ) : (
              hoursLabel(row.total)
            )}
          </td>
        </tr>

        {/* Hàng issue được GOM theo project rồi theo cha. Cả hai quyết
            định (có cần tầng project không, nhóm cha nào) nằm ở core;
            component chỉ vẽ. */}
        {isOpen && memberIssueRows(
          row.issues, meta, data.dates, off, rowKey,
        )}
      </Fragment>
    )
  }

  return (
    <div className="wl-table-scroll">
      <table className="wl-table">
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {t.dashboard.tableCaption}
        </caption>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'left', minWidth: 190, position: 'sticky', left: 0, zIndex: zLayer.stickyCorner }}>
              {t.dashboard.memberIssue}
            </th>
            {data.dates.map((d) => (
              <th
                key={d}
                scope="col"
                style={{
                  background: isWeekend(d) ? tableColors.headerWeekendBg : undefined,
                  minWidth: DAY_COL_WIDTH,
                }}
              >
                {dayMonthLabel(locale, d)}
              </th>
            ))}
            <th scope="col" style={{ width: TOTAL_COL_WIDTH, minWidth: TOTAL_COL_WIDTH }}>
              {cutToToday ? t.dashboard.totalToDate : t.dashboard.totalCapacity}
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Hai chế độ, MỘT hàm render hàng member: gom nhóm project chỉ đổi
              tập hàng và khoá mở rộng, không đổi cách vẽ một hàng. */}
          {groups === undefined
            ? data.rows.map((row) => memberRow(row, null))
            : (
                <>
                  {groups.map((g) => (
                    <Fragment key={`g-${g.projectKey}`}>
                      <GroupHeaderRow
                        label={projectLabel(t, g.projectKey)}
                        table={g.table}
                        dates={data.dates}
                      />
                      {g.table.rows.map((row) => memberRow(row, g.projectKey))}
                    </Fragment>
                  ))}
                  {/* Nhóm cuối: mỗi member MỘT hàng, giờ của mọi project cộng
                      lại. Đây là câu hỏi chính của dashboard ("ai thiếu giờ"),
                      và gom theo project làm nó biến mất — một member trải trên
                      nhiều project thì không nhóm nào một mình trả lời được.
                      Chỉ nhóm này có capacity, vì chỉ hàng ở đây phủ hết dữ
                      liệu. Mở rộng vẫn xem được issue, gom theo project. */}
                  <GroupHeaderRow label={t.dashboard.totalByMember} dates={data.dates} />
                  {data.rows.map((row) => memberRow(row, null))}
                </>
              )}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" style={{ position: 'sticky', left: 0, zIndex: zLayer.sticky, background: tableColors.footerBg }}>
              {t.dashboard.totalTeam}
            </th>
            {data.dates.map((d) => (
              <td
                key={d}
                className="wl-table__num"
                style={{ background: isWeekend(d) ? tableColors.footerWeekendBg : undefined }}
              >
                {cellLabel(data.totalPerDay[d] ?? 0)}
              </td>
            ))}
            <td className="wl-table__num">{hoursLabel(data.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
