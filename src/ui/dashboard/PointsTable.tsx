import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { send, type PointsLoadResult } from '@/sw/messages'
import { buildPointsTable, type PointsTable as Data } from '@/core/points'
import { hoursLabel } from '@/ui/shared/format'
import { Banner } from '@/ui/shared/Banner'

const td: CSSProperties = {
  borderBottom: '1px solid #eceff1', padding: '4px 8px', fontSize: 12,
}

export function PointsPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [sprintName, setSprintName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void send<PointsLoadResult>({ type: 'points/load' })
      .then((res) => { setSprintName(res.sprintName); setData(buildPointsTable(res.issues)) })
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <Banner kind="error">{error}</Banner>
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
            <tr style={{ background: '#fafafa' }}>
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
                <tr key={r.key} style={{ background: r.isOutlier ? '#fff3e0' : undefined }}>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <strong>{r.key}</strong> {r.summary}
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>{r.assigneeName ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'left' }}>{r.status}</td>
                  <td style={{ ...td, textAlign: 'right', color: noPoints ? '#c62828' : undefined }}>
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
