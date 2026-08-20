// src/ui/dashboard/FilterBar.tsx
import { addDays } from '@/core/jiraTime'

export type Preset = 'sprint' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'custom'

type Props = {
  from: string; to: string; preset: Preset
  sprintRange: { name: string; from: string; to: string } | null
  onChange: (from: string, to: string, preset: Preset) => void
  onRefresh: () => void
  fetchedAt: number | null
  stale: boolean
}

// Tuần bắt đầu thứ Hai.
const mondayOf = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(date, dow === 0 ? -6 : 1 - dow)
}

export function FilterBar(p: Props) {
  const today = p.to
  const apply = (preset: Preset) => {
    if (preset === 'sprint' && p.sprintRange) {
      p.onChange(p.sprintRange.from, p.sprintRange.to, 'sprint')
    } else if (preset === 'thisWeek') {
      const mon = mondayOf(today)
      p.onChange(mon, addDays(mon, 6), 'thisWeek')
    } else if (preset === 'lastWeek') {
      const mon = addDays(mondayOf(today), -7)
      p.onChange(mon, addDays(mon, 6), 'lastWeek')
    } else if (preset === 'thisMonth') {
      p.onChange(`${today.slice(0, 7)}-01`, today, 'thisMonth')
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
      {p.sprintRange && (
        <button onClick={() => apply('sprint')} disabled={p.preset === 'sprint'}>
          {p.sprintRange.name}
        </button>
      )}
      <button onClick={() => apply('thisWeek')} disabled={p.preset === 'thisWeek'}>Tuần này</button>
      <button onClick={() => apply('lastWeek')} disabled={p.preset === 'lastWeek'}>Tuần trước</button>
      <button onClick={() => apply('thisMonth')} disabled={p.preset === 'thisMonth'}>Tháng này</button>

      <input type="date" value={p.from} onChange={(e) => p.onChange(e.target.value, p.to, 'custom')} />
      <input type="date" value={p.to} onChange={(e) => p.onChange(p.from, e.target.value, 'custom')} />

      <button onClick={p.onRefresh} style={{ marginLeft: 'auto' }}>Làm mới</button>
      {p.fetchedAt !== null && (
        <span style={{ color: p.stale ? '#ef6c00' : '#78909c' }}>
          {p.stale ? 'dữ liệu cũ lúc ' : 'cập nhật '}
          {new Date(p.fetchedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  )
}
