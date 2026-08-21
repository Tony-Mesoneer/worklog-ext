import { handle } from './handlers'
import type { Message, Reply } from './messages'
import { checkForUpdate, updateStatus } from './update'
import { UPDATE_CHECK_INTERVAL_MS } from '@/core/version'
import { ext } from '@/platform/ext'
import { openPanelOnActionClick, openSidePanel } from '@/platform/sidepanel'

// Check update phải chạy bằng chrome.alarms, không phải setInterval: service
// worker MV3 bị kill sau ~30s không hoạt động, nên mọi timer trong bộ nhớ đều
// chết theo. Alarm là thứ duy nhất đánh thức SW lại được.
const UPDATE_ALARM = 'update-check'

const scheduleUpdateCheck = () => {
  ext.alarms
    .create(UPDATE_ALARM, { periodInMinutes: UPDATE_CHECK_INTERVAL_MS / 60_000 })
    // create() với cùng tên chỉ ghi đè, nên gọi lại ở mọi lần khởi động là an
    // toàn — và cần thiết, vì alarm không sống qua lần cập nhật extension.
    .catch((e: unknown) => console.error('[sw] alarms.create', e))
  // checkForUpdate(false) tự tôn trọng interval, nên lượt gọi lúc khởi động
  // không đốt request nếu vừa check xong.
  void checkForUpdate(false).catch((e: unknown) => console.error('[sw] update check', e))
}

ext.runtime.onInstalled.addListener(scheduleUpdateCheck)
ext.runtime.onStartup.addListener(scheduleUpdateCheck)

ext.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== UPDATE_ALARM) return
  void checkForUpdate(false).catch((e: unknown) => console.error('[sw] update check', e))
})

// Badge sống trên icon nhưng bị xoá mỗi lần SW restart, nên phải vẽ lại từ
// state đã lưu ở mỗi lần SW được đánh thức.
void updateStatus().catch((e: unknown) => console.error('[sw] update status', e))

// Chrome: bật click-icon-mở-panel. Firefox: không có API tương đương và
// sidebar_action đã tự có lối vào — xem platform/sidepanel.
void openPanelOnActionClick().catch((e: unknown) =>
  console.error('[sw] openPanelOnActionClick', e))

ext.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
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

// Phải catch: đây là entry point Cmd+Shift+L, lỗi im lặng ở đây là lỗi người
// dùng gặp đầu tiên. Khác biệt Chrome/Firefox nằm trong platform/sidepanel.
ext.commands.onCommand.addListener((command) => {
  if (command !== 'open-sidepanel') return
  void openSidePanel().catch((e: unknown) => console.error('[sw] openSidePanel', e))
})
