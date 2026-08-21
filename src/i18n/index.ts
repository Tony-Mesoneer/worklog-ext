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

export type { Messages } from './en'

export const LOCALES = ['en', 'vi'] as const
export type Locale = (typeof LOCALES)[number]

/** Ngôn ngữ khi config chưa có gì. */
export const DEFAULT_LOCALE: Locale = 'en'

const TABLE: Record<Locale, Messages> = { en, vi }

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

/** Giá trị lạ → DEFAULT_LOCALE. UI không bao giờ nên trắng chữ vì config rác. */
export const messagesFor = (locale: unknown): Messages =>
  TABLE[isLocale(locale) ? locale : DEFAULT_LOCALE]
