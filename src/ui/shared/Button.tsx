// src/ui/shared/Button.tsx
//
// Nút dùng chung cho cả ba bề mặt. Luôn là <button> thật — không có div bấm
// được ở đâu trong sản phẩm này.
//
// Vì sao className chứ không style object: trạng thái :hover / :focus-visible /
// :active / :disabled không diễn tả được bằng inline style. Toàn bộ trạng thái
// nằm trong .wl-btn* ở theme.css, ở đây chỉ chọn variant.
import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  block?: boolean
  /** Nút chỉ có icon/ký hiệu — bắt buộc kèm aria-label vì không có text đọc được. */
  iconOnly?: boolean
  /** Đang chờ request: hiện spinner và tự khoá nút. */
  loading?: boolean
  children?: ReactNode
}

// forwardRef: CellDetail cần focus() vào nút Đóng khi panel mở bằng bàn phím.
export const Button = forwardRef<HTMLButtonElement, Props>(function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  iconOnly = false,
  loading = false,
  disabled = false,
  type = 'button',
  children,
  ...rest
}, ref) {
  const cls = [
    'wl-btn',
    `wl-btn--${variant}`,
    size === 'md' ? '' : `wl-btn--${size}`,
    block ? 'wl-btn--block' : '',
    iconOnly ? 'wl-btn--icon' : '',
  ].filter((c) => c !== '').join(' ')

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="wl-spinner" aria-hidden="true" />}
      {children}
    </button>
  )
})
