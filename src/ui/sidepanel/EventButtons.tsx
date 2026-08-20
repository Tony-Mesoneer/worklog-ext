// src/ui/sidepanel/EventButtons.tsx
import type { SprintEvent } from '@/core/config-schema'
import { formatDuration } from '@/core/duration'
import { Button } from '@/ui/shared/Button'
import { colors, fontSize, space } from '@/ui/shared/theme'

type Props = {
  events: SprintEvent[]
  onPick: (e: SprintEvent) => void
}

export function EventButtons({ events, onPick }: Props) {
  if (events.length === 0) {
    return (
      <p style={{ fontSize: fontSize.sm, color: colors.muted, margin: 0 }}>
        Chưa cấu hình sprint event — thêm trong Options.
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.x1 }}>
      {events.map((e) => (
        <Button
          key={e.issueKey + e.name}
          size="sm"
          onClick={() => onPick(e)}
          title={`${e.issueKey} · ${formatDuration(e.defaultMinutes * 60)}`}
        >
          {e.name}
        </Button>
      ))}
    </div>
  )
}
