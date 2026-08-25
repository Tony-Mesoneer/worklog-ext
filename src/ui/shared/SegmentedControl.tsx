// src/ui/shared/SegmentedControl.tsx
//
// Một control cho hai công việc khác nhau về mặt ngữ nghĩa:
//
//   mode="tabs"   → role="tablist" + aria-selected, roving tabindex, điều hướng
//                   bằng ←/→/Home/End. Dùng cho tab của dashboard và cho preset
//                   date range (chọn một trong nhiều, luôn có đúng một đang chọn).
//   mode="toggle" → nhóm nút aria-pressed, mỗi nút tự tab tới được. Dùng cho
//                   chip duration: có thể KHÔNG chip nào được chọn (người dùng
//                   gõ tay "1h30"), nên aria-selected của tablist là sai nghĩa.
//
// Trạng thái đang chọn tô bằng accent — không bao giờ bằng `disabled`.
import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export type SegmentItem<T> = {
  value: T
  label: ReactNode
  title?: string
  disabled?: boolean
}

type Props<T> = {
  items: SegmentItem<T>[]
  /** null = chưa chọn gì (chỉ hợp lệ với mode="toggle"). */
  value: T | null
  onChange: (value: T) => void
  mode?: 'tabs' | 'toggle'
  /**
   * Giữ mọi item trên MỘT dòng, chật thì cuộn ngang thay vì xuống dòng. Dùng
   * cho hàng duration ở side panel: nó đứng cạnh ô nhập tay, xuống dòng là
   * hàng vỡ làm đôi.
   */
  nowrap?: boolean
  /** Nhãn cho screen reader — bắt buộc, nhóm nút không có tiêu đề nhìn thấy. */
  label: string
}

export function SegmentedControl<T extends string | number>({
  items, value, onChange, mode = 'tabs', nowrap = false, label,
}: Props<T>) {
  const ref = useRef<HTMLDivElement>(null)

  // Điều hướng bàn phím của tablist: Tab chỉ vào/ra khỏi nhóm, ←/→ đổi tab.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (mode !== 'tabs') return
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const enabled = items.filter((i) => i.disabled !== true)
    if (enabled.length === 0) return

    let next: SegmentItem<T> | undefined
    if (delta !== 0) {
      const at = enabled.findIndex((i) => i.value === value)
      next = enabled[(at + delta + enabled.length) % enabled.length]
    } else if (e.key === 'Home') next = enabled[0]
    else if (e.key === 'End') next = enabled[enabled.length - 1]
    else return

    e.preventDefault()
    if (!next) return
    onChange(next.value)
    // Focus theo tab mới để roving tabindex và focus không lệch nhau.
    const idx = items.indexOf(next)
    ref.current?.querySelectorAll('button')[idx]?.focus()
  }

  // Nếu `value` không khớp item nào (mode toggle chưa chọn gì, hoặc preset
  // "custom"), item đầu vẫn phải tab tới được — không thì cả nhóm biến mất
  // khỏi thứ tự tab.
  const anySelected = items.some((i) => i.value === value)

  return (
    <div
      ref={ref}
      className={nowrap ? 'wl-seg wl-seg--nowrap' : 'wl-seg'}
      role={mode === 'tabs' ? 'tablist' : 'group'}
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) => {
        const selected = item.value === value
        const tabbable = mode === 'toggle' || selected || (!anySelected && i === 0)
        return (
          <button
            key={String(item.value)}
            type="button"
            className="wl-seg__item"
            title={item.title}
            disabled={item.disabled}
            role={mode === 'tabs' ? 'tab' : undefined}
            aria-selected={mode === 'tabs' ? selected : undefined}
            aria-pressed={mode === 'toggle' ? selected : undefined}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
