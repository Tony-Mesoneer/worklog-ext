# worklog-ext

Chrome extension để log worklog Jira nhanh, và theo dõi giờ log của team.

**[tony-mesoneer.github.io/worklog-ext](https://tony-mesoneer.github.io/worklog-ext/)**
— trang giới thiệu, nguồn ở [`docs/index.html`](docs/index.html).

- Side panel: log worklog với start time tự suy ra từ timeline trong ngày,
  duration chọn từ preset, sprint event log bằng một cú bấm.
- Dashboard: bảng giờ của team theo ngày (ai thiếu giờ), story points vs giờ thực.

Jira Cloud là source of truth duy nhất. Không backend.

## Trạng thái

Implementation hoàn thành. Extension chạy local, chưa publish lên Chrome Web Store.

- Design: [`docs/superpowers/specs/2026-08-19-worklog-extension-design.md`](docs/superpowers/specs/2026-08-19-worklog-extension-design.md)

## Cách dùng

1. **Load extension**: Mở `chrome://extensions/`, bật "Developer mode", chọn "Load unpacked" và trỏ tới thư mục `dist/`.
2. **Cấu hình**: Mở trang Options (click icon extension → "Options"), nhập Jira URL rồi bấm "Kết nối", thêm project key, **chọn board chính** (bắt buộc cho preset sprint và tab Story points), thêm members và sprint events. Nếu session Jira không dùng được, nhập email + API token ở mục "API token (dự phòng)".
3. **Log worklog**: Nhấn `Cmd+Shift+L` để mở side panel, chọn issue, nhập dữ liệu, click "Log" để ghi vào Jira.
4. **Dashboard**: Xem nút "Dashboard" trong side panel để mở trang theo dõi giờ của team và so sánh story points vs giờ thực.
5. **Cập nhật**: Extension tự kiểm tra release mới mỗi 6 giờ (mặc định trỏ về `Tony-Mesoneer/worklog-ext`; đổi hoặc để rỗng để tắt ở Options → "6. Cập nhật").

**Lưu ý**: Extension chạy hoàn toàn local trong trình duyệt và kết nối trực tiếp với Jira Cloud. Không có backend, không lưu dữ liệu trên server.

## CI/CD

GitHub Actions, hai workflow:

| Workflow | Trigger | Việc làm |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | mọi PR (không chạy trên push) | version sync → `tsc --noEmit` → `vitest run` → build Chrome + Firefox → `web-ext lint` → zip, upload artifact |
| [`auto-version.yml`](.github/workflows/auto-version.yml) | push/merge vào `main` | đọc conventional commits → bump version → commit + tag → gọi `release.yml` |
| [`release.yml`](.github/workflows/release.yml) | tag `v*`, được gọi từ `auto-version.yml`, hoặc chạy tay | check tag khớp `manifest.json` → typecheck → test → build cả hai target → lint → sign XPI (nếu có secrets) → GitHub Release kèm zip Chrome + zip Firefox |

`ci.yml` **không** bắt event `push`: có cả `push` và `pull_request` thì mỗi lần
push chạy CI hai lần, và sau khi merge thì `push: main` lặp lại đúng công việc
mà `release.yml` đã làm. `pull_request` là cái được giữ vì nó build trên merge
commit — bắt được xung đột nghĩa khi `main` đi tiếp trong lúc PR nằm chờ.

Không cần secret nào — release chỉ ra file zip. Upload lên Chrome Web Store vẫn làm thủ công (kéo file zip từ Release vào Developer Dashboard).

### Tự động tăng version khi merge vào main

`auto-version.yml` đọc các commit từ tag gần nhất tới `HEAD` và tự quyết định mức bump:

| Commit | Bump |
| --- | --- |
| `feat!: …` hoặc body có `BREAKING CHANGE:` | major — nhưng khi còn `0.x` thì hạ xuống minor, để không tự ý công bố 1.0 |
| `feat: …` | minor |
| `fix: …`, `perf: …` | patch |
| `docs:`, `chore:`, `refactor:`, `test:`, `style:`, `ci:`, `build:` | không bump, không release |

Nếu có bump: workflow commit `chore(release): vX.Y.Z`, tạo tag, push lên `main` rồi
gọi `release.yml` để build và tạo GitHub Release. Commit này bị bỏ qua ở lần chạy sau
nên không có vòng lặp. Xem trước quyết định ở local:

```bash
npm run next:version
```

**Cần làm một lần trước khi bật:** tạo tag mốc cho version hiện tại, nếu không lần
chạy đầu sẽ xét cả 70 commit trong history.

```bash
git tag -a v0.2.0 -m v0.2.0 && git push origin v0.2.0
```

Muốn tắt tự động: xoá `.github/workflows/auto-version.yml`, quy trình tag thủ công
bên dưới vẫn chạy nguyên vẹn.

### Version thủ công

Version sống ở `package.json`, `package-lock.json` và `manifest.json`; cả ba phải khớp
nhau, CI fail nếu lệch. Đừng sửa tay — dùng script:

```bash
npm run bump -- patch          # 0.2.0 → 0.2.1
npm run bump -- minor          # 0.2.0 → 0.3.0
npm run bump -- major          # 0.2.0 → 1.0.0
npm run bump -- 1.4.2          # đặt version cụ thể
npm run bump -- patch --dry-run   # xem trước, không sửa gì
```

Script bump cả ba file, commit `chore(release): vX.Y.Z` và tạo tag `vX.Y.Z`. Nó
đòi working tree sạch. Chrome chỉ nhận version dạng số nên chỉ hỗ trợ `x.y.z`,
không có prerelease.

Push tag để chạy release:

```bash
git push origin HEAD --follow-tags
```

### Đóng gói local

```bash
npm run build && npm run pack   # → release/worklog-ext-<version>.zip
```

`manifest.json` nằm ở gốc zip (đúng dạng Chrome Web Store yêu cầu). `release/` được gitignore.

## Icon

`python3 scripts/generate-icons.py` sinh lại `public/icons/icon{16,32,48,128}.png`
— nền `#1a162a`, chữ trắng SF Pro Heavy, `M.` ở cỡ nhỏ và `Meso.` ở cỡ lớn.
Cần Pillow và font hệ thống macOS. Mỗi cỡ render riêng chứ không scale từ một ảnh
lớn xuống, vì chữ ở 16px scale xuống là nhoè.

## Firefox

Build và **lint sạch theo luật AMO** (`web-ext lint`: 0 error). Chưa chạy thử
trên Firefox thật — xem phần "chưa xác nhận" bên dưới.

```bash
npm run build:firefox      # → dist-firefox/
npm run lint:firefox       # web-ext lint, cổng chặn của CI
npm run pack:firefox       # → release/worklog-ext-<version>-firefox.zip
```

Load: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → chọn
`dist-firefox/manifest.json`. Add-on tạm mất khi đóng Firefox; cài lâu dài cần
sign qua AMO.

**Khác biệt so với bản Chrome** — một `manifest.json` gốc, biến đổi theo target
trong [`manifest.config.ts`](manifest.config.ts):

| Chrome | Firefox |
| --- | --- |
| `background.service_worker` | `background.scripts` (Firefox MV3 không có service worker) |
| `side_panel` + `sidePanel` API | `sidebar_action` + `sidebarAction` API |
| permission `sidePanel` | bỏ (Firefox không biết key này) |
| — | `gecko.id` + `data_collection_permissions: ['none']` |
| `dist/` | `dist-firefox/` |

`dist/` giữ nguyên cho Chrome có chủ ý: đổi đường dẫn sẽ buộc mọi người đang
dùng phải trỏ lại "Load unpacked".

Code không hỏi "đang chạy browser nào" mà hỏi "API này có không":
[`src/platform/ext.ts`](src/platform/ext.ts) chọn `browser` hoặc `chrome`, và
[`src/platform/sidepanel.ts`](src/platform/sidepanel.ts) chọn `sidebarAction`
hoặc `sidePanel`. Trên Firefox `chrome.*` tồn tại nhưng là callback-based, nên
`await chrome.storage.local.get(k)` trả `undefined` mà không throw — đó là lý do
không chỗ nào trong `src/` gọi `chrome.*` trực tiếp nữa.

Mỗi release có hai zip, và tính năng check-update chọn đúng zip cho nền tảng
đang chạy. Release cũ (v0.2–v0.5) chỉ có zip Chrome, nên trên Firefox banner sẽ
đưa link trang release thay vì một file không cài được.

### `strict_min_version` là 140.0, không phải lựa chọn

AMO bắt buộc `data_collection_permissions` với add-on mới, và key đó chỉ có từ
Firefox 140 (`web-ext lint` fail với `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION`
nếu đặt thấp hơn). Hạ xuống chỉ khả thi nếu bỏ khai báo đó, tức không nộp được
AMO. Giá trị khai là `['none']` — extension không có backend, không analytics,
không telemetry.

### Hai warning của lint là cố ý

- `UNSAFE_VAR_ASSIGNMENT` (×2): `innerHTML` trong **react-dom**, không phải code
  của repo (`grep -rn innerHTML src/` không có kết quả). Mọi extension React đều
  có warning này.
- `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`: vì **không** khai
  `gecko_android`. Firefox Android không có sidebar, nên bề mặt chính của
  extension không tồn tại ở đó — khai một sàn phiên bản Android sẽ là ngụ ý hỗ
  trợ không có thật.

### Chưa xác nhận — chỉ biết khi chạy trên Firefox thật

- `sidebarAction.open()` đòi user gesture. Handler của `commands`
  (`Cmd+Shift+L`) *nên* tính là gesture, nhưng chưa kiểm.
- Total Cookie Protection có thể chặn session cookie Jira trong fetch từ
  background. Nếu vỡ thì rơi về đường API token (Options → mục 2), tức UX
  Firefox có thể là "bắt buộc nhập token".
- Bước sign AMO đã có trong CI nhưng **chưa từng chạy** — cần secrets, xem dưới.

### Sign XPI qua AMO

Không sign thì Firefox chỉ load được dạng "Temporary Add-on", mất khi đóng
browser. Release đã có bước sign, nó **tự bỏ qua** khi chưa có credential — nên
bản Chrome vẫn release được bình thường.

Bật một lần:

1. Vào [addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/en-US/developers/addon/api/key/)
   lấy JWT issuer + secret.
2. Đặt hai secret của repo: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`.

Release sau đó sẽ đính thêm một `.xpi` đã sign. Kênh là `unlisted` (tự phát
hành, không đăng lên AMO công khai) — đúng cho một công cụ nội bộ.

Hai điều đáng biết trước:

- **AMO không nhận lại cùng một version.** Chạy lại release cho một tag đã sign
  sẽ fail ở bước đó. Bước sign có `continue-on-error` chính vì vậy: một release
  bị chặn hoàn toàn vì AMO là đánh đổi tệ hơn một release thiếu XPI.
- **`.xpi` không ảnh hưởng tính năng check-update.** Nó chọn asset `.zip` theo
  nền tảng; `.xpi` không phải zip nên nằm ngoài phép chọn đó. Muốn Firefox tự
  cập nhật thật thì còn cần `gecko.update_url` trỏ vào một `updates.json` —
  chưa làm.

## Cập nhật extension

Chrome **không tự cập nhật** extension cài bằng "Load unpacked" — không có
`update_url`, và `chrome.runtime.requestUpdateCheck()` chỉ có nghĩa với bản cài
từ Web Store. Nên extension tự đi hỏi GitHub và nói cho bạn biết, còn việc thay
file vẫn là thao tác tay.

**Cách hoạt động**

- Service worker gọi `GET /repos/<owner>/<repo>/releases/latest` (vô danh, không
  token — repo public) mỗi 6 giờ, hẹn bằng `chrome.alarms` chứ không phải
  `setInterval`: service worker MV3 bị kill sau ~30s rảnh, mọi timer trong bộ
  nhớ đều chết theo.
- Kết quả nằm trong `chrome.storage.local` key `update`, nên side panel mở lên
  là thấy ngay, không phải đợi round-trip ra GitHub. `lastCheckedAt` là thứ chặn
  việc mỗi lần mở panel lại đốt một lượt rate limit (GitHub cho 60 request/giờ/IP).
- Có bản mới hơn: badge `↑` trên icon extension, cộng banner ở side panel và
  dashboard kèm link tải zip. "Để sau" chỉ tắt banner cho **đúng version đó** —
  bản mới hơn nữa sẽ hiện lại. Options luôn hiện, kể cả đã tắt.
- Chỉ tag **lớn hơn thật** mới tính là update (so theo từng nhóm số, nên
  `0.10.0 > 0.9.0`). Release bị yank rồi tag lại thấp hơn không đẩy bạn về bản cũ.
- Lượt check tự động thất bại thì lưu lỗi rồi im lặng, và `lastCheckedAt` không
  nhích — lần mở panel sau vẫn thử lại thay vì tắt tiếng 6 tiếng.

**Cách cập nhật khi có bản mới**

Nếu bạn có repo (đường ngắn nhất — không tải gì):

```bash
git pull && npm run build      # ghi đè dist/ tại chỗ
```

rồi Options → mục 6 → **Khởi động lại extension**. Đang sửa code thì
`npm run dev` có HMR, không cần bước nào.

Nếu bạn cài từ zip:

1. Tải `worklog-ext-<version>.zip` từ banner (hoặc từ trang Releases).
2. Giải nén, thay nội dung thư mục bạn đang trỏ "Load unpacked" vào.
3. Options → mục 6 → **Khởi động lại extension**.

`chrome.runtime.reload()` đọc lại file từ đĩa cho extension unpacked và không
cần permission nào, nên bước "vào `chrome://extensions` bấm Reload" bỏ được.
Bước giải nén thì **không** bỏ được: extension không có quyền ghi file.

Muốn hết hẳn việc tải và bấm thì phải qua Chrome Web Store (unlisted vẫn được)
— đó là đường duy nhất Chrome tự cập nhật im lặng. Firefox thì cần XPI đã sign
+ `gecko.update_url`.

Cấu hình (Jira URL, member, sprint event) nằm trong `chrome.storage.local` nên
không mất khi reload.

Muốn Chrome tự update thật thì phải cài qua Chrome Web Store, hoặc host CRX đã
ký + `updates.xml` và deploy bằng enterprise policy (`ExtensionInstallForcelist`)
— trên macOS/Windows, `update_url` không có tác dụng với bản load unpacked.
