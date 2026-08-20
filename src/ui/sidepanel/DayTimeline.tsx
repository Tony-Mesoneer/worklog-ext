// src/ui/sidepanel/DayTimeline.tsx
import { buildSlots, occupiedBy, formatMinutes, type DayEntry } from '@/core/timeline'

type Props = {
  entries: DayEntry[]
  workdayStartMinutes: number
  slotMinutes: number
  selectedStart: number
  selectedDuration: number
}

const DAY_END = 20 * 60 // 20:00 — đủ cho một ngày làm việc dài

export function DayTimeline({
  entries, workdayStartMinutes, slotMinutes, selectedStart, selectedDuration,
}: Props) {
  const slots = buildSlots(workdayStartMinutes, DAY_END, slotMinutes)
  const selEnd = selectedStart + selectedDuration

  return (
    <div style={{ display: 'grid', gap: 1 }}>
      {slots.map((s) => {
        const busy = occupiedBy(entries, s, slotMinutes)
        const inSelection = selectedDuration > 0 && s >= selectedStart && s < selEnd
        return (
          <div key={s} style={{
            display: 'flex', gap: 6, alignItems: 'center', fontSize: 11,
            background: inSelection ? '#c8e6c9' : busy ? '#eceff1' : 'transparent',
            padding: '1px 4px', borderRadius: 3,
          }}>
            <span style={{ width: 38, color: '#607d8b' }}>
              {s % 60 === 0 ? formatMinutes(s) : ''}
            </span>
            <span style={{ flex: 1, color: '#37474f' }}>
              {busy ? busy.issueKey : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
