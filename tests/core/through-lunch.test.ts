// tests/core/through-lunch.test.ts
//
// "Làm xuyên trưa" không phải một cờ riêng — nó là hệ quả của việc đặt hai mốc
// giữa ngày bằng nhau (xem HoursSection trong Options). Ba test này khoá đúng
// chuỗi suy luận đó, vì nó rất dễ bị phá bởi một thay đổi trông vô hại: cho
// `breaks` rỗng rơi về default, hoặc cho phép khoảng có độ dài 0 sống sót.
import { describe, it, expect } from 'vitest'
import { migrateConfig, CONFIG_VERSION } from '@/core/config-schema'
import { normalizeBreaks, splitAroundBreaks, parseHhMm, formatMinutes } from '@/core/timeline'

describe('làm xuyên trưa', () => {
  it('breaks rỗng được giữ nguyên, không bị thay bằng default', () => {
    const c = migrateConfig({ version: CONFIG_VERSION, breaks: [] })
    expect(c.breaks).toEqual([])
  })

  it('khoảng nghỉ độ dài 0 bị lọc → không còn giờ nghỉ', () => {
    const c = migrateConfig({
      version: CONFIG_VERSION,
      breaks: [{ start: '12:00', end: '12:00' }],
    })
    expect(c.breaks).toEqual([])
  })

  it('không giờ nghỉ → worklog 4h từ 10:00 KHÔNG bị cắt', () => {
    const segs = splitAroundBreaks(parseHhMm('10:00'), 240, normalizeBreaks([]))
    expect(segs.map((s) => `${formatMinutes(s.startMinutes)}+${s.durationMinutes}`))
      .toEqual(['10:00+240'])
  })
})
