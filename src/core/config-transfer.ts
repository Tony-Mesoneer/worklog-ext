// src/core/config-transfer.ts
//
// Xuất / nhập config ra file JSON.
//
// Lý do tồn tại: chrome.storage.local gắn với EXTENSION ID. Lần đầu manifest có
// `key` (xem manifest.config.ts), hoặc khi trỏ "Load unpacked" sang thư mục
// khác ở một bản chưa có key, ID đổi và extension mở ra với config trắng. File
// này là cách duy nhất mang Jira URL, member, sprint event sang bên kia.
//
// Hàm thuần: không chrome.*, không DOM. Phần tải file / chọn file nằm ở Options.
import { migrateConfig, type Config } from './config-schema'

/** Dấu nhận dạng file. Chặn việc nhập nhầm một JSON bất kỳ thành config trắng. */
export const CONFIG_EXPORT_KIND = 'worklog-ext/config'

export type ConfigExport = {
  kind: typeof CONFIG_EXPORT_KIND
  exportedAt: string
  /** Version extension lúc xuất — chỉ để người đọc file biết, không dùng để chặn. */
  extensionVersion: string
  config: Config
}

/**
 * Config → nội dung file. GIỮ cả API token (nếu đã lưu): token Atlassian không
 * xem lại được sau khi tạo, bỏ nó ra là bắt người dùng đi tạo token mới chỉ để
 * chuyển thư mục. Cái giá là file nhạy cảm — UI phải nói rõ điều đó.
 */
export function serializeConfigExport(
  config: Config,
  meta: { now: Date; extensionVersion: string },
): string {
  const payload: ConfigExport = {
    kind: CONFIG_EXPORT_KIND,
    exportedAt: meta.now.toISOString(),
    extensionVersion: meta.extensionVersion,
    config,
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** `worklog-config-2026-10-30.json` — ngày theo giờ máy, là ngày người dùng thấy. */
export const configExportFileName = (now: Date): string =>
  `worklog-config-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`

export type ConfigImportResult =
  | { ok: true; config: Config; exportedAt: string; extensionVersion: string }
  /** `json`: không đọc được JSON. `format`: JSON nhưng không phải file xuất từ đây. */
  | { ok: false; reason: 'json' | 'format' }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Nội dung file → Config. Phần `config` đi qua migrateConfig như mọi config đọc
 * từ storage: file xuất từ bản cũ hơn được nâng version, field lạ/sai kiểu rơi
 * về default thay vì làm hỏng cả lần nhập.
 *
 * Không throw — người gọi chỉ cần phân biệt "không phải JSON" với "không phải
 * file của mình" để nói câu đúng.
 */
export function parseConfigImport(text: string): ConfigImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'json' }
  }
  if (!isRecord(raw) || raw['kind'] !== CONFIG_EXPORT_KIND || !isRecord(raw['config'])) {
    return { ok: false, reason: 'format' }
  }
  return {
    ok: true,
    config: migrateConfig(raw['config']),
    exportedAt: typeof raw['exportedAt'] === 'string' ? raw['exportedAt'] : '',
    extensionVersion: typeof raw['extensionVersion'] === 'string' ? raw['extensionVersion'] : '',
  }
}
