import type { ReactNode } from 'react'

// Banner dùng chung ở options, side panel và dashboard — một chỗ đổi màu/khoảng
// cách là đổi được cả ba bề mặt.
type Props = {
  kind: 'error' | 'warn' | 'info'
  children: ReactNode
  action?: { label: string; onClick: () => void }
}

const COLORS = {
  error: { bg: '#fdecea', fg: '#611a15' },
  warn: { bg: '#fff8e1', fg: '#5f4300' },
  info: { bg: '#e8f4fd', fg: '#0b3a5b' },
} as const

export function Banner({ kind, children, action }: Props) {
  const c = COLORS[kind]
  return (
    <div style={{
      background: c.bg, color: c.fg, padding: '8px 12px', borderRadius: 6,
      display: 'flex', gap: 8, alignItems: 'center', fontSize: 13,
    }}>
      <div style={{ flex: 1 }}>{children}</div>
      {action && (
        <button onClick={action.onClick} style={{ fontSize: 13 }}>{action.label}</button>
      )}
    </div>
  )
}
