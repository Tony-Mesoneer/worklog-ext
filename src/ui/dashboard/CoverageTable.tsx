// src/ui/dashboard/CoverageTable.tsx
import { Fragment, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CoverageTable as Data } from '@/core/coverage'
import { isWeekend } from '@/core/coverage'
import { cellLabel, hoursLabel } from '@/ui/shared/format'
import { colors, table as tableColors, statusColors } from '@/ui/shared/theme'

type Props = {
  data: Data
  onCellClick: (accountId: string, date: string) => void
  onToggleDayOff: (accountId: string, date: string) => void
}

const th: CSSProperties = {
  position: 'sticky', top: 0, background: tableColors.headerBg,
  borderBottom: `1px solid ${colors.border}`, padding: '4px 6px', fontSize: 12, textAlign: 'right',
  color: colors.text,
}
const td: CSSProperties = {
  borderBottom: `1px solid ${colors.border}`, padding: '3px 6px', fontSize: 12, textAlign: 'right',
  color: colors.text,
}

export function CoverageTable({ data, onCellClick, onToggleDayOff }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (accountId: string) => {
    const next = new Set(expanded)
    next.has(accountId) ? next.delete(accountId) : next.add(accountId)
    setExpanded(next)
  }

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${colors.border}` }}>
      <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', minWidth: 200 }}>Member / Issue</th>
            {data.dates.map((d) => (
              <th key={d} style={{ ...th, background: isWeekend(d) ? tableColors.headerWeekendBg : tableColors.headerBg, minWidth: 54 }}>
                {d.slice(5)}
              </th>
            ))}
            <th style={{ ...th, minWidth: 70 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <Fragment key={row.member.accountId}>
              <tr style={{ background: tableColors.groupRowBg }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                  <button onClick={() => toggle(row.member.accountId)}
                          style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, marginRight: 6 }}>
                    {expanded.has(row.member.accountId) ? '▾' : '▸'}
                  </button>
                  {row.member.displayName}
                  {!row.member.active && <span style={{ color: colors.muted }}> (inactive)</span>}
                </td>
                {data.dates.map((d) => (
                  <td key={d} style={{ ...td, background: isWeekend(d) ? tableColors.bodyWeekendBg : undefined, cursor: 'pointer' }}
                      onClick={() => onCellClick(row.member.accountId, d)}
                      onContextMenu={(e) => { e.preventDefault(); onToggleDayOff(row.member.accountId, d) }}
                      title="Click: xem chi tiết · Click phải: đánh dấu nghỉ">
                    {cellLabel(row.perDay[d] ?? 0)}
                  </td>
                ))}
                {/* Màu cảnh báo CHỈ ở đây — tô cả bảng thì cảnh báo mất tác dụng. */}
                <td style={{ ...td, fontWeight: 700, color: statusColors[row.status] }}
                    title={`Capacity ${hoursLabel(row.capacitySeconds)}`}>
                  {hoursLabel(row.total)}
                </td>
              </tr>

              {expanded.has(row.member.accountId) && row.issues.map((issue) => (
                <tr key={`${row.member.accountId}-${issue.issueKey}`}>
                  <td style={{ ...td, textAlign: 'left', paddingLeft: 28, color: colors.muted }}>
                    <strong>{issue.issueKey}</strong> {issue.issueSummary}
                  </td>
                  {data.dates.map((d) => (
                    <td key={d} style={{ ...td, background: isWeekend(d) ? tableColors.bodyWeekendBg : undefined }}>
                      {cellLabel(issue.perDay[d] ?? 0)}
                    </td>
                  ))}
                  <td style={td}>{hoursLabel(issue.total)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: tableColors.footerBg, fontWeight: 700 }}>
            <td style={{ ...td, textAlign: 'left' }}>Tổng</td>
            {data.dates.map((d) => (
              <td key={d} style={{ ...td, background: isWeekend(d) ? tableColors.footerWeekendBg : undefined }}>
                {cellLabel(data.totalPerDay[d] ?? 0)}
              </td>
            ))}
            <td style={td}>{hoursLabel(data.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
