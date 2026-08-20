// src/ui/shared/Card.tsx
//
// Nhóm nội dung thành một khối có bề mặt riêng. Đây là primitive giải quyết
// khiếu nại lớn nhất về cấu trúc cũ: mọi thứ nằm trên MỘT bề mặt phẳng nên
// header, timeline, form và link dashboard đọc ra ngang tầm quan trọng.
//
// `title` optional: card không tiêu đề vẫn hữu ích (ví dụ hàng summary).
// `actions` là chỗ cho control phụ nằm cùng dòng tiêu đề (nút "Làm mới"...).
import type { ReactNode } from 'react'

type Props = {
  title?: string
  actions?: ReactNode
  /** Bỏ padding của body — dùng khi con là bảng tự có padding riêng. */
  flush?: boolean
  children: ReactNode
}

export function Card({ title, actions, flush = false, children }: Props) {
  return (
    <section className={flush ? 'wl-card wl-card--flush' : 'wl-card'}>
      {(title !== undefined || actions !== undefined) && (
        <div className="wl-card__head">
          {title !== undefined && <h2 className="wl-card__title">{title}</h2>}
          {actions !== undefined && <div style={{ marginLeft: 'auto' }}>{actions}</div>}
        </div>
      )}
      <div className="wl-card__body">{children}</div>
    </section>
  )
}
