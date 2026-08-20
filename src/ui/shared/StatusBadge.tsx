// src/ui/shared/StatusBadge.tsx
//
// Nhãn trạng thái issue, dùng ở CẢ BA bề mặt (side panel, coverage, story
// points) — một primitive, một bộ màu, sửa một chỗ là đổi cả ba.
//
// Hai quyết định:
//
//  1. NHÃN, KHÔNG PHẢI CẢNH BÁO. Nền mờ + chữ màu + cỡ chữ xs. Trên dashboard,
//     thứ duy nhất được phép "hét lên" là cảnh báo thiếu giờ; một badge trạng
//     thái trên mỗi hàng mà cũng nổi bằng nó thì cảnh báo kia hết tác dụng.
//  2. CHỮ là `fields.status.name` (workflow thật: "In Testing", "Closed"),
//     MÀU là `statusCategory` (ba bucket). Người dùng nhận ra từ vựng của chính
//     mình, còn màu thì không bao giờ thiếu cho một status mới thêm vào.
//
// `name` rỗng = không biết trạng thái (kết quả /issue/picker, hoặc snapshot cũ
// không có meta) → KHÔNG render gì. Một pill rỗng còn tệ hơn không có pill.
import type { StatusCategory } from '@/core/issue-hierarchy'
import { fontSize, radii, statusCategoryColors } from './theme'

type Props = {
  name: string
  category: StatusCategory
}

export function StatusBadge({ name, category }: Props) {
  if (name.trim() === '') return null
  const c = statusCategoryColors[category]
  return (
    <span
      title={`Trạng thái: ${name}`}
      style={{
        flex: '0 0 auto',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: radii.pill,
        fontSize: fontSize.xs,
        lineHeight: 1.5,
        padding: '0 6px',
        whiteSpace: 'nowrap',
      }}
    >
      {name}
    </span>
  )
}
