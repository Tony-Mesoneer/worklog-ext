// src/ui/sidepanel/LogForm.tsx
import { useEffect, useId, useRef } from 'react'
import { parseDuration, formatDuration, stepDurationMinutes } from '@/core/duration'
import { createWheelStepper, DEFAULT_WHEEL_STEPPER, wheelDeltaPx } from '@/core/wheel-step'
import {
  breakAt, buildPickerSlots, occupiedBy, formatMinutes,
  type Break, type DayEntry, type Segment,
} from '@/core/timeline'
import { Button } from '@/ui/shared/Button'
import { SegmentedControl } from '@/ui/shared/SegmentedControl'
import { colors, fontSize, space } from '@/ui/shared/theme'
import { useT } from '@/ui/shared/LocaleProvider'

type Props = {
  entries: DayEntry[]
  presets: number[]
  slotMinutes: number
  workdayStartMinutes: number
  dayEndMinutes: number
  breaks: Break[]
  /** Các đoạn SẼ ghi, tính ở SidePanel bằng splitAroundBreaks. */
  segments: Segment[]
  /** Đuôi vượt quá giờ tan làm — cảnh báo, không chặn. */
  pastEndMinutes: number | null
  startMinutes: number
  durationInput: string
  comment: string
  issueKey: string
  busy: boolean
  /** Cảnh báo chồng giờ tính ở SidePanel để timeline và form nói cùng một điều. */
  overlapKeys: string[]
  onStartChange: (m: number) => void
  onDurationChange: (s: string) => void
  onCommentChange: (s: string) => void
  onSubmit: () => void
}

// "60" → "1h", "90" → "90m": text mà parseDuration đọc lại đúng giá trị.
const presetText = (m: number): string => (m >= 60 && m % 60 === 0 ? `${m / 60}h` : `${m}m`)

const segmentText = (s: Segment): string =>
  `${formatMinutes(s.startMinutes)}–${formatMinutes(s.startMinutes + s.durationMinutes)}` +
  ` (${formatDuration(s.durationMinutes * 60)})`

export function LogForm(p: Props) {
  const t = useT()
  const seconds = parseDuration(p.durationInput)
  // Lưới GIỮ cả các mốc nằm trong giờ nghỉ VÀ các mốc ngoài giờ làm việc (sớm
  // hơn giờ vào, muộn hơn giờ tan), chỉ gắn nhãn chúng: hôm nào làm xuyên trưa
  // hay vào sớm lúc 07:45 thì người dùng vẫn phải chọn được. Cái né giờ nghỉ và
  // bám giờ làm việc là giá trị MẶC ĐỊNH (nextFreeStart ở SidePanel), không
  // phải danh sách này.
  const slots = buildPickerSlots(p.workdayStartMinutes, p.dayEndMinutes, p.slotMinutes)
  const startId = useId()
  const freeId = useId()
  const noteId = useId()
  const freeRef = useRef<HTMLInputElement>(null)

  // Lăn chuột trên ô Duration = ±15m. Listener GẮN TAY với passive:false chứ
  // không dùng onWheel của React: React gắn wheel ở dạng passive, nên
  // preventDefault ở đó không chặn được panel cuộn theo cùng lúc. Đọc props qua
  // ref để listener chỉ gắn một lần mà vẫn thấy giá trị mới nhất.
  const latest = useRef({ input: p.durationInput, onChange: p.onDurationChange })
  latest.current = { input: p.durationInput, onChange: p.onDurationChange }
  useEffect(() => {
    const el = freeRef.current
    if (!el) return
    // Biến delta thành bước rời rạc ở core/wheel-step (giữ phần dư, giãn cách
    // tối thiểu, reset khi đổi chiều/dừng) — xem đó để biết vì sao mượt.
    const step = createWheelStepper()
    // Giá trị của CÚ LĂN ĐANG DIỄN RA. Không đọc lại props mỗi event: nhiều
    // event tới trước khi React kịp render lại, đọc props là đọc số CŨ và các
    // bước bị nuốt mất — lăn nhanh mà số đứng yên chính là cái giật.
    let pending: number | null = null
    let frame = 0
    let idle: ReturnType<typeof setTimeout> | undefined
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return
      e.preventDefault()
      clearTimeout(idle)
      idle = setTimeout(() => { pending = null }, DEFAULT_WHEEL_STEPPER.idleResetMs)

      const dir = step(wheelDeltaPx(e.deltaY, e.deltaMode), e.timeStamp)
      if (dir === 0) return
      const base = pending ?? Math.round((parseDuration(latest.current.input) ?? 0) / 60)
      pending = stepDurationMinutes(base, dir)
      // Gộp mọi bước trong cùng một frame thành MỘT lần setState: cả panel
      // (timeline, cảnh báo) render lại theo duration, không cần làm việc đó
      // nhiều lần mỗi frame.
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0
          if (pending !== null) latest.current.onChange(formatDuration(pending * 60))
        })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      cancelAnimationFrame(frame)
      clearTimeout(idle)
    }
  }, [])

  const invalid = p.durationInput !== '' && seconds === null
  const canSubmit = seconds !== null && p.issueKey.trim() !== ''

  return (
    <div style={{ display: 'grid', gap: space.x3, minWidth: 0 }}>
      {/* Lưới 15 phút sống ở ĐÂY và chỉ ở đây: dropdown start time là chỗ duy
          nhất đơn vị slot có ý nghĩa, vì đó là cách người dùng nhập dữ liệu.
          Timeline hiển thị bằng khối, không bằng slot. */}
      <div className="wl-field">
        <label className="wl-field__label" htmlFor={startId}>{t.sidepanel.startLabel}</label>
        <select
          id={startId}
          value={p.startMinutes}
          onChange={(e) => p.onStartChange(Number(e.target.value))}
          style={{ width: 'fit-content', minWidth: 120 }}
        >
          {slots.map((s) => {
            const busy = occupiedBy(p.entries, s, p.slotMinutes)
            // Nhãn về MỐC THỜI GIAN (giờ nghỉ, ngoài giờ làm việc) đứng trước
            // nhãn issue: chúng nói về chính mốc đó, còn issue chỉ nói ô lưới
            // này đã có việc.
            const outside = s < p.workdayStartMinutes || s >= p.dayEndMinutes
            const note = breakAt(s, p.breaks)
              ? t.sidepanel.breakShort
              : outside
                ? t.sidepanel.outsideHoursShort
                : busy?.issueKey
            return (
              <option key={s} value={s}>
                {formatMinutes(s)}{note ? ` — ${note}` : ''}
              </option>
            )
          })}
        </select>
      </div>

      <div className="wl-field">
        <span className="wl-field__label">{t.sidepanel.durationLabel}</span>
        {/* nowrap + minWidth:0 — hàng này phải nằm trên MỘT dòng. Trước đây
            flexWrap:'wrap' đẩy ô nhập tay xuống dòng dưới ngay khi panel hẹp,
            và người dùng thấy hai hàng rời nhau thay vì một hàng duration. Chỗ
            co lại là nhóm chip (nó cuộn ngang bên trong), không phải ô nhập. */}
        <div style={{ display: 'flex', gap: space.x2, flexWrap: 'nowrap', alignItems: 'center', minWidth: 0 }}>
          {/* mode="toggle": có thể không chip nào được chọn (gõ tay "1h30"), nên
              aria-selected của tablist là sai nghĩa ở đây. */}
          <SegmentedControl
            label={t.sidepanel.durationPresets}
            mode="toggle"
            nowrap
            items={p.presets.map((m) => ({ value: m, label: formatDuration(m * 60) }))}
            value={p.presets.find((m) => m * 60 === seconds) ?? null}
            onChange={(m) => p.onDurationChange(presetText(m))}
          />
          <input
            ref={freeRef}
            id={freeId}
            value={p.durationInput}
            onChange={(e) => p.onDurationChange(e.target.value)}
            placeholder="1h30"
            aria-label={t.sidepanel.durationCustom}
            aria-invalid={invalid || undefined}
            style={{ width: 78, flex: '0 0 auto' }}
          />
        </div>
      </div>

      <div className="wl-field">
        <label className="wl-field__label" htmlFor={noteId}>{t.sidepanel.noteLabel}</label>
        <input
          id={noteId}
          value={p.comment}
          onChange={(e) => p.onCommentChange(e.target.value)}
          placeholder={t.sidepanel.notePlaceholder}
        />
      </div>

      {invalid && (
        <span role="alert" style={{ fontSize: fontSize.sm, color: colors.danger }}>
          {t.sidepanel.durationUnparsed(p.durationInput)}
        </span>
      )}

      {/* Tạo hai worklog trong khi người dùng tin là tạo một sẽ làm mất lòng
          tin vào panel. Nói TRƯỚC khi bấm Log, bằng đúng các mốc giờ sẽ POST. */}
      {p.segments.length > 1 && (
        <span style={{ fontSize: fontSize.sm, color: colors.accentRing }}>
          {t.sidepanel.willSplit(
            p.segments.length,
            t.sidepanel.listJoin(p.segments.map(segmentText)),
          )}
        </span>
      )}

      {/* Mốc bắt đầu rơi vào giờ nghỉ (value cũ, hoặc gõ tay): nói rõ nó bị đẩy
          sang sau giờ nghỉ chứ không im lặng ghi giờ khác giờ đang hiện. */}
      {p.segments.length === 1 && p.segments[0]!.startMinutes !== p.startMinutes && (
        <span style={{ fontSize: fontSize.sm, color: colors.accentRing }}>
          {t.sidepanel.startInBreak(
            formatMinutes(p.startMinutes),
            formatMinutes(p.segments[0]!.startMinutes),
          )}
        </span>
      )}

      {p.pastEndMinutes !== null && (
        // Cảnh báo, KHÔNG chặn: cùng cách xử lý như cảnh báo chồng giờ.
        <span style={{ fontSize: fontSize.sm, color: colors.warning }}>
          {t.sidepanel.pastEnd(
            formatMinutes(p.pastEndMinutes),
            formatMinutes(p.dayEndMinutes),
          )}
        </span>
      )}

      {p.overlapKeys.length > 0 && (
        // Cảnh báo, KHÔNG chặn: Jira cho phép chồng giờ và đôi khi chồng là đúng.
        <span style={{ fontSize: fontSize.sm, color: colors.warning }}>
          {t.sidepanel.overlap(p.overlapKeys.join(', '))}
        </span>
      )}

      <Button
        variant="primary"
        size="lg"
        block
        loading={p.busy}
        disabled={!canSubmit}
        onClick={p.onSubmit}
      >
        {p.busy
          ? t.sidepanel.logging
          : t.sidepanel.logButton(seconds ? formatDuration(seconds) : '')}
      </Button>
    </div>
  )
}
