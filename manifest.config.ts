// manifest.config.ts
//
// Một manifest gốc (`manifest.json`) + biến đổi theo target lúc build.
//
// Phần lớn manifest dùng chung; ở đây là những chỗ hai nền tảng thật sự khác.
//
// Về key `background`: crxjs KHÔNG tự chuyển đổi. Với `browser: 'firefox'` nó
// ĐỌC `manifest.background.scripts[0]` từ manifest đầu vào (xem
// renderCrxManifest trong plugin) và chỉ format lại đầu ra — nên chính chỗ này
// phải cung cấp đúng hình dạng. Truyền `service_worker` cho target firefox sẽ
// làm build vỡ với "Cannot read properties of undefined (reading '0')".
import base from './manifest.json'

export type Target = 'chrome' | 'firefox'

/**
 * ID của add-on trên Firefox. Update dựa vào nó nên coi như VĨNH VIỄN: đổi id
 * là tạo ra một add-on khác, người đang dùng không nhận được bản mới.
 */
const GECKO_ID = 'worklog-ext@tony-mesoneer.github.io'

/**
 * Sàn phiên bản Firefox — con số này KHÔNG phải lựa chọn, nó bị ép.
 *
 * `data_collection_permissions` (AMO bắt buộc với add-on mới) chỉ có từ Firefox
 * 140; `web-ext lint` fail với KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION nếu đặt
 * thấp hơn. Android cần 142, nhưng extension này là công cụ desktop nên lấy mốc
 * desktop và không khai `gecko_android`.
 *
 * Hạ xuống chỉ khả thi nếu bỏ khai báo data collection, tức không nộp được AMO.
 */
const FIREFOX_MIN = '140.0'

export function manifestFor(target: Target) {
  if (target === 'chrome') return base

  // Firefox không có sidePanel API lẫn side_panel manifest key — nó dùng
  // sidebar_action, và MDN nói rõ hai cái không tương thích. Giữ lại key của
  // Chrome sẽ chỉ sinh warning "Unsupported manifest key" chứ không giúp gì.
  const { side_panel, permissions, background, ...rest } = base

  return {
    ...rest,
    // Firefox MV3 không có service worker — background là event page. Cùng một
    // file entry, chỉ khác cách khai báo.
    background: { scripts: [background.service_worker], type: background.type },
    // Cùng một trang HTML, chỉ khác cách khai báo.
    sidebar_action: {
      default_panel: side_panel.default_path,
      default_title: base.action.default_title,
      default_icon: base.action.default_icon,
    },
    // 'sidePanel' là permission của Chrome; Firefox không biết nó.
    permissions: permissions.filter((p) => p !== 'sidePanel'),
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        strict_min_version: FIREFOX_MIN,
        // AMO bắt buộc khai báo này cho add-on mới (web-ext lint:
        // MISSING_DATA_COLLECTION_PERMISSIONS). 'none' là khai báo đúng ở đây và
        // không phải một chỗ trống cho tiện: extension không có backend, không
        // analytics, không telemetry — nó chỉ gọi Jira của chính người dùng.
        // Thêm bất kỳ việc thu dữ liệu nào sau này thì PHẢI sửa dòng này.
        // `as const` trên phần tử, không trên mảng: crxjs cần mảng MUTABLE
        // của literal type, `['none'] as const` cho readonly và không hợp kiểu.
        data_collection_permissions: { required: ['none' as const] },
      },
    },
  }
}
