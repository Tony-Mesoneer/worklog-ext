// src/ui/dashboard/CoverageSummary.tsx
//
// Hàng tóm tắt trên bảng. Câu hỏi thật của lead là "team có đang bám capacity
// không, và ai đang thiếu" — trả lời bằng bốn con số nhanh hơn quét cả lưới.
//
// MỌI số ở đây suy ra từ CoverageTable đã có trong bộ nhớ (grandTotal, capacity
// và total từng row). Không thêm request nào.
import type { CoverageTable } from '@/core/coverage'
import { isShortHours } from '@/core/coverage'
import { ProgressBar } from '@/ui/shared/ProgressBar'
import { hoursLabel, percentLabel } from '@/ui/shared/format'
import { colors, fontSize, space } from '@/ui/shared/theme'
import { useT } from '@/ui/shared/LocaleProvider'

type Props = { data: CoverageTable }

function Stat(
  { label, value, tone, note }:
  { label: string; value: string; tone?: string; note?: string },
) {
  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 92 }}>
      <span style={{ fontSize: fontSize.xs, color: colors.muted, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </span>
      <strong style={{ fontSize: fontSize.xl, color: tone ?? colors.text, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </strong>
      {/* Dòng phụ: bối cảnh cả kỳ. Nhỏ và mờ hơn, để không ai đọc lẫn nó
          thành con số đang được đánh giá. */}
      {note !== undefined && (
        <span style={{ fontSize: fontSize.xs, color: colors.muted, fontVariantNumeric: 'tabular-nums' }}>
          {note}
        </span>
      )}
    </div>
  )
}

export function CoverageSummary({ data }: Props) {
  const t = useT()
  // Mốc để ĐÁNH GIÁ là capacity tới hôm nay; capacity cả kỳ chỉ là bối cảnh.
  // Bản cũ lấy cả kỳ nên giữa sprint luôn ra 12% và 4/4 thiếu giờ — số đúng về
  // số học nhưng vô dụng, vì nó chỉ nói "sprint chưa diễn ra xong".
  const capacity = data.capacityToDateSeconds
  const capacityFull = data.capacityFullRangeSeconds
  const cut = capacity !== capacityFull
  // "Thiếu giờ" = hụt HƠN MỘT NGÀY LÀM VIỆC của chính member đó so với capacity
  // tới hôm nay (luật ở core/coverage.ts: isShortHours). Hụt đúng-hoặc-dưới một
  // ngày không được gắn cờ, vì hôm nay luôn được đếm trọn một ngày nên lúc 9h
  // sáng ai cũng đang hụt gần một ngày. Member inactive và khoảng ngày chưa tới
  // có capacity 0 nên không bao giờ bị tính là thiếu.
  const short = data.rows.filter(isShortHours)
  const noneLogged = data.rows.filter((r) => r.capacityToDateSeconds > 0 && r.total === 0)

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end',
      gap: `${space.x3}px ${space.x5}px`,
    }}>
      <Stat
        label={t.dashboard.loggedVsCapacity}
        value={`${hoursLabel(data.grandTotal)} / ${hoursLabel(capacity)}`}
        // Khoảng đã xảy ra hết (ví dụ preset "Tuần trước") → hai con số bằng
        // nhau, không thêm dòng phụ: trang đọc y như trước khi có thay đổi này.
        {...(cut ? { note: t.dashboard.toDateNote(hoursLabel(capacityFull)) } : {})}
      />
      <Stat
        label={t.dashboard.coverage}
        value={percentLabel(data.grandTotal, capacity)}
        tone={colors.accentRing}
      />
      <Stat
        label={t.dashboard.shortHours}
        value={`${short.length}/${data.rows.length}`}
        tone={short.length === 0 ? colors.success : undefined}
      />
      {noneLogged.length > 0 && (
        <Stat
          label={t.dashboard.nothingLogged}
          value={String(noneLogged.length)}
          tone={colors.danger}
        />
      )}
      <div style={{ flex: '1 1 200px', minWidth: 160, paddingBottom: 4 }}>
        <ProgressBar
          value={data.grandTotal}
          max={capacity}
          height={8}
          label={t.dashboard.teamProgress(
            hoursLabel(data.grandTotal),
            hoursLabel(capacity),
            cut ? t.dashboard.toDateSuffix : '',
            hoursLabel(capacityFull),
          )}
        />
      </div>
    </div>
  )
}
