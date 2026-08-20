// src/ui/sidepanel/DayTimeline.tsx
import { buildSlots, occupiedBy, formatMinutes, DAY_END_MINUTES, type DayEntry } from '@/core/timeline'
import { colors } from '@/ui/shared/theme'

type Props = {
  entries: DayEntry[]
  workdayStartMinutes: number
  slotMinutes: number
  selectedStart: number
  selectedDuration: number
}

export function DayTimeline({
  entries, workdayStartMinutes, slotMinutes, selectedStart, selectedDuration,
}: Props) {
  const slots = buildSlots(workdayStartMinutes, DAY_END_MINUTES, slotMinutes)
  const selEnd = selectedStart + selectedDuration

  return (
    <div style={{ display: 'grid', gap: 1 }}>
      {slots.map((s) => {
        const busy = occupiedBy(entries, s, slotMinutes)
        const inSelection = selectedDuration > 0 && s >= selectedStart && s < selEnd
        return (
          <div key={s} style={{
            display: 'flex', gap: 6, alignItems: 'center', fontSize: 11,
            background: inSelection ? colors.accentSoft : busy ? colors.surfaceAlt : 'transparent',
            padding: '1px 4px', borderRadius: 3,
          }}>
            <span style={{ width: 38, color: colors.muted }}>
              {s % 60 === 0 ? formatMinutes(s) : ''}
            </span>
            <span style={{ flex: 1, color: colors.text }}>
              {busy ? busy.issueKey : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
