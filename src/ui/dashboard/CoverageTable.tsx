// src/ui/dashboard/CoverageTable.tsx
import { Fragment, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CoverageTable as Data } from '@/core/coverage'
import { isWeekend } from '@/core/coverage'
import { cellLabel, hoursLabel } from '@/ui/shared/format'

type Props = {
  data: Data
  onCellClick: (accountId: string, date: string) => void
  onToggleDayOff: (accountId: string, date: string) => void
}

const STATUS_COLOR = { ok: '#2e7d32', under: '#ef6c00', empty: '#c62828' } as const

const th: CSSProperties = {
  position: 'sticky', top: 0, background: '#fafafa',
  borderBottom: '1px solid #cfd8dc', padding: '4px 6px', fontSize: 12, textAlign: 'right',
}
const td: CSSProperties = {
  borderBottom: '1px solid #eceff1', padding: '3px 6px', fontSize: 12, textAlign: 'right',
}

export function CoverageTable({ data, onCellClick, onToggleDayOff }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (accountId: string) => {
    const next = new Set(expanded)
    next.has(accountId) ? next.delete(accountId) : next.add(accountId)
    setExpanded(next)
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', minWidth: 200 }}>Member / Issue</th>
            {data.dates.map((d) => (
              <th key={d} style={{ ...th, background: isWeekend(d) ? '#eceff1' : '#fafafa', minWidth: 54 }}>
                {d.slice(5)}
              </th>
            ))}
            <th style={{ ...th, minWidth: 70 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <Fragment key={row.member.accountId}>
              <tr style={{ background: '#f5f7f8' }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                  <button onClick={() => toggle(row.member.accountId)}
                          style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, marginRight: 6 }}>
                    {expanded.has(row.member.accountId) ? '▾' : '▸'}
                  </button>
                  {row.member.displayName}
                  {!row.member.active && <span style={{ color: '#90a4ae' }}> (inactive)</span>}
                </td>
                {data.dates.map((d) => (
                  <td key={d} style={{ ...td, background: isWeekend(d) ? '#f5f5f5' : undefined, cursor: 'pointer' }}
                      onClick={() => onCellClick(row.member.accountId, d)}
                      onContextMenu={(e) => { e.preventDefault(); onToggleDayOff(row.member.accountId, d) }}
                      title="Click: xem chi tiết · Click phải: đánh dấu nghỉ">
                    {cellLabel(row.perDay[d] ?? 0)}
                  </td>
                ))}
                {/* Màu cảnh báo CHỈ ở đây — tô cả bảng thì cảnh báo mất tác dụng. */}
                <td style={{ ...td, fontWeight: 700, color: STATUS_COLOR[row.status] }}
                    title={`Capacity ${hoursLabel(row.capacitySeconds)}`}>
                  {hoursLabel(row.total)}
                </td>
              </tr>

              {expanded.has(row.member.accountId) && row.issues.map((issue) => (
                <tr key={`${row.member.accountId}-${issue.issueKey}`}>
                  <td style={{ ...td, textAlign: 'left', paddingLeft: 28, color: '#455a64' }}>
                    <strong>{issue.issueKey}</strong> {issue.issueSummary}
                  </td>
                  {data.dates.map((d) => (
                    <td key={d} style={{ ...td, background: isWeekend(d) ? '#f5f5f5' : undefined }}>
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
          <tr style={{ background: '#eceff1', fontWeight: 700 }}>
            <td style={{ ...td, textAlign: 'left' }}>Tổng</td>
            {data.dates.map((d) => (
              <td key={d} style={td}>{cellLabel(data.totalPerDay[d] ?? 0)}</td>
            ))}
            <td style={td}>{hoursLabel(data.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
