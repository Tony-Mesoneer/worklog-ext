import { useEffect, useState } from 'react'
import { send, type PointsLoadResult } from '@/sw/messages'
import { buildPointsTable, type PointsTable as Data } from '@/core/points'
import { Card } from '@/ui/shared/Card'
import { hoursLabel } from '@/ui/shared/format'
import { ErrorBanner, toUiError, type UiError } from '@/ui/shared/errors'
import { colors, fontSize, space } from '@/ui/shared/theme'

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
  if (!data) {
    return <Card><p style={{ margin: 0, color: colors.muted }}>Đang tải…</p></Card>
  }
  if (data.rows.length === 0) {
    return <Card><p style={{ margin: 0, color: colors.muted }}>Sprint hiện tại không có issue nào.</p></Card>
  }

  const med = data.medianHoursPerPoint

  return (
    <>
      <Card title="Sprint hiện tại">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.x5, alignItems: 'baseline' }}>
          <strong style={{ fontSize: fontSize.lg }}>{sprintName}</strong>
          <span style={{ color: colors.muted }}>
            Trung vị{' '}
            <strong style={{ color: colors.text }}>
              {med === null ? '—' : `${med.toFixed(1)} h/point`}
            </strong>
          </span>
          <span style={{ color: data.noEstimate.length > 0 ? colors.danger : colors.muted }}>
            {data.noEstimate.length} issue chưa có story points
          </span>
        </div>
      </Card>

      <Card flush>
        <div className="wl-table-scroll">
          <table className="wl-table">
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', minWidth: 240 }}>Issue</th>
                <th scope="col" style={{ textAlign: 'left' }}>Assignee</th>
                <th scope="col" style={{ textAlign: 'left' }}>Status</th>
                <th scope="col">Points</th>
                <th scope="col">Đã log</th>
                <th scope="col">h/point</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const noPoints = r.storyPoints === null || r.storyPoints === 0
                return (
                  <tr key={r.key} style={{ background: r.isOutlier ? colors.accentSofter : undefined }}>
                    <th scope="row" style={{ fontWeight: 400 }}>
                      <strong>{r.key}</strong> {r.summary}
                    </th>
                    <td style={{ textAlign: 'left' }}>{r.assigneeName ?? '—'}</td>
                    <td style={{ textAlign: 'left' }}>{r.status}</td>
                    <td className="wl-table__num" style={{ color: noPoints ? colors.danger : undefined }}>
                      {noPoints ? 'chưa có' : r.storyPoints}
                    </td>
                    <td className="wl-table__num">{hoursLabel(r.timeSpentSeconds)}</td>
                    <td
                      className="wl-table__num"
                      style={{
                        fontWeight: r.isOutlier ? 700 : 400,
                        color: r.isOutlier ? colors.accentRing : undefined,
                      }}
                      title={r.isOutlier ? 'Lệch xa trung vị h/point của sprint' : undefined}
                    >
                      {r.hoursPerPoint === null ? '—' : r.hoursPerPoint.toFixed(1)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
