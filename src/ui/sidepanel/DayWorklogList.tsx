// src/ui/sidepanel/DayWorklogList.tsx
//
// Danh sách worklog của ngày đang xem, mỗi dòng một nút Xoá.
//
// Vì sao là DANH SÁCH chứ không phải nút trên khối timeline: khối trong DayBlocks
// cao tỉ lệ với thời lượng, nên một worklog 15 phút chỉ dày vài pixel — không
// đặt nổi một nút vào đó, và kể cả đặt được thì bàn phím không có đường tới.
// Danh sách thì mỗi dòng là một hàng thật, tab tới được, và đọc ra thứ tự thời
// gian rõ hơn timeline khi có nhiều worklog ngắn liền nhau.
//
// Không có bước xác nhận: xoá xong có banner Undo 8 giây ở SidePanel, cùng lối
// với việc log. Một dialog xác nhận cho mỗi lần xoá sẽ đắt hơn cái nó phòng.
import type { Worklog } from '@/core/coverage'
import { formatDuration } from '@/core/duration'
import { formatMinutes } from '@/core/timeline'
import { Button } from '@/ui/shared/Button'
import { StatusBadge } from '@/ui/shared/StatusBadge'
import type { IssueMetaMap } from '@/core/issue-hierarchy'
import { colors, fontSize, radii, space } from '@/ui/shared/theme'
import { useT } from '@/ui/shared/LocaleProvider'

type Props = {
  worklogs: Worklog[]
  meta: IssueMetaMap
  /** Đang có request chạy — khoá mọi nút để không xoá hai lần một worklog. */
  busy: boolean
  onDelete: (worklog: Worklog) => void
}

export function DayWorklogList({ worklogs, meta, busy, onDelete }: Props) {
  const t = useT()
  // Ngày trống thì không vẽ gì: DayBlocks phía trên đã nói điều đó, thêm một
  // dòng "chưa có worklog" nữa là lặp.
  if (worklogs.length === 0) return null

  const sorted = [...worklogs].sort((a, b) => a.startMinutes - b.startMinutes)

  return (
    <ul
      aria-label={t.sidepanel.listAria}
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space.x1 }}
    >
      {sorted.map((w) => {
        const end = w.startMinutes + Math.round(w.timeSpentSeconds / 60)
        const m = meta[w.issueKey]
        return (
          <li
            key={w.id}
            style={{
              display: 'flex', alignItems: 'center', gap: space.x2, minWidth: 0,
              background: colors.surfaceAlt,
              border: `1px solid ${colors.border}`,
              borderRadius: radii.chip,
              padding: `${space.x1}px ${space.x1}px ${space.x1}px ${space.x2}px`,
              fontSize: fontSize.md,
            }}
          >
            {/* Giờ là thứ phân biệt hai worklog cùng issue, nên nó đứng đầu và
                không bao giờ bị wrap. */}
            <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: colors.muted }}>
              {formatMinutes(w.startMinutes)}–{formatMinutes(end)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ whiteSpace: 'nowrap' }}>{w.issueKey}</strong>
              {m && <> <StatusBadge name={m.statusName} category={m.statusCategory} /></>}
              {w.comment !== '' && (
                <span style={{ color: colors.muted }}> · {w.comment}</span>
              )}
            </div>
            <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {formatDuration(w.timeSpentSeconds)}
            </span>
            <Button
              variant="ghost" size="sm" disabled={busy}
              onClick={() => onDelete(w)}
              // Nhãn phải nói xoá CÁI NÀO: một danh sách toàn nút "Xoá" giống
              // nhau là vô dụng với screen reader.
              aria-label={t.sidepanel.deleteAria(
                formatDuration(w.timeSpentSeconds),
                w.issueKey,
                formatMinutes(w.startMinutes),
              )}
              title={t.sidepanel.deleteTitle}
            >
              {t.common.remove}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
