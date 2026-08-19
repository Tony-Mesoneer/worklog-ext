# worklog-ext

Chrome extension để log worklog Jira nhanh, và theo dõi giờ log của team.

- Side panel: log worklog với start time tự suy ra từ timeline trong ngày,
  duration chọn từ preset, sprint event log bằng một cú bấm.
- Dashboard: bảng giờ của team theo ngày (ai thiếu giờ), story points vs giờ thực.

Jira Cloud là source of truth duy nhất. Không backend.

## Trạng thái

Design đã thống nhất, chưa implement.

- Design: [`docs/superpowers/specs/2026-08-19-worklog-extension-design.md`](docs/superpowers/specs/2026-08-19-worklog-extension-design.md)
- Spike auth (chạy trong DevTools trên tab Jira): [`spike/auth-probe.js`](spike/auth-probe.js)
