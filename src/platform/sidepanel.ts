// src/platform/sidepanel.ts
//
// Mở panel bên, che khác biệt Chrome ↔ Firefox.
//
// Chrome có `sidePanel` (manifest key `side_panel`). Firefox KHÔNG có, và MDN nói
// rõ hai API không tương thích — nó dùng `sidebarAction` + manifest key
// `sidebar_action`. Đây là khác biệt lớn nhất giữa hai bản, vì panel bên là bề
// mặt chính của extension này.
//
// Feature detection bằng `in` chứ không theo user agent: `'sidePanel' in ext` hỏi
// đúng câu cần hỏi ("API này có không"), còn sniff UA sẽ sai ngay khi một trong
// hai bên thay đổi. Đây cũng là lý do Proxy trong platform/ext.ts phải có bẫy
// `has` — thiếu nó thì mọi phép kiểm tra ở đây trả false.
import { ext } from './ext'

// @types/chrome không biết `sidebarAction` (nó là API của Firefox), nên khai báo
// đúng phần đang dùng. Khai tối thiểu chứ không copy cả API: phần không dùng thì
// không có gì bảo đảm nó đúng.
type SidebarAction = {
  open: () => Promise<void>
  close: () => Promise<void>
}

const sidebarAction = (): SidebarAction | null =>
  'sidebarAction' in ext
    ? (ext as unknown as { sidebarAction: SidebarAction }).sidebarAction
    : null

/**
 * Mở panel bên của window đang hoạt động.
 *
 * Chrome: `sidePanel.open` cần windowId CỤ THỂ — `WINDOW_ID_CURRENT` (-2) là
 * sentinel, không phải id thật, nên phải resolve window trước.
 *
 * Firefox: `sidebarAction.open()` không nhận windowId (nó luôn tác động lên
 * window đang focus) nhưng ĐÒI user gesture. Gọi từ handler của `commands` là
 * trong một gesture, nhưng điều này CHƯA được xác nhận trên Firefox thật — xem
 * README, mục Firefox.
 */
export async function openSidePanel(): Promise<void> {
  const sidebar = sidebarAction()
  if (sidebar) return sidebar.open()

  const win = await ext.windows.getCurrent()
  if (win.id === undefined) throw new Error('không xác định được window hiện tại')
  return ext.sidePanel.open({ windowId: win.id })
}

/**
 * Click icon trên toolbar mở panel bên.
 *
 * Chrome cần bật tường minh qua `setPanelBehavior`. Firefox thì `sidebar_action`
 * đã tự có lối vào riêng (menu Sidebars) và không có API tương đương, nên ở đó
 * hàm này không làm gì — không phải lỗi, chỉ là nền tảng khác cách.
 */
export async function openPanelOnActionClick(): Promise<void> {
  if (!('sidePanel' in ext)) return
  await ext.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
}
