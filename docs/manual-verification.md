# Checklist kiểm thủ công

Những gì không một test hay build nào phủ được. Toàn bộ code chạy trong Chrome
và nói chuyện với Jira thật; test đơn vị (356+) chỉ phủ logic thuần, còn
harness Puppeteer chỉ chụp UI với **dữ liệu giả**. Nghĩa là mọi đường ghi lên
Jira, cùng toàn bộ hành vi đặc thù của Chrome, **chưa từng chạy thật một lần
nào**.

Xếp theo rủi ro giảm dần. Mục 1–3 nên làm trước khi dùng thật.

## 1. Ghi worklog thật — rủi ro cao nhất

Đây là đường code duy nhất vừa chưa bao giờ chạy thật, vừa **ghi dữ liệu**.

- [ ] Log một worklog thường (không vắt qua trưa) → kiểm trong Jira: đúng
      issue, đúng ngày, đúng giờ bắt đầu, đúng thời lượng, comment đúng.
- [ ] Bấm **Undo** trong 8 giây → worklog biến mất khỏi Jira.
- [ ] Log một khoảng **vắt qua 12:00** (ví dụ 11:00 + 3h) → Jira phải có
      **hai** worklog: 11:00–12:00 và 13:00–15:00. Tổng thời lượng đúng bằng
      cái bạn nhập.
- [ ] Undo sau khi bị cắt → **cả hai** worklog phải bị xoá, không sót cái nào.
- [ ] Log vào một issue không tồn tại (gõ `CAG-999999`) → phải hiện message
      gốc từ Jira, không phải chuỗi `Jira 400` trống nghĩa.

Chưa kiểm được và không mô phỏng được từ đây: **rollback khi POST thứ hai
lỗi**. Nếu nó xảy ra, extension phải xoá lại worklog thứ nhất; xoá không được
thì phải in ra worklog id và issue key để bạn xoá tay trong Jira.

## 2. Điểm vào — nhiều khả năng vỡ nhất

- [ ] `Cmd+Shift+L` mở side panel. **Đây là thứ mình đánh cược sẽ vỡ trước
      tiên**: `sidePanel.open()` cần user gesture nhưng lại được gọi sau một
      `await chrome.windows.getCurrent()`, có thể làm mất gesture token. Nếu
      không mở được, cách sửa là lấy `tab.windowId` từ tham số thứ hai của
      `chrome.commands.onCommand` thay vì `await`.
- [ ] Click icon trên toolbar mở side panel.
- [ ] Nút ⚙ ở side panel và ở dashboard đều mở được Options.
- [ ] Icon `Meso` hiện ở toolbar **và** ở thẻ `chrome://extensions`. Nếu chỉ
      hiện một chỗ, đó là cache profile của Chrome: gỡ extension rồi thêm lại
      (mất config, phải cấu hình lại).

## 3. Sprint event resolve — đường mới nhất, chưa chạy thật

- [ ] Bấm nút `Daily` → ô ISSUE KEY prefill đúng `CAG-3065`. Nếu đúng thì toàn
      bộ đường dây resolve theo tên hoạt động thật.
- [ ] Nút `Review`: nếu vẫn khoá, kiểm `matchSummary` trong Options — team có
      **ba** sub-task tên `Security Review`, tên đúng cho ceremony là
      `Sprint Review`.
- [ ] Đầu sprint mới: nếu các nút xám hết, kiểm sprint đã **start** trong Jira
      chưa. Query dùng `sprint in openSprints()`, sprint chưa start không tính.

## 4. Dữ liệu Jira mà harness không mô phỏng được

- [ ] `parent` và `statusCategory` từ payload thật map đúng: subtask hiện dòng
      `↳ <key> <summary>`, badge hiện đúng tên status thật ("In Testing",
      "Closed").
- [ ] Endpoint agile `/sprint/{id}/issue` có tôn trọng `fields=parent` không —
      nếu không, tab Story points sẽ không nhóm được. Degrade êm, không vỡ.
- [ ] JQL dạng `sprint = <id>` (mình không lấy được sprint id qua MCP để kiểm).
      Nếu sai thì kết quả là nút disabled, không phải log sai chỗ.

## 5. Dashboard

- [ ] Đổi date range khi **mất mạng**: phải hiện snapshot cũ kèm timestamp và
      banner cảnh báo, **không** được ra bảng 0h đỏ toàn bộ.
- [ ] Click phải một ô để đánh dấu ngày nghỉ → capacity giảm, reload vẫn giữ.
- [ ] Click một ô → panel chi tiết hiện đúng worklog của member đó ngày đó.

### 5b. Gom nhóm theo project

Phần này KHÔNG có test tự động (thuần hiển thị) — chỉ có typecheck và build che.

- [ ] Lọc project = **Tất cả** và dữ liệu có **nhiều** project → một bảng, mỗi
      project một dòng header, header ngày chỉ xuất hiện MỘT lần.
- [ ] Dữ liệu chỉ có **một** project → không có dòng header project nào, bảng
      giống hệt bản trước và **có** cột capacity/% + cờ thiếu giờ.
- [ ] Lọc vào **một** project cụ thể → cũng có capacity trở lại.
- [ ] Khi gom nhóm: cột cuối là "Tổng" (giờ trần), không có thanh tiến độ.
- [ ] Dòng header của mỗi project = tổng đúng các hàng member trong nhóm đó.
- [ ] `Tổng cả team` ở tfoot = tổng của MỌI nhóm, kể cả "Không rõ project".
- [ ] Một member log ở hai project: mở rộng ở nhóm CAG **không** làm mở luôn ở
      nhóm ABC (khoá mở rộng mang cả project key).
- [ ] Bấm một ô trong nhóm CAG → panel chi tiết chỉ hiện worklog **CAG** của
      ngày đó, không phải cả ngày trên mọi project.
- [ ] Nhóm "Không rõ project" nằm **cuối cùng**, kể cả khi nó nhiều giờ nhất.
- [ ] Cuộn ngang với khoảng một tháng: cột Member dính bên trái, header ngày
      dính trên, dòng header project không bị lệch cột.

### 5c. Xoá worklog (side panel)

- [ ] Card "Trong ngày" có danh sách worklog kèm nút Xoá trên từng dòng.
- [ ] Xoá → banner "Đã xoá … — Undo", và worklog biến khỏi timeline.
- [ ] Bấm Undo → worklog quay lại (id MỚI, không phải id cũ).
- [ ] Xoá một worklog **cắt qua giờ nghỉ** rồi Undo → quay lại thành **hai**
      worklog, tổng giờ đúng. Không phải bug, xem commit.
- [ ] Xoá xong mở dashboard (không bấm Làm mới) → worklog đã xoá **không** còn
      hiện, kể cả khi snapshot chưa hết TTL.

### 5d. Ngôn ngữ

- [ ] Options mục 7 đổi sang Tiếng Việt → toàn bộ Options đổi ngay, không reload.
- [ ] Side panel đang mở sẵn cũng đổi theo (qua `chrome.storage.onChanged`).
- [ ] Ngày/giờ ở mục 6 đổi định dạng theo ngôn ngữ (`21/08/2026` ↔ `8/21/2026`).
- [ ] Dropdown ngôn ngữ luôn hiện "English" và "Tiếng Việt" bằng chính ngôn ngữ
      đó, ở cả hai chế độ.
- [ ] Side panel và dashboard vẫn tiếng Việt cứng — đúng phạm vi đợt 1, chưa dịch.

## 6. Accessibility

- [ ] Điều hướng toàn bộ side panel và dashboard chỉ bằng bàn phím.
- [ ] Calendar tháng: mũi tên di chuyển ngày, Enter chọn, Escape đóng và trả
      focus về nút.
- [ ] Screen reader đọc được badge trạng thái và các nút chỉ có icon.
- [ ] Lưu ý đã biết: bảng dashboard có **48 tab stop** vì các ô đều clickable.
      Đúng về a11y nhưng dùng thì mệt; nếu thấy khó chịu thì gom lại.

## Giới hạn đã biết, không phải bug

- **Ngày lễ công ty** không phải cuối tuần và không nằm trong `daysOff` vẫn bị
  tính là ngày làm việc — cả ở capacity dashboard lẫn lối tắt lấp giờ thiếu.
  Config không có nguồn ngày lễ. Thêm một danh sách ngày lễ là việc nhỏ nếu
  team có lịch cố định.
- **Giờ làm việc và giờ nghỉ trưa không có UI** (tính năng "ẩn" theo yêu cầu).
  Sửa bằng cách viết trực tiếp vào `chrome.storage.local`.
- **Kết quả ô search issue không có badge trạng thái**: `/issue/picker` chỉ trả
  key và summary. Đánh đổi có chủ ý — picker xếp theo issue bạn vừa xem, thứ
  JQL không làm được.
- **Worklog vừa log không hiện trên dashboard tới 5 phút** trừ khi bấm Làm mới;
  snapshot cache có TTL 5 phút và side panel không patch cache của dashboard.
