// src/ui/shared/theme.ts
//
// Token màu/spacing/type cho các chỗ vẫn cần giá trị inline (style cell bảng,
// màu status, layout grid...). Giá trị phải khớp với custom property trong
// theme.css — hai file này diễn tả cùng một palette dưới hai hình thức khác
// nhau. Không import gì — file thuần TypeScript, dùng được ở mọi layer UI.
//
// Quy tắc: bất kỳ khoảng cách / cỡ chữ / bo góc dùng nhiều hơn một lần đều
// phải lấy từ đây (hoặc từ var(--…) trong CSS), không hardcode tại chỗ.

export const colors = {
  bg: '#141218',
  surface: '#1D1A23',
  surfaceAlt: '#232030',
  border: '#2E2A38',
  borderStrong: '#3D3850',
  text: '#E8E5EE',
  muted: '#9B95A8',
  accent: '#967DD6',
  accentHover: '#A891E0',
  accentRing: '#BCA8F0',
  accentSoft: 'rgba(150,125,214,0.16)',
  accentSofter: 'rgba(150,125,214,0.08)',
  onAccent: '#17121F',
  // Đã nâng sáng & giảm bão hoà so với bộ màu light-theme cũ (#2e7d32 /
  // #ef6c00 / #c62828) — trên nền #141218 chúng đọc được rõ mà không chói.
  success: '#6FCF8B',
  warning: '#F2A25C',
  danger: '#F0757D',
} as const

// Thang spacing 4px — cùng bộ với --space-* trong theme.css.
export const space = {
  x1: 4,
  x2: 8,
  x3: 12,
  x4: 16,
  x5: 24,
  x6: 32,
} as const

// Thang type — cùng bộ với --text-* trong theme.css.
export const fontSize = {
  xs: 11,
  sm: 12,
  md: 13,
  lg: 15,
  xl: 18,
  xxl: 22,
} as const

export const radii = {
  panel: 12, // card, bảng, banner
  input: 8, // input, button
  chip: 6, // chip, tag nhỏ, ô bảng
  pill: 999, // meter, badge tròn
} as const

// Banner: nền tối pha màu + chữ sáng, không phải nền pastel nhạt như trước.
export const bannerColors = {
  error: { bg: 'rgba(240,117,125,0.16)', fg: colors.danger, border: 'rgba(240,117,125,0.35)' },
  warn: { bg: 'rgba(242,162,92,0.16)', fg: colors.warning, border: 'rgba(242,162,92,0.35)' },
  info: { bg: colors.accentSoft, fg: colors.text, border: 'rgba(150,125,214,0.35)' },
  success: { bg: 'rgba(111,207,139,0.14)', fg: colors.success, border: 'rgba(111,207,139,0.35)' },
} as const

// Màu của StatusBadge, theo `statusCategory` của Jira — ĐÚNG BA giá trị nên ba
// màu là đủ cho mọi workflow. Đây KHÔNG phải sự trở lại của `statusColors` cũ
// (cờ ok/under/empty của coverage): đó là một phán xét về người, cái này là một
// nhãn về issue.
//
// Ba màu lấy nguyên từ palette đang có: xám-tím trung tính cho việc chưa bắt
// đầu, accent cho việc đang chạy, xanh cho việc xong. Nền/viền dùng chính các
// giá trị rgba đã có trong `bannerColors` — badge phải đọc ra là NHÃN, nên nền
// mờ + chữ màu, không bao giờ nền đặc.
export const statusCategoryColors = {
  new: { bg: 'rgba(155,149,168,0.12)', fg: colors.muted, border: colors.border },
  indeterminate: { bg: colors.accentSoft, fg: colors.accentRing, border: 'rgba(150,125,214,0.35)' },
  done: { bg: 'rgba(111,207,139,0.14)', fg: colors.success, border: 'rgba(111,207,139,0.35)' },
} as const

// Không còn `statusColors`: cờ nhị phân ok/under/empty đã bị thay bằng thanh
// tỉ lệ (ProgressBar + progressTone). `CoverageRow.status` của core vẫn nguyên,
// chỉ là UI không tô màu theo nó nữa.

// CoverageTable cần ba giá trị PHÂN BIỆT nhau: nền hàng tfoot, tint cuối tuần
// của tfoot, và tint cuối tuần trong tbody — mất một trong ba thì cuối tuần
// hết phân biệt được với chính hàng chứa nó. accentOverlay dùng màu accent
// pha loãng để tint cuối tuần trong tbody khác hẳn hai màu xám-tím trung tính
// còn lại (thay vì chỉ khác độ sáng như bản cũ).
// Sọc chéo mờ = "khoảng thời gian không làm việc" (ngày nghỉ, giờ nghỉ trưa).
// Khớp với --stripe-non-working trong theme.css — một ý nghĩa, một hình thức.
export const nonWorkingStripe =
  'repeating-linear-gradient(135deg, rgba(155,149,168,0.10) 0 4px, transparent 4px 8px)'

export const table = {
  headerBg: colors.surfaceAlt,
  headerWeekendBg: colors.border,
  groupRowBg: colors.surface,
  bodyWeekendBg: 'rgba(150,125,214,0.08)',
  footerBg: colors.surfaceAlt,
  footerWeekendBg: colors.border,
  // Ngày nghỉ đã đánh dấu — sọc chéo mờ để phân biệt "nghỉ" với "quên log".
  dayOffBg: nonWorkingStripe,
} as const
