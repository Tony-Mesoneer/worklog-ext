// Click icon → mở side panel. Đây là hành vi duy nhất ở task 1.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error('[sw] setPanelBehavior', e))

chrome.runtime.onInstalled.addListener(() => {
  console.log('[sw] installed')
})
