// src/ui/dashboard/Dashboard.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { send, type CoverageLoadResult, type SprintCurrentResult } from '@/sw/messages'
import type { Config } from '@/core/config-schema'
import type { Worklog } from '@/core/coverage'
import type { IssueMetaMap } from '@/core/issue-hierarchy'
import { buildCoverage, enumerateDates } from '@/core/coverage'
import { todayInZone, addDays } from '@/core/jiraTime'
import type { Scope } from '@/core/snapshot-key'
import { Banner } from '@/ui/shared/Banner'
import { Button } from '@/ui/shared/Button'
import { Card } from '@/ui/shared/Card'
import { SegmentedControl } from '@/ui/shared/SegmentedControl'
import { ErrorBanner, toUiError, type UiError } from '@/ui/shared/errors'
import { rangeLabel } from '@/ui/shared/format'
import { GearIcon } from '@/ui/shared/icons'
import { UpdateBanner } from '@/ui/shared/UpdateBanner'
import { colors, fontSize, space } from '@/ui/shared/theme'
import { FilterBar, type Preset } from './FilterBar'
import { CoverageSummary } from './CoverageSummary'
import { CoverageTable } from './CoverageTable'
import { CellDetail } from './CellDetail'
import { PointsPanel } from './PointsTable'

type Tab = 'coverage' | 'points'

export function Dashboard() {
  const [config, setConfig] = useState<Config | null>(null)
  const [tab, setTab] = useState<Tab>('coverage')
  const [today, setToday] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [preset, setPreset] = useState<Preset>('thisWeek')
  // '' = tất cả project. `config.projects` KHÔNG còn là cổng chặn dữ liệu (query
  // không lọc theo project nữa) — nó chỉ là gợi ý cho ô lọc này, và mặc định
  // vẫn là "tất cả": một worklog trên project khác phải được ĐẾM, không bị ẩn.
  const [project, setProject] = useState('')
  const [sprintRange, setSprintRange] = useState<SprintCurrentResult>(null)
  // null = CHƯA từng có dữ liệu. Phân biệt với [] (Jira trả về rỗng thật) là
  // bắt buộc: nếu load đầu tiên lỗi mà ta vẫn render bảng với [], cả team bị
  // tô đỏ "không log giờ nào" — spec §9/§13 cấm tuyệt đối.
  const [worklogs, setWorklogs] = useState<Worklog[] | null>(null)
  // Metadata issue đi CẠNH worklogs (xem core/issue-hierarchy). Snapshot cache
  // từ trước tính năng này trả về map rỗng — bảng khi đó vẽ phẳng như bản cũ.
  const [issueMeta, setIssueMeta] = useState<IssueMetaMap>({})
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<UiError | null>(null)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<{ accountId: string; date: string } | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const c = await send<Config>({ type: 'config/load' })
        setConfig(c)
        const t = todayInZone(c.timeZone, new Date())
        setToday(t)
        const sprint = await send<SprintCurrentResult>({ type: 'sprint/current' }).catch(() => null)
        setSprintRange(sprint)
        if (sprint) { setFrom(sprint.from); setTo(sprint.to); setPreset('sprint') }
        else { setFrom(addDays(t, -6)); setTo(t); setPreset('custom') }
      } catch (e) { setError(toUiError(e)) }
    })()
  }, [])

  // Bốn nút preset + hai input date (fire mỗi lần gõ) tạo ra nhiều
  // coverage/load chồng nhau. Không đánh số thì response của range đã bị thay
  // thế mà về sau cùng sẽ thắng — bảng hiện số của range khác với range đang
  // chọn, đúng thứ mà lead sẽ hành động theo.
  const generation = useRef(0)

  const load = useCallback(async (scope: Scope, force: boolean) => {
    const gen = (generation.current += 1)
    setLoading(true)
    try {
      const res = await send<CoverageLoadResult>({ type: 'coverage/load', scope, force })
      if (gen !== generation.current) return
      setWorklogs(res.worklogs)
      setIssueMeta(res.meta ?? {})
      setFetchedAt(res.fetchedAt)
      setStale(res.stale)
      setError(null)
    } catch (e) {
      if (gen !== generation.current) return
      setError(toUiError(e))
    } finally {
      if (gen === generation.current) setLoading(false)
    }
  }, [])

  // Chỉ những field này định nghĩa phạm vi fetch. Đưa cả `config` vào deps sẽ
  // khiến mọi thay đổi local (ví dụ ngày nghỉ) kích một lần fetch vô ích —
  // `config/save` trả về `config` với projects/members là mảng mới mỗi lần,
  // nên phải so theo nội dung (join) chứ không theo tham chiếu mảng.
  // `projects` KHÔNG còn trong scope: phạm vi fetch là tác giả + khoảng ngày,
  // nên đổi danh sách project trong Options không còn kích một lần fetch nào.
  const accountIdsKey = config?.members.map((m) => m.accountId).join(',') ?? ''
  const scope = useMemo<Scope | null>(
    () => config ? { from, to, accountIds: config.members.map((m) => m.accountId) } : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountIdsKey, from, to],
  )

  useEffect(() => {
    if (!scope || from === '' || to === '') return
    void load(scope, false)
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

  // Container chung cho mọi trạng thái của trang: max-width + padding, để nội
  // dung không dính vào cạnh viewport như bản cũ.
  const page = (children: ReactNode) => (
    <div style={{
      maxWidth: 1440, margin: '0 auto',
      padding: `${space.x5}px ${space.x5}px ${space.x6}px`,
      display: 'grid', gap: space.x4, minWidth: 0,
    }}>
      {children}
    </div>
  )

  if (!config) {
    return page(
      <>
        <SettingsHeader />
        {error
          ? <ErrorBanner error={error} />
          : <p style={{ color: colors.muted, margin: 0 }}>Đang tải…</p>}
      </>,
    )
  }
  if (config.members.length === 0) {
    return page(
      <>
        <SettingsHeader />
        <Banner kind="info" action={{ label: 'Mở Options', onClick: () => chrome.runtime.openOptionsPage() }}>
          Chưa chọn member nào để theo dõi.
        </Banner>
      </>,
    )
  }

  const dates = enumerateDates(from, to)

  // Các project CÓ MẶT trong dữ liệu, hợp với danh sách đã cấu hình. Lấy từ
  // `meta` (project key thật của Jira), không cắt tiền tố issue key.
  const projectOptions = [...new Set([
    ...config.projects,
    ...Object.values(issueMeta).map((m) => m.projectKey).filter((p): p is string => p !== null),
  ])].sort()

  // Thu hẹp theo project là phép lọc SAU khi fetch. Worklog không có meta (mọi
  // snapshot cũ) không thuộc project nào biết được, nên nó chỉ bị ẩn khi lead
  // chủ động chọn một project — mặc định "tất cả" thì nó vẫn được đếm.
  const shown = project === ''
    ? worklogs
    : (worklogs ?? []).filter((w) => issueMeta[w.issueKey]?.projectKey === project)

  // Chỉ dựng bảng khi đã có dữ liệu thật.
  // `today` lấy từ state đã tính bằng todayInZone(config.timeZone, …) ở lần
  // load đầu — cùng một giá trị mà các preset ngày dùng, không tính lần thứ
  // hai và tuyệt đối không lấy ngày của browser. '' = chưa có config → truyền
  // undefined để core giữ hành vi "cả khoảng".
  const table = shown === null ? null : buildCoverage({
    worklogs: shown,
    members: config.members,
    dates,
    daysOff: config.daysOff,
    ...(today === '' ? {} : { today }),
  })

  const detailMember = detail ? config.members.find((m) => m.accountId === detail.accountId) : null

  return page(
    <>
      {/* Page header — bản cũ không có tiêu đề nào, chỉ mấy cái nút trần ở góc. */}
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: space.x3, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: fontSize.xxl, fontWeight: 700 }}>Worklog team</h1>
          <p style={{ margin: '2px 0 0', color: colors.muted, fontSize: fontSize.md }}>
            {sprintRange ? sprintRange.name : 'Khoảng tự chọn'}
            {rangeLabel(from, to) === '' ? '' : ` · ${rangeLabel(from, to)}`}
            {` · ${config.members.length} member`}
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: space.x3 }}>
          <SegmentedControl<Tab>
            label="Tab dashboard"
            items={[
              { value: 'coverage', label: 'Coverage' },
              { value: 'points', label: 'Story points vs giờ' },
            ]}
            value={tab}
            onChange={setTab}
          />
          {/* Ghost + icon-only, đặt sau tab switcher: đọc ra là chrome phụ chứ
              không cạnh tranh với control chính của trang. */}
          <SettingsButton />
        </div>
      </header>

      <UpdateBanner />

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      {tab === 'coverage' && (
        <>
          <Card title="Bộ lọc">
            <FilterBar
              from={from} to={to} preset={preset} sprintRange={sprintRange} today={today}
              projectOptions={projectOptions} project={project} onProjectChange={setProject}
              onChange={(f, t, p) => { setFrom(f); setTo(t); setPreset(p) }}
              onRefresh={() => scope && void load(scope, true)}
              fetchedAt={fetchedAt} stale={stale} loading={loading}
            />
          </Card>

          {/* stale chỉ có nghĩa khi đã có số để hiện — khi đó những số đó là
              thật, chỉ là cũ. */}
          {stale && table && (
            <Banner kind="warn">
              Không lấy được dữ liệu mới từ Jira — đang hiện snapshot cũ.
            </Banner>
          )}

          {table === null ? (
            <Card>
              <p style={{ margin: 0, color: colors.muted }}>
                {error
                  ? 'Chưa có dữ liệu nào để hiện — xử lý lỗi ở trên rồi bấm "Làm mới".'
                  : 'Đang tải dữ liệu…'}
              </p>
            </Card>
          ) : (
            <>
              <Card title="Tóm tắt">
                <CoverageSummary data={table} />
              </Card>
              <Card flush>
                <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .12s ease' }}>
                  <CoverageTable
                    data={table}
                    meta={issueMeta}
                    daysOff={config.daysOff}
                    onCellClick={(accountId, date) => setDetail({ accountId, date })}
                    onToggleDayOff={(a, d) => void toggleDayOff(a, d)}
                  />
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {tab === 'points' && <PointsPanel />}

      {detail && detailMember && (
        <CellDetail
          memberName={detailMember.displayName}
          date={detail.date}
          dayOff={(config.daysOff[detail.accountId] ?? []).includes(detail.date)}
          onToggleDayOff={() => void toggleDayOff(detail.accountId, detail.date)}
          worklogs={(shown ?? []).filter(
            (w) => w.authorAccountId === detail.accountId && w.date === detail.date,
          )}
          onClose={() => setDetail(null)}
        />
      )}
    </>,
  )
}

// Lối vào Options LUÔN hiện, không phụ thuộc config/lỗi/member rỗng — trước
// đây chỉ có bên trong banner lỗi và banner "chưa chọn member", nên cả hai
// biến mất là hết đường quay lại Options. Ghost + icon-only để đọc ra là
// chrome phụ, không cạnh tranh với "Coverage"/"Story points".
function SettingsButton() {
  return (
    <Button
      variant="ghost" iconOnly aria-label="Cấu hình" title="Cấu hình"
      onClick={() => chrome.runtime.openOptionsPage()}
    >
      <GearIcon />
    </Button>
  )
}

// Dùng cho các trạng thái chưa có <header> đầy đủ (đang tải / lỗi / chưa
// chọn member) — đặt riêng một hàng ở góc phải trang.
function SettingsHeader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <SettingsButton />
    </div>
  )
}
