import { loadConfig, saveConfig } from '@/store/config'
import { readSnapshot, writeSnapshot } from '@/store/snapshot'
import { createClient, type JiraClient } from '@/jira/client'
import { cookieAuth, tokenAuth } from '@/jira/auth'
import * as api from '@/jira/endpoints'
import { formatStarted, offsetMinutesForZone } from '@/core/jiraTime'
import type { Config } from '@/core/config-schema'
import type { Worklog } from '@/core/coverage'
import type {
  Message, AuthProbeResult, DayLoadResult, CoverageLoadResult,
  PointsLoadResult, SprintCurrentResult,
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
async function fetchWorklogs(
  c: JiraClient, config: Config, accountIds: string[], from: string, to: string,
): Promise<Worklog[]> {
  const issues = await api.searchIssuesWithWorklogs(c, {
    projects: config.projects, accountIds, from, to,
  })
  const perIssue = await Promise.all(
    issues.map((i) => api.getIssueWorklogs(c, i.key, i.summary)),
  )
  const wanted = new Set(accountIds)
  return perIssue
    .flat()
    .filter((w) => wanted.has(w.authorAccountId) && w.date >= from && w.date <= to)
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
      const c = await makeClient(config)
      const worklogs = await fetchWorklogs(
        c, config, [config.myAccountId], msg.date, msg.date,
      )
      return { worklogs } satisfies DayLoadResult
    }

    case 'worklog/add': {
      const config = await loadConfig()
      const c = await makeClient(config)
      const offset = offsetMinutesForZone(config.timeZone, msg.date)
      const startedIso = formatStarted(msg.date, msg.startMinutes, offset)
      return api.addWorklog(c, {
        issueKey: msg.issueKey,
        startedIso,
        timeSpentSeconds: msg.timeSpentSeconds,
        comment: msg.comment,
      })
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

    case 'coverage/load': {
      const config = await loadConfig()
      const cached = await readSnapshot(msg.scope)

      // Snapshot còn tươi và không bị buộc refresh → trả ngay, không gọi Jira.
      if (cached && !cached.stale && !msg.force) {
        return {
          worklogs: cached.snapshot.worklogs,
          fetchedAt: cached.snapshot.fetchedAt,
          stale: false,
        } satisfies CoverageLoadResult
      }

      try {
        const c = await makeClient(config)
        const worklogs = await fetchWorklogs(
          c, config, msg.scope.accountIds, msg.scope.from, msg.scope.to,
        )
        const now = Date.now()
        await writeSnapshot(msg.scope, worklogs, now)
        return { worklogs, fetchedAt: now, stale: false } satisfies CoverageLoadResult
      } catch (e) {
        // Jira lỗi nhưng có snapshot cũ: trả snapshot cũ và đánh dấu stale.
        // UI hiện timestamp. Không bao giờ trả rỗng như thể team chưa log.
        if (cached) {
          return {
            worklogs: cached.snapshot.worklogs,
            fetchedAt: cached.snapshot.fetchedAt,
            stale: true,
          } satisfies CoverageLoadResult
        }
        throw e
      }
    }

    case 'points/load': {
      const config = await loadConfig()
      if (config.primaryBoardId === null) {
        throw new Error('Chưa chọn board chính — mở Options')
      }
      const c = await makeClient(config)
      const sprint = await api.getActiveSprint(c, config.primaryBoardId)
      if (!sprint) return { sprintName: '', issues: [] } satisfies PointsLoadResult
      const issues = await api.getSprintIssues(c, sprint.id, config.storyPointsFieldId)
      return { sprintName: sprint.name, issues } satisfies PointsLoadResult
    }

    case 'dashboard/open': {
      await chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/dashboard/index.html') })
      return null
    }
  }
}
