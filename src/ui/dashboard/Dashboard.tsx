// src/ui/dashboard/Dashboard.tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { send, type CoverageLoadResult, type SprintCurrentResult } from '@/sw/messages'
import type { Config } from '@/core/config-schema'
import type { Worklog } from '@/core/coverage'
import { buildCoverage, enumerateDates } from '@/core/coverage'
import { todayInZone, addDays } from '@/core/jiraTime'
import type { Scope } from '@/core/snapshot-key'
import { Banner } from '@/ui/shared/Banner'
import { FilterBar, type Preset } from './FilterBar'
import { CoverageTable } from './CoverageTable'
import { CellDetail } from './CellDetail'
import { PointsPanel } from './PointsTable'

export function Dashboard() {
  const [config, setConfig] = useState<Config | null>(null)
  const [tab, setTab] = useState<'coverage' | 'points'>('coverage')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [preset, setPreset] = useState<Preset>('thisWeek')
  const [sprintRange, setSprintRange] = useState<SprintCurrentResult>(null)
  const [worklogs, setWorklogs] = useState<Worklog[]>([])
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<{ accountId: string; date: string } | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const c = await send<Config>({ type: 'config/load' })
        setConfig(c)
        const today = todayInZone(c.timeZone, new Date())
        const sprint = await send<SprintCurrentResult>({ type: 'sprint/current' }).catch(() => null)
        setSprintRange(sprint)
        if (sprint) { setFrom(sprint.from); setTo(sprint.to); setPreset('sprint') }
        else { setFrom(addDays(today, -6)); setTo(today); setPreset('custom') }
      } catch (e) { setError((e as Error).message) }
    })()
  }, [])

  const load = useCallback(async (c: Config, scope: Scope, force: boolean) => {
    setLoading(true)
    try {
      const res = await send<CoverageLoadResult>({ type: 'coverage/load', scope, force })
      setWorklogs(res.worklogs)
      setFetchedAt(res.fetchedAt)
      setStale(res.stale)
      setError(null)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  // Chỉ những field này định nghĩa phạm vi fetch. Đưa cả `config` vào deps sẽ
  // khiến mọi thay đổi local (ví dụ ngày nghỉ) kích một lần fetch vô ích —
  // `config/save` trả về `config` với projects/members là mảng mới mỗi lần,
  // nên phải so theo nội dung (join) chứ không theo tham chiếu mảng.
  const projectsKey = config?.projects.join(',') ?? ''
  const accountIdsKey = config?.members.map((m) => m.accountId).join(',') ?? ''
  const scope = useMemo<Scope | null>(
    () => config ? { projects: config.projects, from, to, accountIds: config.members.map((m) => m.accountId) } : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectsKey, accountIdsKey, from, to],
  )

  useEffect(() => {
    if (!config || !scope || from === '' || to === '') return
    void load(config, scope, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, load])

  const toggleDayOff = async (accountId: string, date: string) => {
    if (!config) return
    const current = config.daysOff[accountId] ?? []
    const next = current.includes(date)
      ? current.filter((d) => d !== date)
      : [...current, date]
    setConfig(await send<Config>({
      type: 'config/save',
      patch: { daysOff: { ...config.daysOff, [accountId]: next } },
    }))
  }

  if (!config) return <div style={{ padding: 16 }}>Đang tải…</div>
  if (config.members.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <Banner kind="info" action={{ label: 'Mở Options', onClick: () => chrome.runtime.openOptionsPage() }}>
          Chưa chọn member nào để theo dõi.
        </Banner>
      </div>
    )
  }

  const dates = enumerateDates(from, to)
  const table = buildCoverage({
    worklogs,
    members: config.members,
    dates,
    daysOff: config.daysOff,
  })

  const detailMember = detail ? config.members.find((m) => m.accountId === detail.accountId) : null

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <button onClick={() => setTab('coverage')} disabled={tab === 'coverage'}>Coverage</button>
        <button onClick={() => setTab('points')} disabled={tab === 'points'}>Story points vs giờ</button>
      </div>

      {error && <Banner kind="error" action={{ label: 'Ẩn', onClick: () => setError(null) }}>{error}</Banner>}

      {tab === 'coverage' && (
        <>
          <FilterBar
            from={from} to={to} preset={preset} sprintRange={sprintRange}
            onChange={(f, t, p) => { setFrom(f); setTo(t); setPreset(p) }}
            onRefresh={() => scope && void load(config, scope, true)}
            fetchedAt={fetchedAt} stale={stale}
          />
          {stale && (
            <div style={{ margin: '8px 0' }}>
              <Banner kind="warn">
                Không lấy được dữ liệu mới từ Jira — đang hiện snapshot cũ.
              </Banner>
            </div>
          )}
          <div style={{ marginTop: 10, opacity: loading ? 0.6 : 1 }}>
            <CoverageTable
              data={table}
              onCellClick={(accountId, date) => setDetail({ accountId, date })}
              onToggleDayOff={(a, d) => void toggleDayOff(a, d)}
            />
          </div>
        </>
      )}

      {tab === 'points' && <PointsPanel />}

      {detail && detailMember && (
        <CellDetail
          memberName={detailMember.displayName}
          date={detail.date}
          worklogs={worklogs.filter(
            (w) => w.authorAccountId === detail.accountId && w.date === detail.date,
          )}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
