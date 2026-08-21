// src/i18n/index.ts
//
// Chọn bộ ngôn ngữ. Thuần — không chạm chrome, không chạm React.
//
// Vì sao KHÔNG dùng chrome.i18n + _locales: `chrome.i18n.getMessage` luôn đọc
// theo ngôn ngữ của BROWSER và không có API nào override được tại runtime, nên
// một "cài đặt ngôn ngữ" trong app là không thể làm bằng nó. `_locales` vẫn là
// đường duy nhất cho tên/mô tả extension trong Chrome — và phần đó sẽ mãi đi
// theo browser, không theo cài đặt này.
import { en, type Messages } from './en'
import { vi } from './vi'
import { DEFAULT_LOCALE, isLocale, type Locale } from './locale'

export type { Messages } from './en'
export {
  LOCALES, DEFAULT_LOCALE, isLocale, intlLocale, rememberLocale, lastKnownLocale,
  type Locale,
} from './locale'

const TABLE: Record<Locale, Messages> = { en, vi }

/** Giá trị lạ → DEFAULT_LOCALE. UI không bao giờ nên trắng chữ vì config rác. */
export const messagesFor = (locale: unknown): Messages =>
  TABLE[isLocale(locale) ? locale : DEFAULT_LOCALE]
