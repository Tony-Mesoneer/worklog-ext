import type { ReactNode } from 'react'
import { Button } from './Button'
import { bannerColors, fontSize, radii, space } from './theme'

// Banner dùng chung ở options, side panel và dashboard — một chỗ đổi màu/khoảng
// cách là đổi được cả ba bề mặt.
//
// aria-live: lỗi xuất hiện sau một hành động (submit, refresh) phải được đọc
// lên, không thì người dùng screen reader bấm Log rồi không biết đã fail.
// Lỗi = assertive (cắt ngang), thông tin khác = polite.
type Props = {
  kind: 'error' | 'warn' | 'info' | 'success'
  children: ReactNode
  action?: { label: string; onClick: () => void }
}

export function Banner({ kind, children, action }: Props) {
  const c = bannerColors[kind]
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      style={{
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        padding: `${space.x2}px ${space.x3}px`,
        borderRadius: radii.panel,
        display: 'flex',
        gap: space.x2,
        alignItems: 'center',
        flexWrap: 'wrap',
        fontSize: fontSize.md,
        lineHeight: 1.45,
      }}
    >
      <div style={{ flex: 1, minWidth: 140 }}>{children}</div>
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
