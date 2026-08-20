import { MessageError } from '@/sw/messages'
import { Banner } from './Banner'

// Lỗi đã được phân loại cho UI. `auth` tách 401/403 ra khỏi lỗi thường vì spec
// §13 đòi banner riêng ("session Jira hết hạn") kèm đường về Options, chứ không
// phải một dòng đỏ "Jira 401" vô nghĩa với người dùng.
export type UiError = { message: string; auth: boolean }

export const AUTH_TEXT =
  'Session Jira hết hạn hoặc không đủ quyền. Đăng nhập lại Jira rồi thử lại, hoặc nhập API token trong Options.'

export function isAuthStatus(status: number | undefined): boolean {
  return status === 401 || status === 403
}

export function toUiError(e: unknown): UiError {
  const status = e instanceof MessageError ? e.status : undefined
  if (isAuthStatus(status)) return { message: AUTH_TEXT, auth: true }
  return { message: e instanceof Error ? e.message : String(e), auth: false }
}

type Props = {
  error: UiError
  onDismiss?: () => void
}

export function ErrorBanner({ error, onDismiss }: Props) {
  const action = error.auth
    ? { label: 'Mở Options', onClick: () => chrome.runtime.openOptionsPage() }
    : onDismiss
      ? { label: 'Ẩn', onClick: onDismiss }
      : undefined
  return (
    <Banner kind="error" action={action}>
      {error.message}
    </Banner>
  )
}
