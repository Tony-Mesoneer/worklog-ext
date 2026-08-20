// src/ui/dashboard/CoverageTable.tsx
import { Fragment, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CoverageIssueRow, CoverageTable as Data } from '@/core/coverage'
import { isWeekend } from '@/core/coverage'
import type { IssueMeta, IssueMetaMap } from '@/core/issue-hierarchy'
import { groupIssueRowsByParent, mergeCoverageIssueRows } from '@/core/issue-hierarchy'
import { StatusBadge } from '@/ui/shared/StatusBadge'
import { formatDuration } from '@/core/duration'
import { ProgressBar } from '@/ui/shared/ProgressBar'
import { cellLabel, dayMonthLabel, hoursLabel } from '@/ui/shared/format'
import { colors, table as tableColors } from '@/ui/shared/theme'

type Props = {
  data: Data
  /** Metadata issue đi cạnh worklogs (xem core/issue-hierarchy). Rỗng là hợp lệ. */
  meta: IssueMetaMap
  /** accountId → ngày đã đánh dấu nghỉ. Chỉ để VẼ; capacity đã tính ở core. */
  daysOff: Record<string, string[]>
  onCellClick: (accountId: string, date: string) => void
  onToggleDayOff: (accountId: string, date: string) => void
}

const DAY_COL_WIDTH = 58
const TOTAL_COL_WIDTH = 150

// Nền của một ô theo ngày. Cuối tuần và ngày nghỉ phải phân biệt được với ngày
// làm việc bình thường, nếu không thì "chưa log" và "không phải log" trông y nhau.
const dayCellStyle = (date: string, off: boolean): CSSProperties => ({
  background: off ? tableColors.dayOffBg : isWeekend(date) ? tableColors.bodyWeekendBg : undefined,
  minWidth: DAY_COL_WIDTH,
})

// Hai mức thụt của hàng con: nhóm cha thụt như hàng issue cũ, sub-task thụt
// thêm một bậc. Thụt là thứ duy nhất diễn tả quan hệ trong một cái bảng — không
// có nó thì cha và con đọc ra ngang hàng, đúng cái khiếu nại ban đầu.
const INDENT_GROUP = 30
const INDENT_CHILD = 46

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
  return (
    <tr className="wl-row--sub">
      <th
        scope="row"
        style={{
          paddingLeft: indent,
          fontWeight: 400,
          position: 'sticky', left: 0, background: colors.bg, zIndex: 1,
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
          <> giờ ghi trực tiếp trên issue cha</>
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

export function CoverageTable({ data, meta, daysOff, onCellClick, onToggleDayOff }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Khoảng ngày có phần chưa xảy ra → nói rõ thanh đang đo tới hôm nay. Khoảng
  // nằm hoàn toàn trong quá khứ thì hai con số bằng nhau, thêm chữ chỉ gây nhiễu.
  const cutToToday = data.capacityToDateSeconds !== data.capacityFullRangeSeconds

  const toggle = (accountId: string) => {
    const next = new Set(expanded)
    next.has(accountId) ? next.delete(accountId) : next.add(accountId)
    setExpanded(next)
  }

  return (
    <div className="wl-table-scroll">
      <table className="wl-table">
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Giờ đã log của từng member theo ngày. Mỗi ô là một nút: Enter mở chi
          tiết worklog của ngày đó, trong đó có nút đánh dấu ngày nghỉ.
        </caption>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'left', minWidth: 190, position: 'sticky', left: 0, zIndex: 2 }}>
              Member / Issue
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
                {dayMonthLabel(d)}
              </th>
            ))}
            <th scope="col" style={{ width: TOTAL_COL_WIDTH, minWidth: TOTAL_COL_WIDTH }}>
              {cutToToday ? 'Tổng / tới hôm nay' : 'Tổng / capacity'}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const off = new Set(daysOff[row.member.accountId] ?? [])
            const isOpen = expanded.has(row.member.accountId)
            return (
              <Fragment key={row.member.accountId}>
                <tr>
                  <th scope="row" style={{ position: 'sticky', left: 0, background: tableColors.groupRowBg, zIndex: 1 }}>
                    <button
                      type="button"
                      className="wl-btn wl-btn--ghost wl-btn--sm"
                      onClick={() => toggle(row.member.accountId)}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Thu gọn' : 'Mở rộng'} issue của ${row.member.displayName}`}
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
                          onClick={() => onCellClick(row.member.accountId, d)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            onToggleDayOff(row.member.accountId, d)
                          }}
                          aria-label={
                            `${row.member.displayName}, ${dayMonthLabel(d)}: `
                            + `${seconds === 0 ? 'chưa log giờ' : formatDuration(seconds)}`
                            + `${isOff ? ', đã đánh dấu nghỉ' : ''}`
                          }
                          title={
                            `${isOff ? 'Ngày nghỉ · ' : ''}Bấm: xem chi tiết `
                            + '· Bấm phải: đánh dấu nghỉ'
                          }
                        >
                          {isOff && seconds === 0 ? 'off' : cellLabel(seconds)}
                        </button>
                      </td>
                    )
                  })}

                  {/* Tín hiệu TỈ LỆ, không phải cờ nhị phân. Bản cũ tô cam cả bốn
                      member vì giữa sprint ai cũng dưới capacity, nên "hơi chậm"
                      và "chưa log gì" trông y như nhau.
                      Mốc là capacity TỚI HÔM NAY — so với capacity cả kỳ thì
                      giữa sprint thanh nào cũng gần rỗng, cũng mất nghĩa y vậy. */}
                  <td style={{ width: TOTAL_COL_WIDTH, minWidth: TOTAL_COL_WIDTH }}>
                    <ProgressBar
                      value={row.total}
                      max={row.capacityToDateSeconds}
                      height={4}
                      valueText={`${hoursLabel(row.total)} / ${hoursLabel(row.capacityToDateSeconds)}`}
                      label={
                        `${row.member.displayName}: đã log ${hoursLabel(row.total)} `
                        + `trên capacity ${hoursLabel(row.capacityToDateSeconds)}`
                        + `${cutToToday ? ' tới hôm nay' : ''}`
                        + `, cả kỳ ${hoursLabel(row.capacityFullRangeSeconds)}`
                      }
                    />
                  </td>
                </tr>

                {/* Hàng issue được GOM theo cha. Nhóm và thứ tự do core quyết
                    định (groupIssueRowsByParent), component chỉ vẽ. */}
                {isOpen && groupIssueRowsByParent(
                  row.issues, meta, (i) => i.issueKey,
                ).map((group) => {
                  const rowKey = `${row.member.accountId}-${group.key}`
                  if (!group.isParent) {
                    // Issue không có cha: một hàng, y như trước.
                    return (
                      <IssueRow
                        key={rowKey} row={group.own!} dates={data.dates} off={off}
                        indent={INDENT_GROUP} meta={meta[group.own!.issueKey]}
                      />
                    )
                  }
                  // Dòng cha = TỔNG của các con (và của chính cha nếu cha cũng
                  // có giờ). Cha không có giờ riêng vẫn hiện làm tiêu đề, nếu
                  // không thì sub-task lại trông như issue độc lập.
                  const header = mergeCoverageIssueRows(
                    group.key, group.summary,
                    group.own ? [group.own, ...group.children] : group.children,
                  )
                  return (
                    <Fragment key={rowKey}>
                      <IssueRow
                        row={header} dates={data.dates} off={off}
                        indent={INDENT_GROUP} meta={meta[group.key]} isGroupHeader
                      />
                      {(group.own ? [group.own, ...group.children] : group.children).map((child) => (
                        <IssueRow
                          key={`${rowKey}-${child.issueKey}`} row={child}
                          dates={data.dates} off={off} indent={INDENT_CHILD}
                          meta={meta[child.issueKey]} subtask
                          ownOfParent={child.issueKey === group.key}
                        />
                      ))}
                    </Fragment>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" style={{ position: 'sticky', left: 0, zIndex: 1, background: tableColors.footerBg }}>
              Tổng cả team
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
