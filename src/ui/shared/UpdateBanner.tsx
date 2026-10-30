// src/ui/shared/UpdateBanner.tsx
//
// Banner "có bản mới" ở side panel và dashboard. Im lặng ở mọi trạng thái khác:
// một dòng "bạn đang ở bản mới nhất" thường trực chỉ chiếm chỗ của việc chính.
import { Banner } from './Banner'
import { Button } from './Button'
import { fontSize, space } from './theme'
import { useUpdate } from './useUpdate'
import { useT } from './LocaleProvider'
import { ext } from '@/platform/ext'

export function UpdateBanner() {
  const t = useT()
  const { status, dismiss } = useUpdate()
  if (!status || status.state !== 'available' || !status.latest) return null

  const { latest, currentVersion } = status
  // Ưu tiên link tải file; release nào chưa có asset thì mở trang release.
  const href = latest.downloadUrl ?? latest.url
  // Câu hướng dẫn đi theo LOẠI file thật sự được đưa, không theo hệ điều hành:
  // Windows mà release cũ chỉ có zip store thì vẫn là "giải nén thay thư mục".
  const howTo = latest.downloadKind === 'dmg'
    ? t.updateBanner.howToDmg
    : latest.downloadKind === 'windows-zip'
      ? t.updateBanner.howToWindows
      : t.updateBanner.howTo

  return (
    <Banner
      kind="info"
      action={{
        label: t.updateBanner.download,
        onClick: () => void ext.tabs.create({ url: href }),
      }}
    >
      <div style={{ display: 'grid', gap: space.x1 }}>
        <span>{t.updateBanner.available(latest.version, currentVersion)}</span>
        <span style={{ fontSize: fontSize.xs }}>
          {howTo}
          {' '}
          <Button variant="ghost" size="sm" onClick={() => void dismiss()}>
            {t.updateBanner.later}
          </Button>
        </span>
      </div>
    </Banner>
  )
}
