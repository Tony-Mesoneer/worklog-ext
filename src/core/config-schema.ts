export const CONFIG_VERSION = 1

export type SprintEvent = {
  name: string
  issueKey: string
  defaultMinutes: number
  comment: string
}

export type ConfigMember = {
  accountId: string
  displayName: string
  hoursPerDay: number
  active: boolean
}

export type Config = {
  version: number
  jiraBaseUrl: string
  authMode: 'cookie' | 'token'
  token?: { email: string; apiToken: string }
  timeZone: string
  myAccountId: string
  projects: string[]
  primaryBoardId: number | null
  storyPointsFieldId: string | null
  members: ConfigMember[]
  daysOff: Record<string, string[]>
  workdayStart: string
  slotMinutes: number
  durationPresets: number[]
  sprintEvents: SprintEvent[]
}

export const defaultConfig: Config = {
  version: CONFIG_VERSION,
  jiraBaseUrl: '',
  authMode: 'cookie',
  timeZone: 'UTC',
  myAccountId: '',
  projects: [],
  primaryBoardId: null,
  storyPointsFieldId: null,
  members: [],
  daysOff: {},
  workdayStart: '09:00',
  slotMinutes: 15,
  durationPresets: [15, 30, 60, 240, 360, 480],
  sprintEvents: [],
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? v : fallback

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const strArray = (v: unknown, fallback: string[]): string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : fallback

const numArray = (v: unknown, fallback: number[]): number[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'number') ? (v as number[]) : fallback

// Migration cố tình khoan dung: dữ liệu lạ bị thay bằng default chứ không làm
// hỏng toàn bộ config. Mất một field còn hơn người dùng mở extension ra trắng.
export function migrateConfig(raw: unknown): Config {
  const r = isRecord(raw) ? raw : {}
  const d = defaultConfig

  const seenAccountIds = new Set<string>()
  const members: ConfigMember[] = (Array.isArray(r['members']) ? r['members'] : [])
    .filter(isRecord)
    .filter((m) => typeof m['accountId'] === 'string' && m['accountId'] !== '')
    .map((m) => ({
      accountId: m['accountId'] as string,
      displayName: str(m['displayName'], m['accountId'] as string),
      hoursPerDay: num(m['hoursPerDay'], 8),
      active: typeof m['active'] === 'boolean' ? m['active'] : true,
    }))
    // Trùng accountId sẽ khiến buildCoverage đếm đôi vào totalPerDay/grandTotal.
    .filter((m) => {
      if (seenAccountIds.has(m.accountId)) return false
      seenAccountIds.add(m.accountId)
      return true
    })

  const sprintEvents: SprintEvent[] = (Array.isArray(r['sprintEvents']) ? r['sprintEvents'] : [])
    .filter(isRecord)
    .filter((e) => typeof e['issueKey'] === 'string' && e['issueKey'] !== '')
    .map((e) => ({
      name: str(e['name'], e['issueKey'] as string),
      issueKey: e['issueKey'] as string,
      defaultMinutes: num(e['defaultMinutes'], 30),
      comment: str(e['comment'], ''),
    }))

  const daysOffRaw = isRecord(r['daysOff']) ? r['daysOff'] : {}
  const daysOff: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(daysOffRaw)) {
    const dates = strArray(v, [])
    if (dates.length > 0) daysOff[k] = dates
  }

  const tokenRaw = r['token']
  const token =
    isRecord(tokenRaw) &&
    typeof tokenRaw['email'] === 'string' &&
    typeof tokenRaw['apiToken'] === 'string'
      ? { email: tokenRaw['email'], apiToken: tokenRaw['apiToken'] }
      : undefined

  const boardRaw = r['primaryBoardId']
  const spfRaw = r['storyPointsFieldId']

  const config: Config = {
    version: CONFIG_VERSION,
    jiraBaseUrl: str(r['jiraBaseUrl'], d.jiraBaseUrl),
    authMode: r['authMode'] === 'token' ? 'token' : 'cookie',
    timeZone: str(r['timeZone'], d.timeZone),
    myAccountId: str(r['myAccountId'], d.myAccountId),
    projects: strArray(r['projects'], d.projects),
    primaryBoardId: typeof boardRaw === 'number' ? boardRaw : null,
    storyPointsFieldId: typeof spfRaw === 'string' ? spfRaw : null,
    members,
    daysOff,
    workdayStart: str(r['workdayStart'], d.workdayStart),
    slotMinutes: num(r['slotMinutes'], d.slotMinutes),
    durationPresets: numArray(r['durationPresets'], d.durationPresets),
    sprintEvents,
  }
  if (token) config.token = token
  return config
}
