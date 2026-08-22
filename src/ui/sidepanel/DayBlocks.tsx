// src/ui/sidepanel/DayBlocks.tsx
//
// Thay thế DayTimeline cũ. Bản cũ đi qua `buildSlots()` và vẽ MỘT HÀNG CHO MỖI
// SLOT 15 PHÚT — 44 hàng từ 09:00 đến 20:00 — lặp lại key issue trên từng hàng,
// nên "CAG-3027" hiện sáu lần liền rồi "CAG-2969" bảy lần liền. Nó không phải
// timeline, nó là danh sách nhãn trùng lặp, và nó ăn hơn nửa chiều cao panel.
//
// Nguyên tắc sau phản hồi của người dùng ("timeline quá chi tiết, tôi đang
// block time nhỏ nhất là 15 phút rồi"):
//
//   LƯỚI 15 PHÚT LÀ ĐƠN VỊ NHẬP, KHÔNG PHẢI ĐƠN VỊ HIỂN THỊ.
//
// Lưới slot vẫn nguyên vẹn ở dropdown "Bắt đầu" của LogForm (buildSlots +
// occupiedBy, không đổi) — đó là chỗ duy nhất đơn vị 15 phút có ý nghĩa, vì đó
// là cách người dùng nhập dữ liệu. Ở đây chỉ còn: một worklog = một khối, cao
// tỉ lệ với thời lượng, nhãn đúng một lần; khoảng trống là một dải mỏng; buổi
// tối trống gập lại thành một nút. Không hàng nào cho slot, không mốc giờ nào
// không mang thêm thông tin.
//
// Thuần là cách BIỂU DIỄN — dữ liệu vẫn là worklog của `day/load`, không thêm
// request nào, core/timeline.ts không đổi.
//
// Bổ sung sau khi bỏ danh sách worklog riêng: timeline giờ vừa để ĐỌC vừa để
// SỬA. Nút xoá nằm trong chính khối (18px, vừa trong khối 20px thấp nhất) và
// bấm thân khối bạt ra một dải chi tiết. Mật độ được giữ nguyên vì status,
// summary và comment chỉ xuất hiện khi người dùng mở khối — nhồi chúng vào khối
// sẽ phá đúng cái mật độ mà bản thiết kế này được vẽ ra để có.
//
// Bổ sung sau tính năng giờ nghỉ: giờ nghỉ được vẽ thành một DẢI NỀN mờ, không
// phải một khối dữ liệu. Không có nó thì một tiếng trống lúc 12:00 đọc thành
// "mình quên log một tiếng" chứ không phải "đó là giờ nghỉ trưa".
import { useState } from 'react'
import { findOverlaps, formatMinutes, type Break, type DayEntry, type Segment } from '@/core/timeline'
import { Fragment, useId } from 'react'
import type { Worklog } from '@/core/coverage'
import { formatDuration } from '@/core/duration'
import { StatusBadge } from '@/ui/shared/StatusBadge'
import type { IssueMetaMap } from '@/core/issue-hierarchy'
import { Button } from '@/ui/shared/Button'
import { colors, fontSize } from '@/ui/shared/theme'
import { useT } from '@/ui/shared/LocaleProvider'

type Props = {
  /**
   * Bản ghi ĐẦY ĐỦ của ngày, không phải `DayEntry`. Dải chi tiết cần `comment`
   * và toàn bộ worklog để xoá, mà DayEntry (kiểu của core/timeline) chỉ mang
   * đúng những gì phép tính bố cục cần. Component tự dẫn ra entries — một hàm
   * thuần, rẻ, và không có hai prop phải giữ đồng bộ với nhau.
   */
  worklogs: Worklog[]
  workdayStartMinutes: number
  dayEndMinutes: number
  breaks: Break[]
  /** Các đoạn SẼ ghi — nhiều hơn một khi yêu cầu đi qua giờ nghỉ. */
  selection: Segment[]
  /**
   * Metadata issue của ngày đang xem, đi cạnh worklog từ `day/load`. Dùng cho
   * tooltip VÀ cho dải chi tiết: khối vẫn chỉ hiện issue key + thời lượng, còn
   * status/summary chỉ xuất hiện khi người dùng mở khối ra.
   */
  meta: IssueMetaMap
  /** Đang có request chạy — khoá nút xoá để không xoá hai lần một worklog. */
  busy: boolean
  onDelete: (worklog: Worklog) => void
}

// px mỗi phút — cố tình nhỏ. Một ngày kín 8h vẫn chỉ ~105px; ba worklog điển
// hình ~70px. Chiều cao tối thiểu chỉ để chữ 12px không bị cắt.
const PX_PER_MIN = 0.22
const MIN_H = 20
const MAX_H = 56
const MIN_GAP_H = 12
const MAX_GAP_H = 22
// Dải giờ nghỉ cần cao hơn dải trống một chút để nhãn "nghỉ trưa" không
// bị cắt — nó là dải duy nhất luôn có nhãn.
const MIN_BREAK_H = 16

type Block =
  | { kind: 'entry'; id: string; start: number; minutes: number; issueKey: string; hit: boolean }
  | { kind: 'gap'; start: number; minutes: number }
  | { kind: 'break'; start: number; minutes: number }
  | { kind: 'sel'; start: number; minutes: number }

const heightOf = (b: Block): number => {
  const px = b.minutes * PX_PER_MIN
  if (b.kind === 'gap') return Math.round(Math.min(MAX_GAP_H, Math.max(MIN_GAP_H, px)))
  if (b.kind === 'break') return Math.round(Math.min(MAX_GAP_H, Math.max(MIN_BREAK_H, px)))
  return Math.round(Math.min(MAX_H, Math.max(MIN_H, px)))
}

// Dựng danh sách khối theo thứ tự thời gian. `tailFrom` = mốc bắt đầu phần cuối
// ngày còn trống, để gập lại.
function buildBlocks(
  entries: DayEntry[],
  dayStart: number,
  dayEnd: number,
  breaks: Break[],
  selection: Segment[],
): { blocks: Block[]; tailFrom: number } {
  // Worklog bị lựa chọn chồng lên: tô viền accent tại chỗ thay vì chèn thêm một
  // khối riêng — chèn khối chồng giờ sẽ làm trục thời gian sai.
  const hits = new Set(
    selection.flatMap((s) => findOverlaps(entries, s.startMinutes, s.durationMinutes)).map((e) => e.id),
  )

  type Item = { start: number; minutes: number; kind: 'entry' | 'sel' | 'break'; entry?: DayEntry }
  const items: Item[] = entries.map((e) => ({
    start: e.startMinutes, minutes: e.durationMinutes, kind: 'entry', entry: e,
  }))
  for (const s of selection) {
    // Đoạn nào chồng worklog cũ thì đã được thể hiện bằng viền accent trên chính
    // worklog đó; chèn thêm khối nữa là vẽ hai lần một khoảng thời gian.
    if (findOverlaps(entries, s.startMinutes, s.durationMinutes).length === 0) {
      items.push({ start: s.startMinutes, minutes: s.durationMinutes, kind: 'sel' })
    }
  }
  for (const b of breaks) {
    items.push({ start: b.startMinutes, minutes: b.endMinutes - b.startMinutes, kind: 'break' })
  }
  // Cùng mốc bắt đầu: worklog trước, rồi lựa chọn, rồi dải giờ nghỉ — dải nền
  // không bao giờ chen lên trước dữ liệu thật.
  const weight = { entry: 0, sel: 1, break: 2 } as const
  items.sort((a, b) => a.start - b.start || weight[a.kind] - weight[b.kind])

  const blocks: Block[] = []
  let cursor = dayStart

  for (const it of items) {
    const end = it.start + it.minutes
    // Giờ nghỉ đã bị worklog phủ kín (có người log qua trưa từ trước tính năng
    // này) thì bỏ dải đi, giữ trục thời gian đơn điệu.
    if (it.kind === 'break' && end <= cursor) continue
    if (it.start > cursor) blocks.push({ kind: 'gap', start: cursor, minutes: it.start - cursor })

    if (it.kind === 'entry' && it.entry) {
      blocks.push({
        kind: 'entry', id: it.entry.id, start: it.start, minutes: it.minutes,
        issueKey: it.entry.issueKey, hit: hits.has(it.entry.id),
      })
    } else if (it.kind === 'sel') {
      blocks.push({ kind: 'sel', start: it.start, minutes: it.minutes })
    } else {
      const from = Math.max(cursor, it.start)
      blocks.push({ kind: 'break', start: from, minutes: end - from })
    }
    cursor = Math.max(cursor, end)
  }

  return { blocks, tailFrom: Math.min(cursor, dayEnd) }
}

function BlockRow({ block, meta, worklog, open, busy, detailId, onToggle, onDelete }: {
  block: Block
  meta: IssueMetaMap
  /** Bản ghi của khối này — chỉ có với khối `entry`. */
  worklog?: Worklog | undefined
  open?: boolean
  busy?: boolean
  /** id của dải chi tiết, để aria-controls trỏ đúng vào nó. */
  detailId?: string | undefined
  onToggle?: () => void
  onDelete?: () => void
}) {
  const t = useT()
  const h = heightOf(block)
  const dur = formatDuration(block.minutes * 60)

  if (block.kind === 'gap') {
    // Dải trống: tín hiệu thật ("có lỗ chưa log lúc 11:00"). Không nhãn nào ngoài
    // thời lượng, và chỉ khi dải cao đủ để chữ không bị cắt.
    return (
      <div
        className="wl-blk wl-blk--gap"
        style={{ height: h, justifyContent: 'flex-end' }}
        title={t.sidepanel.freeTitle(dur, formatMinutes(block.start))}
      >
        {h >= 16 && <span className="wl-blk__dur">{t.sidepanel.freeShort(dur)}</span>}
      </div>
    )
  }

  if (block.kind === 'break') {
    // Dải nền, KHÔNG phải feature: chỉ sọc mờ + nhãn, không thời lượng, không
    // hành động nào. Nó tồn tại để một tiếng trống lúc 12:00 đọc ra là "nghỉ".
    //
    // KHÔNG hiện giờ cụ thể ở đây: dải này có thể đã bị một worklog cũ (log
    // trước khi có luật "không log qua giờ nghỉ") che mất một phần, nên đoạn
    // còn hiển thị chỉ là PHẦN CÒN TRỐNG của giờ nghỉ, không phải toàn bộ
    // khoảng đã cấu hình. Ghi "12:45–13:00" trong tình huống đó là sai — nó
    // đọc như thể giờ nghỉ chỉ có 15 phút. Nhãn chung "nghỉ trưa" đúng trong
    // mọi trường hợp mà không cần biết band đã bị cắt bao nhiêu.
    return (
      <div
        className="wl-blk wl-blk--break"
        style={{ height: h }}
        title={t.sidepanel.breakTitle}
      >
        <span className="wl-blk__dur">{t.sidepanel.breakShort}</span>
      </div>
    )
  }

  const cls = block.kind === 'entry'
    ? `wl-blk wl-blk--entry${block.hit ? ' wl-blk--hit' : ''}`
    : 'wl-blk wl-blk--sel'

  const m = block.kind === 'entry' ? meta[block.issueKey] : undefined
  const title = [
    `${formatMinutes(block.start)} · ${dur}`,
    m && m.summary !== '' ? m.summary : null,
    m && m.statusName !== '' ? m.statusName : null,
    m?.parentKey ? `↳ ${m.parentKey} ${m.parentSummary ?? ''}`.trim() : null,
  ].filter((x) => x !== null).join(' · ')

  const inner = (
    <>
      <span className="wl-blk__time" style={{ width: 32 }}>{formatMinutes(block.start)}</span>
      <span className="wl-blk__key" style={{ flex: 1 }}>
        {block.kind === 'entry' ? block.issueKey : t.sidepanel.willLogHere}
      </span>
      <span className="wl-blk__dur">{dur}</span>
    </>
  )

  // Khối `sel` là bản xem trước của việc SẼ ghi — chưa tồn tại nên không có gì
  // để mở ra và không có gì để xoá.
  if (block.kind !== 'entry' || !worklog) {
    return <div className={cls} style={{ height: h }} title={title}>{inner}</div>
  }

  return (
    <div className={cls} style={{ height: h }}>
      {/* Thân khối và nút xoá là HAI control cạnh nhau, không lồng nhau: nút
          lồng nút là HTML sai và bàn phím vào đó không ra được. */}
      <button
        type="button"
        className="wl-blk__main"
        onClick={onToggle}
        aria-expanded={open === true}
        {...(detailId === undefined ? {} : { 'aria-controls': detailId })}
        title={title}
      >
        {inner}
      </button>
      <button
        type="button"
        className="wl-blk__del"
        onClick={onDelete}
        disabled={busy === true}
        // Nhãn phải nói xoá CÁI NÀO: một timeline toàn dấu ✕ giống nhau là vô
        // dụng với screen reader.
        aria-label={t.sidepanel.deleteAria(
          dur, worklog.issueKey, formatMinutes(block.start),
        )}
        title={t.sidepanel.deleteTitle}
      >
        ✕
      </button>
    </div>
  )
}

/**
 * Chi tiết của khối đang mở. Nằm ngay dưới khối đó, thụt vào — nó thuộc về khối
 * chứ không phải một hàng ngang hàng.
 *
 * Đây là chỗ duy nhất status/summary/comment xuất hiện trong timeline: nhồi
 * chúng vào chính khối sẽ phá mật độ (khối 15 phút chỉ cao 20px), mà mật độ là
 * lý do timeline này thay thế bản danh sách 44 hàng trước đó.
 */
function BlockDetail({ id, worklog, meta }: {
  id: string
  worklog: Worklog
  meta: IssueMetaMap
}) {
  const t = useT()
  const m = meta[worklog.issueKey]
  const end = worklog.startMinutes + Math.round(worklog.timeSpentSeconds / 60)

  return (
    <div className="wl-blk-detail" id={id}>
      <div className="wl-blk-detail__row">
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatMinutes(worklog.startMinutes)}–{formatMinutes(end)}
        </span>
        <span>·</span>
        <span>{formatDuration(worklog.timeSpentSeconds)}</span>
        {m && m.statusName !== '' && (
          <StatusBadge name={m.statusName} category={m.statusCategory} />
        )}
      </div>
      {worklog.issueSummary !== '' && (
        <div className="wl-blk-detail__note">{worklog.issueSummary}</div>
      )}
      {m?.parentKey && (
        <div>{t.sidepanel.parentOf(m.parentKey, m.parentSummary ?? '')}</div>
      )}
      <div className={worklog.comment === '' ? undefined : 'wl-blk-detail__note'}>
        {worklog.comment === '' ? t.sidepanel.noNote : worklog.comment}
      </div>
    </div>
  )
}

export function DayBlocks({
  worklogs, workdayStartMinutes, dayEndMinutes, breaks, selection, meta,
  busy, onDelete,
}: Props) {
  const t = useT()
  const [showTail, setShowTail] = useState(false)
  // MỘT khối mở tại một thời điểm: panel hẹp, mở nhiều dải cùng lúc là đẩy phần
  // còn lại của ngày ra ngoài vùng nhìn.
  const [openId, setOpenId] = useState<string | null>(null)
  // Prefix ổn định cho id của dải chi tiết: nhiều panel trên một trang (side
  // panel + dashboard cùng mở) không được sinh id trùng nhau.
  const idPrefix = useId()

  const byId = new Map(worklogs.map((w) => [w.id, w]))
  const entries: DayEntry[] = worklogs.map((w) => ({
    id: w.id,
    issueKey: w.issueKey,
    startMinutes: w.startMinutes,
    durationMinutes: Math.round(w.timeSpentSeconds / 60),
  }))

  const { blocks, tailFrom } = buildBlocks(
    entries, workdayStartMinutes, dayEndMinutes, breaks, selection,
  )
  const tailMinutes = dayEndMinutes - tailFrom

  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      {blocks.length === 0 && (
        <p style={{ margin: 0, fontSize: fontSize.sm, color: colors.muted }}>
          {t.sidepanel.noWorklog}
        </p>
      )}

      {blocks.map((b, i) => {
        const w = b.kind === 'entry' ? byId.get(b.id) : undefined
        const open = w !== undefined && openId === w.id
        return (
          <Fragment key={`${b.kind}-${b.start}-${i}`}>
            <BlockRow
              block={b}
              meta={meta}
              worklog={w}
              open={open}
              busy={busy}
              detailId={w === undefined ? undefined : `${idPrefix}-${w.id}`}
              onToggle={() => setOpenId(open ? null : (w?.id ?? null))}
              onDelete={() => { if (w) onDelete(w) }}
            />
            {open && w && (
              <BlockDetail id={`${idPrefix}-${w.id}`} worklog={w} meta={meta} />
            )}
          </Fragment>
        )
      })}

      {tailMinutes > 0 && (
        showTail ? (
          <>
            <BlockRow block={{ kind: 'gap', start: tailFrom, minutes: tailMinutes }} meta={meta} />
            <Button variant="ghost" size="sm" onClick={() => setShowTail(false)}>
              {t.sidepanel.hideTail}
            </Button>
          </>
        ) : (
          <Button
            variant="ghost" size="sm" onClick={() => setShowTail(true)}
            title={`${formatMinutes(tailFrom)} – ${formatMinutes(dayEndMinutes)}`}
          >
            {t.sidepanel.showTail(formatDuration(tailMinutes * 60), formatMinutes(dayEndMinutes))}
          </Button>
        )
      )}
    </div>
  )
}
