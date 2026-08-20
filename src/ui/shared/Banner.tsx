import type { ReactNode } from 'react'
import { bannerColors, radii } from './theme'

// Banner dùng chung ở options, side panel và dashboard — một chỗ đổi màu/khoảng
// cách là đổi được cả ba bề mặt.
type Props = {
  kind: 'error' | 'warn' | 'info'
  children: ReactNode
  action?: { label: string; onClick: () => void }
}

export function Banner({ kind, children, action }: Props) {
  const c = bannerColors[kind]
  return (
    <div style={{
      background: c.bg, color: c.fg, padding: '8px 12px', borderRadius: radii.panel,
      display: 'flex', gap: 8, alignItems: 'center', fontSize: 13,
    }}>
      <div style={{ flex: 1 }}>{children}</div>
      {action && (
        <button onClick={action.onClick} style={{ fontSize: 13 }}>{action.label}</button>
      )}
    </div>
  )
}
