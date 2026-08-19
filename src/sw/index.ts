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

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-sidepanel') chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT })
})
