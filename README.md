# worklog-ext

Chrome extension để log worklog Jira nhanh, và theo dõi giờ log của team.

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
| [`ci.yml`](.github/workflows/ci.yml) | mọi push, mọi PR | check version sync → `tsc --noEmit` → `vitest run` → `vite build` → zip, upload artifact |
| [`auto-version.yml`](.github/workflows/auto-version.yml) | push/merge vào `main` | đọc conventional commits → bump version → commit + tag → gọi `release.yml` |
| [`release.yml`](.github/workflows/release.yml) | tag `v*`, được gọi từ `auto-version.yml`, hoặc chạy tay | check tag khớp `manifest.json` → typecheck → test → build → GitHub Release kèm `worklog-ext-<version>.zip` |

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
— nền `rgb(18,18,18)`, chữ trắng SF Pro Heavy, `M.` ở cỡ nhỏ và `Meso.` ở cỡ lớn.
Cần Pillow và font hệ thống macOS. Mỗi cỡ render riêng chứ không scale từ một ảnh
lớn xuống, vì chữ ở 16px scale xuống là nhoè.

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

1. Tải `worklog-ext-<version>.zip` từ banner (hoặc từ trang Releases).
2. Giải nén, thay nội dung thư mục bạn đang trỏ "Load unpacked" vào.
3. Mở `chrome://extensions` → bấm Reload trên thẻ Worklog.

Cấu hình (Jira URL, member, sprint event) nằm trong `chrome.storage.local` nên
không mất khi reload.

Muốn Chrome tự update thật thì phải cài qua Chrome Web Store, hoặc host CRX đã
ký + `updates.xml` và deploy bằng enterprise policy (`ExtensionInstallForcelist`)
— trên macOS/Windows, `update_url` không có tác dụng với bản load unpacked.
