import { migrateConfig, type Config } from '@/core/config-schema'
import { ext } from '@/platform/ext'

const KEY = 'config'

export async function loadConfig(): Promise<Config> {
  const res = await ext.storage.local.get(KEY)
  return migrateConfig(res[KEY])
}

export async function saveConfig(patch: Partial<Config>): Promise<Config> {
  const current = await loadConfig()
  const next = migrateConfig({ ...current, ...patch })
  await ext.storage.local.set({ [KEY]: next })
  return next
}

/**
 * Thay TOÀN BỘ config — dùng cho Import. Không đi qua saveConfig vì merge sẽ
 * giữ lại những gì file nhập không có (vd token của máy này khi file không có
 * token), tức kết quả không còn là "đúng cái đã xuất".
 */
export async function replaceConfig(raw: unknown): Promise<Config> {
  const next = migrateConfig(raw)
  await ext.storage.local.set({ [KEY]: next })
  return next
}
