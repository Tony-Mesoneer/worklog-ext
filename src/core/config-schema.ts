import { parseHhMm } from './timeline'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locale'

// v1 → v2: workdayStart/workdayEnd/breaks được thêm ở v1 nhưng KHÔNG có UI để
// sửa, nên bất kỳ giá trị nào đã lưu (nếu có) chỉ có thể là default cũ —
// migrateConfig ghi đè chúng bằng default mới một lần khi nâng version.
//
// v2 → v3: giờ nghỉ trưa đổi từ 12:00–13:00 sang 12:00–13:30. Vẫn CHƯA có UI cho
// `breaks`, nên lập luận trên còn nguyên giá trị: giá trị đang lưu chỉ có thể là
// default cũ, ghi đè là an toàn. Không bump version thì người đang dùng giữ
// nguyên 12:00–13:00 và vẫn bị log vào 13:00 — đúng triệu chứng đã báo, và đổi
// default một mình không sửa được gì cho họ.
export const CONFIG_VERSION = 3

// `matchSummary` là TÊN sub-task ceremony trong sprint đang mở ("Daily Scrum").
// Có nó thì issue key được tra tại runtime, nên sprint mới có sub-task mới là
// nút tự trỏ đúng chỗ. `issueKey` trở thành override thủ công cho trường hợp
// muốn ghim cứng một issue. Cả hai là string, '' nghĩa là "không đặt" — giữ
// đúng lối khoan dung của migrateConfig (sai kiểu → default, không bao giờ
// throw). Một event PHẢI có ít nhất một trong hai, không thì không biết ghi
// giờ vào đâu.
export type SprintEvent = {
  name: string
  issueKey: string
  matchSummary: string
  defaultMinutes: number
  comment: string
}

// Một khoảng nghỉ trong ngày, "HH:MM". Cố tình là DANH SÁCH chứ không phải một
// cặp field "lunchStart/lunchEnd": thêm khoảng nghỉ thứ hai (vd 15:00 tea break)
// phải là thêm một phần tử, không phải viết lại logic cắt worklog.
export type BreakInterval = { start: string; end: string }

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
  workdayEnd: string
  breaks: BreakInterval[]
  slotMinutes: number
  durationPresets: number[]
  sprintEvents: SprintEvent[]
  // Repo GitHub (dạng `owner/tên`) dùng để kiểm tra bản mới. Rỗng = tắt tính
  // năng. Là CONFIG chứ không phải hằng số biên dịch vì cùng một bản build có
  // thể được fork/đổi chỗ host, và không có gì trong extension biết nó được
  // build từ repo nào.
  updateRepo: string
  /**
   * Ngôn ngữ UI. Cố tình KHÔNG có giá trị 'auto': `chrome.i18n` không cho
   * override locale tại runtime, nên nếu muốn "theo browser" thì phải tự đọc
   * navigator.language — thêm một trạng thái mà không ai yêu cầu.
   */
  locale: Locale
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
  // Giờ làm việc và giờ nghỉ trưa là feature ẩn: không có UI trong Options,
  // chỉ có default ở đây. Không worklog nào được đi qua giờ nghỉ.
  workdayStart: '08:30',
  workdayEnd: '18:00',
  breaks: [{ start: '12:00', end: '13:30' }],
  slotMinutes: 15,
  durationPresets: [15, 30, 60, 240, 360, 480],
  sprintEvents: [],
  // Mặc định trỏ về repo gốc. Vẫn sửa được ở Options: bản fork phải đổi chỗ
  // này, không thì nó đi hỏi update của một repo không phải của mình.
  updateRepo: 'Tony-Mesoneer/worklog-ext',
  locale: DEFAULT_LOCALE,
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? v : fallback

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const strArray = (v: unknown, fallback: string[]): string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : fallback

// "HH:MM" trong khoảng hợp lệ. Giờ sai kiểu/sai định dạng mà lọt xuống
// parseHhMm sẽ thành NaN, rồi thành `started` rác trong POST worklog.
const HH_MM = /^([01]?\d|2[0-3]):([0-5]\d)$/
const isHhMm = (v: unknown): v is string => typeof v === 'string' && HH_MM.test(v)
const hhMm = (v: unknown, fallback: string): string => (isHhMm(v) ? v : fallback)

const numArray = (v: unknown, fallback: number[]): number[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'number') ? (v as number[]) : fallback

// Giờ tan làm phải sau giờ bắt đầu, không thì lưới slot rỗng và dropdown
// "Bắt đầu" trắng trơn.
const workdayEndOf = (start: string, raw: unknown): string => {
  const end = hhMm(raw, defaultConfig.workdayEnd)
  return parseHhMm(end) > parseHhMm(start) ? end : defaultConfig.workdayEnd
}

// Migration cố tình khoan dung: dữ liệu lạ bị thay bằng default chứ không làm
// hỏng toàn bộ config. Mất một field còn hơn người dùng mở extension ra trắng.
export function migrateConfig(raw: unknown): Config {
  const r = isRecord(raw) ? raw : {}
  const d = defaultConfig

  // version < CONFIG_VERSION: ba field workdayStart/workdayEnd/breaks chưa từng
  // có UI để người dùng tự sửa, nên giá trị đang lưu — nếu có — chắc chắn chỉ là
  // default của một bản trước. Ghi đè, KHÔNG đọc từ `r` cho ba field đó.
  const rawVersion = typeof r['version'] === 'number' ? r['version'] : 0
  const needsWorkdayMigration = rawVersion < CONFIG_VERSION

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

  // Danh tính của một event là issueKey HOẶC matchSummary — mất cả hai thì
  // entry vô nghĩa và bị loại. Config cũ (chỉ có issueKey) đi qua đây không sứt
  // sát gì: matchSummary thiếu → '' → hành vi y như trước.
  const sprintEvents: SprintEvent[] = (Array.isArray(r['sprintEvents']) ? r['sprintEvents'] : [])
    .filter(isRecord)
    .map((e) => ({
      issueKey: str(e['issueKey'], '').trim(),
      matchSummary: str(e['matchSummary'], '').trim(),
      rawName: str(e['name'], ''),
      defaultMinutes: num(e['defaultMinutes'], 30),
      comment: str(e['comment'], ''),
    }))
    .filter((e) => e.issueKey !== '' || e.matchSummary !== '')
    .map((e) => ({
      name: e.rawName !== '' ? e.rawName : (e.matchSummary !== '' ? e.matchSummary : e.issueKey),
      issueKey: e.issueKey,
      matchSummary: e.matchSummary,
      defaultMinutes: e.defaultMinutes,
      comment: e.comment,
    }))

  // `breaks` sai kiểu → default. Nhưng MẢNG RỖNG được giữ nguyên: đó là lựa
  // chọn hợp lệ "ngày làm việc không có giờ nghỉ", không phải dữ liệu thiếu.
  const breaksRaw = r['breaks']
  const breaks: BreakInterval[] = needsWorkdayMigration
    ? d.breaks.map((b) => ({ ...b }))
    : Array.isArray(breaksRaw)
      ? breaksRaw
          .filter(isRecord)
          .filter((b) => isHhMm(b['start']) && isHhMm(b['end']))
          .map((b) => ({ start: b['start'] as string, end: b['end'] as string }))
          // end <= start là vô nghĩa; normalizeBreaks cũng bỏ, nhưng bỏ sớm ở đây
          // để config đọc ra không chứa rác.
          // So sánh bằng PHÚT, không bằng chuỗi: "9:00" hợp lệ về định dạng
          // nhưng "9:00" > "12:00" nếu so chuỗi.
          .filter((b) => parseHhMm(b.end) > parseHhMm(b.start))
      : d.breaks.map((b) => ({ ...b }))

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
    workdayStart: needsWorkdayMigration ? d.workdayStart : hhMm(r['workdayStart'], d.workdayStart),
    workdayEnd: needsWorkdayMigration
      ? d.workdayEnd
      : workdayEndOf(hhMm(r['workdayStart'], d.workdayStart), r['workdayEnd']),
    breaks,
    slotMinutes: num(r['slotMinutes'], d.slotMinutes),
    durationPresets: numArray(r['durationPresets'], d.durationPresets),
    sprintEvents,
    updateRepo: str(r['updateRepo'], d.updateRepo).trim(),
    // Locale lạ (config sửa tay, hoặc bản cũ chưa có field) → default.
    locale: isLocale(r['locale']) ? r['locale'] : d.locale,
  }
  if (token) config.token = token
  return config
}
