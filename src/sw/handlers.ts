import { loadConfig, saveConfig } from '@/store/config'
import { readSnapshot, writeSnapshot, pruneSnapshots, snapshotMeta } from '@/store/snapshot'
import { readCeremonyCache, writeCeremonyCache } from '@/store/ceremony'
import { createClient, type JiraClient } from '@/jira/client'
import { cookieAuth, tokenAuth } from '@/jira/auth'
import * as api from '@/jira/endpoints'
import { formatStarted, offsetMinutesForZone } from '@/core/jiraTime'
import { normalizeBreaks, splitAroundBreaks } from '@/core/timeline'
import { resolveSprintEvents, type CeremonyCandidate } from '@/core/event-resolve'
import type { Config } from '@/core/config-schema'
import type { Worklog } from '@/core/coverage'
import type { IssueMetaMap } from '@/core/issue-hierarchy'
import type {
  Message, AuthProbeResult, DayLoadResult, CoverageLoadResult,
  PointsLoadResult, SprintCurrentResult, WorklogAddResult,
  EventsResolveResult, CeremoniesListResult,
} from './messages'

async function makeClient(config: Config): Promise<JiraClient> {
  if (!config.jiraBaseUrl) throw new Error('Chưa cấu hình Jira URL — mở Options')
  const auth =
    config.authMode === 'token' && config.token
      ? tokenAuth(config.token.email, config.token.apiToken)
      : cookieAuth
  return createClient({
    baseUrl: config.jiraBaseUrl,
    auth,
    onUnauthorized: () => {
      // Không xoá token: người dùng có thể chỉ cần đăng nhập lại Jira.
      console.warn('[sw] Jira trả 401/403 — cần đăng nhập lại hoặc nhập token')
    },
  })
}

// Lấy worklog cho một khoảng ngày: tìm issue có worklog trong khoảng, rồi fetch
// worklog của từng issue. client tự giới hạn 5 request song song.
//
// `projects` là tham số tường minh chứ không lấy từ config, vì hai caller có
// phạm vi khác nhau: dashboard giới hạn theo project (spec §6), còn side panel
// phải thấy CẢ NGÀY của người dùng — worklog trên issue ngoài project (rất
// thường là issue sprint event) mà bị lọc ra sẽ khiến tổng giờ báo thiếu và
// nextFreeStart trả về giờ đã có việc mà không hề cảnh báo chồng giờ.
// Trả kèm `meta` (status + parent của từng issue), lấy từ CÙNG một search đã
// chạy — không thêm request nào. Nó đi cạnh worklogs chứ không nằm trong Worklog:
// xem src/core/issue-hierarchy.
async function fetchWorklogs(
  c: JiraClient,
  projects: string[],
  accountIds: string[],
  from: string,
  to: string,
): Promise<{ worklogs: Worklog[]; meta: IssueMetaMap }> {
  const issues = await api.searchIssuesWithWorklogs(c, { projects, accountIds, from, to })
  const perIssue = await Promise.all(
    issues.map((i) => api.getIssueWorklogs(c, i.key, i.summary)),
  )
  const wanted = new Set(accountIds)
  const worklogs = perIssue
    .flat()
    .filter((w) => wanted.has(w.authorAccountId) && w.date >= from && w.date <= to)
  return { worklogs, meta: api.toIssueMetaMap(issues) }
}

// Xoá các worklog vừa tạo, theo thứ tự NGƯỢC. Trả về id của những cái xoá
// không được — caller phải nêu chúng ra cho người dùng.
async function rollbackWorklogs(
  c: JiraClient, issueKey: string, created: { id: string }[],
): Promise<string[]> {
  const orphans: string[] = []
  for (const w of [...created].reverse()) {
    try {
      await api.deleteWorklog(c, issueKey, w.id)
    } catch (e) {
      console.error('[sw] rollback worklog thất bại', issueKey, w.id, e)
      orphans.push(w.id)
    }
  }
  return orphans
}

// Gom ứng viên ceremony cho các sprint ĐANG MỞ, có gắn sprint id/startDate để
// core tie-break được.
//
// Một request search cho TẤT CẢ tên event (các `summary ~` được OR lại). Khi có
// nhiều sprint đang mở — chỉ xảy ra lúc chuyển sprint — thêm một request rẻ mỗi
// sprint để biết ứng viên nào thuộc sprint nào; không có thông tin đó thì không
// thể biết cái nào là của sprint mới, và đoán sai nghĩa là ghi giờ vào sprint cũ.
async function fetchCeremonyCandidates(
  c: JiraClient,
  sprints: { id: number; startDate: string }[],
  projects: string[],
  summaries: string[],
): Promise<CeremonyCandidate[]> {
  const found = await api.searchSprintSubtasks(c, { projects, summaries })
  if (found.length === 0) return []

  const only = sprints[0]
  if (sprints.length === 1 && only !== undefined) {
    return found.map((i) => ({
      key: i.key, summary: i.summary,
      sprintId: only.id, sprintStartDate: only.startDate,
    }))
  }

  const keys = found.map((i) => i.key)
  const perSprint = await Promise.all(
    sprints.map(async (s) => ({
      sprint: s,
      keys: new Set(await api.filterKeysInSprint(c, keys, s.id)),
    })),
  )
  const out: CeremonyCandidate[] = []
  for (const i of found) {
    const hits = perSprint.filter((p) => p.keys.has(i.key))
    if (hits.length === 0) {
      // Không quy được về sprint nào: vẫn là ứng viên, nhưng không có mốc thời
      // gian nên nó không được THẮNG tie-break (xem core/event-resolve).
      out.push({ key: i.key, summary: i.summary, sprintId: null, sprintStartDate: null })
      continue
    }
    for (const h of hits) {
      out.push({
        key: i.key, summary: i.summary,
        sprintId: h.sprint.id, sprintStartDate: h.sprint.startDate,
      })
    }
  }
  return out
}

export async function handle(msg: Message): Promise<unknown> {
  switch (msg.type) {
    case 'config/load':
      return loadConfig()

    case 'config/save':
      return saveConfig(msg.patch)

    case 'permission/request':
      return chrome.permissions.request({ origins: [msg.origin] })

    case 'auth/probe': {
      const config = await loadConfig()
      const c = await makeClient(config)
      const me = await api.getMyself(c)
      // Dò field Story Points một lần rồi cache — nó không đổi theo thời gian.
      const storyPointsFieldId =
        config.storyPointsFieldId ?? (await api.findStoryPointsFieldId(c))
      await saveConfig({
        myAccountId: me.accountId,
        timeZone: me.timeZone,
        storyPointsFieldId,
      })
      return {
        mode: config.authMode, accountId: me.accountId,
        displayName: me.displayName, timeZone: me.timeZone,
      } satisfies AuthProbeResult
    }

    case 'day/load': {
      const config = await loadConfig()
      // myAccountId rỗng trước khi probe thành công. Không chặn thì JQL thành
      // worklogAuthor in ("") và Jira trả 400 không đọc được.
      if (config.myAccountId === '') {
        throw new Error('Chưa xác định được tài khoản Jira — mở Options và bấm Kết nối')
      }
      const c = await makeClient(config)
      // Không truyền projects: side panel cần cả ngày, không giới hạn project.
      const { worklogs, meta } = await fetchWorklogs(
        c, [], [config.myAccountId], msg.date, msg.date,
      )
      return { worklogs, meta } satisfies DayLoadResult
    }

    case 'worklog/add': {
      const config = await loadConfig()
      const c = await makeClient(config)
      const offset = offsetMinutesForZone(config.timeZone, msg.date)

      // Cắt Ở ĐÂY, không ở UI: một `worklog/add` = một lần bấm Log, dù nó sinh
      // hai POST. Nếu UI tự gửi hai message thì khi POST thứ hai lỗi, không
      // chỗ nào có đủ thông tin để rollback POST thứ nhất.
      const segments = splitAroundBreaks(
        msg.startMinutes,
        Math.round(msg.timeSpentSeconds / 60),
        normalizeBreaks(config.breaks),
      )
      if (segments.length === 0) throw new Error('Thời lượng phải lớn hơn 0')

      // Chia GIÂY chứ không nhân lại từ phút: đoạn cuối nhận phần dư nên tổng
      // giây POST lên Jira đúng bằng tổng người dùng yêu cầu, không lệch vì
      // làm tròn.
      const secondsPer = segments.map((s, i) =>
        i === segments.length - 1
          ? msg.timeSpentSeconds - segments.slice(0, i).reduce((t, x) => t + x.durationMinutes * 60, 0)
          : s.durationMinutes * 60,
      )

      const created: { id: string }[] = []
      for (let i = 0; i < segments.length; i++) {
        try {
          const res = await api.addWorklog(c, {
            issueKey: msg.issueKey,
            startedIso: formatStarted(msg.date, segments[i]!.startMinutes, offset),
            timeSpentSeconds: secondsPer[i]!,
            comment: msg.comment,
          })
          created.push(res)
        } catch (e) {
          // Một nửa worklog còn tệ hơn không có worklog nào: người dùng tin là
          // đã ghi đủ giờ. Rollback những cái đã tạo rồi báo lỗi gốc.
          const orphans = await rollbackWorklogs(c, msg.issueKey, created)
          const reason = e instanceof Error ? e.message : String(e)
          if (orphans.length > 0) {
            // Không xoá được thì PHẢI nêu id + issue key, đó là thông tin duy
            // nhất giúp người dùng tự dọn trong Jira.
            throw new Error(
              `Ghi worklog thất bại: ${reason}. Đã ghi ${orphans.length} worklog trước đó ` +
              `nhưng KHÔNG xoá lại được — xoá tay trong Jira: ` +
              orphans.map((id) => `${id} trên ${msg.issueKey}`).join(', '),
            )
          }
          throw new Error(`Ghi worklog thất bại: ${reason}. Đã hoàn tác, không có worklog nào được ghi.`)
        }
      }

      return { ids: created.map((w) => w.id) } satisfies WorklogAddResult
    }

    case 'worklog/delete': {
      const config = await loadConfig()
      const c = await makeClient(config)
      await api.deleteWorklog(c, msg.issueKey, msg.worklogId)
      return null
    }

    case 'issues/pick': {
      const config = await loadConfig()
      return api.pickIssues(await makeClient(config), msg.query)
    }

    case 'issues/mine': {
      const config = await loadConfig()
      return api.searchMyIssues(await makeClient(config), { projects: config.projects })
    }

    case 'users/search': {
      const config = await loadConfig()
      return api.searchUsers(await makeClient(config), msg.query)
    }

    case 'boards/load': {
      const config = await loadConfig()
      return api.getBoards(await makeClient(config), msg.projectKey)
    }

    case 'sprint/current': {
      const config = await loadConfig()
      if (config.primaryBoardId === null) return null
      const c = await makeClient(config)
      const sprint = await api.getActiveSprint(c, config.primaryBoardId)
      if (!sprint) return null
      return {
        name: sprint.name,
        from: sprint.startDate.slice(0, 10),
        to: sprint.endDate.slice(0, 10),
      } satisfies SprintCurrentResult
    }

    case 'events/resolve': {
      const config = await loadConfig()
      const events = config.sprintEvents
      const summaries = events.map((e) => e.matchSummary).filter((x) => x !== '')

      // Không có event nào tra theo tên → không gọi Jira, hành vi y như trước.
      if (summaries.length === 0) {
        return {
          sprintName: '', events: resolveSprintEvents(events, []),
        } satisfies EventsResolveResult
      }

      // Sprint id là KEY của cache, nên không biết board thì không có gì để
      // gắn cache vào — và cũng không biết sprint nào đang mở để tie-break.
      if (config.primaryBoardId === null) {
        return {
          sprintName: '',
          events: resolveSprintEvents(events, [], {
            unavailable: 'chưa chọn board chính trong Options',
          }),
        } satisfies EventsResolveResult
      }

      const c = await makeClient(config)
      const sprints = await api.getActiveSprints(c, config.primaryBoardId)
      if (sprints.length === 0) {
        return {
          sprintName: '',
          events: resolveSprintEvents(events, [], {
            unavailable: 'không có sprint nào đang mở',
          }),
        } satisfies EventsResolveResult
      }

      // Cache theo sprint MUỘN NHẤT: đó là sprint mà tie-break sẽ chọn, và là
      // cái đổi khi rollover xảy ra.
      const newest = [...sprints].sort(
        (a, b) => (Date.parse(b.startDate) || 0) - (Date.parse(a.startDate) || 0),
      )[0]!
      const cacheArgs = {
        sprintId: newest.id, projects: config.projects, matchSummaries: summaries,
      }

      if (!msg.force) {
        const hit = await readCeremonyCache(cacheArgs)
        if (hit) {
          return {
            sprintName: hit.sprintName,
            events: resolveSprintEvents(events, hit.candidates),
          } satisfies EventsResolveResult
        }
      }

      const candidates = await fetchCeremonyCandidates(
        c, sprints, config.projects, summaries,
      )
      try {
        await writeCeremonyCache(cacheArgs, {
          fetchedAt: Date.now(), sprintName: newest.name, candidates,
        })
      } catch (e) {
        // Cache lỗi thì cứ trả dữ liệu tươi — không được biến lỗi storage thành
        // "không tìm thấy ceremony".
        console.warn('[sw] không ghi được cache ceremony', e)
      }
      return {
        sprintName: newest.name,
        events: resolveSprintEvents(events, candidates),
      } satisfies EventsResolveResult
    }

    case 'ceremonies/list': {
      const config = await loadConfig()
      const c = await makeClient(config)
      return await api.searchSprintSubtasks(c, {
        projects: config.projects,
      }) satisfies CeremoniesListResult
    }

    case 'coverage/load': {
      const config = await loadConfig()
      const cached = await readSnapshot(msg.scope)

      // Snapshot còn tươi và không bị buộc refresh → trả ngay, không gọi Jira.
      if (cached && !cached.stale && !msg.force) {
        return {
          worklogs: cached.snapshot.worklogs,
          // Snapshot cache từ trước tính năng cha/con không có meta → rỗng, và
          // UI vẽ y như bảng cũ thay vì vỡ.
          meta: snapshotMeta(cached.snapshot),
          fetchedAt: cached.snapshot.fetchedAt,
          stale: false,
        } satisfies CoverageLoadResult
      }

      let fresh: { worklogs: Worklog[]; meta: IssueMetaMap }
      try {
        const c = await makeClient(config)
        fresh = await fetchWorklogs(
          c, config.projects, msg.scope.accountIds, msg.scope.from, msg.scope.to,
        )
      } catch (e) {
        // Jira lỗi nhưng có snapshot cũ: trả snapshot cũ và đánh dấu stale.
        // UI hiện timestamp. Không bao giờ trả rỗng như thể team chưa log.
        if (cached) {
          return {
            worklogs: cached.snapshot.worklogs,
            meta: snapshotMeta(cached.snapshot),
            fetchedAt: cached.snapshot.fetchedAt,
            stale: true,
          } satisfies CoverageLoadResult
        }
        throw e
      }

      // Ghi cache NGOÀI try của Jira: nếu writeSnapshot nằm trong đó, một lỗi
      // quota storage sẽ bị báo là "Jira lỗi" và dữ liệu vừa fetch bị bỏ đi để
      // trả về snapshot cũ hơn. Cache lỗi thì cứ trả dữ liệu tươi.
      const now = Date.now()
      try {
        await writeSnapshot(msg.scope, fresh.worklogs, now, fresh.meta)
        await pruneSnapshots()
      } catch (e) {
        console.warn('[sw] không ghi được snapshot', e)
      }
      return {
        worklogs: fresh.worklogs, meta: fresh.meta, fetchedAt: now, stale: false,
      } satisfies CoverageLoadResult
    }

    case 'points/load': {
      const config = await loadConfig()
      if (config.primaryBoardId === null) {
        throw new Error('Chưa chọn board chính — mở Options')
      }
      const c = await makeClient(config)
      const sprint = await api.getActiveSprint(c, config.primaryBoardId)
      if (!sprint) {
        return { sprintName: '', issues: [], meta: {} } satisfies PointsLoadResult
      }
      const { issues, meta } = await api.getSprintIssues(
        c, sprint.id, config.storyPointsFieldId,
      )
      return { sprintName: sprint.name, issues, meta } satisfies PointsLoadResult
    }

    case 'dashboard/open': {
      await chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/dashboard/index.html') })
      return null
    }

    default: {
      // Thêm một variant vào Message mà quên handler thì trước đây handle() trả
      // undefined và UI sập ở chỗ đọc property. Fail to, fail ở đây.
      const unknown: never = msg
      throw new Error(`Message type không có handler: ${JSON.stringify(unknown)}`)
    }
  }
}
