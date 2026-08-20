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
// Thuần là cách BIỂU DIỄN — dữ liệu vẫn là `entries` sẵn có, không thêm request
// nào, core/timeline.ts không đổi.
import { useState } from 'react'
import { DAY_END_MINUTES, findOverlaps, formatMinutes, type DayEntry } from '@/core/timeline'
import { formatDuration } from '@/core/duration'
import { Button } from '@/ui/shared/Button'
import { colors, fontSize } from '@/ui/shared/theme'

type Props = {
  entries: DayEntry[]
  workdayStartMinutes: number
  selectedStart: number
  selectedDuration: number
}

// px mỗi phút — cố tình nhỏ. Một ngày kín 8h vẫn chỉ ~105px; ba worklog điển
// hình ~70px. Chiều cao tối thiểu chỉ để chữ 12px không bị cắt.
const PX_PER_MIN = 0.22
const MIN_H = 20
const MAX_H = 56
const MIN_GAP_H = 12
const MAX_GAP_H = 22

type Block =
  | { kind: 'entry'; id: string; start: number; minutes: number; issueKey: string; hit: boolean }
  | { kind: 'gap'; start: number; minutes: number }
  | { kind: 'sel'; start: number; minutes: number }

const heightOf = (b: Block): number =>
  b.kind === 'gap'
    ? Math.round(Math.min(MAX_GAP_H, Math.max(MIN_GAP_H, b.minutes * PX_PER_MIN)))
    : Math.round(Math.min(MAX_H, Math.max(MIN_H, b.minutes * PX_PER_MIN)))

// Dựng danh sách khối theo thứ tự thời gian. `tailFrom` = mốc bắt đầu phần cuối
// ngày còn trống, để gập lại.
function buildBlocks(
  entries: DayEntry[],
  dayStart: number,
  selStart: number,
  selMinutes: number,
): { blocks: Block[]; tailFrom: number } {
  // Worklog bị lựa chọn chồng lên: tô viền accent tại chỗ thay vì chèn thêm một
  // khối riêng — chèn khối chồng giờ sẽ làm trục thời gian sai.
  const hits = selMinutes > 0
    ? new Set(findOverlaps(entries, selStart, selMinutes).map((e) => e.id))
    : new Set<string>()

  type Item = { start: number; minutes: number; entry?: DayEntry }
  const items: Item[] = entries.map((e) => ({
    start: e.startMinutes, minutes: e.durationMinutes, entry: e,
  }))
  if (selMinutes > 0 && hits.size === 0) items.push({ start: selStart, minutes: selMinutes })
  items.sort((a, b) => a.start - b.start)

  const blocks: Block[] = []
  let cursor = dayStart

  for (const it of items) {
    if (it.start > cursor) blocks.push({ kind: 'gap', start: cursor, minutes: it.start - cursor })
    if (it.entry) {
      blocks.push({
        kind: 'entry', id: it.entry.id, start: it.start, minutes: it.minutes,
        issueKey: it.entry.issueKey, hit: hits.has(it.entry.id),
      })
    } else {
      blocks.push({ kind: 'sel', start: it.start, minutes: it.minutes })
    }
    cursor = Math.max(cursor, it.start + it.minutes)
  }

  return { blocks, tailFrom: Math.min(cursor, DAY_END_MINUTES) }
}

function BlockRow({ block }: { block: Block }) {
  const h = heightOf(block)
  const dur = formatDuration(block.minutes * 60)

  if (block.kind === 'gap') {
    // Dải trống: tín hiệu thật ("có lỗ chưa log lúc 11:00"). Không nhãn nào ngoài
    // thời lượng, và chỉ khi dải cao đủ để chữ không bị cắt.
    return (
      <div
        className="wl-blk wl-blk--gap"
        style={{ height: h, justifyContent: 'flex-end' }}
        title={`Trống ${dur} từ ${formatMinutes(block.start)}`}
      >
        {h >= 16 && <span className="wl-blk__dur">trống {dur}</span>}
      </div>
    )
  }

  const cls = block.kind === 'entry'
    ? `wl-blk wl-blk--entry${block.hit ? ' wl-blk--hit' : ''}`
    : 'wl-blk wl-blk--sel'

  return (
    <div className={cls} style={{ height: h }} title={`${formatMinutes(block.start)} · ${dur}`}>
      <span className="wl-blk__time" style={{ width: 32 }}>{formatMinutes(block.start)}</span>
      <span className="wl-blk__key" style={{ flex: 1 }}>
        {block.kind === 'entry' ? block.issueKey : 'sẽ ghi vào đây'}
      </span>
      <span className="wl-blk__dur">{dur}</span>
    </div>
  )
}

export function DayBlocks({
  entries, workdayStartMinutes, selectedStart, selectedDuration,
}: Props) {
  const [showTail, setShowTail] = useState(false)
  const { blocks, tailFrom } = buildBlocks(
    entries, workdayStartMinutes, selectedStart, selectedDuration,
  )
  const tailMinutes = DAY_END_MINUTES - tailFrom

  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      {blocks.length === 0 && (
        <p style={{ margin: 0, fontSize: fontSize.sm, color: colors.muted }}>
          Chưa có worklog nào trong ngày.
        </p>
      )}

      {blocks.map((b, i) => (
        <BlockRow key={`${b.kind}-${b.start}-${i}`} block={b} />
      ))}

      {tailMinutes > 0 && (
        showTail ? (
          <>
            <BlockRow block={{ kind: 'gap', start: tailFrom, minutes: tailMinutes }} />
            <Button variant="ghost" size="sm" onClick={() => setShowTail(false)}>
              Ẩn phần cuối ngày
            </Button>
          </>
        ) : (
          <Button
            variant="ghost" size="sm" onClick={() => setShowTail(true)}
            title={`${formatMinutes(tailFrom)} – ${formatMinutes(DAY_END_MINUTES)}`}
          >
            {`+ trống ${formatDuration(tailMinutes * 60)} tới ${formatMinutes(DAY_END_MINUTES)}`}
          </Button>
        )
      )}
    </div>
  )
}
