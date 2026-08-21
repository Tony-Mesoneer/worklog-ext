// src/ui/shared/LocaleProvider.tsx
//
// Cấp bộ messages cho cả ba bề mặt UI, và theo dõi thay đổi để đổi ngôn ngữ ở
// Options thì side panel ĐANG MỞ tự đổi theo, không phải reload.
//
// Đọc config trực tiếp từ chrome.storage.local (qua loadConfig) chứ không qua
// message `config/load`: chữ là thứ cần có ở lần render ĐẦU TIÊN, và đánh thức
// service worker chỉ để lấy một locale là đắt vô ích. loadConfig chỉ chạm
// storage.local nên nó dùng được ở mọi trang extension.
//
// `chrome.storage.onChanged` là cách duy nhất biết được thay đổi từ MỘT TRANG
// KHÁC. Không có nó thì đổi ngôn ngữ ở Options không ảnh hưởng side panel đang
// mở, và người dùng thấy hai nửa app nói hai ngôn ngữ.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_LOCALE, isLocale, messagesFor, type Locale, type Messages } from '@/i18n'
import { loadConfig } from '@/store/config'

const LocaleContext = createContext<{ locale: Locale; t: Messages }>({
  locale: DEFAULT_LOCALE,
  t: messagesFor(DEFAULT_LOCALE),
})

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    let alive = true
    // Lỗi đọc config KHÔNG được làm trắng UI: giữ DEFAULT_LOCALE và để component
    // bên trong báo lỗi config theo cách của nó.
    void loadConfig()
      .then((c) => { if (alive) setLocale(c.locale) })
      .catch(() => {})

    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local' || !('config' in changes)) return
      const next = changes['config']?.newValue as { locale?: unknown } | undefined
      // Kiểm qua isLocale thay vì tin newValue: đây là dữ liệu THÔ từ storage,
      // không phải Config đã qua migrateConfig. Giá trị lạ → giữ nguyên locale
      // đang dùng, không nhảy về default giữa phiên.
      if (isLocale(next?.locale)) setLocale(next.locale)
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => {
      alive = false
      chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [])

  return (
    <LocaleContext.Provider value={{ locale, t: messagesFor(locale) }}>
      {children}
    </LocaleContext.Provider>
  )
}

/** Bộ messages hiện tại. Không bao giờ undefined — context có default. */
export const useT = (): Messages => useContext(LocaleContext).t

/** Locale hiện tại, cho `toLocaleString` và bạn bè. */
export const useLocale = (): Locale => useContext(LocaleContext).locale

/** Tag cho Intl: `toLocaleDateString(intlLocale(locale))`. */
export const intlLocale = (locale: Locale): string =>
  locale === 'vi' ? 'vi-VN' : 'en-US'
