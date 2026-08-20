// src/ui/sidepanel/EventButtons.tsx
import type { SprintEvent } from '@/core/config-schema'
import { colors } from '@/ui/shared/theme'

type Props = {
  events: SprintEvent[]
  onPick: (e: SprintEvent) => void
}

export function EventButtons({ events, onPick }: Props) {
  if (events.length === 0) {
    return (
      <p style={{ fontSize: 12, color: colors.muted }}>
        Chưa cấu hình sprint event — thêm trong Options.
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {events.map((e) => (
        <button key={e.issueKey + e.name} onClick={() => onPick(e)}
                title={`${e.issueKey} · ${e.defaultMinutes}m`}
                style={{ fontSize: 12, padding: '4px 8px' }}>
          {e.name}
        </button>
      ))}
    </div>
  )
}
