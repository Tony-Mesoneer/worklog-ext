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

1. **Load extension**: Mở `chrome://extensions/`, bật "Developer mode", chọn "Load unpacked" và trỏ tới thư mục `Documents/Worklog Extension` (cài từ release — xem [Cập nhật extension](#cập-nhật-extension)) hoặc `dist/` (build từ repo).
2. **Cấu hình**: Mở trang Options (click icon extension → "Options"), nhập Jira URL rồi bấm "Kết nối", thêm project key, **chọn board chính** (bắt buộc cho preset sprint và tab Story points), thêm members và sprint events. Nếu session Jira không dùng được, nhập email + API token ở mục "API token (dự phòng)".
3. **Log worklog**: Nhấn `Cmd+Shift+L` để mở side panel, chọn issue, nhập dữ liệu, click "Log" để ghi vào Jira.
4. **Dashboard**: Xem nút "Dashboard" trong side panel để mở trang theo dõi giờ của team và so sánh story points vs giờ thực.
5. **Cập nhật**: Extension tự kiểm tra release mới mỗi 6 giờ (mặc định trỏ về `Tony-Mesoneer/worklog-ext`; đổi hoặc để rỗng để tắt ở Options → "7. Cập nhật").

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

Version sống ở `package.json`, `package-lock.json`, `manifest.json` và
`docs/index.html`; cả bốn phải khớp nhau, CI fail nếu lệch. Landing page có mặt
trong danh sách vì nó nói version cho người dùng đọc — trước đây nó không được
bump nên đứng yên ở v0.5.0 suốt tới v0.10.0. Trên trang, version nằm trong text
của những phần tử mang attribute `data-version`; thêm chỗ hiện version mới thì
gắn attribute đó, đừng gõ số vào. Đừng sửa tay — dùng script:

```bash
npm run bump -- patch          # 0.2.0 → 0.2.1
npm run bump -- minor          # 0.2.0 → 0.3.0
npm run bump -- major          # 0.2.0 → 1.0.0
npm run bump -- 1.4.2          # đặt version cụ thể
npm run bump -- patch --dry-run   # xem trước, không sửa gì
```

Script bump cả bốn file, commit `chore(release): vX.Y.Z` và tạo tag `vX.Y.Z`. Nó
đòi working tree sạch. Chrome chỉ nhận version dạng số nên chỉ hỗ trợ `x.y.z`,
không có prerelease.

Push tag để chạy release:

```bash
git push origin HEAD --follow-tags
```

### Đóng gói local

```bash
npm run build && npm run pack   # → release/worklog-ext-<version>.zip
node scripts/pack.mjs --target windows   # → release/worklog-ext-<version>-windows.zip
```

`manifest.json` nằm ở gốc zip store (đúng dạng Chrome Web Store yêu cầu). Zip
`-windows` thì ngược lại: bọc đúng một thư mục `Worklog Extension`. `.dmg` và
`.exe` chỉ đóng trong CI ([`installers.yml`](.github/workflows/installers.yml)) vì
cần `hdiutil` của macOS và `csc.exe` của Windows. `release/` được gitignore.

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
| `key` (ID cố định, xem [Cập nhật extension](#cập-nhật-extension)) | — (ID là `gecko.id`) |
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
  dashboard kèm link tải gói đúng hệ điều hành. "Để sau" chỉ tắt banner cho **đúng version đó** —
  bản mới hơn nữa sẽ hiện lại. Options luôn hiện, kể cả đã tắt.
- Chỉ tag **lớn hơn thật** mới tính là update (so theo từng nhóm số, nên
  `0.10.0 > 0.9.0`). Release bị yank rồi tag lại thấp hơn không đẩy bạn về bản cũ.
- Lượt check tự động thất bại thì lưu lỗi rồi im lặng, và `lastCheckedAt` không
  nhích — lần mở panel sau vẫn thử lại thay vì tắt tiếng 6 tiếng.

**Một thư mục cố định: `Documents/Worklog Extension`**

Mọi bản release đều cài vào **cùng một thư mục** `Worklog Extension` trong
Documents, nên cập nhật là thả bản mới đè lên thư mục đó rồi khởi động lại
extension — không phải trỏ lại "Load unpacked".

Điều này chỉ an toàn vì manifest Chrome có field `key` (xem
[`manifest.config.ts`](manifest.config.ts)): ID extension cố định là
`iekabcpfloejabojfkmhkadbdofhehda`, không phụ thuộc đường dẫn. Không có `key`,
Chrome băm đường dẫn thư mục ra ID — đổi thư mục là ra extension khác, và toàn
bộ cấu hình (Jira URL, member, sprint event) ở lại với ID cũ.

Hệ quả cho người build từ repo: `dist/` và `Documents/Worklog Extension` giờ
**cùng ID**, nên chỉ load được một trong hai cùng lúc.

Mỗi release có:

| File | Dành cho |
| --- | --- |
| `worklog-ext-<v>.dmg` | macOS |
| `worklog-ext-<v>-windows.zip` | Windows (đường chính) |
| `worklog-ext-<v>-windows.exe` | Windows (tự cài, không ký số) |
| `worklog-ext-<v>.zip` | Linux / Chrome Web Store — `manifest.json` ở gốc |
| `worklog-ext-<v>-firefox.zip` | Firefox |

Banner "có bản mới" tự đưa đúng file theo hệ điều hành
(`runtime.getPlatformInfo()`): macOS nhận `.dmg`, Windows nhận `-windows.zip`
kèm link phụ tới `.exe`. Release nào thiếu các file này thì rơi về zip store.

**Chuyển đổi một lần** (từ bản cài trước khi có `key`, tức ≤ 0.12.0)

Bản mới có ID khác bản đang dùng, nên mở lên với cấu hình trắng. Mang cấu hình
sang bằng file:

1. **Xuất cấu hình từ bản ĐANG dùng — trước khi gỡ nó.** Bản đó chưa có nút
   Export, nên mở Options của nó, bấm F12 (macOS: `⌥⌘I`) → tab Console, dán
   đoạn dưới rồi Enter (Chrome có thể bắt gõ `allow pasting` trước). Nó tải
   xuống `worklog-config.json` đúng định dạng mà nút Import đọc được:

   ```js
   chrome.storage.local.get('config').then(({ config }) => {
     const file = { kind: 'worklog-ext/config', exportedAt: new Date().toISOString(),
       extensionVersion: chrome.runtime.getManifest().version, config }
     const a = document.createElement('a')
     a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }))
     a.download = 'worklog-config.json'
     a.click()
   })
   ```

   Từ bản này trở đi thì dùng nút Options → **8. Chuyển cấu hình → Xuất ra
   file**.
2. Đặt bản mới vào `Documents/Worklog Extension` theo cách của hệ điều hành
   (bên dưới).
3. `chrome://extensions` → **Load unpacked** → chọn `Documents/Worklog
   Extension`. Bản cũ vẫn còn đó cũng không sao — hai ID khác nhau.
4. Ở Options của bản **mới** → **8. Chuyển cấu hình → Nhập từ file…** → chọn
   file vừa xuất. Rồi **1. Jira → Kết nối** để cấp lại quyền truy cập Jira
   (quyền gắn với ID, không đi theo file).
5. Kiểm tra side panel chạy được, rồi **Remove** bản cũ ở `chrome://extensions`
   và **xoá file JSON**: nó chứa cả API token nếu bạn đã lưu.

**Cập nhật trên macOS**

1. Tải `worklog-ext-<v>.dmg` từ banner, mở nó.
2. Mở một cửa sổ Finder khác, chọn **Documents** ở thanh bên, rồi kéo thư mục
   `Worklog Extension` từ cửa sổ dmg thả vào đó. Đã có bản cũ thì chọn
   **Replace** — Finder thay cả thư mục nên không còn file cũ.
3. Eject dmg. Options → **7. Cập nhật → Khởi động lại extension**.

Trong dmg không có lối tắt tới Documents (kiểu symlink `/Applications` của dmg
cài app): symlink chỉ chứa đường dẫn tuyệt đối, mà Documents nằm dưới thư mục
nhà của từng người. Nếu bật iCloud "Desktop & Documents" kèm "Optimize Mac
Storage", macOS có thể đẩy file lên iCloud và Chrome không đọc được — khi đó
chọn "Keep Downloaded" cho thư mục này.

**Cập nhật trên Windows — zip (đường chính)**

Tải `worklog-ext-<v>-windows.zip` từ banner, rồi một trong hai cách:

- **Kéo thả**: mở zip trong Explorer (double-click), kéo thư mục `Worklog
  Extension` thả vào **Documents** ở thanh bên trái → **Replace the files in
  the destination**.
- **Extract All…**: chuột phải zip → **Extract All…** → sửa ô đích thành thư
  mục Documents (vd `C:\Users\<bạn>\Documents`) — **xoá phần
  `\worklog-ext-<v>-windows` Windows tự thêm vào cuối**, không thì nó bung ra
  một thư mục khác → Extract → **Replace**.

Rồi Options → **7. Cập nhật → Khởi động lại extension**.

Explorer **gộp** thư mục chứ không thay: file trùng tên bị ghi đè, file chỉ có
ở bản cũ (asset mang hash cũ) vẫn nằm lại. Vô hại — `manifest.json` mới không
trỏ tới chúng. Muốn sạch thì xoá thư mục `Worklog Extension` trước khi thả, hoặc
dùng `.exe`.

**Cập nhật trên Windows — `.exe` (tùy chọn)**

`worklog-ext-<v>-windows.exe` tự bung vào `Documents\Worklog Extension`, ghi đè
không hỏi, và **xoá nội dung cũ trước** nên không để lại file thừa. "Documents"
ở đây là thư mục Documents thật mà Explorer hiện — kể cả khi OneDrive đã chuyển
nó sang `OneDrive - <Công ty>\Documents`. Nó chỉ xoá khi thư mục đó trông như
bản extension cũ (có `manifest.json`); thư mục trùng tên chứa thứ khác thì để
nguyên và báo lỗi.

File **không ký số**, nên:

- SmartScreen hiện "Windows protected your PC" → **More info → Run anyway**.
- Trên máy công ty, SmartScreen / AppLocker / antivirus có thể **chặn hẳn**
  (không có nút Run anyway). Khi đó dùng zip.

Chạy xong có hộp thoại báo đã cài vào đâu; rồi Options → **7. Cập nhật →
Khởi động lại extension**.

**Nếu bạn build từ repo**

```bash
git pull && npm run build      # ghi đè dist/ tại chỗ
```

rồi Options → **7. Cập nhật → Khởi động lại extension**. Đang sửa code thì
`npm run dev` có HMR, không cần bước nào.

**Vì sao vẫn phải thả file bằng tay**

`chrome.runtime.reload()` đọc lại file từ đĩa cho extension unpacked và không
cần permission nào, nên bước "vào `chrome://extensions` bấm Reload" bỏ được.
Bước đặt file thì **không**: extension không có quyền ghi file.

Muốn cập nhật **hoàn toàn tự động** thì chỉ có Chrome Web Store (để
**unlisted** vẫn được) — đó là đường duy nhất Chrome tự cập nhật im lặng cho
máy thường. Host CRX đã ký + `updates.xml` chỉ chạy khi deploy bằng enterprise
policy (`ExtensionInstallForcelist`); trên macOS/Windows, `update_url` không có
tác dụng với bản load unpacked. Firefox thì cần XPI đã sign + `gecko.update_url`.

Cấu hình (Jira URL, member, sprint event) nằm trong `chrome.storage.local` nên
không mất khi reload hay khi thả đè thư mục — miễn ID không đổi.
