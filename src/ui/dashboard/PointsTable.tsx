import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { send, type PointsLoadResult } from '@/sw/messages'
import { buildPointsTable, type PointsTable as Data } from '@/core/points'
import { hoursLabel } from '@/ui/shared/format'
import { ErrorBanner, toUiError, type UiError } from '@/ui/shared/errors'
import { colors } from '@/ui/shared/theme'

const td: CSSProperties = {
  borderBottom: `1px solid ${colors.border}`, padding: '4px 8px', fontSize: 12, color: colors.text,
}

export function PointsPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [sprintName, setSprintName] = useState('')
  const [error, setError] = useState<UiError | null>(null)

  useEffect(() => {
    void send<PointsLoadResult>({ type: 'points/load' })
      .then((res) => { setSprintName(res.sprintName); setData(buildPointsTable(res.issues)) })
      .catch((e: unknown) => setError(toUiError(e)))
  }, [])

  if (error) return <ErrorBanner error={error} />
  if (!data) return <div>Đang tải…</div>
  if (data.rows.length === 0) return <p>Sprint hiện tại không có issue nào.</p>

  const med = data.medianHoursPerPoint

  return (
    <div>
      <p style={{ fontSize: 13 }}>
        <strong>{sprintName}</strong> · trung vị{' '}
        {med === null ? '—' : `${med.toFixed(1)} h/point`}
        {' · '}{data.noEstimate.length} issue chưa có story points
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
          <thead>
            <tr style={{ background: colors.surface }}>
              <th style={{ ...td, textAlign: 'left' }}>Issue</th>
              <th style={{ ...td, textAlign: 'left' }}>Assignee</th>
              <th style={{ ...td, textAlign: 'left' }}>Status</th>
              <th style={{ ...td, textAlign: 'right' }}>Points</th>
              <th style={{ ...td, textAlign: 'right' }}>Đã log</th>
              <th style={{ ...td, textAlign: 'right' }}>h/point</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const noPoints = r.storyPoints === null || r.storyPoints === 0
              return (
                <tr key={r.key} style={{ background: r.isOutlier ? colors.accentSoft : undefined }}>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <strong>{r.key}</strong> {r.summary}
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>{r.assigneeName ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'left' }}>{r.status}</td>
                  <td style={{ ...td, textAlign: 'right', color: noPoints ? colors.danger : undefined }}>
                    {noPoints ? 'chưa có' : r.storyPoints}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{hoursLabel(r.timeSpentSeconds)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: r.isOutlier ? 700 : 400 }}>
                    {r.hoursPerPoint === null ? '—' : r.hoursPerPoint.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
