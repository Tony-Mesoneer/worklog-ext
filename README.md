# worklog-ext

Chrome extension để log worklog Jira nhanh, và theo dõi giờ log của team.

- Side panel: log worklog với start time tự suy ra từ timeline trong ngày,
  duration chọn từ preset, sprint event log bằng một cú bấm.
- Dashboard: bảng giờ của team theo ngày (ai thiếu giờ), story points vs giờ thực.

Jira Cloud là source of truth duy nhất. Không backend.

## Trạng thái

Implementation hoàn thành. Extension chạy local, chưa publish lên Chrome Web Store.

- Design: [`docs/superpowers/specs/2026-08-19-worklog-extension-design.md`](docs/superpowers/specs/2026-08-19-worklog-extension-design.md)
- Spike auth (chạy trong DevTools trên tab Jira): [`spike/auth-probe.js`](spike/auth-probe.js)

## Cách dùng

1. **Load extension**: Mở `chrome://extensions/`, bật "Developer mode", chọn "Load unpacked" và trỏ tới thư mục `dist/`.
2. **Cấu hình**: Mở trang Options (click icon extension → "Options"), nhập Jira URL rồi bấm "Kết nối", thêm project key, **chọn board chính** (bắt buộc cho preset sprint và tab Story points), thêm members và sprint events. Nếu session Jira không dùng được, nhập email + API token ở mục "API token (dự phòng)".
3. **Log worklog**: Nhấn `Cmd+Shift+L` để mở side panel, chọn issue, nhập dữ liệu, click "Log" để ghi vào Jira.
4. **Dashboard**: Xem nút "Dashboard" trong side panel để mở trang theo dõi giờ của team và so sánh story points vs giờ thực.

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
