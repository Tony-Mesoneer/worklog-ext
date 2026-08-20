import { handle } from './handlers'
import type { Message, Reply } from './messages'

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
