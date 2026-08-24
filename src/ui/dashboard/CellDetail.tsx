// src/ui/dashboard/CellDetail.tsx
import { useEffect, useId, useRef, useState } from 'react'
import type { Worklog } from '@/core/coverage'
import { formatDuration, parseDuration } from '@/core/duration'
import { formatMinutes } from '@/core/timeline'
import { Button } from '@/ui/shared/Button'
import { longDateLabel } from '@/ui/shared/format'
import { colors, fontSize, radii, space, zLayer } from '@/ui/shared/theme'
import { useLocale, useT } from '@/ui/shared/LocaleProvider'

type Props = {
  memberName: string
  date: string
  worklogs: Worklog[]
  dayOff: boolean
  /**
   * Ô này là của CHÍNH người đang dùng.
   *
   * Hai ràng buộc từ Jira, không phải lựa chọn thiết kế:
   *  - `author` của worklog luôn là người đang xác thực, nên không có cách nào
   *    ghi giờ hộ đồng nghiệp.
   *  - xoá worklog của người khác cần quyền project admin, nên với phần lớn
   *    người dùng nút đó chỉ dẫn tới 403.
   *
   * Vậy nên sửa/thêm chỉ xuất hiện ở hàng của mình; hàng người khác là chỉ đọc.
   */
  isMine: boolean
  /**
   * Giờ bắt đầu sẽ dùng nếu ghi thêm vào ngày này, suy ra bằng nextFreeStart ở
   * Dashboard (nó có config: giờ làm việc, slot, giờ nghỉ). null = ngày đã kín.
   */
  nextStartMinutes: number | null
  busy: boolean
  /** Đường bàn phím tương đương cho việc click-phải một ô trong bảng. */
  onToggleDayOff: () => void
  onDelete: (worklog: Worklog) => void
  onAdd: (issueKey: string, timeSpentSeconds: number, comment: string) => void
  onClose: () => void
}

export function CellDetail({
  memberName, date, worklogs, dayOff, isMine, nextStartMinutes, busy,
  onToggleDayOff, onDelete, onAdd, onClose,
}: Props) {
  const t = useT()
  const locale = useLocale()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [issueKey, setIssueKey] = useState('')
  const [duration, setDuration] = useState('')
  const [comment, setComment] = useState('')
  const issueId = useId()
  const durId = useId()

  const seconds = parseDuration(duration)
  const canAdd = isMine
    && nextStartMinutes !== null
    && issueKey.trim() !== ''
    && seconds !== null
    && seconds > 0
    && !busy

  const submit = () => {
    if (!canAdd || seconds === null) return
    onAdd(issueKey.trim().toUpperCase(), seconds, comment)
    setIssueKey('')
    setDuration('')
    setComment('')
  }

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
        // Không có dòng này thì header sticky của bảng (z-index 1) vẽ trùm lên
        // panel. `position: fixed` KHÔNG tự nâng tầng — z-index: auto vẫn nằm
        // dưới mọi z-index dương, bất kể thứ tự DOM.
        zIndex: zLayer.panel,
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
              <div style={{ display: 'flex', gap: space.x2, alignItems: 'baseline' }}>
                <strong>{w.issueKey}</strong>
                <span style={{ color: colors.muted, fontVariantNumeric: 'tabular-nums' }}>
                  {formatMinutes(w.startMinutes)} · {formatDuration(w.timeSpentSeconds)}
                </span>
                {isMine && (
                  <Button
                    variant="ghost" size="sm" disabled={busy}
                    style={{ marginLeft: 'auto' }}
                    onClick={() => onDelete(w)}
                    aria-label={t.sidepanel.deleteAria(
                      formatDuration(w.timeSpentSeconds),
                      w.issueKey,
                      formatMinutes(w.startMinutes),
                    )}
                    title={t.sidepanel.deleteTitle}
                  >
                    {t.common.remove}
                  </Button>
                )}
              </div>
              <div style={{ color: colors.muted }}>{w.issueSummary}</div>
              {w.comment !== '' && (
                <div style={{ fontStyle: 'italic' }}>{w.comment}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Sửa/thêm chỉ ở hàng của mình — xem `isMine`. Hàng người khác nói rõ lý
          do thay vì để một khoảng trống không giải thích. */}
      {!isMine ? (
        <p style={{ margin: 0, color: colors.muted, fontSize: fontSize.sm }}>
          {t.dashboard.othersReadOnly}
        </p>
      ) : nextStartMinutes === null ? (
        <p style={{ margin: 0, color: colors.muted, fontSize: fontSize.sm }}>
          {t.dashboard.dayFull}
        </p>
      ) : (
        <div style={{
          display: 'grid', gap: space.x2,
          borderTop: `1px solid ${colors.border}`, paddingTop: space.x3,
        }}>
          <strong style={{ fontSize: fontSize.md }}>{t.dashboard.addHere}</strong>
          <div className="wl-field">
            <label className="wl-field__label" htmlFor={issueId}>
              {t.dashboard.colIssue}
            </label>
            <input
              id={issueId}
              value={issueKey}
              onChange={(e) => setIssueKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              placeholder={t.dashboard.addIssuePlaceholder}
              autoComplete="off"
            />
          </div>
          <div className="wl-field">
            <label className="wl-field__label" htmlFor={durId}>
              {t.sidepanel.durationLabel}
            </label>
            <input
              id={durId}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              placeholder="1h30"
              autoComplete="off"
            />
          </div>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            placeholder={t.sidepanel.noteLabel}
            autoComplete="off"
          />
          {/* Nói TRƯỚC giờ sẽ ghi: người dùng không chọn giờ ở đây, nó được suy
              ra — im lặng về nó là bắt họ đoán. */}
          <span style={{ color: colors.muted, fontSize: fontSize.sm }}>
            {t.dashboard.addStartsAt(formatMinutes(nextStartMinutes))}
          </span>
          {duration !== '' && seconds === null && (
            <span role="alert" style={{ color: colors.danger, fontSize: fontSize.sm }}>
              {t.sidepanel.durationUnparsed(duration)}
            </span>
          )}
          <Button variant="primary" onClick={submit} disabled={!canAdd}>
            {t.dashboard.addSubmit}
          </Button>
        </div>
      )}
    </aside>
  )
}
