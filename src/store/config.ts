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
