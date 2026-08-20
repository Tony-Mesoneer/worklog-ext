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
