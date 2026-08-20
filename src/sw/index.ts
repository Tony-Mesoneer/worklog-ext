import { handle } from './handlers'
import type { Message, Reply } from './messages'
import { checkForUpdate, updateStatus } from './update'
import { UPDATE_CHECK_INTERVAL_MS } from '@/core/version'

// Check update phải chạy bằng chrome.alarms, không phải setInterval: service
// worker MV3 bị kill sau ~30s không hoạt động, nên mọi timer trong bộ nhớ đều
// chết theo. Alarm là thứ duy nhất đánh thức SW lại được.
const UPDATE_ALARM = 'update-check'

const scheduleUpdateCheck = () => {
  chrome.alarms
    .create(UPDATE_ALARM, { periodInMinutes: UPDATE_CHECK_INTERVAL_MS / 60_000 })
    // create() với cùng tên chỉ ghi đè, nên gọi lại ở mọi lần khởi động là an
    // toàn — và cần thiết, vì alarm không sống qua lần cập nhật extension.
    .catch((e: unknown) => console.error('[sw] alarms.create', e))
  // checkForUpdate(false) tự tôn trọng interval, nên lượt gọi lúc khởi động
  // không đốt request nếu vừa check xong.
  void checkForUpdate(false).catch((e: unknown) => console.error('[sw] update check', e))
}

chrome.runtime.onInstalled.addListener(scheduleUpdateCheck)
chrome.runtime.onStartup.addListener(scheduleUpdateCheck)

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== UPDATE_ALARM) return
  void checkForUpdate(false).catch((e: unknown) => console.error('[sw] update check', e))
})

// Badge sống trên icon nhưng bị xoá mỗi lần SW restart, nên phải vẽ lại từ
// state đã lưu ở mỗi lần SW được đánh thức.
void updateStatus().catch((e: unknown) => console.error('[sw] update status', e))

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error('[sw] setPanelBehavior', e))

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
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

// WINDOW_ID_CURRENT (-2) là sentinel, không phải window id thật — sidePanel.open
// cần id cụ thể. Phải resolve window trước, và phải catch: đây là entry point
// Cmd+Shift+L, lỗi im lặng ở đây là lỗi người dùng gặp đầu tiên.
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open-sidepanel') return
  chrome.windows
    .getCurrent()
    .then((win) => {
      if (win.id === undefined) throw new Error('không xác định được window hiện tại')
      return chrome.sidePanel.open({ windowId: win.id })
    })
    .catch((e: unknown) => console.error('[sw] sidePanel.open', e))
})
