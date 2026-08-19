# Worklog Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome extension MV3 để log worklog Jira trong dưới 5 giây, và cho team lead một bảng theo dõi giờ log của cả team.

**Architecture:** Extension-only, không backend. Jira Cloud REST API là source of truth duy nhất; `chrome.storage.local` chỉ giữ config và snapshot cache có TTL. Toàn bộ logic dễ sai nằm trong `src/core/` — thư mục này không được import `chrome` hay `fetch`, nên test được bằng vitest không cần browser. Ba bề mặt UI (side panel để log, dashboard full-tab cho lead, options để setup) không gọi Jira trực tiếp mà gửi message tới service worker.

**Tech Stack:** TypeScript, React 18, Vite, `@crxjs/vite-plugin`, vitest. Không thêm state manager, không thêm UI framework, không thêm date library — `core/` tự xử lý ngày tháng bằng chuỗi `YYYY-MM-DD` và phút-từ-nửa-đêm.

**Spec:** `docs/superpowers/specs/2026-08-19-worklog-extension-design.md`

## Global Constraints

Mọi task đều phải tuân các ràng buộc này.

- **`src/core/` không được import `chrome`, `fetch`, `react`, hay bất cứ gì từ `src/jira/`, `src/store/`, `src/ui/`.** Chỉ TypeScript thuần. Đây là ràng buộc kiến trúc quan trọng nhất của dự án.
- **`src/ui/` không được import `src/jira/`.** Mọi request Jira đi qua `chrome.runtime.sendMessage` tới service worker.
- **Không content script.** Không inject gì vào DOM của Jira.
- **Không dùng `chrome.storage.sync`.** Chỉ `chrome.storage.local` — để API token không bị đẩy lên Google account.
- **Không bao giờ log token, `Authorization` header, hay cookie** ra console.
- **`authMode` mặc định là `'cookie'`** (spike 2026-08-19 xác nhận cookie session ghi worklog được). Mọi request ghi gửi kèm header `X-Atlassian-Token: no-check` vô điều kiện.
- **Timezone lấy từ Jira profile** (`GET /rest/api/3/myself` → `timeZone`), không lấy từ browser.
- **Tối đa 5 request Jira song song.** Retry `429` tối đa 3 lần, tôn trọng `Retry-After`. Timeout 15s/request.
- **Snapshot TTL 5 phút.** Khi Jira lỗi, hiện snapshot cũ kèm timestamp — không bao giờ render 0h như thể team chưa log.
- **Không có timer start/stop.** Duration chỉ từ preset hoặc nhập tay.
- **Không log hộ member.** Jira Cloud luôn gán worklog author = người gọi API.
- **Slot mặc định 15 phút, `workdayStart` mặc định `"09:00"`, preset duration `[15, 30, 60, 240, 360, 480]` phút.**
- **Ngôn ngữ UI: tiếng Việt.** Comment trong code: tiếng Việt cho phần giải thích quyết định, tiếng Anh cho tên biến/hàm.

---

## File Structure

```
worklog-ext/
  package.json                      # deps + scripts
  tsconfig.json
  vite.config.ts                    # crxjs plugin, alias @/ → src/
  vitest.config.ts                  # môi trường node, không jsdom cho core
  manifest.json                     # MV3
  src/
    core/                           # LOGIC THUẦN — không chrome, không fetch
      duration.ts                   # parse/format duration ↔ seconds
      jiraTime.ts                   # started ISO ↔ (date, phút-từ-nửa-đêm)
      timeline.ts                   # slot 15m, next free start, overlap
      coverage.ts                   # worklogs → bảng member × ngày + total
      points.ts                     # story points vs giờ, h/point, median
      config-schema.ts              # type Config + default + migrate (pure)
      snapshot-key.ts               # key cache + kiểm tra stale (pure)
    jira/
      auth.ts                       # cookieAuth / tokenAuth
      client.ts                     # fetch wrapper: semaphore, retry, timeout
      endpoints.ts                  # các call Jira có type
    store/
      config.ts                     # đọc/ghi config qua chrome.storage.local
      snapshot.ts                   # đọc/ghi snapshot cache
    sw/
      index.ts                      # service worker: router message
      handlers.ts                   # handler cho từng loại message
      messages.ts                   # type của message (ui và sw cùng import)
    ui/
      shared/
        useMessage.ts               # hook gửi message tới sw
        Banner.tsx                  # banner lỗi auth / offline / snapshot cũ
        format.ts                   # wrapper mỏng quanh core/duration cho UI
      sidepanel/
        index.html | main.tsx | SidePanel.tsx
        DayTimeline.tsx | IssuePicker.tsx | EventButtons.tsx | LogForm.tsx
      dashboard/
        index.html | main.tsx | Dashboard.tsx
        FilterBar.tsx | CoverageTable.tsx | PointsTable.tsx | CellDetail.tsx
      options/
        index.html | main.tsx | Options.tsx
  tests/
    core/                           # mirror src/core/
    jira/
  spike/auth-probe.js               # đã chạy, giữ để chạy lại khi đổi instance
  docs/superpowers/
    specs/2026-08-19-worklog-extension-design.md
    plans/2026-08-19-worklog-extension.md
```

Quyết định decomposition: `core/` chia theo **miền vấn đề** (duration, time, timeline, coverage, points), không chia theo layer. Mỗi file trả lời một câu hỏi và test được độc lập. UI chia theo **bề mặt** rồi theo khối trong bề mặt đó — file nào thay đổi cùng nhau thì nằm cùng nhau.

---

## Task 1: Scaffold — extension load được vào Chrome

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `manifest.json`
- Create: `src/sw/index.ts`
- Create: `src/ui/sidepanel/index.html`, `src/ui/sidepanel/main.tsx`
- Create: `src/ui/dashboard/index.html`, `src/ui/dashboard/main.tsx`
- Create: `src/ui/options/index.html`, `src/ui/options/main.tsx`
- Test: `tests/core/smoke.test.ts`

**Interfaces:**
- Consumes: không có (task đầu).
- Produces: `npm run build` ra `dist/` load được; `npm test` chạy vitest; alias `@/` trỏ `src/`.

- [ ] **Step 1: Tạo `package.json`**

Các version dưới đây là **sàn**, không phải pin. Chạy `npm install` và để npm resolve bản mới tương thích.

```json
{
  "name": "worklog-ext",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.28",
    "@types/chrome": "^0.0.268",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

CRXJS v2 còn ở beta. Nếu `npm run build` fail vì plugin, **fallback**: bỏ `@crxjs/vite-plugin`, dùng Vite multi-page build (`build.rollupOptions.input` trỏ 3 file html) và copy `manifest.json` sang `dist/` bằng một script `node scripts/copy-manifest.mjs`. Ghi lại lựa chọn vào README nếu phải fallback.

- [ ] **Step 2: Tạo `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["chrome", "vitest/globals"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

`noUncheckedIndexedAccess` bật có chủ ý: `core/coverage.ts` và `core/timeline.ts` truy cập mảng và `Record` rất nhiều, đây là nơi lỗi `undefined` hay lọt.

- [ ] **Step 3: Tạo `vite.config.ts` và `vitest.config.ts`**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { fileURLToPath, URL } from 'node:url'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  test: { environment: 'node', globals: true, include: ['tests/**/*.test.ts'] },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
```

`environment: 'node'` chứ không `jsdom`: `core/` không cần DOM, và test chạy nhanh hơn. Nếu về sau cần test component React thì thêm file config riêng, không đổi cái này.

- [ ] **Step 4: Tạo `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Worklog",
  "version": "0.1.0",
  "description": "Log worklog Jira nhanh, theo dõi giờ log của team",
  "action": { "default_title": "Worklog" },
  "background": { "service_worker": "src/sw/index.ts", "type": "module" },
  "side_panel": { "default_path": "src/ui/sidepanel/index.html" },
  "options_page": "src/ui/options/index.html",
  "permissions": ["storage", "sidePanel", "tabs"],
  "optional_host_permissions": ["https://*/*"],
  "commands": {
    "open-sidepanel": {
      "suggested_key": { "default": "Ctrl+Shift+L", "mac": "Command+Shift+L" },
      "description": "Mở Worklog side panel"
    }
  }
}
```

`optional_host_permissions` thay vì `host_permissions`: quyền được xin lúc runtime trong Options, nên đổi Jira instance không cần build lại. Không khai báo `web_accessible_resources` — dashboard là extension page, mở bằng `chrome.tabs.create`.

- [ ] **Step 5: Tạo service worker tối thiểu**

```ts
// src/sw/index.ts
// Click icon → mở side panel. Đây là hành vi duy nhất ở task 1.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error('[sw] setPanelBehavior', e))

chrome.runtime.onInstalled.addListener(() => {
  console.log('[sw] installed')
})
```

- [ ] **Step 6: Tạo ba trang UI rỗng**

Ba trang cùng khuôn. Ví dụ side panel:

```html
<!-- src/ui/sidepanel/index.html -->
<!doctype html>
<html lang="vi">
  <head><meta charset="utf-8" /><title>Worklog</title></head>
  <body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

```tsx
// src/ui/sidepanel/main.tsx
import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')!).render(<div>Side panel</div>)
```

Làm y hệt cho `dashboard` (render `<div>Dashboard</div>`) và `options` (render `<div>Options</div>`).

- [ ] **Step 7: Viết smoke test cho hạ tầng test**

```ts
// tests/core/smoke.test.ts
import { describe, it, expect } from 'vitest'

describe('hạ tầng test', () => {
  it('chạy được và resolve alias @/', async () => {
    // import động để test fail rõ ràng nếu alias sai
    const mod = await import('@/core/duration')
    expect(typeof mod.parseDuration).toBe('function')
  })
})
```

- [ ] **Step 8: Chạy test để xác nhận nó FAIL**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/core/duration'`. Đây là fail đúng: alias hoạt động, chỉ thiếu file. Task 2 sẽ làm nó xanh.

- [ ] **Step 9: Build và load vào Chrome**

Run: `npm run build`
Expected: `dist/` được tạo, không lỗi TypeScript.

Rồi: `chrome://extensions` → bật Developer mode → **Load unpacked** → chọn `dist/`.
Expected: extension "Worklog" xuất hiện, không có lỗi đỏ. Click icon → side panel mở, hiện "Side panel". Mở Options từ menu extension → hiện "Options".

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold MV3 extension với Vite, React, vitest"
```

---

## Task 2: `core/duration.ts` — parse và format duration

**Files:**
- Create: `src/core/duration.ts`
- Test: `tests/core/duration.test.ts`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `parseDuration(input: string): number | null` — trả về **giây**, `null` nếu không hợp lệ.
  - `formatDuration(seconds: number): string` — `"2h 30m"`, `"45m"`, `"3h"`.
  - `formatHhMm(seconds: number): string` — `"2:30"` (dùng trong ô bảng dashboard).

- [ ] **Step 1: Viết test fail**

```ts
// tests/core/duration.test.ts
import { describe, it, expect } from 'vitest'
import { parseDuration, formatDuration, formatHhMm } from '@/core/duration'

describe('parseDuration', () => {
  it('parse dạng giờ + phút liền nhau', () => {
    expect(parseDuration('1h30')).toBe(5400)
    expect(parseDuration('1h30m')).toBe(5400)
    expect(parseDuration('1h 30m')).toBe(5400)
  })

  it('parse chỉ giờ hoặc chỉ phút', () => {
    expect(parseDuration('2h')).toBe(7200)
    expect(parseDuration('90m')).toBe(5400)
    expect(parseDuration('15m')).toBe(900)
  })

  it('parse giờ thập phân', () => {
    expect(parseDuration('1.5h')).toBe(5400)
    expect(parseDuration('0.25h')).toBe(900)
  })

  it('số trần được hiểu là phút', () => {
    // Người dùng gõ "45" hầu như luôn có ý 45 phút, không phải 45 giờ.
    expect(parseDuration('45')).toBe(2700)
  })

  it('không phân biệt hoa thường và bỏ qua khoảng trắng', () => {
    expect(parseDuration('  2H 15M ')).toBe(8100)
  })

  it('trả null cho input không hợp lệ', () => {
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
    expect(parseDuration('-1h')).toBeNull()
    expect(parseDuration('1h2h')).toBeNull()
    expect(parseDuration('1d')).toBeNull()
  })

  it('trả null cho 0 — Jira từ chối worklog 0 giây', () => {
    expect(parseDuration('0')).toBeNull()
    expect(parseDuration('0m')).toBeNull()
    expect(parseDuration('0h')).toBeNull()
  })

  it('làm tròn xuống giây, không trả số thập phân', () => {
    // 0.1h = 360s đúng; 1.234h phải ra số nguyên
    expect(Number.isInteger(parseDuration('1.234h')!)).toBe(true)
  })
})

describe('formatDuration', () => {
  it('format giờ và phút', () => {
    expect(formatDuration(5400)).toBe('1h 30m')
    expect(formatDuration(7200)).toBe('2h')
    expect(formatDuration(2700)).toBe('45m')
    expect(formatDuration(0)).toBe('0m')
  })
})

describe('formatHhMm', () => {
  it('format dạng h:mm cho ô bảng', () => {
    expect(formatHhMm(5400)).toBe('1:30')
    expect(formatHhMm(7200)).toBe('2:00')
    expect(formatHhMm(2700)).toBe('0:45')
    expect(formatHhMm(0)).toBe('0:00')
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/core/duration.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Implement**

```ts
// src/core/duration.ts

// Chấp nhận: "1h30", "1h30m", "1h 30m", "2h", "90m", "1.5h", "45" (= 45 phút).
// Từ chối: rỗng, âm, 0, đơn vị lạ ("1d"), đơn vị lặp ("1h2h").
const PATTERN = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m?)?$/

export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (s === '') return null

  const m = PATTERN.exec(s)
  if (!m) return null

  const [, hoursRaw, restRaw] = m
  if (hoursRaw === undefined && restRaw === undefined) return null

  const hours = hoursRaw === undefined ? 0 : Number(hoursRaw)
  // Phần thứ hai là phút trong cả hai trường hợp: có "h" đứng trước ("1h30")
  // hoặc là số trần ("45"). Ta không bao giờ hiểu số trần là giờ.
  const minutes = restRaw === undefined ? 0 : Number(restRaw)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null

  const seconds = Math.floor(hours * 3600 + minutes * 60)
  return seconds > 0 ? seconds : null
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatHhMm(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}:${String(m).padStart(2, '0')}`
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run tests/core/duration.test.ts`
Expected: PASS, tất cả case.

Nếu case `'1h2h'` vẫn pass sai (parse ra số) thì regex đang khớp lỏng — kiểm tra lại rằng `^...$` có anchor và nhóm giờ không lặp được.

- [ ] **Step 5: Chạy smoke test của task 1 — giờ nó phải xanh**

Run: `npm test`
Expected: cả `smoke.test.ts` và `duration.test.ts` PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/duration.ts tests/core/duration.test.ts
git commit -m "feat(core): parse và format duration worklog"
```

---

## Task 3: `core/jiraTime.ts` — chuyển đổi thời gian Jira

Đây là task rủi ro cao nhất trong `core/`: sai ở đây thì worklog rơi sang ngày khác và mọi con số trên dashboard lệch mà không báo lỗi. Spec §12 là nguồn của các quyết định dưới đây.

**Files:**
- Create: `src/core/jiraTime.ts`
- Test: `tests/core/jiraTime.test.ts`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `parseStarted(started: string): { date: string; minutes: number }` — `date` là `"YYYY-MM-DD"`, `minutes` là phút-từ-nửa-đêm.
  - `formatStarted(date: string, minutes: number, offsetMinutes: number): string` — ra `"2026-08-19T09:00:00.000+0700"`.
  - `parseOffsetMinutes(iso: string): number | null`
  - `offsetMinutesForZone(timeZone: string, date: string): number`
  - `addDays(date: string, delta: number): string`
  - `todayInZone(timeZone: string, now: Date): string`

**Quyết định then chốt:** `parseStarted` đọc **wall-clock nguyên văn** từ chuỗi, không đi qua `new Date()`. Lý do: `new Date("...+0700")` cho ra một instant, rồi mọi cách đọc lại nó đều dịch sang timezone của browser — worklog 09:00 của một người ở UTC+7 sẽ hiện thành 02:00 UTC hoặc 04:00 ở Chrome chạy tz khác, và nếu qua nửa đêm thì lệch cả ngày. Offset trong chuỗi cho biết giờ địa phương mà tác giả worklog *có ý* ghi; đó chính là ngữ nghĩa dashboard cần ("ai log bao nhiêu vào ngày nào").

- [ ] **Step 1: Viết test fail**

```ts
// tests/core/jiraTime.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseStarted, formatStarted, parseOffsetMinutes,
  offsetMinutesForZone, addDays, todayInZone,
} from '@/core/jiraTime'

describe('parseStarted', () => {
  it('đọc wall-clock nguyên văn, không dịch timezone', () => {
    expect(parseStarted('2026-08-19T09:00:00.000+0700'))
      .toEqual({ date: '2026-08-19', minutes: 540 })
  })

  it('không bị ảnh hưởng bởi offset — offset chỉ là metadata', () => {
    // Cùng wall-clock, khác offset → cùng kết quả. Đây là hành vi có chủ ý.
    expect(parseStarted('2026-08-19T09:00:00.000+0200'))
      .toEqual({ date: '2026-08-19', minutes: 540 })
  })

  it('xử lý giờ sát nửa đêm mà không nhảy ngày', () => {
    expect(parseStarted('2026-08-19T23:45:00.000+0700'))
      .toEqual({ date: '2026-08-19', minutes: 1425 })
    expect(parseStarted('2026-08-19T00:15:00.000+0700'))
      .toEqual({ date: '2026-08-19', minutes: 15 })
  })

  it('chấp nhận dạng offset có dấu hai chấm và dạng Z', () => {
    expect(parseStarted('2026-08-19T09:30:00.000+07:00'))
      .toEqual({ date: '2026-08-19', minutes: 570 })
    expect(parseStarted('2026-08-19T09:30:00.000Z'))
      .toEqual({ date: '2026-08-19', minutes: 570 })
  })

  it('ném lỗi cho chuỗi không phải ISO — dữ liệu lạ phải ồn ào, không âm thầm', () => {
    expect(() => parseStarted('hôm qua')).toThrow()
  })
})

describe('parseOffsetMinutes', () => {
  it('đọc offset ra phút', () => {
    expect(parseOffsetMinutes('2026-08-19T09:00:00.000+0700')).toBe(420)
    expect(parseOffsetMinutes('2026-08-19T09:00:00.000+07:00')).toBe(420)
    expect(parseOffsetMinutes('2026-08-19T09:00:00.000-0330')).toBe(-210)
    expect(parseOffsetMinutes('2026-08-19T09:00:00.000Z')).toBe(0)
  })

  it('trả null khi không có offset', () => {
    expect(parseOffsetMinutes('2026-08-19T09:00:00.000')).toBeNull()
  })
})

describe('formatStarted', () => {
  it('ra đúng format Jira yêu cầu', () => {
    expect(formatStarted('2026-08-19', 540, 420))
      .toBe('2026-08-19T09:00:00.000+0700')
  })

  it('pad đủ chữ số và xử lý offset âm', () => {
    expect(formatStarted('2026-01-05', 15, -210))
      .toBe('2026-01-05T00:15:00.000-0330')
  })

  it('vòng lại được qua parseStarted', () => {
    const s = formatStarted('2026-08-19', 1425, 420)
    expect(parseStarted(s)).toEqual({ date: '2026-08-19', minutes: 1425 })
  })
})

describe('offsetMinutesForZone', () => {
  it('trả offset của timezone tại một ngày cụ thể', () => {
    expect(offsetMinutesForZone('Asia/Jakarta', '2026-08-19')).toBe(420)
    expect(offsetMinutesForZone('UTC', '2026-08-19')).toBe(0)
  })

  it('theo đúng DST của ngày được hỏi, không dùng ngày hôm nay', () => {
    // Zurich: UTC+2 mùa hè, UTC+1 mùa đông.
    expect(offsetMinutesForZone('Europe/Zurich', '2026-07-15')).toBe(120)
    expect(offsetMinutesForZone('Europe/Zurich', '2026-01-15')).toBe(60)
  })
})

describe('addDays', () => {
  it('cộng trừ ngày qua biên tháng và năm', () => {
    expect(addDays('2026-08-19', 1)).toBe('2026-08-20')
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })
})

describe('todayInZone', () => {
  it('trả ngày theo timezone Jira, không theo timezone máy', () => {
    // 2026-08-19T23:00Z là 2026-08-20 ở UTC+7
    const now = new Date('2026-08-19T23:00:00.000Z')
    expect(todayInZone('Asia/Jakarta', now)).toBe('2026-08-20')
    expect(todayInZone('UTC', now)).toBe('2026-08-19')
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/core/jiraTime.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Implement**

```ts
// src/core/jiraTime.ts

// Jira trả started dạng 2026-08-19T09:00:00.000+0700.
// Ta đọc wall-clock NGUYÊN VĂN, không qua new Date(): xem ghi chú quyết định
// trong plan/spec §12. Offset chỉ dùng khi GHI, không dùng khi đọc.
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
const OFFSET = /(?:(Z)|([+-])(\d{2}):?(\d{2}))$/

export function parseStarted(started: string): { date: string; minutes: number } {
  const m = ISO.exec(started)
  if (!m) throw new Error(`started không phải ISO: ${started}`)
  const [, y, mo, d, hh, mm] = m
  return {
    date: `${y}-${mo}-${d}`,
    minutes: Number(hh) * 60 + Number(mm),
  }
}

export function parseOffsetMinutes(iso: string): number | null {
  const m = OFFSET.exec(iso.trim())
  if (!m) return null
  const [, z, sign, hh, mm] = m
  if (z) return 0
  const magnitude = Number(hh) * 60 + Number(mm)
  return sign === '-' ? -magnitude : magnitude
}

export function formatStarted(date: string, minutes: number, offsetMinutes: number): string {
  const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0')
  const hh = Math.floor(minutes / 60)
  const mm = minutes % 60
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const offH = Math.floor(Math.abs(offsetMinutes) / 60)
  const offM = Math.abs(offsetMinutes) % 60
  return `${date}T${pad(hh)}:${pad(mm)}:00.000${sign}${pad(offH)}${pad(offM)}`
}

// Lấy offset của một IANA timezone tại một ngày cụ thể. Dùng Intl thay vì thêm
// date library: Intl có sẵn trong cả Chrome và node, và nó biết DST.
export function offsetMinutesForZone(timeZone: string, date: string): number {
  // Lấy giữa trưa để tránh biên DST chuyển lúc nửa đêm.
  const probe = new Date(`${date}T12:00:00.000Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(probe)
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00'
  if (name === 'GMT') return 0
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  if (!m) return 0
  const [, sign, hh, mm] = m
  const magnitude = Number(hh) * 60 + Number(mm)
  return sign === '-' ? -magnitude : magnitude
}

export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  // Dùng UTC để phép cộng ngày không bị DST của máy làm lệch.
  const t = Date.UTC(y, m - 1, d) + delta * 86400000
  const dt = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export function todayInZone(timeZone: string, now: Date): string {
  // en-CA cho ra đúng YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run tests/core/jiraTime.test.ts`
Expected: PASS.

Nếu case `offsetMinutesForZone('Europe/Zurich', ...)` fail, kiểm tra node version — `timeZoneName: 'longOffset'` cần Node 18+. Không thay bằng cách tính tay; nâng Node.

- [ ] **Step 5: Commit**

```bash
git add src/core/jiraTime.ts tests/core/jiraTime.test.ts
git commit -m "feat(core): chuyển đổi thời gian Jira theo wall-clock, không qua Date"
```

---

## Task 4: `core/timeline.ts` — slot 15 phút và start time tự động

**Files:**
- Create: `src/core/timeline.ts`
- Test: `tests/core/timeline.test.ts`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `type DayEntry = { id: string; issueKey: string; startMinutes: number; durationMinutes: number }`
  - `parseHhMm(s: string): number` — `"09:00"` → `540`
  - `formatMinutes(m: number): string` — `540` → `"09:00"`
  - `snapUp(minutes: number, slotMinutes: number): number`
  - `nextFreeStart(entries: DayEntry[], workdayStartMinutes: number, slotMinutes: number): number`
  - `buildSlots(fromMinutes: number, toMinutes: number, slotMinutes: number): number[]`
  - `occupiedBy(entries: DayEntry[], slotStart: number, slotMinutes: number): DayEntry | null`
  - `findOverlaps(entries: DayEntry[], startMinutes: number, durationMinutes: number): DayEntry[]`

- [ ] **Step 1: Viết test fail**

```ts
// tests/core/timeline.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseHhMm, formatMinutes, snapUp, nextFreeStart,
  buildSlots, occupiedBy, findOverlaps, type DayEntry,
} from '@/core/timeline'

const entry = (id: string, startMinutes: number, durationMinutes: number): DayEntry =>
  ({ id, issueKey: `CAG-${id}`, startMinutes, durationMinutes })

describe('parseHhMm / formatMinutes', () => {
  it('vòng lại được', () => {
    expect(parseHhMm('09:00')).toBe(540)
    expect(parseHhMm('00:15')).toBe(15)
    expect(parseHhMm('23:45')).toBe(1425)
    expect(formatMinutes(540)).toBe('09:00')
    expect(formatMinutes(15)).toBe('00:15')
  })
})

describe('snapUp', () => {
  it('làm tròn LÊN về lưới', () => {
    expect(snapUp(540, 15)).toBe(540)   // đã đúng lưới thì giữ nguyên
    expect(snapUp(541, 15)).toBe(555)
    expect(snapUp(554, 15)).toBe(555)
  })
})

describe('nextFreeStart', () => {
  it('ngày trống → workdayStart', () => {
    expect(nextFreeStart([], 540, 15)).toBe(540)
  })

  it('có worklog → ngay sau worklog cuối, snap lên lưới', () => {
    // 09:00 + 90m = 10:30
    expect(nextFreeStart([entry('a', 540, 90)], 540, 15)).toBe(630)
  })

  it('lấy điểm kết thúc MUỘN NHẤT, không phải entry cuối trong mảng', () => {
    // Mảng không được sắp xếp; entry dài hơn kết thúc muộn hơn.
    const entries = [entry('a', 600, 30), entry('b', 540, 180)]
    expect(nextFreeStart(entries, 540, 15)).toBe(720) // 09:00 + 3h = 12:00
  })

  it('snap lên khi worklog kết thúc lệch lưới', () => {
    // 09:00 + 20m = 09:20 → snap lên 09:30
    expect(nextFreeStart([entry('a', 540, 20)], 540, 15)).toBe(570)
  })

  it('không bao giờ trả về trước workdayStart', () => {
    // Worklog lúc 07:00 xong 07:30, nhưng ngày làm việc bắt đầu 09:00.
    expect(nextFreeStart([entry('a', 420, 30)], 540, 15)).toBe(540)
  })
})

describe('buildSlots', () => {
  it('sinh các mốc bắt đầu slot, không gồm mốc cuối', () => {
    expect(buildSlots(540, 600, 15)).toEqual([540, 555, 570, 585])
  })

  it('trả mảng rỗng khi from >= to', () => {
    expect(buildSlots(600, 600, 15)).toEqual([])
    expect(buildSlots(600, 540, 15)).toEqual([])
  })
})

describe('occupiedBy', () => {
  const entries = [entry('a', 540, 60)] // 09:00–10:00

  it('trả entry khi slot nằm trong khoảng đã log', () => {
    expect(occupiedBy(entries, 540, 15)?.id).toBe('a')
    expect(occupiedBy(entries, 585, 15)?.id).toBe('a')
  })

  it('trả null cho slot ngay sau khi kết thúc', () => {
    // Entry kết thúc đúng 10:00, nên slot 10:00 là trống.
    expect(occupiedBy(entries, 600, 15)).toBeNull()
  })

  it('trả null cho slot trước khi bắt đầu', () => {
    expect(occupiedBy(entries, 525, 15)).toBeNull()
  })
})

describe('findOverlaps', () => {
  const entries = [entry('a', 540, 60), entry('b', 660, 30)] // 09-10, 11-11:30

  it('không có gì chồng thì trả rỗng', () => {
    expect(findOverlaps(entries, 600, 60)).toEqual([]) // 10:00–11:00
  })

  it('phát hiện chồng một phần', () => {
    expect(findOverlaps(entries, 570, 60).map((e) => e.id)).toEqual(['a'])
  })

  it('phát hiện chồng nhiều entry', () => {
    expect(findOverlaps(entries, 540, 180).map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('kề nhau không tính là chồng', () => {
    // 10:00–11:00 chạm đầu chạm cuối cả hai nhưng không chồng.
    expect(findOverlaps(entries, 600, 60)).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/core/timeline.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Implement**

```ts
// src/core/timeline.ts

export type DayEntry = {
  id: string
  issueKey: string
  startMinutes: number
  durationMinutes: number
}

export function parseHhMm(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function formatMinutes(m: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export function snapUp(minutes: number, slotMinutes: number): number {
  return Math.ceil(minutes / slotMinutes) * slotMinutes
}

// Start time mặc định = ngay sau worklog kết thúc muộn nhất trong ngày, snap lên
// lưới; nhưng không sớm hơn giờ bắt đầu ngày làm việc.
export function nextFreeStart(
  entries: DayEntry[],
  workdayStartMinutes: number,
  slotMinutes: number,
): number {
  const lastEnd = entries.reduce(
    (max, e) => Math.max(max, e.startMinutes + e.durationMinutes),
    0,
  )
  return Math.max(workdayStartMinutes, snapUp(lastEnd, slotMinutes))
}

export function buildSlots(fromMinutes: number, toMinutes: number, slotMinutes: number): number[] {
  const slots: number[] = []
  for (let m = fromMinutes; m < toMinutes; m += slotMinutes) slots.push(m)
  return slots
}

export function occupiedBy(
  entries: DayEntry[],
  slotStart: number,
  slotMinutes: number,
): DayEntry | null {
  const slotEnd = slotStart + slotMinutes
  for (const e of entries) {
    const end = e.startMinutes + e.durationMinutes
    if (e.startMinutes < slotEnd && end > slotStart) return e
  }
  return null
}

// Kề nhau (end === start) KHÔNG tính là chồng — đó là trường hợp bình thường
// nhất khi lấp kín ngày.
export function findOverlaps(
  entries: DayEntry[],
  startMinutes: number,
  durationMinutes: number,
): DayEntry[] {
  const end = startMinutes + durationMinutes
  return entries.filter((e) => {
    const eEnd = e.startMinutes + e.durationMinutes
    return e.startMinutes < end && eEnd > startMinutes
  })
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run tests/core/timeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/timeline.ts tests/core/timeline.test.ts
git commit -m "feat(core): slot 15 phút, start time tự động, phát hiện overlap"
```

---

## Task 5: `core/coverage.ts` — bảng member × ngày

**Files:**
- Create: `src/core/coverage.ts`
- Test: `tests/core/coverage.test.ts`

**Interfaces:**
- Consumes: `addDays` từ `@/core/jiraTime` (Task 3).
- Produces:
  - `type Worklog = { id: string; issueKey: string; issueSummary: string; authorAccountId: string; date: string; startMinutes: number; timeSpentSeconds: number; comment: string }`
  - `type Member = { accountId: string; displayName: string; hoursPerDay: number; active: boolean }`
  - `type CoverageIssueRow = { issueKey: string; issueSummary: string; perDay: Record<string, number>; total: number }`
  - `type CoverageRow = { member: Member; perDay: Record<string, number>; total: number; capacitySeconds: number; status: 'ok' | 'under' | 'empty'; issues: CoverageIssueRow[] }`
  - `type CoverageTable = { dates: string[]; rows: CoverageRow[]; totalPerDay: Record<string, number>; grandTotal: number }`
  - `enumerateDates(from: string, to: string): string[]`
  - `isWeekend(date: string): boolean`
  - `buildCoverage(args: { worklogs: Worklog[]; members: Member[]; dates: string[]; daysOff: Record<string, string[]> }): CoverageTable`

- [ ] **Step 1: Viết test fail**

```ts
// tests/core/coverage.test.ts
import { describe, it, expect } from 'vitest'
import {
  enumerateDates, isWeekend, buildCoverage,
  type Worklog, type Member,
} from '@/core/coverage'

const H = 3600

const member = (accountId: string, hoursPerDay = 8, active = true): Member =>
  ({ accountId, displayName: `User ${accountId}`, hoursPerDay, active })

const wl = (
  authorAccountId: string, date: string, hours: number,
  issueKey = 'CAG-1', id = `${authorAccountId}-${date}-${issueKey}-${hours}`,
): Worklog => ({
  id, issueKey, issueSummary: `Summary ${issueKey}`, authorAccountId, date,
  startMinutes: 540, timeSpentSeconds: hours * H, comment: '',
})

describe('enumerateDates', () => {
  it('liệt kê ngày bao gồm cả hai đầu', () => {
    expect(enumerateDates('2026-08-17', '2026-08-19'))
      .toEqual(['2026-08-17', '2026-08-18', '2026-08-19'])
  })

  it('một ngày duy nhất', () => {
    expect(enumerateDates('2026-08-19', '2026-08-19')).toEqual(['2026-08-19'])
  })

  it('trả rỗng khi from > to', () => {
    expect(enumerateDates('2026-08-19', '2026-08-17')).toEqual([])
  })
})

describe('isWeekend', () => {
  it('nhận thứ Bảy và Chủ nhật', () => {
    expect(isWeekend('2026-08-22')).toBe(true)  // thứ Bảy
    expect(isWeekend('2026-08-23')).toBe(true)  // Chủ nhật
    expect(isWeekend('2026-08-21')).toBe(false) // thứ Sáu
    expect(isWeekend('2026-08-24')).toBe(false) // thứ Hai
  })
})

describe('buildCoverage', () => {
  const dates = enumerateDates('2026-08-17', '2026-08-21') // Hai → Sáu

  it('cộng giờ theo member và theo ngày', () => {
    const table = buildCoverage({
      worklogs: [wl('u1', '2026-08-17', 8), wl('u1', '2026-08-18', 4)],
      members: [member('u1')], dates, daysOff: {},
    })
    const row = table.rows[0]!
    expect(row.perDay['2026-08-17']).toBe(8 * H)
    expect(row.perDay['2026-08-18']).toBe(4 * H)
    expect(row.total).toBe(12 * H)
  })

  it('cộng nhiều worklog cùng ngày cùng issue', () => {
    const table = buildCoverage({
      worklogs: [
        wl('u1', '2026-08-17', 2, 'CAG-1', 'a'),
        wl('u1', '2026-08-17', 3, 'CAG-1', 'b'),
      ],
      members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows[0]!.perDay['2026-08-17']).toBe(5 * H)
    expect(table.rows[0]!.issues).toHaveLength(1)
    expect(table.rows[0]!.issues[0]!.total).toBe(5 * H)
  })

  it('gộp theo issue trong hàng con, sort theo tổng giảm dần', () => {
    const table = buildCoverage({
      worklogs: [
        wl('u1', '2026-08-17', 1, 'CAG-1'),
        wl('u1', '2026-08-18', 6, 'CAG-2'),
      ],
      members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows[0]!.issues.map((i) => i.issueKey)).toEqual(['CAG-2', 'CAG-1'])
  })

  it('hàng total theo ngày và grand total', () => {
    const table = buildCoverage({
      worklogs: [wl('u1', '2026-08-17', 8), wl('u2', '2026-08-17', 4)],
      members: [member('u1'), member('u2')], dates, daysOff: {},
    })
    expect(table.totalPerDay['2026-08-17']).toBe(12 * H)
    expect(table.grandTotal).toBe(12 * H)
  })

  it('capacity loại cuối tuần', () => {
    // Hai→Sáu = 5 ngày làm việc × 8h
    const table = buildCoverage({
      worklogs: [], members: [member('u1')],
      dates: enumerateDates('2026-08-17', '2026-08-23'), // gồm cả T7, CN
      daysOff: {},
    })
    expect(table.rows[0]!.capacitySeconds).toBe(5 * 8 * H)
  })

  it('capacity loại ngày nghỉ phép của đúng member đó', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1'), member('u2')], dates,
      daysOff: { u1: ['2026-08-18'] },
    })
    expect(table.rows[0]!.capacitySeconds).toBe(4 * 8 * H)
    expect(table.rows[1]!.capacitySeconds).toBe(5 * 8 * H)
  })

  it('capacity theo hoursPerDay riêng của member part-time', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1', 4)], dates, daysOff: {},
    })
    expect(table.rows[0]!.capacitySeconds).toBe(5 * 4 * H)
  })

  it('status: empty khi chưa log gì', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows[0]!.status).toBe('empty')
  })

  it('status: under khi log thiếu so với capacity', () => {
    const table = buildCoverage({
      worklogs: [wl('u1', '2026-08-17', 8)], members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows[0]!.status).toBe('under')
  })

  it('status: ok khi đủ hoặc vượt capacity', () => {
    const table = buildCoverage({
      worklogs: dates.map((d) => wl('u1', d, 8)),
      members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows[0]!.status).toBe('ok')
  })

  it('member inactive: vẫn hiện, nhưng capacity = 0 nên không bị báo thiếu', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1', 8, false)], dates, daysOff: {},
    })
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0]!.capacitySeconds).toBe(0)
    expect(table.rows[0]!.status).toBe('empty')
  })

  it('bỏ qua worklog ngoài khoảng ngày', () => {
    const table = buildCoverage({
      worklogs: [wl('u1', '2026-09-01', 8)], members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows[0]!.total).toBe(0)
  })

  it('bỏ qua worklog của người không có trong danh sách member', () => {
    // Người đã rời team nhưng worklog cũ còn đó — không tự thêm hàng mới.
    const table = buildCoverage({
      worklogs: [wl('ghost', '2026-08-17', 8)], members: [member('u1')], dates, daysOff: {},
    })
    expect(table.rows).toHaveLength(1)
    expect(table.grandTotal).toBe(0)
  })

  it('giữ đúng thứ tự member được truyền vào', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u2'), member('u1')], dates, daysOff: {},
    })
    expect(table.rows.map((r) => r.member.accountId)).toEqual(['u2', 'u1'])
  })

  it('mọi ngày đều có key trong perDay, kể cả ngày 0 giờ', () => {
    const table = buildCoverage({
      worklogs: [], members: [member('u1')], dates, daysOff: {},
    })
    for (const d of dates) expect(table.rows[0]!.perDay[d]).toBe(0)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/core/coverage.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Implement**

```ts
// src/core/coverage.ts
import { addDays } from './jiraTime'

export type Worklog = {
  id: string
  issueKey: string
  issueSummary: string
  authorAccountId: string
  date: string           // "YYYY-MM-DD" theo wall-clock của worklog
  startMinutes: number
  timeSpentSeconds: number
  comment: string
}

export type Member = {
  accountId: string
  displayName: string
  hoursPerDay: number
  active: boolean
}

export type CoverageIssueRow = {
  issueKey: string
  issueSummary: string
  perDay: Record<string, number>
  total: number
}

export type CoverageRow = {
  member: Member
  perDay: Record<string, number>
  total: number
  capacitySeconds: number
  status: 'ok' | 'under' | 'empty'
  issues: CoverageIssueRow[]
}

export type CoverageTable = {
  dates: string[]
  rows: CoverageRow[]
  totalPerDay: Record<string, number>
  grandTotal: number
}

export function enumerateDates(from: string, to: string): string[] {
  const out: string[] = []
  let d = from
  // Chuỗi YYYY-MM-DD so sánh từ điển đúng bằng so sánh thời gian.
  while (d <= to) {
    out.push(d)
    d = addDays(d, 1)
  }
  return out
}

export function isWeekend(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 || day === 6
}

export function buildCoverage(args: {
  worklogs: Worklog[]
  members: Member[]
  dates: string[]
  daysOff: Record<string, string[]>
}): CoverageTable {
  const { worklogs, members, dates, daysOff } = args
  const dateSet = new Set(dates)
  const zeros = (): Record<string, number> =>
    Object.fromEntries(dates.map((d) => [d, 0]))

  const totalPerDay = zeros()
  let grandTotal = 0

  const rows: CoverageRow[] = members.map((m) => {
    const perDay = zeros()
    const issueMap = new Map<string, CoverageIssueRow>()
    let total = 0

    for (const w of worklogs) {
      if (w.authorAccountId !== m.accountId) continue
      if (!dateSet.has(w.date)) continue

      perDay[w.date] = (perDay[w.date] ?? 0) + w.timeSpentSeconds
      total += w.timeSpentSeconds
      totalPerDay[w.date] = (totalPerDay[w.date] ?? 0) + w.timeSpentSeconds
      grandTotal += w.timeSpentSeconds

      let issue = issueMap.get(w.issueKey)
      if (!issue) {
        issue = {
          issueKey: w.issueKey,
          issueSummary: w.issueSummary,
          perDay: zeros(),
          total: 0,
        }
        issueMap.set(w.issueKey, issue)
      }
      issue.perDay[w.date] = (issue.perDay[w.date] ?? 0) + w.timeSpentSeconds
      issue.total += w.timeSpentSeconds
    }

    // Member inactive không có capacity: họ đã rời team, báo đỏ là nhiễu.
    const off = new Set(daysOff[m.accountId] ?? [])
    const workingDays = m.active
      ? dates.filter((d) => !isWeekend(d) && !off.has(d)).length
      : 0
    const capacitySeconds = workingDays * m.hoursPerDay * 3600

    const status: CoverageRow['status'] =
      total === 0 ? 'empty' : total < capacitySeconds ? 'under' : 'ok'

    return {
      member: m,
      perDay,
      total,
      capacitySeconds,
      status,
      issues: [...issueMap.values()].sort((a, b) => b.total - a.total),
    }
  })

  return { dates, rows, totalPerDay, grandTotal }
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run tests/core/coverage.test.ts`
Expected: PASS, tất cả 17 case.

- [ ] **Step 5: Commit**

```bash
git add src/core/coverage.ts tests/core/coverage.test.ts
git commit -m "feat(core): bảng coverage member × ngày với capacity và ngày nghỉ"
```

---

## Task 6: `core/points.ts` — story points vs giờ thực

**Files:**
- Create: `src/core/points.ts`
- Test: `tests/core/points.test.ts`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `type SprintIssue = { key: string; summary: string; assigneeName: string | null; status: string; storyPoints: number | null; timeSpentSeconds: number }`
  - `type PointsRow = SprintIssue & { hoursPerPoint: number | null; isOutlier: boolean }`
  - `type PointsTable = { rows: PointsRow[]; noEstimate: PointsRow[]; medianHoursPerPoint: number | null }`
  - `median(values: number[]): number | null`
  - `buildPointsTable(issues: SprintIssue[]): PointsTable`

**Quy tắc:** `hoursPerPoint = (timeSpentSeconds / 3600) / storyPoints`, chỉ tính khi `storyPoints > 0` **và** `timeSpentSeconds > 0`. Issue không có story points (null hoặc 0) đi vào `noEstimate` và **không** tham gia tính median. `isOutlier` khi `hoursPerPoint > 2 × median`. Hàng chính sort theo `hoursPerPoint` giảm dần, `null` xuống cuối.

- [ ] **Step 1: Viết test fail**

```ts
// tests/core/points.test.ts
import { describe, it, expect } from 'vitest'
import { median, buildPointsTable, type SprintIssue } from '@/core/points'

const issue = (
  key: string, storyPoints: number | null, hours: number,
): SprintIssue => ({
  key, summary: `Summary ${key}`, assigneeName: 'User', status: 'In Progress',
  storyPoints, timeSpentSeconds: hours * 3600,
})

describe('median', () => {
  it('số lượng lẻ', () => expect(median([3, 1, 2])).toBe(2))
  it('số lượng chẵn lấy trung bình hai giá trị giữa', () => expect(median([1, 2, 3, 4])).toBe(2.5))
  it('một phần tử', () => expect(median([5])).toBe(5))
  it('mảng rỗng trả null', () => expect(median([])).toBeNull())
})

describe('buildPointsTable', () => {
  it('tính h/point', () => {
    const t = buildPointsTable([issue('CAG-1', 2, 10)])
    expect(t.rows[0]!.hoursPerPoint).toBe(5)
  })

  it('issue không có story points vào noEstimate và h/point là null', () => {
    const t = buildPointsTable([issue('CAG-1', null, 8), issue('CAG-2', 0, 8)])
    expect(t.noEstimate.map((r) => r.key)).toEqual(['CAG-1', 'CAG-2'])
    expect(t.rows.every((r) => r.hoursPerPoint === null)).toBe(true)
  })

  it('issue có points nhưng chưa log giờ: h/point null, KHÔNG vào noEstimate', () => {
    // Chưa log giờ khác hẳn chưa estimate — trộn hai cái là mất tín hiệu.
    const t = buildPointsTable([issue('CAG-1', 3, 0)])
    expect(t.rows[0]!.hoursPerPoint).toBeNull()
    expect(t.noEstimate).toHaveLength(0)
  })

  it('median chỉ tính trên issue có h/point', () => {
    const t = buildPointsTable([
      issue('CAG-1', 1, 2),   // 2
      issue('CAG-2', 1, 4),   // 4
      issue('CAG-3', null, 9),// bỏ qua
      issue('CAG-4', 2, 0),   // bỏ qua (chưa log giờ)
    ])
    expect(t.medianHoursPerPoint).toBe(3)
  })

  it('median null khi không có issue nào tính được', () => {
    expect(buildPointsTable([issue('CAG-1', null, 8)]).medianHoursPerPoint).toBeNull()
  })

  it('đánh dấu outlier khi vượt 2× median', () => {
    const t = buildPointsTable([
      issue('CAG-1', 1, 2),   // 2
      issue('CAG-2', 1, 2),   // 2  → median 2
      issue('CAG-3', 1, 10),  // 10 > 4 → outlier
    ])
    const byKey = Object.fromEntries(t.rows.map((r) => [r.key, r]))
    expect(byKey['CAG-3']!.isOutlier).toBe(true)
    expect(byKey['CAG-1']!.isOutlier).toBe(false)
  })

  it('sort h/point giảm dần, null xuống cuối', () => {
    const t = buildPointsTable([
      issue('CAG-1', 1, 2),
      issue('CAG-2', null, 5),
      issue('CAG-3', 1, 8),
    ])
    expect(t.rows.map((r) => r.key)).toEqual(['CAG-3', 'CAG-1', 'CAG-2'])
  })

  it('mảng rỗng cho bảng rỗng, không ném lỗi', () => {
    const t = buildPointsTable([])
    expect(t.rows).toEqual([])
    expect(t.noEstimate).toEqual([])
    expect(t.medianHoursPerPoint).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/core/points.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Implement**

```ts
// src/core/points.ts

export type SprintIssue = {
  key: string
  summary: string
  assigneeName: string | null
  status: string
  storyPoints: number | null
  timeSpentSeconds: number
}

export type PointsRow = SprintIssue & {
  hoursPerPoint: number | null
  isOutlier: boolean
}

export type PointsTable = {
  rows: PointsRow[]
  noEstimate: PointsRow[]
  medianHoursPerPoint: number | null
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]!
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}

const OUTLIER_FACTOR = 2

export function buildPointsTable(issues: SprintIssue[]): PointsTable {
  const withRatio = issues.map((i) => {
    const points = i.storyPoints
    // Chỉ tính khi CÓ points VÀ ĐÃ log giờ. Hai điều kiện này khác nhau và
    // được phân biệt có chủ ý: chưa estimate ≠ chưa làm.
    const hoursPerPoint =
      points !== null && points > 0 && i.timeSpentSeconds > 0
        ? i.timeSpentSeconds / 3600 / points
        : null
    return { ...i, hoursPerPoint, isOutlier: false }
  })

  const med = median(
    withRatio.map((r) => r.hoursPerPoint).filter((v): v is number => v !== null),
  )

  const rows = withRatio
    .map((r) => ({
      ...r,
      isOutlier:
        med !== null && r.hoursPerPoint !== null &&
        r.hoursPerPoint > med * OUTLIER_FACTOR,
    }))
    .sort((a, b) => {
      if (a.hoursPerPoint === null && b.hoursPerPoint === null) return 0
      if (a.hoursPerPoint === null) return 1
      if (b.hoursPerPoint === null) return -1
      return b.hoursPerPoint - a.hoursPerPoint
    })

  const noEstimate = rows.filter(
    (r) => r.storyPoints === null || r.storyPoints === 0,
  )

  return { rows, noEstimate, medianHoursPerPoint: med }
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run tests/core/points.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/points.ts tests/core/points.test.ts
git commit -m "feat(core): bảng story points vs giờ thực với median và outlier"
```

---

## Task 7: `core/config-schema.ts` + `core/snapshot-key.ts` — schema và cache key

Hai file nhỏ nhưng phải thuần: migration config là chỗ dễ làm mất dữ liệu người dùng, và nó phải test được không cần `chrome`.

**Files:**
- Create: `src/core/config-schema.ts`, `src/core/snapshot-key.ts`
- Test: `tests/core/config-schema.test.ts`, `tests/core/snapshot-key.test.ts`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `CONFIG_VERSION: number`
  - `type SprintEvent = { name: string; issueKey: string; defaultMinutes: number; comment: string }`
  - `type ConfigMember = { accountId: string; displayName: string; hoursPerDay: number; active: boolean }`
  - `type Config` — xem code bên dưới.
  - `defaultConfig: Config`
  - `migrateConfig(raw: unknown): Config`
  - `type Scope = { projects: string[]; from: string; to: string; accountIds: string[] }`
  - `snapshotKey(scope: Scope): string`
  - `isStale(fetchedAt: number, now: number, ttlMs: number): boolean`
  - `SNAPSHOT_TTL_MS: number`

- [ ] **Step 1: Viết test fail cho config-schema**

```ts
// tests/core/config-schema.test.ts
import { describe, it, expect } from 'vitest'
import { migrateConfig, defaultConfig, CONFIG_VERSION } from '@/core/config-schema'

describe('migrateConfig', () => {
  it('undefined → default', () => {
    expect(migrateConfig(undefined)).toEqual(defaultConfig)
  })

  it('object rỗng → default', () => {
    expect(migrateConfig({})).toEqual(defaultConfig)
  })

  it('giữ giá trị người dùng đã set', () => {
    const c = migrateConfig({
      version: CONFIG_VERSION,
      jiraBaseUrl: 'https://mesoneerag.atlassian.net',
      projects: ['CAG'],
      workdayStart: '08:30',
    })
    expect(c.jiraBaseUrl).toBe('https://mesoneerag.atlassian.net')
    expect(c.projects).toEqual(['CAG'])
    expect(c.workdayStart).toBe('08:30')
  })

  it('điền field thiếu bằng default, không xoá field đã có', () => {
    const c = migrateConfig({ version: CONFIG_VERSION, projects: ['CAG'] })
    expect(c.projects).toEqual(['CAG'])
    expect(c.slotMinutes).toBe(defaultConfig.slotMinutes)
    expect(c.durationPresets).toEqual(defaultConfig.durationPresets)
  })

  it('bỏ giá trị sai kiểu thay vì để nó lan xuống runtime', () => {
    const c = migrateConfig({ version: CONFIG_VERSION, projects: 'CAG', slotMinutes: 'nhiều' })
    expect(c.projects).toEqual(defaultConfig.projects)
    expect(c.slotMinutes).toBe(defaultConfig.slotMinutes)
  })

  it('luôn trả về version hiện tại', () => {
    expect(migrateConfig({ version: 0 }).version).toBe(CONFIG_VERSION)
  })

  it('không bao giờ trả authMode lạ', () => {
    expect(migrateConfig({ authMode: 'magic' }).authMode).toBe('cookie')
  })

  it('lọc member sai cấu trúc, giữ member hợp lệ', () => {
    const c = migrateConfig({
      members: [
        { accountId: 'u1', displayName: 'A', hoursPerDay: 8, active: true },
        { displayName: 'thiếu accountId' },
      ],
    })
    expect(c.members).toHaveLength(1)
    expect(c.members[0]!.accountId).toBe('u1')
  })

  it('điền active và hoursPerDay cho member thiếu field', () => {
    const c = migrateConfig({ members: [{ accountId: 'u1', displayName: 'A' }] })
    expect(c.members[0]).toEqual({ accountId: 'u1', displayName: 'A', hoursPerDay: 8, active: true })
  })

  it('lọc sprint event thiếu issueKey', () => {
    const c = migrateConfig({
      sprintEvents: [
        { name: 'Daily', issueKey: 'CAG-1', defaultMinutes: 15, comment: '' },
        { name: 'Retro' },
      ],
    })
    expect(c.sprintEvents).toHaveLength(1)
  })

  it('default không chứa token', () => {
    expect(defaultConfig.token).toBeUndefined()
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/core/config-schema.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Implement `config-schema.ts`**

```ts
// src/core/config-schema.ts

export const CONFIG_VERSION = 1

export type SprintEvent = {
  name: string
  issueKey: string
  defaultMinutes: number
  comment: string
}

export type ConfigMember = {
  accountId: string
  displayName: string
  hoursPerDay: number
  active: boolean
}

export type Config = {
  version: number
  jiraBaseUrl: string
  authMode: 'cookie' | 'token'
  token?: { email: string; apiToken: string }
  timeZone: string
  myAccountId: string
  projects: string[]
  primaryBoardId: number | null
  storyPointsFieldId: string | null
  members: ConfigMember[]
  daysOff: Record<string, string[]>
  workdayStart: string
  slotMinutes: number
  durationPresets: number[]
  sprintEvents: SprintEvent[]
}

export const defaultConfig: Config = {
  version: CONFIG_VERSION,
  jiraBaseUrl: '',
  authMode: 'cookie',
  timeZone: 'UTC',
  myAccountId: '',
  projects: [],
  primaryBoardId: null,
  storyPointsFieldId: null,
  members: [],
  daysOff: {},
  workdayStart: '09:00',
  slotMinutes: 15,
  durationPresets: [15, 30, 60, 240, 360, 480],
  sprintEvents: [],
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? v : fallback

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const strArray = (v: unknown, fallback: string[]): string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : fallback

const numArray = (v: unknown, fallback: number[]): number[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'number') ? (v as number[]) : fallback

// Migration cố tình khoan dung: dữ liệu lạ bị thay bằng default chứ không làm
// hỏng toàn bộ config. Mất một field còn hơn người dùng mở extension ra trắng.
export function migrateConfig(raw: unknown): Config {
  const r = isRecord(raw) ? raw : {}
  const d = defaultConfig

  const members: ConfigMember[] = (Array.isArray(r['members']) ? r['members'] : [])
    .filter(isRecord)
    .filter((m) => typeof m['accountId'] === 'string' && m['accountId'] !== '')
    .map((m) => ({
      accountId: m['accountId'] as string,
      displayName: str(m['displayName'], m['accountId'] as string),
      hoursPerDay: num(m['hoursPerDay'], 8),
      active: typeof m['active'] === 'boolean' ? m['active'] : true,
    }))

  const sprintEvents: SprintEvent[] = (Array.isArray(r['sprintEvents']) ? r['sprintEvents'] : [])
    .filter(isRecord)
    .filter((e) => typeof e['issueKey'] === 'string' && e['issueKey'] !== '')
    .map((e) => ({
      name: str(e['name'], e['issueKey'] as string),
      issueKey: e['issueKey'] as string,
      defaultMinutes: num(e['defaultMinutes'], 30),
      comment: str(e['comment'], ''),
    }))

  const daysOffRaw = isRecord(r['daysOff']) ? r['daysOff'] : {}
  const daysOff: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(daysOffRaw)) {
    const dates = strArray(v, [])
    if (dates.length > 0) daysOff[k] = dates
  }

  const tokenRaw = r['token']
  const token =
    isRecord(tokenRaw) &&
    typeof tokenRaw['email'] === 'string' &&
    typeof tokenRaw['apiToken'] === 'string'
      ? { email: tokenRaw['email'], apiToken: tokenRaw['apiToken'] }
      : undefined

  const boardRaw = r['primaryBoardId']
  const spfRaw = r['storyPointsFieldId']

  const config: Config = {
    version: CONFIG_VERSION,
    jiraBaseUrl: str(r['jiraBaseUrl'], d.jiraBaseUrl),
    authMode: r['authMode'] === 'token' ? 'token' : 'cookie',
    timeZone: str(r['timeZone'], d.timeZone),
    myAccountId: str(r['myAccountId'], d.myAccountId),
    projects: strArray(r['projects'], d.projects),
    primaryBoardId: typeof boardRaw === 'number' ? boardRaw : null,
    storyPointsFieldId: typeof spfRaw === 'string' ? spfRaw : null,
    members,
    daysOff,
    workdayStart: str(r['workdayStart'], d.workdayStart),
    slotMinutes: num(r['slotMinutes'], d.slotMinutes),
    durationPresets: numArray(r['durationPresets'], d.durationPresets),
    sprintEvents,
  }
  if (token) config.token = token
  return config
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run tests/core/config-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Viết test fail cho snapshot-key**

```ts
// tests/core/snapshot-key.test.ts
import { describe, it, expect } from 'vitest'
import { snapshotKey, isStale, SNAPSHOT_TTL_MS } from '@/core/snapshot-key'

const scope = {
  projects: ['CAG'], from: '2026-08-17', to: '2026-08-21', accountIds: ['u1', 'u2'],
}

describe('snapshotKey', () => {
  it('cùng scope → cùng key', () => {
    expect(snapshotKey(scope)).toBe(snapshotKey({ ...scope }))
  })

  it('không phụ thuộc thứ tự project và accountId', () => {
    // Nếu thứ tự ảnh hưởng key, cache miss vô cớ mỗi lần UI đổi thứ tự chọn.
    expect(snapshotKey({ ...scope, accountIds: ['u2', 'u1'] })).toBe(snapshotKey(scope))
    expect(snapshotKey({ ...scope, projects: ['CAG'] })).toBe(snapshotKey(scope))
  })

  it('đổi date range → khác key', () => {
    expect(snapshotKey({ ...scope, to: '2026-08-22' })).not.toBe(snapshotKey(scope))
  })

  it('đổi member → khác key', () => {
    expect(snapshotKey({ ...scope, accountIds: ['u1'] })).not.toBe(snapshotKey(scope))
  })

  it('key có prefix nhận dạng được để dọn cache', () => {
    expect(snapshotKey(scope).startsWith('snapshot:')).toBe(true)
  })
})

describe('isStale', () => {
  it('mới fetch thì chưa stale', () => {
    expect(isStale(1000, 1000 + SNAPSHOT_TTL_MS - 1, SNAPSHOT_TTL_MS)).toBe(false)
  })

  it('đúng hoặc quá TTL thì stale', () => {
    expect(isStale(1000, 1000 + SNAPSHOT_TTL_MS, SNAPSHOT_TTL_MS)).toBe(true)
  })

  it('fetchedAt trong tương lai (đồng hồ máy nhảy) coi là stale', () => {
    expect(isStale(5000, 1000, SNAPSHOT_TTL_MS)).toBe(true)
  })
})
```

- [ ] **Step 6: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/core/snapshot-key.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 7: Implement `snapshot-key.ts`**

```ts
// src/core/snapshot-key.ts

export const SNAPSHOT_TTL_MS = 5 * 60 * 1000

export type Scope = {
  projects: string[]
  from: string
  to: string
  accountIds: string[]
}

// Sort trước khi ghép: UI có thể trả về thứ tự khác nhau cho cùng một lựa chọn,
// và ta không muốn cache miss chỉ vì thứ tự.
export function snapshotKey(scope: Scope): string {
  const p = [...scope.projects].sort().join(',')
  const a = [...scope.accountIds].sort().join(',')
  return `snapshot:${p}|${scope.from}|${scope.to}|${a}`
}

export function isStale(fetchedAt: number, now: number, ttlMs: number): boolean {
  const age = now - fetchedAt
  // age < 0 nghĩa là đồng hồ nhảy về quá khứ; coi là stale để fetch lại cho chắc.
  return age < 0 || age >= ttlMs
}
```

- [ ] **Step 8: Chạy toàn bộ test `core/`**

Run: `npm test`
Expected: PASS toàn bộ. Đây là mốc quan trọng: **toàn bộ logic của ứng dụng đã được test, chưa cần Chrome hay Jira.**

- [ ] **Step 9: Commit**

```bash
git add src/core/config-schema.ts src/core/snapshot-key.ts tests/core/config-schema.test.ts tests/core/snapshot-key.test.ts
git commit -m "feat(core): schema config với migration khoan dung, và cache key"
```

---

## Task 8: `jira/auth.ts` + `jira/client.ts` — fetch wrapper

**Files:**
- Create: `src/jira/auth.ts`, `src/jira/client.ts`
- Test: `tests/jira/client.test.ts`

**Interfaces:**
- Consumes: không có từ task trước.
- Produces:
  - `type Auth = { headers(): Record<string, string>; credentials: RequestCredentials }`
  - `cookieAuth: Auth`
  - `tokenAuth(email: string, apiToken: string): Auth`
  - `class JiraError extends Error { status: number; body: string }`
  - `type JiraClient = { call<T>(req: { method: string; path: string; body?: unknown }): Promise<T> }`
  - `createClient(deps: ClientDeps): JiraClient`
  - `type ClientDeps = { baseUrl: string; auth: Auth; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; maxConcurrent?: number; maxRetries?: number; timeoutMs?: number; onUnauthorized?: () => void }`

- [ ] **Step 1: Implement `auth.ts` (không có test riêng — nó chỉ là dữ liệu)**

```ts
// src/jira/auth.ts

export type Auth = {
  headers(): Record<string, string>
  credentials: RequestCredentials
}

// Đường mặc định. Spike 2026-08-19 xác nhận cookie session ghi được worklog.
// X-Atlassian-Token: no-check gửi vô điều kiện — vô hại khi XSRF không bật, và
// tránh phải thử-rồi-retry.
export const cookieAuth: Auth = {
  headers: () => ({ 'X-Atlassian-Token': 'no-check' }),
  credentials: 'include',
}

export function tokenAuth(email: string, apiToken: string): Auth {
  const encoded = btoa(`${email}:${apiToken}`)
  return {
    // KHÔNG bao giờ log giá trị này.
    headers: () => ({
      Authorization: `Basic ${encoded}`,
      'X-Atlassian-Token': 'no-check',
    }),
    credentials: 'omit',
  }
}
```

- [ ] **Step 2: Viết test fail cho client**

```ts
// tests/jira/client.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createClient, JiraError } from '@/jira/client'
import { cookieAuth } from '@/jira/auth'

const ok = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })

const base = { baseUrl: 'https://x.atlassian.net', auth: cookieAuth, sleep: async () => {} }

describe('createClient', () => {
  it('gọi đúng URL và trả data đã parse', async () => {
    const fetchImpl = vi.fn(async () => ok({ accountId: 'u1' }))
    const client = createClient({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })

    const data = await client.call<{ accountId: string }>({ method: 'GET', path: '/rest/api/3/myself' })

    expect(data.accountId).toBe('u1')
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://x.atlassian.net/rest/api/3/myself')
  })

  it('gửi header auth và credentials của Auth', async () => {
    const fetchImpl = vi.fn(async () => ok({}))
    const client = createClient({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })

    await client.call({ method: 'GET', path: '/x' })

    const init = fetchImpl.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>)['X-Atlassian-Token']).toBe('no-check')
    expect(init.credentials).toBe('include')
  })

  it('trả null cho 204 No Content', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const client = createClient({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.call({ method: 'DELETE', path: '/x' })).resolves.toBeNull()
  })

  it('retry 429 và tôn trọng Retry-After', async () => {
    const sleep = vi.fn(async () => {})
    let n = 0
    const fetchImpl = vi.fn(async () => {
      n += 1
      if (n === 1) return new Response('rate limited', { status: 429, headers: { 'Retry-After': '2' } })
      return ok({ done: true })
    })
    const client = createClient({ ...base, sleep, fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.call<{ done: boolean }>({ method: 'GET', path: '/x' })).resolves.toEqual({ done: true })
    expect(sleep).toHaveBeenCalledWith(2000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('bỏ cuộc sau maxRetries lần 429', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate limited', { status: 429 }))
    const client = createClient({
      ...base, maxRetries: 2, fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await expect(client.call({ method: 'GET', path: '/x' })).rejects.toBeInstanceOf(JiraError)
    // 1 lần đầu + 2 lần retry
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('KHÔNG retry 401, và gọi onUnauthorized', async () => {
    const onUnauthorized = vi.fn()
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 401 }))
    const client = createClient({
      ...base, onUnauthorized, fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await expect(client.call({ method: 'GET', path: '/x' })).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('403 cũng gọi onUnauthorized và không retry', async () => {
    const onUnauthorized = vi.fn()
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 403 }))
    const client = createClient({
      ...base, onUnauthorized, fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await expect(client.call({ method: 'GET', path: '/x' })).rejects.toMatchObject({ status: 403 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('KHÔNG retry 400 — lỗi payload thì retry vô nghĩa', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 400 }))
    const client = createClient({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.call({ method: 'POST', path: '/x', body: {} })).rejects.toMatchObject({ status: 400 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('giữ nguyên body lỗi của Jira trong JiraError', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('{"errorMessages":["Issue does not exist"]}', { status: 404 }))
    const client = createClient({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.call({ method: 'GET', path: '/x' }))
      .rejects.toMatchObject({ status: 404, body: '{"errorMessages":["Issue does not exist"]}' })
  })

  it('không bao giờ chạy quá maxConcurrent request cùng lúc', async () => {
    let inFlight = 0
    let peak = 0
    const fetchImpl = vi.fn(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return ok({})
    })
    const client = createClient({
      ...base, maxConcurrent: 2, fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await Promise.all(
      Array.from({ length: 10 }, (_, i) => client.call({ method: 'GET', path: `/x/${i}` })),
    )

    expect(peak).toBeLessThanOrEqual(2)
    expect(fetchImpl).toHaveBeenCalledTimes(10)
  })

  it('giải phóng slot semaphore cả khi request lỗi', async () => {
    // Nếu slot bị giữ khi throw, request thứ hai sẽ treo mãi.
    let n = 0
    const fetchImpl = vi.fn(async () => {
      n += 1
      if (n === 1) return new Response('bad', { status: 400 })
      return ok({ ok: true })
    })
    const client = createClient({
      ...base, maxConcurrent: 1, fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await expect(client.call({ method: 'GET', path: '/a' })).rejects.toBeInstanceOf(JiraError)
    await expect(client.call<{ ok: boolean }>({ method: 'GET', path: '/b' })).resolves.toEqual({ ok: true })
  })

  it('ghép baseUrl có dấu / ở cuối mà không sinh //', async () => {
    const fetchImpl = vi.fn(async () => ok({}))
    const client = createClient({
      ...base, baseUrl: 'https://x.atlassian.net/', fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await client.call({ method: 'GET', path: '/rest/api/3/myself' })

    expect(fetchImpl.mock.calls[0]![0]).toBe('https://x.atlassian.net/rest/api/3/myself')
  })
})
```

- [ ] **Step 3: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/jira/client.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 4: Implement `client.ts`**

```ts
// src/jira/client.ts
import type { Auth } from './auth'

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message)
    this.name = 'JiraError'
  }
}

export type ClientDeps = {
  baseUrl: string
  auth: Auth
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  maxConcurrent?: number
  maxRetries?: number
  timeoutMs?: number
  onUnauthorized?: () => void
}

export type JiraClient = {
  call<T>(req: { method: string; path: string; body?: unknown }): Promise<T>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Semaphore đơn giản: đủ cho nhu cầu ở đây, không đáng thêm dependency.
function createSemaphore(limit: number) {
  let active = 0
  const queue: (() => void)[] = []
  const release = () => {
    active -= 1
    queue.shift()?.()
  }
  return async function acquire(): Promise<() => void> {
    if (active >= limit) await new Promise<void>((r) => queue.push(r))
    active += 1
    return release
  }
}

export function createClient(deps: ClientDeps): JiraClient {
  const {
    baseUrl, auth,
    fetchImpl = fetch,
    sleep = defaultSleep,
    maxConcurrent = 5,
    maxRetries = 3,
    timeoutMs = 15_000,
    onUnauthorized,
  } = deps

  const acquire = createSemaphore(maxConcurrent)
  const root = baseUrl.replace(/\/+$/, '')

  async function once(method: string, path: string, body?: unknown): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetchImpl(root + path, {
        method,
        credentials: auth.credentials,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...auth.headers() },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } finally {
      clearTimeout(timer)
    }
  }

  async function call<T>(req: { method: string; path: string; body?: unknown }): Promise<T> {
    const release = await acquire()
    try {
      for (let attempt = 0; ; attempt += 1) {
        const res = await once(req.method, req.path, req.body)

        if (res.status === 401 || res.status === 403) {
          onUnauthorized?.()
          throw new JiraError(`Jira ${res.status}`, res.status, await res.text())
        }

        if (res.status === 429 && attempt < maxRetries) {
          const retryAfter = Number(res.headers.get('Retry-After'))
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 500 * 2 ** attempt
          await sleep(waitMs)
          continue
        }

        if (!res.ok) {
          throw new JiraError(`Jira ${res.status}`, res.status, await res.text())
        }

        if (res.status === 204) return null as T
        const text = await res.text()
        return (text === '' ? null : JSON.parse(text)) as T
      }
    } finally {
      // Phải nằm trong finally: nếu không, một request lỗi sẽ giữ slot vĩnh viễn
      // và mọi request sau treo im lặng.
      release()
    }
  }

  return { call }
}
```

- [ ] **Step 5: Chạy test để xác nhận PASS**

Run: `npx vitest run tests/jira/client.test.ts`
Expected: PASS, tất cả 12 case.

- [ ] **Step 6: Commit**

```bash
git add src/jira/auth.ts src/jira/client.ts tests/jira/client.test.ts
git commit -m "feat(jira): fetch wrapper với semaphore, retry 429, và xử lý 401"
```

---

## Task 9: `jira/endpoints.ts` — các call Jira có type

**Files:**
- Create: `src/jira/endpoints.ts`
- Test: `tests/jira/endpoints.test.ts`

**Interfaces:**
- Consumes: `JiraClient` từ `@/jira/client` (Task 8); `Worklog` từ `@/core/coverage` (Task 5); `SprintIssue` từ `@/core/points` (Task 6); `parseStarted` từ `@/core/jiraTime` (Task 3).
- Produces:
  - `getMyself(c): Promise<{ accountId: string; displayName: string; timeZone: string }>`
  - `findStoryPointsFieldId(c): Promise<string | null>`
  - `searchIssuesWithWorklogs(c, args: { projects: string[]; accountIds: string[]; from: string; to: string }): Promise<{ key: string; summary: string }[]>`
  - `getIssueWorklogs(c, issueKey: string, issueSummary: string): Promise<Worklog[]>`
  - `addWorklog(c, args: { issueKey: string; startedIso: string; timeSpentSeconds: number; comment: string }): Promise<{ id: string }>`
  - `deleteWorklog(c, issueKey: string, worklogId: string): Promise<void>`
  - `pickIssues(c, query: string): Promise<{ key: string; summary: string }[]>`
  - `getBoards(c, projectKey: string): Promise<{ id: number; name: string }[]>`
  - `getActiveSprint(c, boardId: number): Promise<{ id: number; name: string; startDate: string; endDate: string } | null>`
  - `getSprintIssues(c, sprintId: number, storyPointsFieldId: string | null): Promise<SprintIssue[]>`
  - `searchUsers(c, query: string): Promise<{ accountId: string; displayName: string }[]>`

**Ghi chú spec gap:** spec §5 không nói cách tìm id của custom field Story Points. Nó khác nhau giữa các instance (`customfield_10016`, `customfield_10026`, ...), nên **không hardcode**. `findStoryPointsFieldId` dò qua `GET /rest/api/3/field`, khớp `name` trong danh sách `['Story Points', 'Story point estimate']`, và kết quả được cache vào `config.storyPointsFieldId` (Task 10).

- [ ] **Step 1: Viết test fail**

```ts
// tests/jira/endpoints.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  findStoryPointsFieldId, searchIssuesWithWorklogs, getIssueWorklogs,
  addWorklog, getSprintIssues, getActiveSprint,
} from '@/jira/endpoints'
import type { JiraClient } from '@/jira/client'

// Client giả: ghi lại request và trả kết quả đã dựng sẵn theo path.
const fakeClient = (routes: Record<string, unknown>) => {
  const calls: { method: string; path: string; body?: unknown }[] = []
  const client: JiraClient = {
    call: vi.fn(async (req) => {
      calls.push(req)
      const key = `${req.method} ${req.path.split('?')[0]}`
      if (!(key in routes)) throw new Error(`route chưa khai báo: ${key}`)
      return routes[key] as never
    }),
  }
  return { client, calls }
}

describe('findStoryPointsFieldId', () => {
  it('tìm field theo tên Story Points', async () => {
    const { client } = fakeClient({
      'GET /rest/api/3/field': [
        { id: 'customfield_1', name: 'Sprint' },
        { id: 'customfield_10016', name: 'Story Points' },
      ],
    })
    expect(await findStoryPointsFieldId(client)).toBe('customfield_10016')
  })

  it('nhận cả tên "Story point estimate" của Jira team-managed', async () => {
    const { client } = fakeClient({
      'GET /rest/api/3/field': [{ id: 'customfield_10026', name: 'Story point estimate' }],
    })
    expect(await findStoryPointsFieldId(client)).toBe('customfield_10026')
  })

  it('trả null khi instance không có field nào khớp', async () => {
    const { client } = fakeClient({ 'GET /rest/api/3/field': [{ id: 'x', name: 'Rank' }] })
    expect(await findStoryPointsFieldId(client)).toBeNull()
  })
})

describe('searchIssuesWithWorklogs', () => {
  it('dựng JQL đủ ba điều kiện: ngày, tác giả, project', async () => {
    const { client, calls } = fakeClient({
      'POST /rest/api/3/search/jql': { issues: [{ key: 'CAG-1', fields: { summary: 'S1' } }] },
    })

    const out = await searchIssuesWithWorklogs(client, {
      projects: ['CAG'], accountIds: ['u1', 'u2'], from: '2026-08-17', to: '2026-08-21',
    })

    const jql = (calls[0]!.body as { jql: string }).jql
    expect(jql).toContain('worklogDate >= "2026-08-17"')
    expect(jql).toContain('worklogDate <= "2026-08-21"')
    expect(jql).toContain('worklogAuthor in ("u1","u2")')
    expect(jql).toContain('project in ("CAG")')
    expect(out).toEqual([{ key: 'CAG-1', summary: 'S1' }])
  })

  it('bỏ điều kiện project khi không chọn project nào', async () => {
    const { client, calls } = fakeClient({ 'POST /rest/api/3/search/jql': { issues: [] } })
    await searchIssuesWithWorklogs(client, {
      projects: [], accountIds: ['u1'], from: '2026-08-17', to: '2026-08-21',
    })
    expect((calls[0]!.body as { jql: string }).jql).not.toContain('project in')
  })

  it('trả rỗng ngay, không gọi Jira, khi không có member nào', async () => {
    // JQL "worklogAuthor in ()" là lỗi cú pháp; chặn ở đây thay vì để Jira 400.
    const { client, calls } = fakeClient({})
    expect(await searchIssuesWithWorklogs(client, {
      projects: ['CAG'], accountIds: [], from: '2026-08-17', to: '2026-08-21',
    })).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('theo hết các trang nextPageToken', async () => {
    let n = 0
    const client: JiraClient = {
      call: vi.fn(async () => {
        n += 1
        if (n === 1) {
          return { issues: [{ key: 'CAG-1', fields: { summary: 'S1' } }], nextPageToken: 'p2' } as never
        }
        return { issues: [{ key: 'CAG-2', fields: { summary: 'S2' } }] } as never
      }),
    }
    const out = await searchIssuesWithWorklogs(client, {
      projects: ['CAG'], accountIds: ['u1'], from: '2026-08-17', to: '2026-08-21',
    })
    expect(out.map((i) => i.key)).toEqual(['CAG-1', 'CAG-2'])
  })
})

describe('getIssueWorklogs', () => {
  it('map worklog Jira sang Worklog của core, dùng wall-clock', async () => {
    const { client } = fakeClient({
      'GET /rest/api/3/issue/CAG-1/worklog': {
        worklogs: [{
          id: '9001',
          author: { accountId: 'u1' },
          started: '2026-08-19T09:00:00.000+0700',
          timeSpentSeconds: 3600,
          comment: { type: 'doc', version: 1, content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'fix bug' }] },
          ] },
        }],
      },
    })

    const out = await getIssueWorklogs(client, 'CAG-1', 'Summary 1')

    expect(out).toEqual([{
      id: '9001', issueKey: 'CAG-1', issueSummary: 'Summary 1',
      authorAccountId: 'u1', date: '2026-08-19', startMinutes: 540,
      timeSpentSeconds: 3600, comment: 'fix bug',
    }])
  })

  it('comment rỗng hoặc thiếu → chuỗi rỗng, không crash', async () => {
    const { client } = fakeClient({
      'GET /rest/api/3/issue/CAG-1/worklog': {
        worklogs: [{
          id: '1', author: { accountId: 'u1' },
          started: '2026-08-19T09:00:00.000+0700', timeSpentSeconds: 60,
        }],
      },
    })
    expect((await getIssueWorklogs(client, 'CAG-1', 'S'))[0]!.comment).toBe('')
  })

  it('bỏ qua worklog có started không đọc được thay vì làm sập cả bảng', async () => {
    const { client } = fakeClient({
      'GET /rest/api/3/issue/CAG-1/worklog': {
        worklogs: [
          { id: '1', author: { accountId: 'u1' }, started: 'rác', timeSpentSeconds: 60 },
          { id: '2', author: { accountId: 'u1' }, started: '2026-08-19T09:00:00.000+0700', timeSpentSeconds: 60 },
        ],
      },
    })
    const out = await getIssueWorklogs(client, 'CAG-1', 'S')
    expect(out.map((w) => w.id)).toEqual(['2'])
  })
})

describe('addWorklog', () => {
  it('POST đúng payload và tắt notify', async () => {
    const { client, calls } = fakeClient({
      'POST /rest/api/3/issue/CAG-1/worklog': { id: '9002' },
    })

    const out = await addWorklog(client, {
      issueKey: 'CAG-1', startedIso: '2026-08-19T09:00:00.000+0700',
      timeSpentSeconds: 1800, comment: 'daily',
    })

    expect(out).toEqual({ id: '9002' })
    expect(calls[0]!.path).toContain('notifyUsers=false')
    const body = calls[0]!.body as { timeSpentSeconds: number; started: string; comment?: unknown }
    expect(body.timeSpentSeconds).toBe(1800)
    expect(body.started).toBe('2026-08-19T09:00:00.000+0700')
    expect(JSON.stringify(body.comment)).toContain('daily')
  })

  it('không gửi field comment khi comment rỗng', async () => {
    const { client, calls } = fakeClient({ 'POST /rest/api/3/issue/CAG-1/worklog': { id: '1' } })
    await addWorklog(client, {
      issueKey: 'CAG-1', startedIso: '2026-08-19T09:00:00.000+0700',
      timeSpentSeconds: 900, comment: '',
    })
    expect((calls[0]!.body as Record<string, unknown>)['comment']).toBeUndefined()
  })
})

describe('getActiveSprint', () => {
  it('trả sprint đang mở đầu tiên', async () => {
    const { client } = fakeClient({
      'GET /rest/agile/1.0/board/5/sprint': {
        values: [{ id: 42, name: 'Sprint 42', startDate: '2026-08-17T00:00:00.000Z', endDate: '2026-08-28T00:00:00.000Z' }],
      },
    })
    expect((await getActiveSprint(client, 5))?.id).toBe(42)
  })

  it('trả null khi board không có sprint đang mở', async () => {
    const { client } = fakeClient({ 'GET /rest/agile/1.0/board/5/sprint': { values: [] } })
    expect(await getActiveSprint(client, 5)).toBeNull()
  })
})

describe('getSprintIssues', () => {
  it('đọc story points từ custom field được truyền vào', async () => {
    const { client } = fakeClient({
      'GET /rest/agile/1.0/sprint/42/issue': {
        issues: [{
          key: 'CAG-1',
          fields: {
            summary: 'S1', status: { name: 'In Progress' },
            assignee: { displayName: 'Thanh Hoang' },
            timespent: 7200, customfield_10016: 3,
          },
        }],
      },
    })

    const out = await getSprintIssues(client, 42, 'customfield_10016')

    expect(out).toEqual([{
      key: 'CAG-1', summary: 'S1', assigneeName: 'Thanh Hoang',
      status: 'In Progress', storyPoints: 3, timeSpentSeconds: 7200,
    }])
  })

  it('storyPoints null khi không biết field id', async () => {
    const { client } = fakeClient({
      'GET /rest/agile/1.0/sprint/42/issue': {
        issues: [{ key: 'CAG-1', fields: { summary: 'S1', status: { name: 'Open' }, assignee: null, timespent: null } }],
      },
    })
    const out = await getSprintIssues(client, 42, null)
    expect(out[0]).toEqual({
      key: 'CAG-1', summary: 'S1', assigneeName: null,
      status: 'Open', storyPoints: null, timeSpentSeconds: 0,
    })
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/jira/endpoints.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Implement**

```ts
// src/jira/endpoints.ts
import type { JiraClient } from './client'
import { parseStarted } from '@/core/jiraTime'
import type { Worklog } from '@/core/coverage'
import type { SprintIssue } from '@/core/points'

// --- ADF helpers -----------------------------------------------------------
// Jira Cloud v3 dùng Atlassian Document Format cho comment. Ta chỉ cần một
// đoạn văn bản phẳng ở cả hai chiều.
type Adf = { type: string; content?: Adf[]; text?: string }

const toAdf = (text: string): Adf => ({
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
} as Adf)

const adfToText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return ''
  const n = node as Adf
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.content)) return n.content.map(adfToText).join('')
  return ''
}

// --- identity & fields -----------------------------------------------------
export async function getMyself(c: JiraClient) {
  return c.call<{ accountId: string; displayName: string; timeZone: string }>({
    method: 'GET', path: '/rest/api/3/myself',
  })
}

const STORY_POINT_NAMES = ['Story Points', 'Story point estimate']

// Id của field Story Points khác nhau giữa các Jira instance, nên dò thay vì
// hardcode. Kết quả được cache vào config.storyPointsFieldId.
export async function findStoryPointsFieldId(c: JiraClient): Promise<string | null> {
  const fields = await c.call<{ id: string; name: string }[]>({
    method: 'GET', path: '/rest/api/3/field',
  })
  for (const name of STORY_POINT_NAMES) {
    const hit = fields.find((f) => f.name === name)
    if (hit) return hit.id
  }
  return null
}

// --- worklog search --------------------------------------------------------
export async function searchIssuesWithWorklogs(
  c: JiraClient,
  args: { projects: string[]; accountIds: string[]; from: string; to: string },
): Promise<{ key: string; summary: string }[]> {
  // "worklogAuthor in ()" là lỗi cú pháp JQL — chặn trước khi gọi Jira.
  if (args.accountIds.length === 0) return []

  const authors = args.accountIds.map((a) => `"${a}"`).join(',')
  const clauses = [
    `worklogDate >= "${args.from}"`,
    `worklogDate <= "${args.to}"`,
    `worklogAuthor in (${authors})`,
  ]
  if (args.projects.length > 0) {
    clauses.push(`project in (${args.projects.map((p) => `"${p}"`).join(',')})`)
  }
  const jql = clauses.join(' AND ')

  const out: { key: string; summary: string }[] = []
  let nextPageToken: string | undefined

  do {
    const page = await c.call<{
      issues: { key: string; fields: { summary: string } }[]
      nextPageToken?: string
    }>({
      method: 'POST',
      path: '/rest/api/3/search/jql',
      body: { jql, fields: ['summary'], maxResults: 100, nextPageToken },
    })
    for (const i of page.issues) out.push({ key: i.key, summary: i.fields.summary })
    nextPageToken = page.nextPageToken
  } while (nextPageToken)

  return out
}

export async function getIssueWorklogs(
  c: JiraClient, issueKey: string, issueSummary: string,
): Promise<Worklog[]> {
  const res = await c.call<{
    worklogs: {
      id: string
      author?: { accountId?: string }
      started: string
      timeSpentSeconds: number
      comment?: unknown
    }[]
  }>({ method: 'GET', path: `/rest/api/3/issue/${issueKey}/worklog` })

  const out: Worklog[] = []
  for (const w of res.worklogs) {
    let parsed: { date: string; minutes: number }
    try {
      parsed = parseStarted(w.started)
    } catch {
      // Một worklog rác không được làm sập cả bảng của team.
      console.warn(`[jira] bỏ qua worklog ${w.id} của ${issueKey}: started không đọc được`)
      continue
    }
    out.push({
      id: w.id,
      issueKey,
      issueSummary,
      authorAccountId: w.author?.accountId ?? '',
      date: parsed.date,
      startMinutes: parsed.minutes,
      timeSpentSeconds: w.timeSpentSeconds,
      comment: adfToText(w.comment),
    })
  }
  return out
}

export async function addWorklog(
  c: JiraClient,
  args: { issueKey: string; startedIso: string; timeSpentSeconds: number; comment: string },
): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    timeSpentSeconds: args.timeSpentSeconds,
    started: args.startedIso,
  }
  if (args.comment !== '') body['comment'] = toAdf(args.comment)

  return c.call<{ id: string }>({
    method: 'POST',
    path: `/rest/api/3/issue/${args.issueKey}/worklog?notifyUsers=false`,
    body,
  })
}

export async function deleteWorklog(
  c: JiraClient, issueKey: string, worklogId: string,
): Promise<void> {
  await c.call<null>({
    method: 'DELETE',
    path: `/rest/api/3/issue/${issueKey}/worklog/${worklogId}?notifyUsers=false`,
  })
}

// --- pickers ---------------------------------------------------------------
export async function pickIssues(
  c: JiraClient, query: string,
): Promise<{ key: string; summary: string }[]> {
  const res = await c.call<{
    sections: { issues: { key: string; summaryText: string }[] }[]
  }>({
    method: 'GET',
    path: `/rest/api/3/issue/picker?query=${encodeURIComponent(query)}`,
  })
  const seen = new Set<string>()
  const out: { key: string; summary: string }[] = []
  for (const section of res.sections ?? []) {
    for (const i of section.issues ?? []) {
      if (seen.has(i.key)) continue
      seen.add(i.key)
      out.push({ key: i.key, summary: i.summaryText })
    }
  }
  return out
}

export async function searchUsers(
  c: JiraClient, query: string,
): Promise<{ accountId: string; displayName: string }[]> {
  const res = await c.call<{ accountId: string; displayName: string }[]>({
    method: 'GET',
    path: `/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=50`,
  })
  return res.map((u) => ({ accountId: u.accountId, displayName: u.displayName }))
}

// --- agile -----------------------------------------------------------------
export async function getBoards(
  c: JiraClient, projectKey: string,
): Promise<{ id: number; name: string }[]> {
  const res = await c.call<{ values: { id: number; name: string }[] }>({
    method: 'GET',
    path: `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}`,
  })
  return res.values
}

export async function getActiveSprint(
  c: JiraClient, boardId: number,
): Promise<{ id: number; name: string; startDate: string; endDate: string } | null> {
  const res = await c.call<{
    values: { id: number; name: string; startDate?: string; endDate?: string }[]
  }>({ method: 'GET', path: `/rest/agile/1.0/board/${boardId}/sprint?state=active` })

  const s = res.values[0]
  if (!s) return null
  return {
    id: s.id, name: s.name,
    startDate: s.startDate ?? '', endDate: s.endDate ?? '',
  }
}

export async function getSprintIssues(
  c: JiraClient, sprintId: number, storyPointsFieldId: string | null,
): Promise<SprintIssue[]> {
  const fields = ['summary', 'status', 'assignee', 'timespent']
  if (storyPointsFieldId) fields.push(storyPointsFieldId)

  const res = await c.call<{
    issues: { key: string; fields: Record<string, unknown> }[]
  }>({
    method: 'GET',
    path: `/rest/agile/1.0/sprint/${sprintId}/issue?fields=${fields.join(',')}&maxResults=100`,
  })

  return res.issues.map((i) => {
    const f = i.fields
    const sp = storyPointsFieldId ? f[storyPointsFieldId] : null
    const assignee = f['assignee'] as { displayName?: string } | null
    const status = f['status'] as { name?: string } | null
    return {
      key: i.key,
      summary: String(f['summary'] ?? ''),
      assigneeName: assignee?.displayName ?? null,
      status: status?.name ?? '',
      storyPoints: typeof sp === 'number' ? sp : null,
      timeSpentSeconds: typeof f['timespent'] === 'number' ? f['timespent'] : 0,
    }
  })
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run tests/jira/endpoints.test.ts`
Expected: PASS.

- [ ] **Step 5: Xác nhận ràng buộc kiến trúc chưa bị vi phạm**

Run: `! grep -rn "from '@/jira" src/core/ && ! grep -rn "chrome\." src/core/ && echo "core/ vẫn thuần"`
Expected: in ra `core/ vẫn thuần`.

- [ ] **Step 6: Commit**

```bash
git add src/jira/endpoints.ts tests/jira/endpoints.test.ts
git commit -m "feat(jira): endpoint worklog, sprint, picker; dò field Story Points"
```

---

## Task 10: `store/` — config và snapshot trong chrome.storage.local

**Files:**
- Create: `src/store/config.ts`, `src/store/snapshot.ts`
- Test: `tests/store/config.test.ts`

**Interfaces:**
- Consumes: `migrateConfig`, `Config` từ `@/core/config-schema` (Task 7); `snapshotKey`, `isStale`, `SNAPSHOT_TTL_MS`, `Scope` từ `@/core/snapshot-key` (Task 7); `Worklog` từ `@/core/coverage`.
- Produces:
  - `loadConfig(): Promise<Config>`
  - `saveConfig(patch: Partial<Config>): Promise<Config>`
  - `type Snapshot = { fetchedAt: number; worklogs: Worklog[] }`
  - `readSnapshot(scope: Scope): Promise<{ snapshot: Snapshot; stale: boolean } | null>`
  - `writeSnapshot(scope: Scope, worklogs: Worklog[], now: number): Promise<void>`
  - `patchSnapshot(scope: Scope, add: Worklog[], removeIds: string[]): Promise<void>`

- [ ] **Step 1: Viết test fail (với chrome giả)**

```ts
// tests/store/config.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defaultConfig } from '@/core/config-schema'

// chrome giả tối thiểu: chỉ storage.local, đủ cho store/.
const makeChrome = () => {
  const data: Record<string, unknown> = {}
  return {
    data,
    api: {
      storage: {
        local: {
          get: vi.fn(async (keys: string[] | string) => {
            const list = Array.isArray(keys) ? keys : [keys]
            return Object.fromEntries(
              list.filter((k) => k in data).map((k) => [k, data[k]]),
            )
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(data, items)
          }),
        },
      },
    },
  }
}

describe('store/config', () => {
  let fake: ReturnType<typeof makeChrome>

  beforeEach(() => {
    fake = makeChrome()
    vi.stubGlobal('chrome', fake.api)
    vi.resetModules()
  })

  it('loadConfig trả default khi storage rỗng', async () => {
    const { loadConfig } = await import('@/store/config')
    expect(await loadConfig()).toEqual(defaultConfig)
  })

  it('loadConfig chạy migrate qua dữ liệu cũ', async () => {
    fake.data['config'] = { projects: 'sai kiểu' }
    const { loadConfig } = await import('@/store/config')
    expect((await loadConfig()).projects).toEqual([])
  })

  it('saveConfig merge patch chứ không ghi đè cả object', async () => {
    const { saveConfig, loadConfig } = await import('@/store/config')
    await saveConfig({ projects: ['CAG'] })
    await saveConfig({ workdayStart: '08:00' })
    const c = await loadConfig()
    expect(c.projects).toEqual(['CAG'])
    expect(c.workdayStart).toBe('08:00')
  })

  it('saveConfig trả về config sau khi merge', async () => {
    const { saveConfig } = await import('@/store/config')
    expect((await saveConfig({ projects: ['CAG'] })).projects).toEqual(['CAG'])
  })

  it('luôn ghi vào storage.local, không bao giờ storage.sync', async () => {
    const { saveConfig } = await import('@/store/config')
    await saveConfig({ projects: ['CAG'] })
    expect(fake.api.storage.local.set).toHaveBeenCalled()
    expect('sync' in fake.api.storage).toBe(false)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/store/config.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Implement `store/config.ts`**

```ts
// src/store/config.ts
import { migrateConfig, type Config } from '@/core/config-schema'

const KEY = 'config'

export async function loadConfig(): Promise<Config> {
  const res = await chrome.storage.local.get(KEY)
  return migrateConfig(res[KEY])
}

export async function saveConfig(patch: Partial<Config>): Promise<Config> {
  const current = await loadConfig()
  const next = migrateConfig({ ...current, ...patch })
  await chrome.storage.local.set({ [KEY]: next })
  return next
}
```

- [ ] **Step 4: Implement `store/snapshot.ts`**

```ts
// src/store/snapshot.ts
import { snapshotKey, isStale, SNAPSHOT_TTL_MS, type Scope } from '@/core/snapshot-key'
import type { Worklog } from '@/core/coverage'

export type Snapshot = { fetchedAt: number; worklogs: Worklog[] }

export async function readSnapshot(
  scope: Scope,
): Promise<{ snapshot: Snapshot; stale: boolean } | null> {
  const key = snapshotKey(scope)
  const res = await chrome.storage.local.get(key)
  const snapshot = res[key] as Snapshot | undefined
  if (!snapshot) return null
  return { snapshot, stale: isStale(snapshot.fetchedAt, Date.now(), SNAPSHOT_TTL_MS) }
}

export async function writeSnapshot(
  scope: Scope, worklogs: Worklog[], now: number,
): Promise<void> {
  await chrome.storage.local.set({
    [snapshotKey(scope)]: { fetchedAt: now, worklogs } satisfies Snapshot,
  })
}

// Sau khi log hoặc undo, patch tại chỗ thay vì refetch: side panel phải phản hồi
// tức thì, và một worklog vừa ghi thì ta đã biết đủ thông tin về nó.
export async function patchSnapshot(
  scope: Scope, add: Worklog[], removeIds: string[],
): Promise<void> {
  const existing = await readSnapshot(scope)
  if (!existing) return
  const remove = new Set(removeIds)
  const worklogs = [
    ...existing.snapshot.worklogs.filter((w) => !remove.has(w.id)),
    ...add,
  ]
  await chrome.storage.local.set({
    [snapshotKey(scope)]: {
      fetchedAt: existing.snapshot.fetchedAt, worklogs,
    } satisfies Snapshot,
  })
}
```

- [ ] **Step 5: Chạy test để xác nhận PASS**

Run: `npx vitest run tests/store/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store tests/store
git commit -m "feat(store): config và snapshot cache trên chrome.storage.local"
```

---

## Task 11: `sw/` — service worker và router message

Service worker là **cầu duy nhất** giữa UI và Jira. Nó trả về **dữ liệu thô**; UI tự gọi `core/` để dựng bảng. Nhờ vậy `core/` chạy trong ngữ cảnh UI (nơi có React re-render) và service worker không phải giữ state gì.

**Files:**
- Create: `src/sw/messages.ts`, `src/sw/handlers.ts`
- Modify: `src/sw/index.ts` (thay bản tối thiểu của Task 1)

**Interfaces:**
- Consumes: `loadConfig`, `saveConfig` (Task 10); `readSnapshot`, `writeSnapshot`, `patchSnapshot` (Task 10); toàn bộ `@/jira/endpoints` (Task 9); `createClient`, `cookieAuth`, `tokenAuth` (Task 8); `formatStarted`, `offsetMinutesForZone`, `todayInZone` (Task 3); `Scope` (Task 7).
- Produces: `type Message` và `type Reply` trong `src/sw/messages.ts` — **UI import type từ đây, không import gì khác từ `sw/`**.

- [ ] **Step 1: Định nghĩa message contract**

```ts
// src/sw/messages.ts
import type { Config } from '@/core/config-schema'
import type { Worklog } from '@/core/coverage'
import type { SprintIssue } from '@/core/points'
import type { Scope } from '@/core/snapshot-key'

export type Message =
  | { type: 'config/load' }
  | { type: 'config/save'; patch: Partial<Config> }
  | { type: 'auth/probe' }
  | { type: 'permission/request'; origin: string }
  | { type: 'day/load'; date: string }
  | { type: 'worklog/add'; issueKey: string; date: string; startMinutes: number; timeSpentSeconds: number; comment: string }
  | { type: 'worklog/delete'; issueKey: string; worklogId: string }
  | { type: 'issues/pick'; query: string }
  | { type: 'users/search'; query: string }
  | { type: 'boards/load'; projectKey: string }
  | { type: 'sprint/current' }
  | { type: 'coverage/load'; scope: Scope; force: boolean }
  | { type: 'points/load' }
  | { type: 'dashboard/open' }

export type Reply =
  | { ok: true; data: unknown }
  | { ok: false; error: string; status?: number }

export type AuthProbeResult = {
  mode: 'cookie' | 'token'
  accountId: string
  displayName: string
  timeZone: string
}

export type DayLoadResult = { worklogs: Worklog[] }
export type CoverageLoadResult = { worklogs: Worklog[]; fetchedAt: number; stale: boolean }
export type PointsLoadResult = { sprintName: string; issues: SprintIssue[] }
export type SprintCurrentResult = { name: string; from: string; to: string } | null

// Helper dùng ở cả ba bề mặt UI. Nó ném Error với message đọc được để
// component chỉ cần try/catch một chỗ.
export async function send<T>(message: Message): Promise<T> {
  const reply = (await chrome.runtime.sendMessage(message)) as Reply | undefined
  if (!reply) throw new Error('Service worker không trả lời')
  if (!reply.ok) throw new Error(reply.error)
  return reply.data as T
}
```

- [ ] **Step 2: Implement handlers**

```ts
// src/sw/handlers.ts
import { loadConfig, saveConfig } from '@/store/config'
import { readSnapshot, writeSnapshot, patchSnapshot } from '@/store/snapshot'
import { createClient, type JiraClient } from '@/jira/client'
import { cookieAuth, tokenAuth } from '@/jira/auth'
import * as api from '@/jira/endpoints'
import { formatStarted, offsetMinutesForZone, todayInZone } from '@/core/jiraTime'
import type { Config } from '@/core/config-schema'
import type { Worklog } from '@/core/coverage'
import type {
  Message, AuthProbeResult, DayLoadResult, CoverageLoadResult,
  PointsLoadResult, SprintCurrentResult,
} from './messages'

async function makeClient(config: Config): Promise<JiraClient> {
  if (!config.jiraBaseUrl) throw new Error('Chưa cấu hình Jira URL — mở Options')
  const auth =
    config.authMode === 'token' && config.token
      ? tokenAuth(config.token.email, config.token.apiToken)
      : cookieAuth
  return createClient({
    baseUrl: config.jiraBaseUrl,
    auth,
    onUnauthorized: () => {
      // Không xoá token: người dùng có thể chỉ cần đăng nhập lại Jira.
      console.warn('[sw] Jira trả 401/403 — cần đăng nhập lại hoặc nhập token')
    },
  })
}

// Lấy worklog cho một khoảng ngày: tìm issue có worklog trong khoảng, rồi fetch
// worklog của từng issue. client tự giới hạn 5 request song song.
async function fetchWorklogs(
  c: JiraClient, config: Config, accountIds: string[], from: string, to: string,
): Promise<Worklog[]> {
  const issues = await api.searchIssuesWithWorklogs(c, {
    projects: config.projects, accountIds, from, to,
  })
  const perIssue = await Promise.all(
    issues.map((i) => api.getIssueWorklogs(c, i.key, i.summary)),
  )
  const wanted = new Set(accountIds)
  return perIssue
    .flat()
    .filter((w) => wanted.has(w.authorAccountId) && w.date >= from && w.date <= to)
}

export async function handle(msg: Message): Promise<unknown> {
  switch (msg.type) {
    case 'config/load':
      return loadConfig()

    case 'config/save':
      return saveConfig(msg.patch)

    case 'permission/request':
      return chrome.permissions.request({ origins: [msg.origin] })

    case 'auth/probe': {
      const config = await loadConfig()
      const c = await makeClient(config)
      const me = await api.getMyself(c)
      // Dò field Story Points một lần rồi cache — nó không đổi theo thời gian.
      const storyPointsFieldId =
        config.storyPointsFieldId ?? (await api.findStoryPointsFieldId(c))
      await saveConfig({
        myAccountId: me.accountId,
        timeZone: me.timeZone,
        storyPointsFieldId,
      })
      return {
        mode: config.authMode, accountId: me.accountId,
        displayName: me.displayName, timeZone: me.timeZone,
      } satisfies AuthProbeResult
    }

    case 'day/load': {
      const config = await loadConfig()
      const c = await makeClient(config)
      const worklogs = await fetchWorklogs(
        c, config, [config.myAccountId], msg.date, msg.date,
      )
      return { worklogs } satisfies DayLoadResult
    }

    case 'worklog/add': {
      const config = await loadConfig()
      const c = await makeClient(config)
      const offset = offsetMinutesForZone(config.timeZone, msg.date)
      const startedIso = formatStarted(msg.date, msg.startMinutes, offset)
      return api.addWorklog(c, {
        issueKey: msg.issueKey,
        startedIso,
        timeSpentSeconds: msg.timeSpentSeconds,
        comment: msg.comment,
      })
    }

    case 'worklog/delete': {
      const config = await loadConfig()
      const c = await makeClient(config)
      await api.deleteWorklog(c, msg.issueKey, msg.worklogId)
      return null
    }

    case 'issues/pick': {
      const config = await loadConfig()
      return api.pickIssues(await makeClient(config), msg.query)
    }

    case 'users/search': {
      const config = await loadConfig()
      return api.searchUsers(await makeClient(config), msg.query)
    }

    case 'boards/load': {
      const config = await loadConfig()
      return api.getBoards(await makeClient(config), msg.projectKey)
    }

    case 'sprint/current': {
      const config = await loadConfig()
      if (config.primaryBoardId === null) return null
      const c = await makeClient(config)
      const sprint = await api.getActiveSprint(c, config.primaryBoardId)
      if (!sprint) return null
      return {
        name: sprint.name,
        from: sprint.startDate.slice(0, 10),
        to: sprint.endDate.slice(0, 10),
      } satisfies SprintCurrentResult
    }

    case 'coverage/load': {
      const config = await loadConfig()
      const cached = await readSnapshot(msg.scope)

      // Snapshot còn tươi và không bị buộc refresh → trả ngay, không gọi Jira.
      if (cached && !cached.stale && !msg.force) {
        return {
          worklogs: cached.snapshot.worklogs,
          fetchedAt: cached.snapshot.fetchedAt,
          stale: false,
        } satisfies CoverageLoadResult
      }

      try {
        const c = await makeClient(config)
        const worklogs = await fetchWorklogs(
          c, config, msg.scope.accountIds, msg.scope.from, msg.scope.to,
        )
        const now = Date.now()
        await writeSnapshot(msg.scope, worklogs, now)
        return { worklogs, fetchedAt: now, stale: false } satisfies CoverageLoadResult
      } catch (e) {
        // Jira lỗi nhưng có snapshot cũ: trả snapshot cũ và đánh dấu stale.
        // UI hiện timestamp. Không bao giờ trả rỗng như thể team chưa log.
        if (cached) {
          return {
            worklogs: cached.snapshot.worklogs,
            fetchedAt: cached.snapshot.fetchedAt,
            stale: true,
          } satisfies CoverageLoadResult
        }
        throw e
      }
    }

    case 'points/load': {
      const config = await loadConfig()
      if (config.primaryBoardId === null) {
        throw new Error('Chưa chọn board chính — mở Options')
      }
      const c = await makeClient(config)
      const sprint = await api.getActiveSprint(c, config.primaryBoardId)
      if (!sprint) return { sprintName: '', issues: [] } satisfies PointsLoadResult
      const issues = await api.getSprintIssues(c, sprint.id, config.storyPointsFieldId)
      return { sprintName: sprint.name, issues } satisfies PointsLoadResult
    }

    case 'dashboard/open': {
      await chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/dashboard/index.html') })
      return null
    }
  }
}

// Export để side panel gọi sau khi log/undo, giữ snapshot đồng bộ.
export { patchSnapshot, todayInZone }
```

- [ ] **Step 3: Implement router trong `sw/index.ts`**

```ts
// src/sw/index.ts
import { handle } from './handlers'
import type { Message, Reply } from './messages'

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error('[sw] setPanelBehavior', e))

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  handle(msg)
    .then((data) => sendResponse({ ok: true, data } satisfies Reply))
    .catch((e: unknown) => {
      const error = e instanceof Error ? e.message : String(e)
      const status = typeof e === 'object' && e !== null && 'status' in e
        ? (e as { status: number }).status
        : undefined
      console.error('[sw]', msg.type, error)
      sendResponse({ ok: false, error, status } satisfies Reply)
    })
  // true = giữ kênh mở cho phản hồi async. Thiếu dòng này thì mọi handler
  // trả về undefined ở phía UI — lỗi kinh điển của MV3.
  return true
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-sidepanel') chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT })
})
```

- [ ] **Step 4: Kiểm tra type và build**

Run: `npm run build`
Expected: không lỗi TypeScript. Nếu `chrome.sidePanel.open` báo thiếu type, nâng `@types/chrome`.

- [ ] **Step 5: Smoke test bằng tay**

Reload extension ở `chrome://extensions`, mở service worker console (link "Service worker"), chạy:

```js
await chrome.runtime.sendMessage({ type: 'config/load' })
```

Expected: trả `{ ok: true, data: { version: 1, jiraBaseUrl: '', ... } }`.

- [ ] **Step 6: Commit**

```bash
git add src/sw
git commit -m "feat(sw): router message, snapshot fallback khi Jira lỗi"
```

---

## Task 12: Options page — setup

**Files:**
- Create: `src/ui/shared/Banner.tsx`, `src/ui/shared/format.ts`
- Modify: `src/ui/options/main.tsx`
- Create: `src/ui/options/Options.tsx`

**Interfaces:**
- Consumes: `send`, các type result từ `@/sw/messages` (Task 11); `Config` từ `@/core/config-schema`; `formatDuration` từ `@/core/duration`.
- Produces: `Banner` (dùng lại ở side panel và dashboard), `src/ui/shared/format.ts` với `hoursLabel(seconds: number): string`.

Options gồm 6 khối, mỗi khối lưu ngay khi đổi (không có nút Save toàn trang — một form dài với nút Save ở cuối là chỗ người dùng mất dữ liệu):

1. **Jira URL** — input + nút "Kết nối". Nút gọi `permission/request` với origin `https://<host>/*` rồi `auth/probe`. Hiện kết quả: tên, timezone, và `authMode` đã dùng.
2. **Cảnh báo timezone** — nếu `Intl.DateTimeFormat().resolvedOptions().timeZone !== config.timeZone`, hiện banner vàng: "Timezone Jira (`X`) khác timezone máy (`Y`). Worklog sẽ ghi theo timezone Jira." Không tự sửa gì.
3. **Project** — input thêm/xoá project key. Hiện danh sách hiện tại dạng chip.
4. **Board chính** — dropdown, nạp từ `boards/load` của project đầu tiên; giải thích một dòng: "Dùng cho preset Sprint hiện tại và tab Story points."
5. **Member** — ô search gọi `users/search`, thêm vào danh sách; mỗi member có input `hoursPerDay` và checkbox `active`.
6. **Sprint event** — bảng thêm/xoá dòng: tên, issue key, số phút mặc định, comment mặc định.

- [ ] **Step 1: Viết `Banner.tsx`**

```tsx
// src/ui/shared/Banner.tsx
type Props = {
  kind: 'error' | 'warn' | 'info'
  children: React.ReactNode
  action?: { label: string; onClick: () => void }
}

const COLORS = {
  error: { bg: '#fdecea', fg: '#611a15' },
  warn: { bg: '#fff8e1', fg: '#5f4300' },
  info: { bg: '#e8f4fd', fg: '#0b3a5b' },
} as const

export function Banner({ kind, children, action }: Props) {
  const c = COLORS[kind]
  return (
    <div style={{
      background: c.bg, color: c.fg, padding: '8px 12px', borderRadius: 6,
      display: 'flex', gap: 8, alignItems: 'center', fontSize: 13,
    }}>
      <div style={{ flex: 1 }}>{children}</div>
      {action && (
        <button onClick={action.onClick} style={{ fontSize: 13 }}>{action.label}</button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Viết `format.ts`**

```ts
// src/ui/shared/format.ts
import { formatDuration, formatHhMm } from '@/core/duration'

export const hoursLabel = (seconds: number): string =>
  seconds === 0 ? '–' : formatDuration(seconds)

export const cellLabel = (seconds: number): string =>
  seconds === 0 ? '' : formatHhMm(seconds)
```

- [ ] **Step 3: Viết `Options.tsx`**

Đây là component dài nhưng phẳng. Khung bắt buộc, các khối còn lại theo cùng mẫu:

```tsx
// src/ui/options/Options.tsx
import { useEffect, useState } from 'react'
import { send, type AuthProbeResult } from '@/sw/messages'
import type { Config, ConfigMember, SprintEvent } from '@/core/config-schema'
import { Banner } from '@/ui/shared/Banner'

export function Options() {
  const [config, setConfig] = useState<Config | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [probe, setProbe] = useState<AuthProbeResult | null>(null)
  const [urlDraft, setUrlDraft] = useState('')

  useEffect(() => {
    send<Config>({ type: 'config/load' })
      .then((c) => { setConfig(c); setUrlDraft(c.jiraBaseUrl) })
      .catch((e: Error) => setError(e.message))
  }, [])

  const save = async (patch: Partial<Config>) => {
    try {
      setConfig(await send<Config>({ type: 'config/save', patch }))
      setError(null)
    } catch (e) { setError((e as Error).message) }
  }

  const connect = async () => {
    setError(null)
    try {
      const url = new URL(urlDraft)
      const granted = await send<boolean>({
        type: 'permission/request', origin: `${url.origin}/*`,
      })
      if (!granted) { setError('Bạn đã từ chối quyền truy cập Jira'); return }
      await save({ jiraBaseUrl: url.origin })
      setProbe(await send<AuthProbeResult>({ type: 'auth/probe' }))
    } catch (e) { setError((e as Error).message) }
  }

  if (!config) return <div style={{ padding: 16 }}>Đang tải…</div>

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzMismatch = config.timeZone !== 'UTC' && config.timeZone !== browserTz

  return (
    <div style={{ padding: 16, maxWidth: 760, fontFamily: 'system-ui', display: 'grid', gap: 20 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>Worklog — cấu hình</h1>

      {error && <Banner kind="error">{error}</Banner>}

      {tzMismatch && (
        <Banner kind="warn">
          Timezone Jira (<code>{config.timeZone}</code>) khác timezone máy
          (<code>{browserTz}</code>). Worklog sẽ ghi theo timezone Jira.
        </Banner>
      )}

      <section>
        <h2 style={{ fontSize: 15 }}>1. Jira</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://your-site.atlassian.net"
            style={{ flex: 1, padding: 6 }}
          />
          <button onClick={connect}>Kết nối</button>
        </div>
        {probe && (
          <p style={{ fontSize: 13, color: '#2e7d32' }}>
            Đã kết nối: {probe.displayName} · {probe.timeZone} · chế độ {probe.mode}
          </p>
        )}
      </section>

      {/* Khối 3–6 theo cùng mẫu: đọc từ `config`, ghi bằng `save({...})`.
          Mỗi thay đổi lưu ngay — không có nút Save toàn trang. */}
      <ProjectsSection config={config} save={save} />
      <BoardSection config={config} save={save} />
      <MembersSection config={config} save={save} />
      <EventsSection config={config} save={save} />
    </div>
  )
}
```

Bốn section con nằm cùng file (chúng chỉ được dùng ở đây và luôn thay đổi cùng nhau). Mẫu cho `MembersSection` — ba section còn lại theo cùng cấu trúc:

```tsx
function MembersSection({ config, save }: {
  config: Config; save: (p: Partial<Config>) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ accountId: string; displayName: string }[]>([])

  const search = async () => {
    setFound(await send<{ accountId: string; displayName: string }[]>({
      type: 'users/search', query,
    }))
  }

  const add = (u: { accountId: string; displayName: string }) => {
    if (config.members.some((m) => m.accountId === u.accountId)) return
    const member: ConfigMember = { ...u, hoursPerDay: 8, active: true }
    void save({ members: [...config.members, member] })
  }

  const update = (accountId: string, patch: Partial<ConfigMember>) => {
    void save({
      members: config.members.map((m) => (m.accountId === accountId ? { ...m, ...patch } : m)),
    })
  }

  return (
    <section>
      <h2 style={{ fontSize: 15 }}>5. Member theo dõi</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)}
               placeholder="Tên hoặc email" style={{ flex: 1, padding: 6 }} />
        <button onClick={search}>Tìm</button>
      </div>
      {found.length > 0 && (
        <ul>
          {found.map((u) => (
            <li key={u.accountId}>
              {u.displayName} <button onClick={() => add(u)}>Thêm</button>
            </li>
          ))}
        </ul>
      )}
      <table style={{ width: '100%', fontSize: 13, marginTop: 8 }}>
        <thead><tr><th align="left">Member</th><th>Giờ/ngày</th><th>Active</th><th /></tr></thead>
        <tbody>
          {config.members.map((m) => (
            <tr key={m.accountId}>
              <td>{m.displayName}</td>
              <td align="center">
                <input type="number" min={0} max={24} value={m.hoursPerDay} style={{ width: 56 }}
                       onChange={(e) => update(m.accountId, { hoursPerDay: Number(e.target.value) })} />
              </td>
              <td align="center">
                <input type="checkbox" checked={m.active}
                       onChange={(e) => update(m.accountId, { active: e.target.checked })} />
              </td>
              <td align="center">
                <button onClick={() => void save({
                  members: config.members.filter((x) => x.accountId !== m.accountId),
                })}>Xoá</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
```

`ProjectsSection` (input + chip list, ghi `projects`), `BoardSection` (gọi `boards/load` cho `config.projects[0]`, dropdown ghi `primaryBoardId`), `EventsSection` (bảng thêm/xoá `SprintEvent` với 4 cột: tên, issue key, phút, comment) viết theo đúng mẫu trên: đọc `config`, ghi qua `save`.

- [ ] **Step 4: Nối vào `main.tsx`**

```tsx
// src/ui/options/main.tsx
import { createRoot } from 'react-dom/client'
import { Options } from './Options'

createRoot(document.getElementById('root')!).render(<Options />)
```

- [ ] **Step 5: Smoke test bằng tay**

Run: `npm run build`, reload extension, mở Options.

Checklist:
- Nhập `https://mesoneerag.atlassian.net` → Kết nối → Chrome hỏi quyền → cho phép → hiện "Đã kết nối: Thanh Hoang · Asia/Jakarta · chế độ cookie".
- Nếu timezone máy khác `Asia/Jakarta` → banner vàng xuất hiện.
- Thêm project `CAG` → chọn board → dropdown có board của CAG.
- Tìm member theo tên → thêm → đổi giờ/ngày → **reload trang** → giá trị vẫn còn (đã lưu ngay).
- Thêm một sprint event (ví dụ Daily / một issue key thật / 15 phút) → reload → vẫn còn.

- [ ] **Step 6: Commit**

```bash
git add src/ui/shared src/ui/options
git commit -m "feat(ui): Options page — kết nối Jira, project, board, member, sprint event"
```

---

## Task 13: Side panel — luồng log hằng ngày

**Files:**
- Modify: `src/ui/sidepanel/main.tsx`
- Create: `src/ui/sidepanel/SidePanel.tsx`, `DayTimeline.tsx`, `IssuePicker.tsx`, `EventButtons.tsx`, `LogForm.tsx`

**Interfaces:**
- Consumes: `send`, `DayLoadResult` (Task 11); `parseDuration`, `formatDuration` (Task 2); `nextFreeStart`, `buildSlots`, `occupiedBy`, `findOverlaps`, `parseHhMm`, `formatMinutes`, `DayEntry` (Task 4); `todayInZone`, `addDays` (Task 3); `Config` (Task 7).
- Produces: không có (đây là lá).

**Cấu trúc state ở `SidePanel.tsx`** — mọi state sống ở đây, các component con là thuần trình bày:

```ts
const [config, setConfig] = useState<Config | null>(null)
const [date, setDate] = useState<string>('')            // "YYYY-MM-DD"
const [worklogs, setWorklogs] = useState<Worklog[]>([])  // của chính mình, ngày đang xem
const [issueKey, setIssueKey] = useState('')
const [startMinutes, setStartMinutes] = useState(0)
const [durationInput, setDurationInput] = useState('')
const [comment, setComment] = useState('')
const [busy, setBusy] = useState(false)
const [error, setError] = useState<string | null>(null)
const [lastLogged, setLastLogged] = useState<{ id: string; issueKey: string } | null>(null)
```

- [ ] **Step 1: Viết `DayTimeline.tsx`**

```tsx
// src/ui/sidepanel/DayTimeline.tsx
import { buildSlots, occupiedBy, formatMinutes, type DayEntry } from '@/core/timeline'

type Props = {
  entries: DayEntry[]
  workdayStartMinutes: number
  slotMinutes: number
  selectedStart: number
  selectedDuration: number
}

const DAY_END = 20 * 60 // 20:00 — đủ cho một ngày làm việc dài

export function DayTimeline({
  entries, workdayStartMinutes, slotMinutes, selectedStart, selectedDuration,
}: Props) {
  const slots = buildSlots(workdayStartMinutes, DAY_END, slotMinutes)
  const selEnd = selectedStart + selectedDuration

  return (
    <div style={{ display: 'grid', gap: 1 }}>
      {slots.map((s) => {
        const busy = occupiedBy(entries, s, slotMinutes)
        const inSelection = selectedDuration > 0 && s >= selectedStart && s < selEnd
        return (
          <div key={s} style={{
            display: 'flex', gap: 6, alignItems: 'center', fontSize: 11,
            background: inSelection ? '#c8e6c9' : busy ? '#eceff1' : 'transparent',
            padding: '1px 4px', borderRadius: 3,
          }}>
            <span style={{ width: 38, color: '#607d8b' }}>
              {s % 60 === 0 ? formatMinutes(s) : ''}
            </span>
            <span style={{ flex: 1, color: '#37474f' }}>
              {busy ? busy.issueKey : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Viết `EventButtons.tsx`**

```tsx
// src/ui/sidepanel/EventButtons.tsx
import type { SprintEvent } from '@/core/config-schema'

type Props = {
  events: SprintEvent[]
  onPick: (e: SprintEvent) => void
}

export function EventButtons({ events, onPick }: Props) {
  if (events.length === 0) {
    return (
      <p style={{ fontSize: 12, color: '#78909c' }}>
        Chưa cấu hình sprint event — thêm trong Options.
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {events.map((e) => (
        <button key={e.issueKey + e.name} onClick={() => onPick(e)}
                title={`${e.issueKey} · ${e.defaultMinutes}m`}
                style={{ fontSize: 12, padding: '4px 8px' }}>
          {e.name}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Viết `IssuePicker.tsx`**

```tsx
// src/ui/sidepanel/IssuePicker.tsx
import { useEffect, useState } from 'react'
import { send } from '@/sw/messages'

type Props = { value: string; onChange: (issueKey: string) => void }

// Nhận issue key từ URL của tab đang mở: /browse/KEY hoặc ?selectedIssue=KEY
const keyFromUrl = (url: string): string | null => {
  const m = /\/browse\/([A-Z][A-Z0-9_]+-\d+)/.exec(url)
    ?? /[?&]selectedIssue=([A-Z][A-Z0-9_]+-\d+)/.exec(url)
  return m?.[1] ?? null
}

export function IssuePicker({ value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ key: string; summary: string }[]>([])

  // Prefill từ tab đang active. Chỉ chạy một lần khi mở panel.
  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const k = tab?.url ? keyFromUrl(tab.url) : null
      if (k) onChange(k)
    })
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    let cancelled = false
    const timer = setTimeout(() => {
      void send<{ key: string; summary: string }[]>({ type: 'issues/pick', query })
        .then((r) => { if (!cancelled) setResults(r) })
        .catch(() => { if (!cancelled) setResults([]) })
    }, 250) // debounce: mỗi ký tự một request là lạm dụng rate limit
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input value={value} onChange={(e) => onChange(e.target.value.toUpperCase())}
               placeholder="CAG-123" style={{ width: 100, padding: 4 }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
               placeholder="tìm issue…" style={{ flex: 1, padding: 4 }} />
      </div>
      {results.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0', maxHeight: 140, overflowY: 'auto' }}>
          {results.map((r) => (
            <li key={r.key}>
              <button onClick={() => { onChange(r.key); setQuery(''); setResults([]) }}
                      style={{ width: '100%', textAlign: 'left', fontSize: 12, padding: 3 }}>
                <strong>{r.key}</strong> {r.summary}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Viết `LogForm.tsx`**

```tsx
// src/ui/sidepanel/LogForm.tsx
import { parseDuration, formatDuration } from '@/core/duration'
import { buildSlots, occupiedBy, formatMinutes, findOverlaps, type DayEntry } from '@/core/timeline'

type Props = {
  entries: DayEntry[]
  presets: number[]
  slotMinutes: number
  workdayStartMinutes: number
  startMinutes: number
  durationInput: string
  comment: string
  busy: boolean
  onStartChange: (m: number) => void
  onDurationChange: (s: string) => void
  onCommentChange: (s: string) => void
  onSubmit: () => void
}

const DAY_END = 20 * 60

export function LogForm(p: Props) {
  const seconds = parseDuration(p.durationInput)
  const minutes = seconds === null ? 0 : Math.round(seconds / 60)
  const overlaps = minutes > 0 ? findOverlaps(p.entries, p.startMinutes, minutes) : []
  const slots = buildSlots(p.workdayStartMinutes, DAY_END, p.slotMinutes)

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label style={{ fontSize: 12 }}>Bắt đầu</label>
        <select value={p.startMinutes} onChange={(e) => p.onStartChange(Number(e.target.value))}>
          {slots.map((s) => {
            const busy = occupiedBy(p.entries, s, p.slotMinutes)
            return (
              <option key={s} value={s}>
                {formatMinutes(s)}{busy ? ` — ${busy.issueKey}` : ''}
              </option>
            )
          })}
        </select>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {p.presets.map((m) => (
          <button key={m} onClick={() => p.onDurationChange(m >= 60 && m % 60 === 0 ? `${m / 60}h` : `${m}m`)}
                  style={{ fontSize: 12, padding: '3px 7px' }}>
            {formatDuration(m * 60)}
          </button>
        ))}
        <input value={p.durationInput} onChange={(e) => p.onDurationChange(e.target.value)}
               placeholder="1h30" style={{ width: 70, padding: 3 }} />
      </div>

      <input value={p.comment} onChange={(e) => p.onCommentChange(e.target.value)}
             placeholder="Ghi chú (không bắt buộc)" style={{ padding: 5 }} />

      {p.durationInput !== '' && seconds === null && (
        <span style={{ fontSize: 12, color: '#c62828' }}>
          Không hiểu "{p.durationInput}" — thử 1h30, 90m, 1.5h
        </span>
      )}

      {overlaps.length > 0 && (
        // Cảnh báo, KHÔNG chặn: Jira cho phép chồng giờ và đôi khi chồng là đúng.
        <span style={{ fontSize: 12, color: '#ef6c00' }}>
          Chồng giờ với {overlaps.map((o) => o.issueKey).join(', ')}
        </span>
      )}

      <button onClick={p.onSubmit} disabled={p.busy || seconds === null}
              style={{ padding: 7, fontWeight: 600 }}>
        {p.busy ? 'Đang ghi…' : `Log ${seconds ? formatDuration(seconds) : ''}`}
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Viết `SidePanel.tsx` — nơi giữ toàn bộ state**

```tsx
// src/ui/sidepanel/SidePanel.tsx
import { useCallback, useEffect, useState } from 'react'
import { send, type DayLoadResult } from '@/sw/messages'
import type { Config, SprintEvent } from '@/core/config-schema'
import type { Worklog } from '@/core/coverage'
import { nextFreeStart, parseHhMm, type DayEntry } from '@/core/timeline'
import { parseDuration, formatDuration } from '@/core/duration'
import { todayInZone, addDays } from '@/core/jiraTime'
import { Banner } from '@/ui/shared/Banner'
import { DayTimeline } from './DayTimeline'
import { EventButtons } from './EventButtons'
import { IssuePicker } from './IssuePicker'
import { LogForm } from './LogForm'

const toEntries = (worklogs: Worklog[]): DayEntry[] =>
  worklogs.map((w) => ({
    id: w.id, issueKey: w.issueKey,
    startMinutes: w.startMinutes,
    durationMinutes: Math.round(w.timeSpentSeconds / 60),
  }))

export function SidePanel() {
  const [config, setConfig] = useState<Config | null>(null)
  const [date, setDate] = useState('')
  const [worklogs, setWorklogs] = useState<Worklog[]>([])
  const [issueKey, setIssueKey] = useState('')
  const [startMinutes, setStartMinutes] = useState(0)
  const [durationInput, setDurationInput] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLogged, setLastLogged] = useState<{ id: string; issueKey: string } | null>(null)

  useEffect(() => {
    void send<Config>({ type: 'config/load' })
      .then((c) => {
        setConfig(c)
        setDate(todayInZone(c.timeZone, new Date()))
        setStartMinutes(parseHhMm(c.workdayStart))
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const reload = useCallback(async (c: Config, d: string) => {
    try {
      const res = await send<DayLoadResult>({ type: 'day/load', date: d })
      setWorklogs(res.worklogs)
      // Start time luôn nhảy tới khoảng trống kế tiếp sau khi dữ liệu đổi.
      setStartMinutes(nextFreeStart(toEntries(res.worklogs), parseHhMm(c.workdayStart), c.slotMinutes))
      setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => {
    if (config && date) void reload(config, date)
  }, [config, date, reload])

  const pickEvent = (e: SprintEvent) => {
    setIssueKey(e.issueKey)
    setDurationInput(e.defaultMinutes >= 60 && e.defaultMinutes % 60 === 0
      ? `${e.defaultMinutes / 60}h` : `${e.defaultMinutes}m`)
    setComment(e.comment)
  }

  const submit = async () => {
    if (!config) return
    const seconds = parseDuration(durationInput)
    if (seconds === null) { setError('Duration không hợp lệ'); return }
    if (issueKey.trim() === '') { setError('Chưa chọn issue'); return }

    setBusy(true)
    try {
      const res = await send<{ id: string }>({
        type: 'worklog/add',
        issueKey: issueKey.trim(), date, startMinutes,
        timeSpentSeconds: seconds, comment,
      })
      setLastLogged({ id: res.id, issueKey: issueKey.trim() })
      setDurationInput('')
      setComment('')
      await reload(config, date)
      // Undo hết hiệu lực sau 8 giây.
      setTimeout(() => setLastLogged(null), 8000)
    } catch (e) {
      // Giữ nguyên form: người dùng không phải nhập lại.
      setError((e as Error).message)
    } finally { setBusy(false) }
  }

  const undo = async () => {
    if (!lastLogged || !config) return
    try {
      await send({ type: 'worklog/delete', issueKey: lastLogged.issueKey, worklogId: lastLogged.id })
      setLastLogged(null)
      await reload(config, date)
    } catch (e) {
      setError(`Không xoá được worklog ${lastLogged.id} trên ${lastLogged.issueKey} — xoá tay trong Jira`)
    }
  }

  if (!config) return <div style={{ padding: 12 }}>Đang tải…</div>
  if (config.jiraBaseUrl === '') {
    return (
      <div style={{ padding: 12 }}>
        <Banner kind="info" action={{ label: 'Mở Options', onClick: () => chrome.runtime.openOptionsPage() }}>
          Chưa cấu hình Jira.
        </Banner>
      </div>
    )
  }

  const entries = toEntries(worklogs)
  const totalSeconds = worklogs.reduce((s, w) => s + w.timeSpentSeconds, 0)
  const target = 8 * 3600

  return (
    <div style={{ padding: 10, fontFamily: 'system-ui', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => setDate(addDays(date, -1))}>←</button>
        <strong style={{ fontSize: 13 }}>{date}</strong>
        <button onClick={() => setDate(addDays(date, 1))}>→</button>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: totalSeconds >= target ? '#2e7d32' : '#ef6c00' }}>
          {formatDuration(totalSeconds)} / {formatDuration(target)}
        </span>
      </div>

      {error && <Banner kind="error" action={{ label: 'Ẩn', onClick: () => setError(null) }}>{error}</Banner>}

      {lastLogged && (
        <Banner kind="info" action={{ label: 'Undo', onClick: () => void undo() }}>
          Đã log vào {lastLogged.issueKey}
        </Banner>
      )}

      <DayTimeline
        entries={entries}
        workdayStartMinutes={parseHhMm(config.workdayStart)}
        slotMinutes={config.slotMinutes}
        selectedStart={startMinutes}
        selectedDuration={Math.round((parseDuration(durationInput) ?? 0) / 60)}
      />

      <EventButtons events={config.sprintEvents} onPick={pickEvent} />
      <IssuePicker value={issueKey} onChange={setIssueKey} />

      <LogForm
        entries={entries}
        presets={config.durationPresets}
        slotMinutes={config.slotMinutes}
        workdayStartMinutes={parseHhMm(config.workdayStart)}
        startMinutes={startMinutes}
        durationInput={durationInput}
        comment={comment}
        busy={busy}
        onStartChange={setStartMinutes}
        onDurationChange={setDurationInput}
        onCommentChange={setComment}
        onSubmit={() => void submit()}
      />

      <button onClick={() => void send({ type: 'dashboard/open' })} style={{ fontSize: 12 }}>
        Mở dashboard team
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Nối vào `main.tsx`**

```tsx
// src/ui/sidepanel/main.tsx
import { createRoot } from 'react-dom/client'
import { SidePanel } from './SidePanel'

createRoot(document.getElementById('root')!).render(<SidePanel />)
```

- [ ] **Step 7: Smoke test bằng tay**

Run: `npm run build`, reload extension.

Checklist (dùng một issue thật, xoá worklog test sau khi xong):
- Mở tab một issue Jira → mở side panel bằng `Cmd+Shift+L` → issue key được prefill từ URL.
- Ngày mặc định là hôm nay theo timezone Jira.
- Ngày chưa log gì → start time = `09:00`.
- Bấm preset `1h` → timeline tô xanh 4 slot từ 09:00.
- Bấm Log → worklog xuất hiện trên timeline, tổng giờ tăng, start time **tự nhảy sang 10:00**.
- Bấm Undo → worklog biến mất, start time về 09:00.
- Bấm một nút sprint event → issue key, duration, comment được prefill.
- Nhập `abc` vào duration → hiện lỗi, nút Log bị disable.
- Chọn start time chồng với worklog đã có → hiện cảnh báo cam nhưng **vẫn log được**.
- Mũi tên ← → đổi ngày và nạp lại đúng worklog của ngày đó.
- Tắt wifi rồi bấm Log → hiện lỗi, **form giữ nguyên nội dung đã nhập**.

- [ ] **Step 8: Commit**

```bash
git add src/ui/sidepanel
git commit -m "feat(ui): side panel log worklog với timeline và start time tự động"
```

---

## Task 14: Dashboard — tab Coverage

**Files:**
- Modify: `src/ui/dashboard/main.tsx`
- Create: `src/ui/dashboard/Dashboard.tsx`, `FilterBar.tsx`, `CoverageTable.tsx`, `CellDetail.tsx`

**Interfaces:**
- Consumes: `send`, `CoverageLoadResult`, `SprintCurrentResult` (Task 11); `buildCoverage`, `enumerateDates`, `isWeekend`, `CoverageTable as CoverageTableData` (Task 5); `cellLabel`, `hoursLabel` (Task 12); `Config` (Task 7); `Scope` (Task 7).
- Produces: `Dashboard` component có tab; Task 15 thêm tab thứ hai vào đây.

- [ ] **Step 1: Viết `FilterBar.tsx`**

```tsx
// src/ui/dashboard/FilterBar.tsx
import { addDays } from '@/core/jiraTime'

export type Preset = 'sprint' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'custom'

type Props = {
  from: string; to: string; preset: Preset
  sprintRange: { name: string; from: string; to: string } | null
  onChange: (from: string, to: string, preset: Preset) => void
  onRefresh: () => void
  fetchedAt: number | null
  stale: boolean
}

// Tuần bắt đầu thứ Hai.
const mondayOf = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(date, dow === 0 ? -6 : 1 - dow)
}

export function FilterBar(p: Props) {
  const today = p.to
  const apply = (preset: Preset) => {
    if (preset === 'sprint' && p.sprintRange) {
      p.onChange(p.sprintRange.from, p.sprintRange.to, 'sprint')
    } else if (preset === 'thisWeek') {
      const mon = mondayOf(today)
      p.onChange(mon, addDays(mon, 6), 'thisWeek')
    } else if (preset === 'lastWeek') {
      const mon = addDays(mondayOf(today), -7)
      p.onChange(mon, addDays(mon, 6), 'lastWeek')
    } else if (preset === 'thisMonth') {
      p.onChange(`${today.slice(0, 7)}-01`, today, 'thisMonth')
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
      {p.sprintRange && (
        <button onClick={() => apply('sprint')} disabled={p.preset === 'sprint'}>
          {p.sprintRange.name}
        </button>
      )}
      <button onClick={() => apply('thisWeek')} disabled={p.preset === 'thisWeek'}>Tuần này</button>
      <button onClick={() => apply('lastWeek')} disabled={p.preset === 'lastWeek'}>Tuần trước</button>
      <button onClick={() => apply('thisMonth')} disabled={p.preset === 'thisMonth'}>Tháng này</button>

      <input type="date" value={p.from} onChange={(e) => p.onChange(e.target.value, p.to, 'custom')} />
      <input type="date" value={p.to} onChange={(e) => p.onChange(p.from, e.target.value, 'custom')} />

      <button onClick={p.onRefresh} style={{ marginLeft: 'auto' }}>Làm mới</button>
      {p.fetchedAt !== null && (
        <span style={{ color: p.stale ? '#ef6c00' : '#78909c' }}>
          {p.stale ? 'dữ liệu cũ lúc ' : 'cập nhật '}
          {new Date(p.fetchedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Viết `CoverageTable.tsx`**

Bảng cây kiểu spreadsheet: hàng member expand ra hàng issue, cột là ngày, có cột Total và hàng total. Màu cảnh báo **chỉ ở cột Total của hàng member**.

```tsx
// src/ui/dashboard/CoverageTable.tsx
import { useState } from 'react'
import type { CoverageTable as Data } from '@/core/coverage'
import { isWeekend } from '@/core/coverage'
import { cellLabel, hoursLabel } from '@/ui/shared/format'

type Props = {
  data: Data
  onCellClick: (accountId: string, date: string) => void
  onToggleDayOff: (accountId: string, date: string) => void
}

const STATUS_COLOR = { ok: '#2e7d32', under: '#ef6c00', empty: '#c62828' } as const

const th: React.CSSProperties = {
  position: 'sticky', top: 0, background: '#fafafa',
  borderBottom: '1px solid #cfd8dc', padding: '4px 6px', fontSize: 12, textAlign: 'right',
}
const td: React.CSSProperties = {
  borderBottom: '1px solid #eceff1', padding: '3px 6px', fontSize: 12, textAlign: 'right',
}

export function CoverageTable({ data, onCellClick, onToggleDayOff }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (accountId: string) => {
    const next = new Set(expanded)
    next.has(accountId) ? next.delete(accountId) : next.add(accountId)
    setExpanded(next)
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', minWidth: 200 }}>Member / Issue</th>
            {data.dates.map((d) => (
              <th key={d} style={{ ...th, background: isWeekend(d) ? '#eceff1' : '#fafafa', minWidth: 54 }}>
                {d.slice(5)}
              </th>
            ))}
            <th style={{ ...th, minWidth: 70 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <>
              <tr key={row.member.accountId} style={{ background: '#f5f7f8' }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                  <button onClick={() => toggle(row.member.accountId)}
                          style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, marginRight: 6 }}>
                    {expanded.has(row.member.accountId) ? '▾' : '▸'}
                  </button>
                  {row.member.displayName}
                  {!row.member.active && <span style={{ color: '#90a4ae' }}> (inactive)</span>}
                </td>
                {data.dates.map((d) => (
                  <td key={d} style={{ ...td, background: isWeekend(d) ? '#f5f5f5' : undefined, cursor: 'pointer' }}
                      onClick={() => onCellClick(row.member.accountId, d)}
                      onContextMenu={(e) => { e.preventDefault(); onToggleDayOff(row.member.accountId, d) }}
                      title="Click: xem chi tiết · Click phải: đánh dấu nghỉ">
                    {cellLabel(row.perDay[d] ?? 0)}
                  </td>
                ))}
                {/* Màu cảnh báo CHỈ ở đây — tô cả bảng thì cảnh báo mất tác dụng. */}
                <td style={{ ...td, fontWeight: 700, color: STATUS_COLOR[row.status] }}
                    title={`Capacity ${hoursLabel(row.capacitySeconds)}`}>
                  {hoursLabel(row.total)}
                </td>
              </tr>

              {expanded.has(row.member.accountId) && row.issues.map((issue) => (
                <tr key={`${row.member.accountId}-${issue.issueKey}`}>
                  <td style={{ ...td, textAlign: 'left', paddingLeft: 28, color: '#455a64' }}>
                    <strong>{issue.issueKey}</strong> {issue.issueSummary}
                  </td>
                  {data.dates.map((d) => (
                    <td key={d} style={{ ...td, background: isWeekend(d) ? '#f5f5f5' : undefined }}>
                      {cellLabel(issue.perDay[d] ?? 0)}
                    </td>
                  ))}
                  <td style={td}>{hoursLabel(issue.total)}</td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#eceff1', fontWeight: 700 }}>
            <td style={{ ...td, textAlign: 'left' }}>Tổng</td>
            {data.dates.map((d) => (
              <td key={d} style={td}>{cellLabel(data.totalPerDay[d] ?? 0)}</td>
            ))}
            <td style={td}>{hoursLabel(data.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Viết `CellDetail.tsx`**

```tsx
// src/ui/dashboard/CellDetail.tsx
import type { Worklog } from '@/core/coverage'
import { formatDuration } from '@/core/duration'
import { formatMinutes } from '@/core/timeline'

type Props = {
  memberName: string
  date: string
  worklogs: Worklog[]
  onClose: () => void
}

export function CellDetail({ memberName, date, worklogs, onClose }: Props) {
  return (
    <aside style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 380, background: '#fff',
      borderLeft: '1px solid #cfd8dc', padding: 14, overflowY: 'auto', fontSize: 13,
      boxShadow: '-2px 0 8px rgba(0,0,0,.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <strong style={{ flex: 1 }}>{memberName} · {date}</strong>
        <button onClick={onClose}>Đóng</button>
      </div>
      {worklogs.length === 0 && <p style={{ color: '#78909c' }}>Không có worklog nào.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {worklogs.map((w) => (
          <li key={w.id} style={{ borderBottom: '1px solid #eceff1', padding: '6px 0' }}>
            <div>
              <strong>{w.issueKey}</strong> · {formatMinutes(w.startMinutes)} · {formatDuration(w.timeSpentSeconds)}
            </div>
            <div style={{ color: '#607d8b' }}>{w.issueSummary}</div>
            {w.comment !== '' && <div style={{ color: '#37474f', fontStyle: 'italic' }}>{w.comment}</div>}
          </li>
        ))}
      </ul>
    </aside>
  )
}
```

- [ ] **Step 4: Viết `Dashboard.tsx`**

```tsx
// src/ui/dashboard/Dashboard.tsx
import { useCallback, useEffect, useState } from 'react'
import { send, type CoverageLoadResult, type SprintCurrentResult } from '@/sw/messages'
import type { Config } from '@/core/config-schema'
import type { Worklog } from '@/core/coverage'
import { buildCoverage, enumerateDates } from '@/core/coverage'
import { todayInZone, addDays } from '@/core/jiraTime'
import type { Scope } from '@/core/snapshot-key'
import { Banner } from '@/ui/shared/Banner'
import { FilterBar, type Preset } from './FilterBar'
import { CoverageTable } from './CoverageTable'
import { CellDetail } from './CellDetail'
import { PointsPanel } from './PointsTable'

export function Dashboard() {
  const [config, setConfig] = useState<Config | null>(null)
  const [tab, setTab] = useState<'coverage' | 'points'>('coverage')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [preset, setPreset] = useState<Preset>('thisWeek')
  const [sprintRange, setSprintRange] = useState<SprintCurrentResult>(null)
  const [worklogs, setWorklogs] = useState<Worklog[]>([])
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<{ accountId: string; date: string } | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const c = await send<Config>({ type: 'config/load' })
        setConfig(c)
        const today = todayInZone(c.timeZone, new Date())
        const sprint = await send<SprintCurrentResult>({ type: 'sprint/current' }).catch(() => null)
        setSprintRange(sprint)
        if (sprint) { setFrom(sprint.from); setTo(sprint.to); setPreset('sprint') }
        else { setFrom(addDays(today, -6)); setTo(today); setPreset('custom') }
      } catch (e) { setError((e as Error).message) }
    })()
  }, [])

  const load = useCallback(async (c: Config, scope: Scope, force: boolean) => {
    setLoading(true)
    try {
      const res = await send<CoverageLoadResult>({ type: 'coverage/load', scope, force })
      setWorklogs(res.worklogs)
      setFetchedAt(res.fetchedAt)
      setStale(res.stale)
      setError(null)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!config || from === '' || to === '') return
    void load(config, {
      projects: config.projects, from, to,
      accountIds: config.members.map((m) => m.accountId),
    }, false)
  }, [config, from, to, load])

  const toggleDayOff = async (accountId: string, date: string) => {
    if (!config) return
    const current = config.daysOff[accountId] ?? []
    const next = current.includes(date)
      ? current.filter((d) => d !== date)
      : [...current, date]
    setConfig(await send<Config>({
      type: 'config/save',
      patch: { daysOff: { ...config.daysOff, [accountId]: next } },
    }))
  }

  if (!config) return <div style={{ padding: 16 }}>Đang tải…</div>
  if (config.members.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <Banner kind="info" action={{ label: 'Mở Options', onClick: () => chrome.runtime.openOptionsPage() }}>
          Chưa chọn member nào để theo dõi.
        </Banner>
      </div>
    )
  }

  const dates = enumerateDates(from, to)
  const table = buildCoverage({
    worklogs,
    members: config.members,
    dates,
    daysOff: config.daysOff,
  })

  const detailMember = detail ? config.members.find((m) => m.accountId === detail.accountId) : null

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <button onClick={() => setTab('coverage')} disabled={tab === 'coverage'}>Coverage</button>
        <button onClick={() => setTab('points')} disabled={tab === 'points'}>Story points vs giờ</button>
      </div>

      {error && <Banner kind="error" action={{ label: 'Ẩn', onClick: () => setError(null) }}>{error}</Banner>}

      {tab === 'coverage' && (
        <>
          <FilterBar
            from={from} to={to} preset={preset} sprintRange={sprintRange}
            onChange={(f, t, p) => { setFrom(f); setTo(t); setPreset(p) }}
            onRefresh={() => void load(config, {
              projects: config.projects, from, to,
              accountIds: config.members.map((m) => m.accountId),
            }, true)}
            fetchedAt={fetchedAt} stale={stale}
          />
          {stale && (
            <div style={{ margin: '8px 0' }}>
              <Banner kind="warn">
                Không lấy được dữ liệu mới từ Jira — đang hiện snapshot cũ.
              </Banner>
            </div>
          )}
          <div style={{ marginTop: 10, opacity: loading ? 0.6 : 1 }}>
            <CoverageTable
              data={table}
              onCellClick={(accountId, date) => setDetail({ accountId, date })}
              onToggleDayOff={(a, d) => void toggleDayOff(a, d)}
            />
          </div>
        </>
      )}

      {tab === 'points' && <PointsPanel />}

      {detail && detailMember && (
        <CellDetail
          memberName={detailMember.displayName}
          date={detail.date}
          worklogs={worklogs.filter(
            (w) => w.authorAccountId === detail.accountId && w.date === detail.date,
          )}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Nối `main.tsx`, tạm stub `PointsPanel`**

```tsx
// src/ui/dashboard/main.tsx
import { createRoot } from 'react-dom/client'
import { Dashboard } from './Dashboard'

createRoot(document.getElementById('root')!).render(<Dashboard />)
```

```tsx
// src/ui/dashboard/PointsTable.tsx — stub, Task 15 thay bằng bản thật
export function PointsPanel() {
  return <div>Chưa implement</div>
}
```

- [ ] **Step 6: Smoke test bằng tay**

Run: `npm run build`, reload extension, mở dashboard từ nút trong side panel.

Checklist:
- Mặc định là date range của sprint hiện tại (nếu đã chọn board chính).
- Bảng có một hàng cho mỗi member trong config, cột là từng ngày, cuối tuần tô xám.
- Cột Total của member: xanh khi đủ capacity, cam khi thiếu, đỏ khi 0 giờ.
- Bấm ▸ → expand ra các issue member đó đã log, sort theo tổng giảm dần.
- Hàng Tổng dưới cùng khớp với tổng các hàng member (cộng tay một cột để kiểm).
- Click một ô → panel bên phải hiện đúng worklog của member đó ngày đó, có comment.
- Click phải một ô → ngày đó thành ngày nghỉ → capacity giảm → màu cột Total có thể đổi từ cam sang xanh. Reload trang → vẫn giữ.
- Bấm "Tuần trước" → bảng đổi range và nạp lại.
- Bấm "Làm mới" hai lần liên tiếp: lần đầu gọi Jira, lần hai trong 5 phút vẫn gọi (vì `force: true`). Đổi range rồi quay lại range cũ trong 5 phút → **không** gọi Jira (kiểm bằng tab Network của service worker).
- Tắt wifi → bấm "Làm mới" → banner vàng "đang hiện snapshot cũ" và bảng **vẫn có số**, không về 0.

- [ ] **Step 7: Commit**

```bash
git add src/ui/dashboard
git commit -m "feat(ui): dashboard tab Coverage — bảng cây member × ngày"
```

---

## Task 15: Dashboard — tab Story points vs giờ thực

**Files:**
- Modify: `src/ui/dashboard/PointsTable.tsx` (thay stub của Task 14)

**Interfaces:**
- Consumes: `send`, `PointsLoadResult` (Task 11); `buildPointsTable`, `PointsRow` (Task 6); `hoursLabel` (Task 12).
- Produces: `PointsPanel` — Task 14 đã import sẵn.

- [ ] **Step 1: Implement**

```tsx
// src/ui/dashboard/PointsTable.tsx
import { useEffect, useState } from 'react'
import { send, type PointsLoadResult } from '@/sw/messages'
import { buildPointsTable, type PointsTable as Data } from '@/core/points'
import { hoursLabel } from '@/ui/shared/format'
import { Banner } from '@/ui/shared/Banner'

const td: React.CSSProperties = {
  borderBottom: '1px solid #eceff1', padding: '4px 8px', fontSize: 12,
}

export function PointsPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [sprintName, setSprintName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void send<PointsLoadResult>({ type: 'points/load' })
      .then((res) => { setSprintName(res.sprintName); setData(buildPointsTable(res.issues)) })
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <Banner kind="error">{error}</Banner>
  if (!data) return <div>Đang tải…</div>
  if (data.rows.length === 0) return <p>Sprint hiện tại không có issue nào.</p>

  const med = data.medianHoursPerPoint

  return (
    <div>
      <p style={{ fontSize: 13 }}>
        <strong>{sprintName}</strong> · trung vị{' '}
        {med === null ? '—' : `${med.toFixed(1)} h/point`}
        {' · '}{data.noEstimate.length} issue chưa có story points
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <th style={{ ...td, textAlign: 'left' }}>Issue</th>
              <th style={{ ...td, textAlign: 'left' }}>Assignee</th>
              <th style={{ ...td, textAlign: 'left' }}>Status</th>
              <th style={{ ...td, textAlign: 'right' }}>Points</th>
              <th style={{ ...td, textAlign: 'right' }}>Đã log</th>
              <th style={{ ...td, textAlign: 'right' }}>h/point</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const noPoints = r.storyPoints === null || r.storyPoints === 0
              return (
                <tr key={r.key} style={{ background: r.isOutlier ? '#fff3e0' : undefined }}>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <strong>{r.key}</strong> {r.summary}
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>{r.assigneeName ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'left' }}>{r.status}</td>
                  <td style={{ ...td, textAlign: 'right', color: noPoints ? '#c62828' : undefined }}>
                    {noPoints ? 'chưa có' : r.storyPoints}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{hoursLabel(r.timeSpentSeconds)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: r.isOutlier ? 700 : 400 }}>
                    {r.hoursPerPoint === null ? '—' : r.hoursPerPoint.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Chạy toàn bộ test và build**

Run: `npm test && npm run build`
Expected: toàn bộ test PASS, build không lỗi.

- [ ] **Step 3: Smoke test bằng tay**

Reload extension, mở dashboard → tab "Story points vs giờ".

Checklist (dữ liệu thật của CAG: 55 issue, 15 có story points, 19 có giờ):
- Header hiện tên sprint, trung vị h/point, và số issue chưa có story points.
- Sort mặc định: h/point giảm dần, issue chưa log giờ (`—`) nằm cuối.
- Issue chưa có story points hiện "chưa có" màu đỏ ở cột Points.
- Issue có h/point vượt 2× trung vị được tô nền cam và in đậm.
- Nếu chưa chọn board chính trong Options → hiện banner lỗi "Chưa chọn board chính", không phải trang trắng.

- [ ] **Step 4: Cập nhật README**

Thêm mục "Cách dùng": load unpacked từ `dist/`, mở Options cấu hình, `Cmd+Shift+L` để log, nút trong side panel để mở dashboard. Ghi rõ extension chỉ chạy local, chưa publish lên Chrome Web Store.

- [ ] **Step 5: Commit**

```bash
git add src/ui/dashboard/PointsTable.tsx README.md
git commit -m "feat(ui): dashboard tab story points vs giờ thực"
```

---

## Self-review

**1. Spec coverage** — đối chiếu từng mục của spec:

| Spec | Task |
|---|---|
| §3 nền tảng, stack, ba bề mặt UI | 1 |
| §4 auth cookie + token fallback, probe, host permission runtime | 8 (auth), 11 (probe), 12 (permission) |
| §5 client: 5 song song, retry 429, timeout, 401 | 8 |
| §5 bảng endpoint | 9 |
| §6 scope project + date range, JQL worklogAuthor | 9, 11 |
| §6 sprint chỉ dùng cho preset và tab points | 9, 11, 14, 15 |
| §7 side panel: 5 khối, start time tự động, undo 8s, overlap cảnh báo | 13 |
| §8 dashboard Coverage: bảng cây, total hai chiều, màu ở hàng tổng, click ô, ngày nghỉ | 5, 14 |
| §8 tab story points, outlier, chưa có points | 6, 15 |
| §9 snapshot TTL 5 phút, patch tại chỗ, hiện snapshot cũ kèm timestamp | 7, 10, 11, 14 |
| §10 cấu trúc code, ràng buộc core thuần | 1–7, kiểm ở Task 9 Step 5 |
| §11 config schema + migration | 7, 10 |
| §12 timezone từ Jira profile, format started, cảnh báo lệch tz | 3, 11, 12 |
| §13 bảng xử lý lỗi | 8 (401/429/400), 11 (snapshot fallback), 12/13/14/15 (banner) |
| §14 test core, fake fetch cho jira, checklist thủ công | 2–10, 12–15 |
| §15 thứ tự triển khai | thứ tự task 1→15 |

Gap đã xử lý trong plan: spec không nói cách tìm id custom field Story Points → thêm `findStoryPointsFieldId` (Task 9) và cache vào `config.storyPointsFieldId` (Task 7, 11).

Một điểm spec ghi mà plan **cố tình để lại cho sau**: `patchSnapshot` đã implement ở Task 10 nhưng side panel (Task 13) hiện gọi `reload` (fetch lại một ngày) thay vì patch, vì fetch một ngày của một người là một request nhỏ. `patchSnapshot` dùng khi tối ưu dashboard sau này. Không phải placeholder — là quyết định về phạm vi, ghi ở đây để người đọc không tưởng là bỏ sót.

**2. Placeholder scan** — không có "TBD"/"TODO"/"tương tự Task N". Chỗ duy nhất viết gọn là bốn section con của Options (Task 12 Step 3): `MembersSection` được viết đầy đủ làm mẫu, ba section còn lại nêu rõ đọc field nào và ghi field nào. Đó là ba form CRUD cùng một khuôn; viết lại cả ba làm plan dài mà không thêm thông tin.

**3. Type consistency** — đã kiểm chéo: `Worklog`/`Member`/`CoverageTable` (Task 5) dùng nguyên tên ở Task 9, 10, 11, 14. `SprintIssue`/`PointsRow`/`PointsTable` (Task 6) dùng ở 9, 11, 15. `DayEntry` (Task 4) dùng ở 13. `Config`/`ConfigMember`/`SprintEvent` (Task 7) dùng ở 10, 11, 12, 13, 14. `Scope` (Task 7) dùng ở 10, 11, 14. `JiraClient` (Task 8) dùng ở 9, 11. `send` (Task 11) dùng ở 12, 13, 14, 15. `PointsPanel` (Task 14 stub) → thay ở Task 15 với cùng tên và cùng chữ ký không tham số.
