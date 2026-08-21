// src/ui/dashboard/FilterBar.tsx
import { useId } from 'react'
import { addDays } from '@/core/jiraTime'
import { Button } from '@/ui/shared/Button'
import { SegmentedControl, type SegmentItem } from '@/ui/shared/SegmentedControl'
import { colors, fontSize, space } from '@/ui/shared/theme'
import { intlLocale, useLocale, useT } from '@/ui/shared/LocaleProvider'

export type Preset = 'sprint' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'custom'

type Props = {
  from: string; to: string; preset: Preset
  sprintRange: { name: string; from: string; to: string } | null
  // Hôm nay theo timezone Jira. Preset phải tính từ đây, KHÔNG từ p.to: lấy
  // p.to thì sau khi bấm "Tuần trước", "Tuần này" lại ra tuần trước lần nữa
  // (mondayOf của một Chủ nhật lùi 6 ngày) và "Tháng này" kết thúc ở một ngày
  // trong quá khứ.
  today: string
  /**
   * Các project key CÓ THỂ chọn: hợp của `config.projects` và những project
   * thật sự xuất hiện trong dữ liệu. Rỗng → không vẽ ô lọc.
   */
  projectOptions: string[]
  /** '' = tất cả project. Đây là mặc định: lọc là TUỲ CHỌN, không phải cổng. */
  project: string
  onProjectChange: (project: string) => void
  onChange: (from: string, to: string, preset: Preset) => void
  onRefresh: () => void
  fetchedAt: number | null
  stale: boolean
  loading: boolean
}

// Tuần bắt đầu thứ Hai.
const mondayOf = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(date, dow === 0 ? -6 : 1 - dow)
}

export function FilterBar(p: Props) {
  const t = useT()
  const locale = useLocale()
  const today = p.today
  const fromId = useId()
  const toId = useId()
  const projectId = useId()

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

  // 'custom' không có nút riêng: nó là hệ quả của việc sửa hai ô date, nên khi
  // preset === 'custom' thì không segment nào được chọn — đúng trạng thái.
  const items: SegmentItem<Preset>[] = [
    ...(p.sprintRange ? [{ value: 'sprint' as Preset, label: p.sprintRange.name }] : []),
    { value: 'thisWeek', label: t.dashboard.presetThisWeek, disabled: today === '' },
    { value: 'lastWeek', label: t.dashboard.presetLastWeek, disabled: today === '' },
    { value: 'thisMonth', label: t.dashboard.presetThisMonth, disabled: today === '' },
  ]

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end',
      gap: `${space.x3}px ${space.x4}px`,
    }}>
      <div className="wl-field">
        <span className="wl-field__label">{t.dashboard.rangeLabel}</span>
        <SegmentedControl
          label={t.dashboard.rangeLabel} items={items} value={p.preset}
          onChange={(v) => apply(v)}
        />
      </div>

      <div style={{ display: 'flex', gap: space.x2, alignItems: 'flex-end' }}>
        <div className="wl-field">
          <label className="wl-field__label" htmlFor={fromId}>{t.dashboard.from}</label>
          <input
            id={fromId} type="date" value={p.from}
            onChange={(e) => p.onChange(e.target.value, p.to, 'custom')}
          />
        </div>
        <div className="wl-field">
          <label className="wl-field__label" htmlFor={toId}>{t.dashboard.to}</label>
          <input
            id={toId} type="date" value={p.to}
            onChange={(e) => p.onChange(p.from, e.target.value, 'custom')}
          />
        </div>
      </div>

      {/* Lọc theo project là THU HẸP tuỳ chọn, không phải phạm vi fetch: dữ
          liệu luôn được lấy cho mọi project mà team đã log, ô này chỉ để lead
          tập trung vào một project khi muốn. Mặc định "Tất cả". */}
      {p.projectOptions.length > 0 && (
        <div className="wl-field">
          <label className="wl-field__label" htmlFor={projectId}>Project</label>
          <select
            id={projectId} value={p.project}
            onChange={(e) => p.onProjectChange(e.target.value)}
          >
            <option value="">{t.dashboard.allProjects}</option>
            {p.projectOptions.map((key) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', gap: space.x2, alignItems: 'center' }}>
        {p.fetchedAt !== null && (
          <span style={{
            fontSize: fontSize.sm,
            color: p.stale ? colors.warning : colors.muted,
            textAlign: 'right',
          }}>
            {/* Giờ theo ngôn ngữ đang chọn: en-US dùng 12h có AM/PM, vi-VN
                dùng 24h — hardcode 'vi-VN' làm UI tiếng Anh hiện "14:05". */}
            {(p.stale ? t.dashboard.staleAt : t.dashboard.updatedAt)(
              new Date(p.fetchedAt).toLocaleTimeString(intlLocale(locale), {
                hour: '2-digit', minute: '2-digit',
              }),
            )}
          </span>
        )}
        <Button onClick={p.onRefresh} loading={p.loading}>{t.dashboard.refresh}</Button>
      </div>
    </div>
  )
}
