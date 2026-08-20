// src/ui/shared/ProgressBar.tsx
//
// Meter dùng ở hai chỗ: tiến độ ngày của side panel (đã log / 8h) và coverage
// từng member ở dashboard (đã log / capacity).
//
// Lý do nó tồn tại: cảnh báo nhị phân xanh-hoặc-cam đã mất nghĩa. Giữa sprint
// mọi người đều dưới capacity, nên cả cột Total tô cam và "hơi chậm" trông y
// như "chưa log gì". Một thanh tỉ lệ nói ra sự khác biệt đó mà không cần đọc số.
import { colors } from './theme'

type Props = {
  /** Giá trị và mốc, cùng đơn vị (giây). */
  value: number
  max: number
  /** Chiều cao thanh. 4 cho trong ô bảng, 8 cho header panel. */
  height?: number
  /** Nhãn cho screen reader — thanh không có text đi kèm thì bắt buộc. */
  label: string
  /** Text hiện cạnh thanh (đã format sẵn ở caller). */
  valueText?: string
}

// Màu theo TỈ LỆ, không theo cờ nhị phân: 0 = đỏ (chưa log gì), dưới 60% = cam,
// 60–99% = accent (đang đi đúng hướng), >= 100% = xanh.
export function progressTone(value: number, max: number): string {
  if (value <= 0) return colors.danger
  if (max <= 0) return colors.accent
  const ratio = value / max
  if (ratio >= 1) return colors.success
  if (ratio >= 0.6) return colors.accent
  return colors.warning
}

export function ProgressBar({ value, max, height = 6, label, valueText }: Props) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const tone = progressTone(value, max)

  return (
    <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
      {valueText !== undefined && (
        <span style={{ fontSize: 11, color: colors.muted, textAlign: 'right' }}>{valueText}</span>
      )}
      <div
        className="wl-meter"
        style={{ height }}
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.max(1, Math.round(max))}
        aria-valuetext={label}
      >
        <div
          className="wl-meter__fill"
          style={{ width: `${(ratio * 100).toFixed(1)}%`, background: tone }}
        />
      </div>
    </div>
  )
}
