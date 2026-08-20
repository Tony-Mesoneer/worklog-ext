// src/ui/sidepanel/LogForm.tsx
import { parseDuration, formatDuration } from '@/core/duration'
import {
  buildSlots, occupiedBy, formatMinutes, findOverlaps,
  DAY_END_MINUTES, type DayEntry,
} from '@/core/timeline'

type Props = {
  entries: DayEntry[]
  presets: number[]
  slotMinutes: number
  workdayStartMinutes: number
  startMinutes: number
  durationInput: string
  comment: string
  issueKey: string
  busy: boolean
  onStartChange: (m: number) => void
  onDurationChange: (s: string) => void
  onCommentChange: (s: string) => void
  onSubmit: () => void
}

export function LogForm(p: Props) {
  const seconds = parseDuration(p.durationInput)
  const minutes = seconds === null ? 0 : Math.round(seconds / 60)
  const overlaps = minutes > 0 ? findOverlaps(p.entries, p.startMinutes, minutes) : []
  const slots = buildSlots(p.workdayStartMinutes, DAY_END_MINUTES, p.slotMinutes)

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label style={{ fontSize: 12 }}>Bắt đầu</label>
        <select value={p.startMinutes} onChange={(e) => p.onStartChange(Number(e.target.value))}>
          {slots.map((s) => {
            const busy = occupiedBy(p.entries, s, p.slotMinutes)
            return (
              <option key={s} value={s}>
                {formatMinutes(s)}{busy ? ` — ${busy.issueKey}` : ''}
              </option>
            )
          })}
        </select>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {p.presets.map((m) => (
          <button key={m} onClick={() => p.onDurationChange(m >= 60 && m % 60 === 0 ? `${m / 60}h` : `${m}m`)}
                  style={{ fontSize: 12, padding: '3px 7px' }}>
            {formatDuration(m * 60)}
          </button>
        ))}
        <input value={p.durationInput} onChange={(e) => p.onDurationChange(e.target.value)}
               placeholder="1h30" style={{ width: 70, padding: 3 }} />
      </div>

      <input value={p.comment} onChange={(e) => p.onCommentChange(e.target.value)}
             placeholder="Ghi chú (không bắt buộc)" style={{ padding: 5 }} />

      {p.durationInput !== '' && seconds === null && (
        <span style={{ fontSize: 12, color: '#c62828' }}>
          Không hiểu "{p.durationInput}" — thử 1h30, 90m, 1.5h
        </span>
      )}

      {overlaps.length > 0 && (
        // Cảnh báo, KHÔNG chặn: Jira cho phép chồng giờ và đôi khi chồng là đúng.
        <span style={{ fontSize: 12, color: '#ef6c00' }}>
          Chồng giờ với {overlaps.map((o) => o.issueKey).join(', ')}
        </span>
      )}

      <button onClick={p.onSubmit} disabled={p.busy || seconds === null || p.issueKey.trim() === ''}
              style={{ padding: 7, fontWeight: 600 }}>
        {p.busy ? 'Đang ghi…' : `Log ${seconds ? formatDuration(seconds) : ''}`}
      </button>
    </div>
  )
}
