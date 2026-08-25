// src/ui/sidepanel/LogForm.tsx
import { useId } from 'react'
import { parseDuration, formatDuration } from '@/core/duration'
import {
  buildSlots, occupiedBy, formatMinutes,
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
  // Lưới bỏ hẳn các mốc nằm trong giờ nghỉ: dropdown không được mời người dùng
  // bắt đầu một worklog vào giữa bữa trưa.
  const slots = buildSlots(p.workdayStartMinutes, p.dayEndMinutes, p.slotMinutes, p.breaks)
  const startId = useId()
  const freeId = useId()
  const noteId = useId()

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
            return (
              <option key={s} value={s}>
                {formatMinutes(s)}{busy ? ` — ${busy.issueKey}` : ''}
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
