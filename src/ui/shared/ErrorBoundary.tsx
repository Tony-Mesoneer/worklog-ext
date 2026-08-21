// src/ui/shared/ErrorBoundary.tsx
//
// Bọc mỗi root (side panel, dashboard, options) để một lỗi render không làm
// React unmount cả cây và để lại MÀN HÌNH TỐI TRẮNG TRƠN — không chữ, không
// nút, không manh mối. Đây là cách duy nhất bắt được lỗi render trong React 18
// (getDerivedStateFromError/componentDidCatch chỉ tồn tại ở class component),
// không phải lý do để thêm thư viện.
//
// migrateConfig đảm bảo shape config hợp lệ nên nguyên nhân cụ thể đã gặp
// (parseHhMm(undefined) throw) không nên xảy ra trong app thật — nhưng
// "lỗi render bất kỳ = màn hình câm" là một failure mode tệ tự nó, bất kể
// nguyên nhân là gì.
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Banner } from './Banner'
import { fontSize, space } from './theme'
import { lastKnownLocale, messagesFor } from '@/i18n'
import { ext } from '@/platform/ext'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Chỉ log error object + component stack — KHÔNG log message/config nào
    // khác có thể mang token (config.token.apiToken, Authorization header...).
    console.error('[ErrorBoundary] render crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    // Không dùng useT(): đây là class, và nó bọc NGOÀI LocaleProvider (phải vậy,
    // không thì provider sập là màn hình trắng). Đọc locale ghi nhớ gần nhất —
    // một màn hình lỗi không được phụ thuộc vào đúng cái provider vừa sập.
    const t = messagesFor(lastKnownLocale())

    // Render tối giản, không phụ thuộc state/props phức tạp nào khác — bản
    // thân fallback không được phép crash.
    return (
      <div style={{ padding: space.x4, display: 'grid', gap: space.x3 }}>
        <Banner kind="error">{t.errors.boundary(error.message)}</Banner>
        <div style={{ display: 'flex', gap: space.x2, flexWrap: 'wrap' }}>
          <button type="button" className="wl-btn wl-btn--primary" onClick={() => location.reload()}>
            {t.errors.boundaryReload}
          </button>
          <button
            type="button"
            className="wl-btn wl-btn--secondary"
            onClick={() => ext.runtime.openOptionsPage()}
          >
            {t.common.openOptions}
          </button>
        </div>
        <details style={{ fontSize: fontSize.xs }}>
          <summary>{t.errors.boundaryDetails}</summary>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error.stack}</pre>
        </details>
      </div>
    )
  }
}
