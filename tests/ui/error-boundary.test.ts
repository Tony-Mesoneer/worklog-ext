import { describe, it, expect, vi } from 'vitest'
import { createElement, isValidElement } from 'react'
import type { ReactElement } from 'react'
import { ErrorBoundary } from '@/ui/shared/ErrorBoundary'

// vitest.config.ts chạy môi trường 'node' (không jsdom) cho toàn repo. Đã thử
// react-dom/server (renderToStaticMarkup) để né việc thêm jsdom, nhưng bản SSR
// đồng bộ ("legacy") của React 18 KHÔNG chạy error boundary — nó ném lỗi thẳng
// ra ngoài y như không có boundary, nên test kiểu đó chỉ xác nhận hành vi của
// react-dom/server chứ không phải của ErrorBoundary. Mount thật (createRoot,
// bấm nút, window.location.reload, chrome.runtime.openOptionsPage) cần DOM +
// mock chrome, và đó là lý do project không thêm jsdom.
//
// Phần có thể kiểm mà không cần DOM: instance hoá class trực tiếp, gọi các
// lifecycle method React 18 thực sự gọi khi con throw
// (getDerivedStateFromError, componentDidCatch), rồi đọc CÂY REACT ELEMENT mà
// render() trả về (dữ liệu thuần, không cần DOM để tạo hay đọc). Việc này xác
// nhận đúng thứ quan trọng: boundary CHUYỂN sang fallback thay vì rethrow, nội
// dung fallback đúng, và log không rò rỉ gì ngoài error + component stack.

function findText(node: unknown, needle: string): boolean {
  if (typeof node === 'string') return node.includes(needle)
  if (Array.isArray(node)) return node.some((n) => findText(n, needle))
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: unknown }>
    return findText(el.props.children, needle)
  }
  return false
}

describe('ErrorBoundary', () => {
  it('switches to fallback (not rethrow) after getDerivedStateFromError, showing the real message', () => {
    const err = new Error('config hỏng: parseHhMm nhận undefined')
    const state = ErrorBoundary.getDerivedStateFromError(err)
    expect(state.error).toBe(err)

    const boundary = new ErrorBoundary({ children: createElement('span', null, 'nội dung gốc') })
    Object.assign(boundary.state, state)

    const fallback = boundary.render()
    expect(findText(fallback, 'Đã có lỗi')).toBe(true)
    expect(findText(fallback, 'config hỏng: parseHhMm nhận undefined')).toBe(true)
    expect(findText(fallback, 'Tải lại')).toBe(true)
    expect(findText(fallback, 'Mở Options')).toBe(true)
    // Fallback thay thế hẳn con gốc, không còn "nội dung gốc" trong cây trả về.
    expect(findText(fallback, 'nội dung gốc')).toBe(false)
  })

  it('componentDidCatch logs only the error object and the component stack', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const boundary = new ErrorBoundary({ children: null })
      const err = new Error('boom')
      boundary.componentDidCatch(err, { componentStack: '\n    in Boom\n    in ErrorBoundary' })

      expect(spy).toHaveBeenCalledTimes(1)
      const args = spy.mock.calls[0]!
      expect(args).toContain(err)
      expect(args).toContain('\n    in Boom\n    in ErrorBoundary')
    } finally {
      spy.mockRestore()
    }
  })

  it('renders children unchanged when there is no error', () => {
    const child = createElement('span', null, 'ok')
    const boundary = new ErrorBoundary({ children: child })
    expect(boundary.render()).toBe(child)
  })
})
