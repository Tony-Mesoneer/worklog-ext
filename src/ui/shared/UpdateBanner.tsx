// src/ui/shared/UpdateBanner.tsx
//
// Banner "có bản mới" ở side panel và dashboard. Im lặng ở mọi trạng thái khác:
// một dòng "bạn đang ở bản mới nhất" thường trực chỉ chiếm chỗ của việc chính.
import { Banner } from './Banner'
import { Button } from './Button'
import { fontSize, space } from './theme'
import { useUpdate } from './useUpdate'

export function UpdateBanner() {
  const { status, dismiss } = useUpdate()
  if (!status || status.state !== 'available' || !status.latest) return null

  const { latest, currentVersion } = status
  // Ưu tiên link tải zip; release nào chưa có asset thì mở trang release.
  const href = latest.downloadUrl ?? latest.url

  return (
    <Banner
      kind="info"
      action={{ label: 'Tải bản mới', onClick: () => void chrome.tabs.create({ url: href }) }}
    >
      <div style={{ display: 'grid', gap: space.x1 }}>
        <span>
          Có bản <strong>{latest.version}</strong> (đang dùng {currentVersion}).
        </span>
        <span style={{ fontSize: fontSize.xs }}>
          Giải nén thay thư mục đang dùng, rồi bấm Reload ở <code>chrome://extensions</code>.
          {' '}
          <Button variant="ghost" size="sm" onClick={() => void dismiss()}>
            Để sau
          </Button>
        </span>
      </div>
    </Banner>
  )
}
