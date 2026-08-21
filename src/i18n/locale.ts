// src/i18n/locale.ts
//
// Chỉ danh tính locale — không import bộ messages nào. Tách khỏi index.ts để
// `core/config-schema` và `ui/shared/format` dùng được mà không kéo theo cả
// en.ts + vi.ts, và để không có vòng import nào giữa config và messages.
export const LOCALES = ['en', 'vi'] as const
export type Locale = (typeof LOCALES)[number]

/** Ngôn ngữ khi config chưa có gì. */
export const DEFAULT_LOCALE: Locale = 'en'

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

/** Tag cho Intl: `toLocaleDateString(intlLocale(locale))`. */
export const intlLocale = (locale: Locale): string =>
  locale === 'vi' ? 'vi-VN' : 'en-US'

// Locale được biết đến gần nhất, ghi bởi LocaleProvider lúc mount.
//
// Chỉ dành cho code KHÔNG đọc được React context: ErrorBoundary là class và nằm
// NGOÀI provider (nó phải bọc cả provider, không thì provider sập là màn hình
// trắng). Mọi component bình thường phải dùng useT().
let lastKnown: Locale = DEFAULT_LOCALE
export const rememberLocale = (locale: Locale): void => { lastKnown = locale }
export const lastKnownLocale = (): Locale => lastKnown
