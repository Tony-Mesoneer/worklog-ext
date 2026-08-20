// src/ui/shared/theme.ts
//
// Token màu/khoảng bo góc cho các chỗ vẫn cần giá trị inline (style cell bảng,
// màu status...). Giá trị phải khớp với custom property trong theme.css —
// hai file này diễn tả cùng một palette dưới hai hình thức khác nhau.
// Không import gì — file thuần TypeScript, dùng được ở mọi layer UI.

export const colors = {
  bg: '#141218',
  surface: '#1D1A23',
  surfaceAlt: '#232030',
  border: '#2E2A38',
  text: '#E8E5EE',
  muted: '#9B95A8',
  accent: '#967DD6',
  accentSoft: 'rgba(150,125,214,0.16)',
  // Đã nâng sáng & giảm bão hoà so với bộ màu light-theme cũ (#2e7d32 /
  // #ef6c00 / #c62828) — trên nền #141218 chúng đọc được rõ mà không chói.
  success: '#6FCF8B',
  warning: '#F2A25C',
  danger: '#F0757D',
} as const

export const radii = {
  panel: 10, // panel, bảng, banner
  input: 8, // input, button, hàng bảng
  chip: 6, // chip, tag nhỏ
} as const

// Banner: nền tối pha màu + chữ sáng, không phải nền pastel nhạt như trước.
export const bannerColors = {
  error: { bg: 'rgba(240,117,125,0.16)', fg: colors.danger },
  warn: { bg: 'rgba(242,162,92,0.16)', fg: colors.warning },
  info: { bg: colors.accentSoft, fg: colors.text },
} as const

// Trạng thái coverage của member (CoverageTable) — chỉ áp cho ô Total, xem
// ràng buộc trong spec.
export const statusColors = {
  ok: colors.success,
  under: colors.warning,
  empty: colors.danger,
} as const

// CoverageTable cần ba giá trị PHÂN BIỆT nhau: nền hàng tfoot, tint cuối tuần
// của tfoot, và tint cuối tuần trong tbody — mất một trong ba thì cuối tuần
// hết phân biệt được với chính hàng chứa nó. accentOverlay dùng màu accent
// pha loãng để tint cuối tuần trong tbody khác hẳn hai màu xám-tím trung tính
// còn lại (thay vì chỉ khác độ sáng như bản cũ).
export const table = {
  headerBg: colors.surface,
  headerWeekendBg: colors.border,
  groupRowBg: colors.surfaceAlt,
  bodyWeekendBg: 'rgba(150,125,214,0.08)',
  footerBg: colors.surface,
  footerWeekendBg: colors.surfaceAlt,
} as const
