// src/ui/dashboard/CellDetail.tsx
import type { Worklog } from '@/core/coverage'
import { formatDuration } from '@/core/duration'
import { formatMinutes } from '@/core/timeline'

type Props = {
  memberName: string
  date: string
  worklogs: Worklog[]
  onClose: () => void
}

export function CellDetail({ memberName, date, worklogs, onClose }: Props) {
  return (
    <aside style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 380, background: '#fff',
      borderLeft: '1px solid #cfd8dc', padding: 14, overflowY: 'auto', fontSize: 13,
      boxShadow: '-2px 0 8px rgba(0,0,0,.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <strong style={{ flex: 1 }}>{memberName} · {date}</strong>
        <button onClick={onClose}>Đóng</button>
      </div>
      {worklogs.length === 0 && <p style={{ color: '#78909c' }}>Không có worklog nào.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {worklogs.map((w) => (
          <li key={w.id} style={{ borderBottom: '1px solid #eceff1', padding: '6px 0' }}>
            <div>
              <strong>{w.issueKey}</strong> · {formatMinutes(w.startMinutes)} · {formatDuration(w.timeSpentSeconds)}
            </div>
            <div style={{ color: '#607d8b' }}>{w.issueSummary}</div>
            {w.comment !== '' && <div style={{ color: '#37474f', fontStyle: 'italic' }}>{w.comment}</div>}
          </li>
        ))}
      </ul>
    </aside>
  )
}
