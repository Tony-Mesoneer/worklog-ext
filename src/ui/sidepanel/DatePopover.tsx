// src/ui/sidepanel/DatePopover.tsx
//
// Nhảy ngày nhanh bằng lịch tháng. Mũi tên ←/→ trong header vẫn giữ nguyên —
// chúng là công cụ đúng cho ±1 ngày, là trường hợp thường gặp; lịch này dành cho
// những cú nhảy mà trước đây tốn bảy lần bấm.
//
// Phần toán lưới nằm ở @/core/month (thuần, có test). Ở đây chỉ còn hiển thị,
// điều hướng bàn phím và quản lý focus.
//
// CỐ Ý KHÔNG LÀM: đánh dấu ngày nào đã có giờ log. Việc đó cần worklog của cả
// tháng đang xem, tức một request Jira mới mỗi lần đổi tháng — ngoài phạm vi.
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { addDays } from '@/core/jiraTime'
import { monthGrid, shiftMonth } from '@/core/month'
import { Button } from '@/ui/shared/Button'
import { fullDateLabel, longDateLabel, monthYearLabel } from '@/ui/shared/format'
import { colors, fontSize, space } from '@/ui/shared/theme'

type Props = {
  /** Ngày đang chọn, "YYYY-MM-DD". */
  value: string
  /** Hôm nay theo timezone Jira — KHÔNG theo timezone máy. */
  today: string
  /** Khoá cả trigger và mọi ô ngày khi đang submit, để không có đường thứ hai
   *  đổi ngày giữa lúc ghi worklog (race làm dữ liệu ngày mới bị ghi đè). */
  disabled: boolean
  onChange: (date: string) => void
}

const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

export function DatePopover({ value, today, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false)
  // Ô đang được focus trong lưới. Tháng đang xem suy ra từ đây, nên mũi tên đi
  // qua biên tháng là tự động sang tháng kế.
  const [cursor, setCursor] = useState(value)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  // Click ra ngoài thì đóng. Không trap focus: popover này không phải modal.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Focus theo `cursor`: mở lịch là focus vào ngày đang chọn, và mỗi lần cursor
  // đổi thì focus đi theo, kể cả khi lưới vừa render sang tháng khác.
  useEffect(() => {
    if (!open) return
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`button[data-date="${cursor}"]`)
      ?.focus()
  }, [open, cursor])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = (next: string) => { e.preventDefault(); setCursor(next) }
    switch (e.key) {
      case 'ArrowLeft': return move(addDays(cursor, -1))
      case 'ArrowRight': return move(addDays(cursor, 1))
      case 'ArrowUp': return move(addDays(cursor, -7))
      case 'ArrowDown': return move(addDays(cursor, 7))
      case 'PageUp': return move(shiftMonth(cursor, -1))
      case 'PageDown': return move(shiftMonth(cursor, 1))
      case 'Home': return move(`${cursor.slice(0, 8)}01`)
      case 'Escape':
        e.preventDefault()
        close(true)
        return
      default:
    }
  }

  const pick = (date: string) => {
    onChange(date)
    close(true)
  }

  const [year, month] = cursor.split('-').map(Number) as [number, number]
  const weeks = monthGrid(year, month)

  return (
    <div ref={rootRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      {/* Trigger LÀ chính cái ngày trong header — affordance nằm đúng chỗ mắt
          người dùng đang nhìn. */}
      <button
        ref={triggerRef}
        type="button"
        className="wl-datebtn"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setCursor(value)
          setOpen((o) => !o)
        }}
      >
        <span style={{ fontSize: fontSize.lg, fontWeight: 600, lineHeight: 1.2 }}>
          {value === '' ? '' : longDateLabel(value)}
        </span>
        <span style={{ fontSize: fontSize.xs, color: colors.muted }}>
          {value === today ? 'Hôm nay · mở lịch' : `${value} · mở lịch`}
        </span>
      </button>

      {open && (
        <div
          className="wl-pop"
          role="dialog"
          aria-label="Chọn ngày"
          onKeyDown={onKeyDown}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: space.x1 }}>
            <Button
              variant="ghost" size="sm" iconOnly aria-label="Tháng trước"
              onClick={() => setCursor(shiftMonth(cursor, -1))}
            >
              ‹
            </Button>
            <strong style={{ flex: 1, textAlign: 'center', fontSize: fontSize.md }}>
              {monthYearLabel(cursor)}
            </strong>
            <Button
              variant="ghost" size="sm" iconOnly aria-label="Tháng sau"
              onClick={() => setCursor(shiftMonth(cursor, 1))}
            >
              ›
            </Button>
          </div>

          <div ref={gridRef} className="wl-cal">
            {DOW.map((d) => (
              <span key={d} className="wl-cal__dow" aria-hidden="true">{d}</span>
            ))}
            {weeks.flat().map((cell) => (
              <button
                key={cell.date}
                type="button"
                data-date={cell.date}
                className={cell.inMonth ? 'wl-cal__day' : 'wl-cal__day wl-cal__day--out'}
                disabled={disabled}
                aria-label={fullDateLabel(cell.date)}
                aria-pressed={cell.date === value}
                aria-current={cell.date === today ? 'date' : undefined}
                tabIndex={cell.date === cursor ? 0 : -1}
                onClick={() => pick(cell.date)}
              >
                {Number(cell.date.slice(8, 10))}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: space.x2 }}>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => pick(today)}>
              Hôm nay
            </Button>
            <Button variant="ghost" size="sm" onClick={() => close(true)}>Đóng</Button>
          </div>
        </div>
      )}
    </div>
  )
}
