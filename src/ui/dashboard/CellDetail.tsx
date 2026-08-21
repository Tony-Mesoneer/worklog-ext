// src/ui/dashboard/CellDetail.tsx
import { useEffect, useRef } from 'react'
import type { Worklog } from '@/core/coverage'
import { formatDuration } from '@/core/duration'
import { formatMinutes } from '@/core/timeline'
import { Button } from '@/ui/shared/Button'
import { longDateLabel } from '@/ui/shared/format'
import { colors, fontSize, radii, space } from '@/ui/shared/theme'
import { useLocale, useT } from '@/ui/shared/LocaleProvider'

type Props = {
  memberName: string
  date: string
  worklogs: Worklog[]
  dayOff: boolean
  /** Đường bàn phím tương đương cho việc click-phải một ô trong bảng. */
  onToggleDayOff: () => void
  onClose: () => void
}

export function CellDetail({
  memberName, date, worklogs, dayOff, onToggleDayOff, onClose,
}: Props) {
  const t = useT()
  const locale = useLocale()
  const closeRef = useRef<HTMLButtonElement>(null)

  // Focus vào panel khi mở và Esc để đóng: panel mở bằng Enter trên một ô bảng,
  // nếu focus vẫn ở ô đó thì người dùng bàn phím không tới được nội dung.
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const total = worklogs.reduce((s, w) => s + w.timeSpentSeconds, 0)

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label={t.dashboard.detailAria(memberName, date)}
      style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 'min(380px, 92vw)',
        background: colors.surface, color: colors.text,
        borderLeft: `1px solid ${colors.border}`,
        borderTopLeftRadius: radii.panel, borderBottomLeftRadius: radii.panel,
        boxShadow: 'var(--shadow-pop)',
        padding: space.x4, overflowY: 'auto', fontSize: fontSize.md,
        display: 'grid', gap: space.x3, alignContent: 'start',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space.x2 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: fontSize.lg }}>{memberName}</strong>
          <div style={{ color: colors.muted, fontSize: fontSize.sm }}>
            {longDateLabel(locale, date)} ·{' '}
        {worklogs.length === 0 ? t.dashboard.detailNothing : formatDuration(total)}
          </div>
        </div>
        <Button ref={closeRef} variant="ghost" size="sm" onClick={onClose}>{t.common.close}</Button>
      </div>

      {/* Nút này LÀ đường bàn phím tương đương của click-phải trong bảng. */}
      <Button
        variant="secondary"
        size="sm"
        onClick={onToggleDayOff}
        aria-pressed={dayOff}
      >
        {dayOff ? t.dashboard.unmarkDayOff : t.dashboard.markDayOff}
      </Button>

      {worklogs.length === 0 ? (
        <p style={{ color: colors.muted, margin: 0 }}>{t.dashboard.noWorklogs}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: space.x2 }}>
          {worklogs.map((w) => (
            <li key={w.id} style={{
              borderBottom: `1px solid ${colors.border}`,
              paddingBottom: space.x2, display: 'grid', gap: 2,
            }}>
              <div style={{ display: 'flex', gap: space.x2, flexWrap: 'wrap' }}>
                <strong>{w.issueKey}</strong>
                <span style={{ color: colors.muted, fontVariantNumeric: 'tabular-nums' }}>
                  {formatMinutes(w.startMinutes)} · {formatDuration(w.timeSpentSeconds)}
                </span>
              </div>
              <div style={{ color: colors.muted }}>{w.issueSummary}</div>
              {w.comment !== '' && (
                <div style={{ fontStyle: 'italic' }}>{w.comment}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
