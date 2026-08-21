// src/ui/sidepanel/EventButtons.tsx
import type { ResolvedSprintEvent } from '@/core/event-resolve'
import { formatDuration } from '@/core/duration'
import { Button } from '@/ui/shared/Button'
import { colors, fontSize, space } from '@/ui/shared/theme'
import { useT } from '@/ui/shared/LocaleProvider'

type Props = {
  events: ResolvedSprintEvent[]
  loading: boolean
  onPick: (e: ResolvedSprintEvent) => void
}

export function EventButtons({ events, loading, onPick }: Props) {
  const t = useT()
  if (events.length === 0) {
    return (
      <p style={{ fontSize: fontSize.sm, color: colors.muted, margin: 0 }}>
        {loading
          ? t.sidepanel.resolvingCeremonies
          : t.sidepanel.noEvents}
      </p>
    )
  }

  // Event không tra được PHẢI nhìn thấy được, không chỉ nằm trong tooltip: một
  // cảnh báo không ai đọc được thì không phải cảnh báo. Nút bị khoá cho biết
  // "bấm không được", dòng bên dưới cho biết "vì sao".
  const blocked = events.filter((e) => e.issueKey === null)

  return (
    <div style={{ display: 'grid', gap: space.x2, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.x1 }}>
        {events.map((e, i) => (
          <Button
            key={`${e.name}#${i}`}
            size="sm"
            disabled={e.issueKey === null}
            onClick={() => onPick(e)}
            title={
              e.issueKey === null
                ? t.sidepanel.eventDisabled(e.name, e.reason ?? t.sidepanel.unknownIssue)
                : `${e.issueKey} · ${formatDuration(e.defaultMinutes * 60)}`
            }
          >
            {e.name}
          </Button>
        ))}
      </div>

      {loading && (
        <span style={{ fontSize: fontSize.sm, color: colors.muted }}>
          {t.sidepanel.resolvingCeremonies}
        </span>
      )}

      {!loading && blocked.length > 0 && (
        <ul
          style={{
            margin: 0, padding: 0, listStyle: 'none',
            display: 'grid', gap: 2,
            fontSize: fontSize.sm, color: colors.warning, lineHeight: 1.45,
          }}
        >
          {blocked.map((e, i) => (
            <li key={`${e.name}#blocked#${i}`}>
              <strong style={{ fontWeight: 600 }}>{e.name}</strong>: {e.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
