import { migrateConfig, type Config } from '@/core/config-schema'

const KEY = 'config'

export async function loadConfig(): Promise<Config> {
  const res = await chrome.storage.local.get(KEY)
  return migrateConfig(res[KEY])
}

export async function saveConfig(patch: Partial<Config>): Promise<Config> {
  const current = await loadConfig()
  const next = migrateConfig({ ...current, ...patch })
  await chrome.storage.local.set({ [KEY]: next })
  return next
}
