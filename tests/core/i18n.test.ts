// tests/core/i18n.test.ts
//
// TS đã chặn thiếu key (vi khai báo `: Messages`). Test ở đây chặn những gì kiểu
// không thấy được: value rỗng, và bản dịch bị copy nguyên từ tiếng Anh.
import { describe, it, expect } from 'vitest'
import { en } from '@/i18n/en'
import { vi } from '@/i18n/vi'
import { messagesFor, isLocale, LOCALES, DEFAULT_LOCALE } from '@/i18n'

// Đi hết cây messages, trả về [đường dẫn, giá trị]. Hàm được gọi với tham số giả
// để lấy chuỗi kết quả — một hàm trả về chuỗi rỗng cũng là bản dịch thiếu.
const walk = (node: unknown, path: string[] = []): Array<[string, string]> => {
  if (typeof node === 'string') return [[path.join('.'), node]]
  if (typeof node === 'function') {
    const args = Array.from({ length: node.length }, (_, i) => (i === 1 ? 1 : 'x'))
    return [[path.join('.'), String((node as (...a: unknown[]) => string)(...args))]]
  }
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([k, v]) => walk(v, [...path, k]))
  }
  return []
}

const enEntries = walk(en)
const viEntries = walk(vi)

describe('bộ ngôn ngữ', () => {
  it('vi và en có ĐÚNG cùng tập đường dẫn', () => {
    expect(viEntries.map(([p]) => p).sort()).toEqual(enEntries.map(([p]) => p).sort())
  })

  it('không có value nào rỗng hay chỉ khoảng trắng', () => {
    for (const [locale, entries] of [['en', enEntries], ['vi', viEntries]] as const) {
      for (const [path, value] of entries) {
        expect(value.trim(), `${locale}.${path}`).not.toBe('')
      }
    }
  })

  it('hàm nhận đúng cùng số tham số ở cả hai bộ', () => {
    // TS đã kiểm kiểu, nhưng một hàm bỏ quên tham số vẫn hợp kiểu nếu nó chỉ
    // dùng ít hơn — và khi đó bản dịch sẽ đánh rơi một giá trị.
    const arity = (node: unknown, path: string[] = []): Array<[string, number]> => {
      if (typeof node === 'function') return [[path.join('.'), node.length]]
      if (typeof node === 'object' && node !== null) {
        return Object.entries(node).flatMap(([k, v]) => arity(v, [...path, k]))
      }
      return []
    }
    expect(Object.fromEntries(arity(vi))).toEqual(Object.fromEntries(arity(en)))
  })

  it('mỗi chuỗi tiếng Việt phải KHÁC bản tiếng Anh, trừ danh sách miễn trừ', () => {
    // Hai loại được miễn, liệt kê từng key chứ không miễn theo pattern — một
    // bản dịch bị bỏ quên phải fail chứ không lẫn vào đây được:
    //   1. Thuật ngữ Jira mà UI tiếng Việt vẫn giữ nguyên tiếng Anh
    //      ("Coverage", "Assignee", "Points"…) — dịch chúng làm người dùng khó
    //      đối chiếu với chính Jira.
    //   2. Hàm CHỈ định dạng, không chứa từ nào để dịch. `listJoin` với một
    //      phần tử trả về đúng phần tử đó; nó chỉ khác nhau từ hai phần tử trở
    //      lên ("and" vs "và"), mà walker chỉ gọi với một tham số.
    const same = new Set([
      'language.en', 'language.vi',
      'options.jira.title', 'options.token.tokenLabel', 'options.token.tokenPlaceholder',
      'options.projects.title', 'options.projects.keyLabel', 'options.board.label',
      'options.members.colMember', 'options.members.colActive',
      'options.events.newIssueKeyPlaceholder', 'options.events.newCommentPlaceholder',
      'options.events.issueKeyPlaceholder', 'options.update.repoPlaceholder',
      'dashboard.tabCoverage', 'dashboard.coverage', 'dashboard.memberIssue',
      'dashboard.dayOffShort', 'dashboard.colIssue', 'dashboard.colAssignee',
      'dashboard.colStatus', 'dashboard.colPoints',
      'sidepanel.logButton', 'sidepanel.listJoin', 'sidepanel.eventDisabled',
    ])
    const enMap = new Map(enEntries)
    for (const [path, value] of viEntries) {
      if (same.has(path)) continue
      expect(value, `${path} chưa dịch`).not.toBe(enMap.get(path))
    }
  })
})

describe('messagesFor', () => {
  it('trả đúng bộ cho từng locale', () => {
    expect(messagesFor('en')).toBe(en)
    expect(messagesFor('vi')).toBe(vi)
  })

  it('giá trị lạ → default, không bao giờ undefined', () => {
    for (const junk of ['fr', '', null, undefined, 42, {}]) {
      expect(messagesFor(junk)).toBe(messagesFor(DEFAULT_LOCALE))
    }
  })

  it('default là en', () => {
    expect(DEFAULT_LOCALE).toBe('en')
  })
})

describe('isLocale', () => {
  it('chỉ nhận locale trong LOCALES', () => {
    for (const l of LOCALES) expect(isLocale(l)).toBe(true)
    for (const junk of ['fr', 'EN', '', null, 42]) expect(isLocale(junk)).toBe(false)
  })
})
