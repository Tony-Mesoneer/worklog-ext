// src/ui/dashboard/CoverageSummary.tsx
//
// Hàng tóm tắt trên bảng. Câu hỏi thật của lead là "team có đang bám capacity
// không, và ai đang thiếu" — trả lời bằng bốn con số nhanh hơn quét cả lưới.
//
// MỌI số ở đây suy ra từ CoverageTable đã có trong bộ nhớ (grandTotal, capacity
// và total từng row). Không thêm request nào.
import type { CoverageTable } from '@/core/coverage'
import { ProgressBar } from '@/ui/shared/ProgressBar'
import { hoursLabel, percentLabel } from '@/ui/shared/format'
import { colors, fontSize, space } from '@/ui/shared/theme'

type Props = { data: CoverageTable }

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 92 }}>
      <span style={{ fontSize: fontSize.xs, color: colors.muted, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </span>
      <strong style={{ fontSize: fontSize.xl, color: tone ?? colors.text, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </strong>
    </div>
  )
}

export function CoverageSummary({ data }: Props) {
  const capacity = data.rows.reduce((s, r) => s + r.capacitySeconds, 0)
  // "Thiếu giờ" = có capacity mà log dưới capacity. Member inactive có capacity 0
  // nên không bao giờ bị tính là thiếu — đúng ý core/coverage.
  const short = data.rows.filter((r) => r.capacitySeconds > 0 && r.total < r.capacitySeconds)
  const noneLogged = data.rows.filter((r) => r.capacitySeconds > 0 && r.total === 0)

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end',
      gap: `${space.x3}px ${space.x5}px`,
    }}>
      <Stat label="Đã log" value={hoursLabel(data.grandTotal)} />
      <Stat label="Capacity" value={hoursLabel(capacity)} />
      <Stat
        label="Coverage"
        value={percentLabel(data.grandTotal, capacity)}
        tone={colors.accentRing}
      />
      <Stat
        label="Thiếu giờ"
        value={`${short.length}/${data.rows.length}`}
        tone={short.length === 0 ? colors.success : undefined}
      />
      {noneLogged.length > 0 && (
        <Stat
          label="Chưa log gì"
          value={String(noneLogged.length)}
          tone={colors.danger}
        />
      )}
      <div style={{ flex: '1 1 200px', minWidth: 160, paddingBottom: 4 }}>
        <ProgressBar
          value={data.grandTotal}
          max={capacity}
          height={8}
          label={`Cả team đã log ${hoursLabel(data.grandTotal)} trên capacity ${hoursLabel(capacity)}`}
        />
      </div>
    </div>
  )
}
