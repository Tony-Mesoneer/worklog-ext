import { MessageError } from '@/sw/messages'
import { Banner } from './Banner'
import { useT } from './LocaleProvider'
import { ext } from '@/platform/ext'

// Lỗi đã được phân loại cho UI. `auth` tách 401/403 ra khỏi lỗi thường vì spec
// §13 đòi banner riêng ("session Jira hết hạn") kèm đường về Options, chứ không
// phải một dòng đỏ "Jira 401" vô nghĩa với người dùng.
export type UiError = { message: string; auth: boolean }

export function isAuthStatus(status: number | undefined): boolean {
  return status === 401 || status === 403
}

// `message` để RỖNG khi auth: câu chữ phụ thuộc ngôn ngữ, mà toUiError là hàm
// thuần gọi được ngoài React (không có context). ErrorBanner tự điền text auth
// theo locale; chỗ nào cần chuỗi thô thì dùng `t.errors.auth`.
export function toUiError(e: unknown): UiError {
  const status = e instanceof MessageError ? e.status : undefined
  if (isAuthStatus(status)) return { message: '', auth: true }
  return { message: e instanceof Error ? e.message : String(e), auth: false }
}

type Props = {
  error: UiError
  onDismiss?: () => void
}

export function ErrorBanner({ error, onDismiss }: Props) {
  const t = useT()
  const action = error.auth
    ? { label: t.common.openOptions, onClick: () => ext.runtime.openOptionsPage() }
    : onDismiss
      ? { label: t.errors.dismiss, onClick: onDismiss }
      : undefined
  return (
    <Banner kind="error" action={action}>
      {error.auth ? t.errors.auth : error.message}
    </Banner>
  )
}
