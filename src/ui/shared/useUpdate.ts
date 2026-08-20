// src/ui/shared/useUpdate.ts
//
// Trạng thái "có bản mới không" cho cả side panel, dashboard và Options.
//
// Hai bước có chủ ý: `update/status` đọc cache và trả về NGAY (không mạng), rồi
// `update/check` chạy nền để làm mới. Nếu chỉ có bước hai thì mỗi lần mở panel
// người dùng phải đợi round-trip ra GitHub mới thấy được gì; nếu chỉ có bước
// một thì cache không bao giờ được làm mới ở máy ít khi để SW sống lâu.
import { useCallback, useEffect, useState } from 'react'
import { send } from '@/sw/messages'
import type { UpdateStatusResult } from '@/sw/update'
import { toUiError } from './errors'

export type UseUpdate = {
  status: UpdateStatusResult | null
  checking: boolean
  /** Lỗi của lượt bấm "Kiểm tra ngay". Lỗi của lượt tự động nằm ở status.lastError. */
  error: string | null
  check: () => Promise<void>
  dismiss: () => Promise<void>
}

export function useUpdate(): UseUpdate {
  const [status, setStatus] = useState<UpdateStatusResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const set = (s: UpdateStatusResult) => { if (alive) setStatus(s) }
    void send<UpdateStatusResult>({ type: 'update/status' })
      .then(set)
      // force = false: SW tự bỏ qua nếu chưa tới hạn, nên gọi ở mỗi lần mở UI
      // là an toàn với rate limit.
      .then(() => send<UpdateStatusResult>({ type: 'update/check', force: false }))
      .then(set)
      // Lỗi của lượt nền KHÔNG hiện lên: người dùng không yêu cầu gì cả, và
      // "không hỏi được GitHub" không phải việc của họ lúc đang log giờ.
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const check = useCallback(async () => {
    setChecking(true)
    setError(null)
    try {
      setStatus(await send<UpdateStatusResult>({ type: 'update/check', force: true }))
    } catch (e) {
      setError(toUiError(e).message)
    } finally {
      setChecking(false)
    }
  }, [])

  const dismiss = useCallback(async () => {
    const version = status?.latest?.version
    if (!version) return
    try {
      setStatus(await send<UpdateStatusResult>({ type: 'update/dismiss', version }))
    } catch (e) {
      setError(toUiError(e).message)
    }
  }, [status])

  return { status, checking, error, check, dismiss }
}
