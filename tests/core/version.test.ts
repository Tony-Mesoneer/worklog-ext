// tests/core/version.test.ts
//
// So sánh version, đọc payload GitHub Release, và quyết định có hiện banner.
// Toàn bộ là hàm thuần — không chạm chrome, không chạm network.
import { describe, it, expect } from 'vitest'
import {
  parseVersion, compareVersions, isNewerVersion, stripTagPrefix,
  isRepoSlug, releaseApiUrl, parseRelease, decideUpdate, shouldCheck,
  UPDATE_CHECK_INTERVAL_MS,
} from '@/core/version'

describe('parseVersion', () => {
  it('nhận 1–4 nhóm số như Chrome', () => {
    expect(parseVersion('1')).toEqual([1])
    expect(parseVersion('0.2')).toEqual([0, 2])
    expect(parseVersion('0.2.0')).toEqual([0, 2, 0])
    expect(parseVersion('1.2.3.4')).toEqual([1, 2, 3, 4])
  })

  it('loại chuỗi không phải version Chrome', () => {
    for (const bad of ['', 'v1.0.0', '1.2.3.4.5', '1.0.0-beta', 'abc', '1..2', '1.-1']) {
      expect(parseVersion(bad), bad).toBeNull()
    }
  })

  it('loại giá trị không phải string', () => {
    expect(parseVersion(undefined)).toBeNull()
    expect(parseVersion(123)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('so sánh theo từng nhóm số, không so chuỗi', () => {
    // "0.10.0" > "0.9.0" — so chuỗi sẽ ra ngược.
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1)
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('thiếu nhóm coi như 0', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0')).toBe(1)
  })

  it('version không đọc được → 0, không throw', () => {
    expect(compareVersions('rác', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', 'rác')).toBe(0)
  })
})

describe('isNewerVersion', () => {
  it('chỉ true khi latest lớn hơn thật', () => {
    expect(isNewerVersion('0.3.0', '0.2.0')).toBe(true)
    expect(isNewerVersion('0.2.0', '0.2.0')).toBe(false)
    // Downgrade không bao giờ được coi là update — release bị yank rồi
    // tag lại thấp hơn không được đẩy người dùng về bản cũ.
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false)
  })

  it('không đọc được thì không coi là mới', () => {
    expect(isNewerVersion('rác', '0.2.0')).toBe(false)
  })
})

describe('stripTagPrefix', () => {
  it('bỏ chữ v đầu tag', () => {
    expect(stripTagPrefix('v0.3.0')).toBe('0.3.0')
    expect(stripTagPrefix('0.3.0')).toBe('0.3.0')
    expect(stripTagPrefix('  v1.2.3 ')).toBe('1.2.3')
  })
})

describe('isRepoSlug', () => {
  it('nhận owner/name', () => {
    expect(isRepoSlug('mesoneer/worklog-ext')).toBe(true)
    expect(isRepoSlug('a.b-c_d/e.f-g_h')).toBe(true)
  })

  it('loại chuỗi rỗng, thiếu phần, hoặc là URL', () => {
    for (const bad of ['', 'worklog-ext', 'a/b/c', '/b', 'a/', 'https://github.com/a/b', 'a b/c']) {
      expect(isRepoSlug(bad), bad).toBe(false)
    }
  })
})

describe('releaseApiUrl', () => {
  it('trỏ tới release mới nhất của repo', () => {
    expect(releaseApiUrl('mesoneer/worklog-ext'))
      .toBe('https://api.github.com/repos/mesoneer/worklog-ext/releases/latest')
  })
})

const payload = {
  tag_name: 'v0.3.0',
  html_url: 'https://github.com/o/r/releases/tag/v0.3.0',
  published_at: '2026-08-20T10:00:00Z',
  body: 'ghi chú',
  assets: [
    { name: 'source.txt', browser_download_url: 'https://x/source.txt', size: 10 },
    { name: 'worklog-ext-0.3.0.zip', browser_download_url: 'https://x/w.zip', size: 2048 },
  ],
}

describe('parseRelease', () => {
  it('đọc version từ tag và chọn asset .zip', () => {
    const r = parseRelease(payload)
    expect(r).toEqual({
      version: '0.3.0',
      tag: 'v0.3.0',
      url: 'https://github.com/o/r/releases/tag/v0.3.0',
      downloadUrl: 'https://x/w.zip',
      publishedAt: '2026-08-20T10:00:00Z',
      notes: 'ghi chú',
    })
  })

  it('không có asset .zip thì downloadUrl null, phần còn lại vẫn dùng được', () => {
    const r = parseRelease({ ...payload, assets: [] })
    expect(r?.version).toBe('0.3.0')
    expect(r?.downloadUrl).toBeNull()
  })

  it('field thiếu hoặc sai kiểu → null chứ không throw', () => {
    expect(parseRelease(null)).toBeNull()
    expect(parseRelease({})).toBeNull()
    expect(parseRelease({ tag_name: 'không-phải-version' })).toBeNull()
    expect(parseRelease({ ...payload, assets: 'rác' })?.downloadUrl).toBeNull()
  })

  it('bỏ qua asset thiếu url', () => {
    const r = parseRelease({
      ...payload,
      assets: [{ name: 'a.zip', size: 1 }, { name: 'b.zip', browser_download_url: 'https://x/b.zip' }],
    })
    expect(r?.downloadUrl).toBe('https://x/b.zip')
  })
})

const latest = parseRelease(payload)!

describe('decideUpdate', () => {
  it('có bản mới hơn → available', () => {
    expect(decideUpdate('0.2.0', latest, null)).toEqual({
      state: 'available', latestVersion: '0.3.0',
    })
  })

  it('đang ở bản mới nhất → current', () => {
    expect(decideUpdate('0.3.0', latest, null).state).toBe('current')
  })

  it('bản local cao hơn release (đang dev) → current', () => {
    expect(decideUpdate('0.4.0', latest, null).state).toBe('current')
  })

  it('chưa check được → unknown', () => {
    expect(decideUpdate('0.2.0', null, null).state).toBe('unknown')
  })

  it('đã tắt banner cho đúng version đó → dismissed', () => {
    expect(decideUpdate('0.2.0', latest, '0.3.0').state).toBe('dismissed')
  })

  it('tắt banner bản cũ không che được bản mới hơn', () => {
    expect(decideUpdate('0.2.0', latest, '0.2.5').state).toBe('available')
  })
})

describe('shouldCheck', () => {
  it('chưa check lần nào thì check ngay', () => {
    expect(shouldCheck(0, 1_000)).toBe(true)
  })

  it('trong khoảng interval thì bỏ qua', () => {
    const now = 10_000_000
    expect(shouldCheck(now - 1000, now)).toBe(false)
    expect(shouldCheck(now - UPDATE_CHECK_INTERVAL_MS - 1, now)).toBe(true)
  })

  it('lastCheckedAt ở tương lai (đồng hồ máy bị đổi) vẫn check lại được', () => {
    const now = 10_000_000
    expect(shouldCheck(now + 999_999_999, now)).toBe(true)
  })
})
