# Worklog Extension — Design

Ngày: 2026-08-19
Trạng thái: đã thống nhất. Spike auth đã chạy 2026-08-19: cookie session ghi được worklog.

## 1. Vấn đề

Log worklog trực tiếp trong Jira chậm và rời rạc: mở issue, mở dialog, gõ giờ,
đoán start time. Giờ họp sprint event thường bị bỏ log hoặc log dồn. Ở vai trò
team lead, không có cách nhanh nào để biết ai đang thiếu giờ trong sprint.

## 2. Mục tiêu và phi mục tiêu

**Mục tiêu**
- Log worklog trong dưới 5 giây, start time tự suy ra, duration chọn từ preset.
- Log sprint event (Daily, Planning, Refinement, Review, Retro) bằng một cú bấm.
- Bảng theo dõi giờ của team theo ngày, phát hiện ai thiếu giờ.
- So story points với giờ thực để thấy issue lệch xa mặt bằng.

**Phi mục tiêu (đợt đầu)**
- Timer start/stop. Duration nhập tay hoặc chọn preset.
- Log hộ member. Jira Cloud luôn gán worklog author = người gọi API; không thể
  ghi thay người khác bằng REST API native. Vai trò lead là đọc và nhắc.
- Lịch sử nhiều sprint, tích hợp calendar, gadget tự cấu hình, export Excel,
  calendar view, backend server.
- Content script inject vào DOM Jira.

## 3. Nền tảng và stack

Chrome extension, Manifest V3. TypeScript + React + Vite với
`@crxjs/vite-plugin`. Không backend. Vitest cho unit test.

Hai bề mặt UI:
- **Side panel** (`chrome.sidePanel`) — luồng log hằng ngày. Chọn side panel thay
  vì popup vì nó không đóng khi click ra ngoài, cho phép vừa làm vừa log.
- **Dashboard full-tab** — view của team lead.
- **Options page** — setup và cấu hình.

Không dùng content script. Đánh đổi: không log được ngay trên trang Jira, nhưng
tránh được rủi ro bảo trì lớn nhất là Atlassian đổi DOM.

## 4. Auth

Jira base URL không hardcode. Options page nhập URL, extension xin host
permission runtime qua `chrome.permissions.request` (khai báo
`optional_host_permissions`), nhờ đó dùng được cho instance khác không cần build lại.

Hai đường, quyết định bằng probe lúc setup:

**Đường 1 — cookie session (mặc định, đã xác minh).** Fetch với
`credentials: 'include'`, dùng session Jira đang đăng nhập. Không setup gì.
Spike ngày 2026-08-19 trên `your-site.atlassian.net` xác nhận **cả đọc và ghi
worklog đều chạy** bằng cookie session — kết luận `cookie-write-ok`. Đây là
đường mặc định; người dùng không phải tạo API token.

Request ghi luôn gửi kèm header `X-Atlassian-Token: no-check`. Header này vô hại
khi XSRF check không bật, nên gửi vô điều kiện thay vì thử-rồi-retry: bớt một
nhánh code và một round-trip.

**Đường 2 — API token (fallback).** Basic auth với email + API token từ
`id.atlassian.com`. Lưu trong `chrome.storage.local`, **không** dùng
`storage.sync` để token không đẩy lên Google account. Không bao giờ log token.

Đường 2 vẫn được implement dù đường 1 đã chạy, vì ba trường hợp thật: session
Jira hết hạn giữa lúc dùng, người dùng đăng nhập Jira ở profile Chrome khác, và
instance Jira khác có thể bật XSRF check khắt khe hơn.

**Probe:** lúc setup, thử `GET /myself`. Nếu 200 thì `authMode = 'cookie'`, không
hỏi gì thêm. Nếu fail thì hiện form nhập token. Nếu request về sau trả 401/403,
`authMode` bị vô hiệu và banner đẩy người dùng về Options.

## 5. Lớp truy cập Jira

`jira/client.ts` là fetch wrapper duy nhất:
- Tối đa 5 request song song.
- `429` → retry với exponential backoff, tôn trọng `Retry-After`, tối đa 3 lần.
- `401/403` → không retry, phát event để UI hiện banner.
- Timeout 15s mỗi request.

Endpoint dùng đến:

| Mục đích | Endpoint |
|---|---|
| Danh tính + timezone | `GET /rest/api/3/myself` |
| Tìm issue nhanh | `GET /rest/api/3/issue/picker?query=` |
| Issue có worklog trong khoảng | `POST /rest/api/3/search/jql` |
| Worklog của issue | `GET /rest/api/3/issue/{key}/worklog` |
| Ghi worklog | `POST /rest/api/3/issue/{key}/worklog?notifyUsers=false` |
| Xoá worklog (undo) | `DELETE /rest/api/3/issue/{key}/worklog/{id}` |
| Board của project | `GET /rest/agile/1.0/board?projectKeyOrId=` |
| Sprint đang mở | `GET /rest/agile/1.0/board/{id}/sprint?state=active` |
| Issue của sprint | `GET /rest/agile/1.0/sprint/{id}/issue` |
| Tìm member | `GET /rest/api/3/user/search` |

## 6. Phạm vi dữ liệu

Scope = **danh sách project** + **date range**. Không lấy sprint làm xương sống.

```
worklogDate >= "<from>" AND worklogDate <= "<to>"
AND worklogAuthor in (<accountIds>)
AND project in (<projectKeys>)
```

JQL này trả đúng những issue có worklog trong khoảng, hoạt động tự nhiên với
nhiều project, không cần đi qua Agile API. Sau đó fetch
`/issue/{key}/worklog` cho từng issue trong kết quả, lọc theo author và ngày ở
phía client (Jira trả toàn bộ worklog của issue, không filter được theo ngày).

Dùng `worklogAuthor` chứ không `assignee`: theo dõi *người*, và một người log giờ
ở nhiều project. Member không được assign issue nào vẫn xuất hiện.

Sprint chỉ dùng cho hai việc: preset date range "Sprint hiện tại"
(`startDate`/`endDate` của sprint), và tab Story points. Cả hai lấy từ **một
board chính** do người dùng chỉ định (`primaryBoardId`, mặc định board của CAG).
Nếu các project có cadence sprint khác nhau, chỉ hai chức năng đó bị ảnh hưởng;
các preset Tuần này / Tuần trước / Tháng này / custom không quan tâm sprint.

Số liệu thật đo được ngày 2026-08-19 trên project CAG, sprint đang mở: 55 issue,
19 issue có worklog, 0 issue có original estimate, 15 issue có story points.
Suy ra: khối lượng fetch nhỏ (khoảng 4 batch, mỗi batch 5 request song song), và **estimate theo giờ
không tồn tại trong dữ liệu** — đó là lý do tab thứ hai dùng story points.

## 7. Side panel — luồng log

Năm khối, trên xuống:

**1. Ngày + tổng giờ.** Mặc định hôm nay, mũi tên qua ngày khác. Hiện
`6h15 / 8h` để thấy ngay còn thiếu bao nhiêu.

**2. Timeline trong ngày.** Thanh chia slot 15 phút từ `workdayStart` (default
`09:00`). Vẽ worklog đã có của chính người dùng trong ngày, và các khoảng trống.
Đây là cơ chế làm start time tự động:

- Start time mặc định = giờ kết thúc của worklog cuối cùng trong ngày, snap về
  lưới 15 phút.
- Ngày trống → `workdayStart`.
- Sửa được qua dropdown liệt kê slot 15m (`09:00`, `09:15`, ...). Slot đã bị
  chiếm hiện mờ kèm key issue đang chiếm.
- Nếu duration đã chọn làm worklog mới chồng lên worklog cũ, hiện cảnh báo
  nhưng không chặn — Jira cho phép overlap, và đôi khi đúng là chồng thật.

**3. Chọn issue.** Nếu tab đang active là trang issue Jira, tự nhận issue key từ
URL (`/browse/KEY` hoặc `selectedIssue=KEY`) và prefill. Nếu không, ô search dùng
`/issue/picker`, cộng danh sách issue assign cho người dùng trong sprint hiện tại.

**4. Sprint events.** Hàng nút bấm cho các event đã map sang issue key cố định.
Mỗi event có duration và comment mặc định riêng (Daily 15m, Planning 2h, ...).
Bấm một nút prefill cả issue, duration, comment; chỉ còn xác nhận start time.

**5. Duration + submit.** Chips `15m · 30m · 1h · 4h · 6h · 8h`, cộng ô nhập tự
do parse `"1h30"`, `"90m"`, `"1.5h"`. Comment optional. Submit →
`POST .../worklog`. Timeline cập nhật optimistic, snapshot được patch tại chỗ.
Nút Undo trong 8 giây gọi `DELETE`.

## 8. Dashboard

Một tab, hai tab con. Filter trên cùng: date range (preset + custom), chọn
project, chọn member.

**Tab Coverage.** Bảng dạng cây kiểu spreadsheet, giống layout Jira Assistant:

- Mỗi member là một hàng nhóm, expand ra thành các issue họ đã log giờ vào.
- Cột = từng ngày trong khoảng, cộng cột **Total** bên phải.
- **Hàng total** dưới cùng = tổng theo từng ngày.
- Ô hiện giờ dạng `2h 30m`, hover ra comment worklog.
- Màu cảnh báo thiếu giờ **chỉ ở hàng tổng của member**, không tô cả bảng — bảng
  dày mà tô nhiều màu sẽ rối và mất giá trị cảnh báo.
- Click ô → panel chi tiết worklog của member đó trong ngày đó (issue, giờ, comment).
- Cuối tuần tô xám.

Capacity mặc định 8h/ngày, cấu hình riêng từng member (`hoursPerDay`, cho
part-time). Click-phải một ô để đánh dấu "off" (nghỉ phép) — lưu trong config
local, không ghi gì lên Jira. Không có cái này thì dashboard báo đỏ sai mỗi lần
ai đó nghỉ, và mất tin cậy.

**Tab Story points vs giờ thực.** Bảng issue của sprint hiện tại trên board
chính: key, summary, assignee, status, story points, giờ đã log, và **h/point**.
Sort mặc định theo h/point giảm dần. Đánh dấu riêng hai nhóm: lệch xa trung vị
h/point của sprint, và **chưa có story points** (thường là vấn đề lớn hơn).

## 9. Cache

`store/snapshot.ts` giữ một snapshot cho mỗi `(projects, dateRange, members)` trong
`chrome.storage.local`, TTL 5 phút.

- Dashboard render ngay từ snapshot nếu có, đồng thời refresh nền.
- Side panel patch snapshot tại chỗ sau khi log, không refetch.
- Mất mạng hoặc Jira lỗi → hiện snapshot cũ **kèm timestamp** ("dữ liệu lúc
  09:12"). Tuyệt đối không render 0h như thể team chưa log gì.
- Snapshot chỉ là cache: xoá nó không mất dữ liệu, Jira là source of truth duy nhất.

## 10. Cấu trúc code

```
worklog-ext/
  manifest.json
  src/
    core/          # logic thuần, KHÔNG import chrome/fetch
      duration.ts  # parse & format "1h30" | "90m" ↔ seconds
      timeline.ts  # slot 15m, tìm start trống kế tiếp, phát hiện overlap
      coverage.ts  # worklogs → matrix member × ngày + total hai chiều
      points.ts    # story points vs giờ, h/point, trung vị
    jira/
      auth.ts | client.ts | endpoints.ts
    store/
      config.ts    # schema chrome.storage.local + migration theo version
      snapshot.ts
    sw/            # service worker: message router, prefetch
    ui/
      sidepanel/ | dashboard/ | options/
```

Ràng buộc kiến trúc: **`core/` không import `chrome` hay `fetch`**. Mọi chỗ dễ
sai — snap giờ, phát hiện overlap, cộng total hai chiều, parse duration, tính
h/point — nằm trong `core/` và test bằng vitest không cần browser. Đây là điều
kiện để TDD khả thi cho một extension.

`ui/` không gọi `jira/` trực tiếp; mọi request đi qua message tới service worker,
để host permission và auth chỉ tồn tại ở một chỗ.

## 11. Config schema

```ts
type Config = {
  version: number
  jiraBaseUrl: string
  authMode: 'cookie' | 'token'
  token?: { email: string; apiToken: string }   // chỉ khi authMode === 'token'
  projects: string[]                            // ["CAG", ...]
  primaryBoardId: number | null
  members: { accountId: string; displayName: string; hoursPerDay: number }[]
  daysOff: Record<string, string[]>             // accountId → ["2026-08-14"]
  workdayStart: string                          // "09:00"
  slotMinutes: number                           // 15
  durationPresets: number[]                     // [15, 30, 60, 240, 360, 480]
  sprintEvents: {
    name: string; issueKey: string;
    defaultMinutes: number; comment?: string
  }[]
}
```

`version` để migrate khi schema đổi; migration chạy lúc service worker khởi động.

## 12. Timezone

`started` phải theo timezone trong Jira profile (`/myself` trả `timeZone`,
hiện tại `Asia/Jakarta`), **không** lấy từ browser. Lấy sai thì worklog `09:00`
có thể rơi sang ngày hôm trước trong report của người khác. Format bắt buộc:
`2026-08-19T09:00:00.000+0700`.

Nếu timezone browser khác timezone Jira profile, Options hiện cảnh báo một lần —
không tự đoán, vì đoán sai lệch ngày là lỗi im lặng.

## 13. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| `401` / `403` | Banner "session Jira hết hạn" + link Options. Không render bảng trống. |
| `429` | Backoff, hiện "đang chờ Jira". Không nuốt lỗi im lặng. |
| Mất mạng | Hiện snapshot cũ kèm timestamp. |
| POST worklog fail | Giữ nguyên form và input, hiện message gốc từ Jira. |
| Undo `DELETE` fail | Hiện worklog id và link tới issue để xoá tay. |
| Host permission bị thu hồi | Đẩy về Options, xin lại permission. |
| Member trong config không còn active | Vẫn hiện trong bảng, đánh dấu inactive, không tính vào capacity. |

## 14. Test

- **`core/`** — vitest, viết test trước. Bao gồm: parse duration các dạng hợp lệ
  và không hợp lệ, snap start time khi ngày trống / có worklog / có gap, phát
  hiện overlap, cộng total hai chiều với ngày nghỉ và member part-time, h/point
  khi story points bằng 0 hoặc null.
- **`jira/`** — fake fetch, kiểm tra retry 429, giới hạn 5 song song, và
  chuyển 401 thành event.
- **Manual smoke checklist** trên Chrome cho từng bề mặt UI.
- Không E2E automation cho MV3 đợt đầu: chi phí lớn hơn giá trị ở scope này.

## 15. Thứ tự triển khai

1. ~~Spike auth~~ — xong 2026-08-19, `authMode` mặc định là `cookie`.
2. Scaffold Vite + MV3 manifest + hai bề mặt UI trống.
3. `core/` với test viết trước.
4. `jira/` auth + client + endpoints.
5. Options page: base URL, permission, probe auth, chọn project và board, member,
   capacity, sprint event map.
6. Side panel: timeline, chọn issue, duration, submit, undo.
7. Dashboard tab Coverage.
8. Dashboard tab Story points vs giờ thực.

Mỗi bước từ 3 trở đi kết thúc bằng test xanh trước khi qua bước sau.
