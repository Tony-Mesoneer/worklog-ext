import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { send, type AuthProbeResult, type CeremoniesListResult } from '@/sw/messages'
import type { Config, ConfigMember, SprintEvent } from '@/core/config-schema'
import {
  buildCeremonyOptions, summaryCounts, type CeremonyOption,
} from '@/core/ceremony-options'
import { normalizeSummary } from '@/core/event-resolve'
import { Banner } from '@/ui/shared/Banner'
import { Button } from '@/ui/shared/Button'
import { Card } from '@/ui/shared/Card'
import { toUiError } from '@/ui/shared/errors'
import { colors, fontSize, radii, space } from '@/ui/shared/theme'
import { useUpdate } from '@/ui/shared/useUpdate'
import { intlLocale, useLocale, useT } from '@/ui/shared/LocaleProvider'
import { LOCALES, type Locale } from '@/i18n'
import { isRepoSlug } from '@/core/version'
import { ext } from '@/platform/ext'

// Dòng giải thích dưới tiêu đề section — cùng một kiểu ở cả sáu khối.
function Hint({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: fontSize.md, color: colors.muted, lineHeight: 1.5 }}>
      {children}
    </p>
  )
}

export function Options() {
  const t = useT()
  const [config, setConfig] = useState<Config | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [probe, setProbe] = useState<AuthProbeResult | null>(null)
  const [urlDraft, setUrlDraft] = useState('')
  // Khối token mở khi probe fail (spec §4: "Nếu fail thì hiện form nhập
  // token"), và mở được bằng tay cho người đã biết mình cần token.
  const [showToken, setShowToken] = useState(false)
  const urlId = useId()

  const report = (e: unknown) => {
    const ui = toUiError(e)
    if (ui.auth) setShowToken(true)
    setError(ui.auth ? t.options.authHint : ui.message)
  }

  useEffect(() => {
    send<Config>({ type: 'config/load' })
      .then((c) => { setConfig(c); setUrlDraft(c.jiraBaseUrl); if (c.authMode === 'token') setShowToken(true) })
      .catch(report)
  }, [])

  const save = async (patch: Partial<Config>) => {
    try {
      setConfig(await send<Config>({ type: 'config/save', patch }))
      setError(null)
    } catch (e) { report(e) }
  }

  // Probe dùng lại sau khi lưu token, để người dùng biết ngay token có chạy hay
  // không thay vì phải mò ở side panel.
  const probeAuth = async () => {
    try {
      setProbe(await send<AuthProbeResult>({ type: 'auth/probe' }))
      setError(null)
      return true
    } catch (e) {
      setProbe(null)
      // Bất kỳ lỗi probe nào (không chỉ 401) đều mở khối token: cookie session
      // không dùng được thì token là đường còn lại.
      setShowToken(true)
      const ui = toUiError(e)
      setError(ui.auth
        ? t.options.authHint
        : t.options.jira.probeFailed(ui.message))
      return false
    }
  }

  const connect = async () => {
    setError(null)
    try {
      const url = new URL(urlDraft)
      const granted = await send<boolean>({
        type: 'permission/request', origin: `${url.origin}/*`,
      })
      if (!granted) { setError('Bạn đã từ chối quyền truy cập Jira'); return }
      await save({ jiraBaseUrl: url.origin })
      await probeAuth()
    } catch (e) { report(e) }
  }

  if (!config) {
    return (
      <div style={{ padding: space.x5, color: colors.muted }}>Đang tải…</div>
    )
  }

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzMismatch = config.timeZone !== 'UTC' && config.timeZone !== browserTz

  return (
    <div style={{
      maxWidth: 860, margin: '0 auto',
      padding: `${space.x5}px ${space.x5}px ${space.x6}px`,
      display: 'grid', gap: space.x4, minWidth: 0,
    }}>
      <header>
        <h1 style={{ fontSize: fontSize.xxl, margin: 0, fontWeight: 700 }}>{t.options.pageTitle}</h1>
        <p style={{ margin: '2px 0 0', color: colors.muted }}>{t.options.pageSubtitle}</p>
      </header>

      {error && <Banner kind="error">{error}</Banner>}

      {tzMismatch && (
        <Banner kind="warn">{t.options.tzMismatch(config.timeZone, browserTz)}</Banner>
      )}

      <Card title={t.options.jira.title}>
        <div style={{ display: 'grid', gap: space.x2 }}>
          <div className="wl-field">
            <label className="wl-field__label" htmlFor={urlId}>{t.options.jira.urlLabel}</label>
            <div style={{ display: 'flex', gap: space.x2, flexWrap: 'wrap' }}>
              <input
                id={urlId}
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://your-site.atlassian.net"
                style={{ flex: '1 1 240px', minWidth: 0 }}
              />
              <Button variant="primary" onClick={connect}>{t.common.connect}</Button>
            </div>
          </div>
          {probe && (
            <p style={{ fontSize: fontSize.md, color: colors.success, margin: 0 }}>
              {t.options.jira.connected(probe.displayName, probe.timeZone, probe.mode)}
            </p>
          )}
        </div>
      </Card>

      <TokenSection
        config={config} save={save} probeAuth={probeAuth}
        open={showToken} setOpen={setShowToken}
      />

      {/* Khối 2–5 theo cùng mẫu: đọc từ `config`, ghi bằng `save({...})`.
          Mỗi thay đổi lưu ngay — không có nút Save toàn trang. */}
      <ProjectsSection config={config} save={save} />
      <BoardSection config={config} save={save} />
      <MembersSection config={config} save={save} setError={setError} />
      <EventsSection config={config} save={save} />
      <UpdateSection config={config} save={save} />
      <LanguageSection config={config} save={save} />
    </div>
  )
}

type SectionProps = { config: Config; save: (p: Partial<Config>) => Promise<void> }

// Đường dự phòng theo spec §4: session Jira hết hạn giữa lúc dùng, người dùng
// đăng nhập Jira ở profile Chrome khác, hoặc instance bật XSRF khắt khe hơn.
//
// Thu gọn thành một dòng dưới khối Jira: phần lớn người dùng dùng session,
// không bao giờ cần mở khối này. Không đánh số như các khối chính — nó là
// phụ lục của "1. Jira", không phải một bước cấu hình riêng.
// Vẫn PHẢI tự mở khi probe fail hoặc authMode === 'token' (xem `open` do
// Options truyền xuống) — đó là đường dự phòng duy nhất khi session hết hạn.
function TokenSection({ config, save, probeAuth, open, setOpen }: SectionProps & {
  probeAuth: () => Promise<boolean>
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [busy, setBusy] = useState(false)
  const emailId = useId()
  const tokenId = useId()

  const saved = config.authMode === 'token' && config.token !== undefined

  const submit = async () => {
    setBusy(true)
    try {
      await save({ authMode: 'token', token: { email: email.trim(), apiToken: apiToken.trim() } })
      // Xoá draft ngay sau khi lưu: token không nằm lại trong DOM.
      setApiToken('')
      await probeAuth()
    } finally { setBusy(false) }
  }

  const clear = async () => {
    setBusy(true)
    try {
      setApiToken('')
      await save({ authMode: 'cookie', token: undefined })
    } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {/* Email không phải bí mật (khác API token) — hiện được để người dùng
              biết mình đang ở chế độ nào mà không cần mở form. */}
          {saved
            ? t.options.token.toggleSaved(config.token?.email ?? '')
            : t.options.token.toggleNew}
        </Button>
      </div>
    )
  }

  return (
    <Card title={t.options.token.title}>
      <div style={{ display: 'grid', gap: space.x3 }}>
        <Hint>{t.options.token.hint}</Hint>
        {saved && (
          <p style={{ fontSize: fontSize.md, color: colors.success, margin: 0 }}>
            {t.options.token.saved(config.token?.email ?? '')}
          </p>
        )}
        <div style={{ display: 'grid', gap: space.x2, maxWidth: 480 }}>
          <div className="wl-field">
            <label className="wl-field__label" htmlFor={emailId}>{t.options.token.emailLabel}</label>
            <input
              id={emailId}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.options.token.emailPlaceholder}
              autoComplete="off"
            />
          </div>
          {/* KHÔNG bao giờ đổ token đã lưu ra lại input, và không bao giờ log. */}
          <div className="wl-field">
            <label className="wl-field__label" htmlFor={tokenId}>{t.options.token.tokenLabel}</label>
            <input
              id={tokenId}
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={saved ? t.options.token.tokenPlaceholderReplace : t.options.token.tokenPlaceholder}
              autoComplete="off"
            />
          </div>
          <div style={{ display: 'flex', gap: space.x2, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => void submit()}
              disabled={email.trim() === '' || apiToken.trim() === ''}
            >
              {t.options.token.submit}
            </Button>
            {saved && (
              <Button variant="danger" onClick={() => void clear()} disabled={busy}>
                {t.options.token.clear}
              </Button>
            )}
            <Button variant="ghost" onClick={() => { setApiToken(''); setOpen(false) }} disabled={busy}>
              {t.common.close}
            </Button>
          </div>
          <Hint>{t.options.token.createHint}</Hint>
        </div>
      </div>
    </Card>
  )
}

function ProjectsSection({ config, save }: SectionProps) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const fieldId = useId()

  const add = () => {
    const key = draft.trim().toUpperCase()
    if (key === '' || config.projects.includes(key)) { setDraft(''); return }
    void save({ projects: [...config.projects, key] })
    setDraft('')
  }

  const remove = (key: string) => {
    void save({ projects: config.projects.filter((p) => p !== key) })
  }

  return (
    <Card title={t.options.projects.title}>
      <div style={{ display: 'grid', gap: space.x3 }}>
        <div className="wl-field">
          <label className="wl-field__label" htmlFor={fieldId}>{t.options.projects.keyLabel}</label>
          <div style={{ display: 'flex', gap: space.x2, flexWrap: 'wrap' }}>
            <input
              id={fieldId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add() }}
              placeholder={t.options.projects.keyPlaceholder}
              style={{ flex: '1 1 200px', minWidth: 0 }}
            />
            <Button variant="primary" onClick={add} disabled={draft.trim() === ''}>{t.common.add}</Button>
          </div>
        </div>
        {config.projects.length === 0 ? (
          <Hint>{t.options.projects.empty}</Hint>
        ) : (
          <div style={{ display: 'flex', gap: space.x2, flexWrap: 'wrap' }}>
            {config.projects.map((p) => (
              <span key={p} style={{
                background: colors.surfaceAlt, border: `1px solid ${colors.border}`,
                borderRadius: radii.pill, padding: `2px 4px 2px ${space.x3}px`,
                fontSize: fontSize.md, display: 'inline-flex', gap: space.x1, alignItems: 'center',
              }}>
                {p}
                <Button
                  variant="ghost" size="sm" iconOnly
                  aria-label={t.options.projects.removeAria(p)}
                  onClick={() => remove(p)}
                  style={{ width: 22, height: 22, borderRadius: radii.pill }}
                >
                  ×
                </Button>
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function BoardSection({ config, save }: SectionProps) {
  const t = useT()
  const [boards, setBoards] = useState<{ id: number; name: string }[]>([])
  // Fetch fail mà chỉ để list rỗng thì người dùng thấy dropdown trống, không
  // chọn được gì, rồi sau đó gặp "Chưa chọn board chính" ở tab points mà không
  // hiểu vì sao. Phải nói ra lỗi tại đây.
  const [boardsError, setBoardsError] = useState<string | null>(null)
  const projectKey = config.projects[0]
  const selectId = useId()

  useEffect(() => {
    if (!projectKey) { setBoards([]); setBoardsError(null); return }
    let cancelled = false
    send<{ id: number; name: string }[]>({ type: 'boards/load', projectKey })
      .then((bs) => { if (!cancelled) { setBoards(bs); setBoardsError(null) } })
      .catch((e: unknown) => {
        if (cancelled) return
        setBoards([])
        setBoardsError(toUiError(e).message)
      })
    return () => { cancelled = true }
  }, [projectKey])

  return (
    <Card title={t.options.board.title}>
      <div style={{ display: 'grid', gap: space.x3 }}>
        <Hint>{t.options.board.hint}</Hint>
        {!projectKey ? (
          <Hint>{t.options.board.needProject}</Hint>
        ) : boardsError !== null ? (
          <Banner kind="error">{t.options.board.loadError(projectKey, boardsError)}</Banner>
        ) : (
          <div className="wl-field" style={{ maxWidth: 320 }}>
            <label className="wl-field__label" htmlFor={selectId}>{t.options.board.label}</label>
            <select
              id={selectId}
              value={config.primaryBoardId ?? ''}
              onChange={(e) => void save({ primaryBoardId: Number(e.target.value) })}
            >
              <option value="" disabled>{t.options.board.choose}</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Card>
  )
}

function MembersSection({ config, save, setError }: SectionProps & {
  setError: (e: string | null) => void
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ accountId: string; displayName: string }[]>([])
  const [searching, setSearching] = useState(false)
  const fieldId = useId()

  const search = async () => {
    setSearching(true)
    try {
      setFound(await send<{ accountId: string; displayName: string }[]>({
        type: 'users/search', query,
      }))
      setError(null)
    } catch (e) { setError((e as Error).message) } finally { setSearching(false) }
  }

  const add = (u: { accountId: string; displayName: string }) => {
    if (config.members.some((m) => m.accountId === u.accountId)) return
    const member: ConfigMember = { ...u, hoursPerDay: 8, active: true }
    void save({ members: [...config.members, member] })
  }

  const update = (accountId: string, patch: Partial<ConfigMember>) => {
    void save({
      members: config.members.map((m) => (m.accountId === accountId ? { ...m, ...patch } : m)),
    })
  }

  return (
    <Card title={t.options.members.title}>
      <div style={{ display: 'grid', gap: space.x3 }}>
        <div className="wl-field">
          <label className="wl-field__label" htmlFor={fieldId}>{t.options.members.searchLabel}</label>
          <div style={{ display: 'flex', gap: space.x2, flexWrap: 'wrap' }}>
            <input
              id={fieldId} value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void search() }}
              placeholder={t.options.members.searchPlaceholder}
              style={{ flex: '1 1 200px', minWidth: 0 }}
            />
            <Button variant="primary" loading={searching} onClick={() => void search()}>{t.common.search}</Button>
          </div>
        </div>

        {found.length > 0 && (
          <ul className="wl-list">
            {found.map((u) => (
              <li key={u.accountId} style={{
                display: 'flex', gap: space.x2, alignItems: 'center',
                padding: `${space.x1}px 0`,
              }}>
                <span style={{ flex: 1, minWidth: 0 }}>{u.displayName}</span>
                <Button size="sm" onClick={() => add(u)}>{t.common.add}</Button>
              </li>
            ))}
          </ul>
        )}

        {config.members.length === 0 ? (
          <Hint>{t.options.members.empty}</Hint>
        ) : (
          <div className="wl-table-scroll">
            <table className="wl-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left' }}>{t.options.members.colMember}</th>
                  <th scope="col">{t.options.members.colHoursPerDay}</th>
                  <th scope="col">{t.options.members.colActive}</th>
                  <th scope="col"><span style={{ visibility: 'hidden' }}>{t.common.remove}</span></th>
                </tr>
              </thead>
              <tbody>
                {config.members.map((m) => (
                  <tr key={m.accountId}>
                    <th scope="row">{m.displayName}</th>
                    <td>
                      <input
                        type="number" min={0} max={24} value={m.hoursPerDay} style={{ width: 64 }}
                        aria-label={t.options.members.hoursAria(m.displayName)}
                        onChange={(e) => update(m.accountId, { hoursPerDay: Number(e.target.value) })}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox" checked={m.active}
                        aria-label={t.options.members.activeAria(m.displayName)}
                        onChange={(e) => update(m.accountId, { active: e.target.checked })}
                      />
                    </td>
                    <td>
                      <Button
                        variant="danger" size="sm"
                        aria-label={t.options.members.removeAria(m.displayName)}
                        onClick={() => void save({
                          members: config.members.filter((x) => x.accountId !== m.accountId),
                        })}
                      >
                        {t.common.remove}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  )
}

const EMPTY_EVENT_DRAFT: SprintEvent = {
  name: '', issueKey: '', matchSummary: '', defaultMinutes: 15, comment: '',
}

// Ô issue key của một dòng ĐÃ LƯU. Có draft riêng và chỉ commit khi blur/Enter,
// vì issueKey là một nửa danh tính của event: lưu ngay mỗi phím gõ thì trạng
// thái rỗng thoáng qua sẽ bị migrateConfig loại và cả dòng biến mất giữa lúc
// đang sửa. `canClear` = dòng còn matchSummary làm danh tính nên xoá key được.
function IssueKeyCell({ value, canClear, label, onCommit }: {
  value: string
  canClear: boolean
  label: string
  onCommit: (next: string) => void
}) {
  const t = useT()
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])

  const commit = () => {
    const next = draft.trim().toUpperCase()
    if (next === value) return
    if (next === '' && !canClear) { setDraft(value); return }
    onCommit(next)
  }

  return (
    <input
      value={draft} style={{ width: 110 }}
      placeholder={canClear ? t.options.events.issueKeyPlaceholderOptional : t.options.events.issueKeyPlaceholder}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
    />
  )
}

// Dòng chọn hiện TÊN + CHA, vì trong sprint thật có nhiều sub-task trùng tên
// ("Security Review" mỗi story một cái) và tên cha là thứ duy nhất phân biệt.
// Tên bị trùng thì KHOÁ luôn: chọn nó không bao giờ tra được issue (xem
// core/ceremony-options), nên mời người dùng chọn là mời họ vào một cái bẫy.
// Không ẨN nó đi — người dùng đang đi tìm đúng cái tên đó và phải hiểu vì sao
// không chọn được.
function SubtaskSelect({ value, options, label, onChange }: {
  value: string
  options: CeremonyOption[]
  label: string
  onChange: (next: string) => void
}) {
  const t = useT()
  // Tên ĐANG LƯU mà không có option dùng được nào mang giá trị đó vẫn phải là
  // một option, không thì <select> tự nhảy về "dùng issue key" và ghi đè cấu
  // hình đang có. Nói rõ nó đang ở tình trạng nào thay vì hiện tên trơ trọi.
  const saved = value.trim()
  const usableMatch = options.some((o) => o.usable && o.value === saved)
  const dupMatch = options.find((o) => !o.usable && o.value === saved)
  const savedNote = dupMatch !== undefined
    ? t.options.events.savedDuplicate(saved)
    : t.options.events.savedMissing(saved)

  return (
    <select
      value={saved} style={{ width: '100%', maxWidth: 320 }}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{t.options.events.noMatch}</option>
      {saved !== '' && !usableMatch && (
        <option value={saved}>{savedNote}</option>
      )}
      {options.map((o) => (
        <option key={o.issueKey} value={o.value} disabled={!o.usable}>
          {o.usable
            ? o.label
            : t.options.events.dupLabel(o.value, o.duplicateCount, o.parentLabel)}
        </option>
      ))}
    </select>
  )
}

// Cảnh báo tại chỗ cho cấu hình ĐÃ LƯU đã trở thành nhập nhằng. Side panel đã
// nói lý do nút bị khoá, nhưng Options là nơi SỬA được, nên nó phải nói ở đây
// nữa — không thì người dùng chỉ biết có chuyện khi bấm nút và thấy nút xám.
function AmbiguousNote({ summary, count }: { summary: string; count: number }) {
  const t = useT()
  return (
    <p
      // maxWidth khớp với <select> ở trên, và whiteSpace ghi đè `nowrap` của
      // .wl-table: thiếu một trong hai thì dòng cảnh báo tự nong cột này ra và
      // đẩy các cột còn lại (issue key, phút, comment) ra ngoài vùng cuộn.
      style={{
        margin: `${space.x1}px 0 0`, maxWidth: 320, whiteSpace: 'normal',
        fontSize: fontSize.sm, color: colors.warning, lineHeight: 1.45,
      }}
    >
      {t.options.events.ambiguous(count, summary)}
    </p>
  )
}

function EventsSection({ config, save }: SectionProps) {
  const t = useT()
  // Draft cho dòng mới — chưa lưu, chỉ tồn tại ở local state. Khác với các
  // input khác trong section (vốn ghi thẳng qua `save` mỗi lần đổi), dòng này
  // chưa có danh tính (issueKey hoặc matchSummary) nên `migrateConfig` sẽ loại
  // bỏ ngay nếu lưu sớm — xem giải thích trong task-12-report.md.
  const [draft, setDraft] = useState<SprintEvent>(EMPTY_EVENT_DRAFT)

  // Sub-task thật trong sprint đang mở. Người dùng CHỌN từ đây chứ không gõ
  // tên: một lỗi chính tả nghĩa là nút chết im lặng và chỉ lộ ra rất muộn.
  const [subtasks, setSubtasks] = useState<CeremoniesListResult>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    send<CeremoniesListResult>({ type: 'ceremonies/list' })
      .then((r) => { if (!cancelled) { setSubtasks(r); setLoadError(null) } })
      .catch((e: unknown) => { if (!cancelled) setLoadError(toUiError(e).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [config.projects.join(','), config.primaryBoardId])

  // Một dòng cho MỖI sub-task (kèm cha), và tên trùng bị đánh dấu không dùng
  // được. Logic thuần nằm ở core/ceremony-options — ở đây chỉ còn hiển thị.
  const options = buildCeremonyOptions(subtasks)
  const dupCounts = summaryCounts(subtasks)

  // Danh tính của một event là issueKey HOẶC matchSummary. Patch nào làm mất
  // cả hai đều bị bỏ: migrateConfig sẽ xoá dòng đó và nó biến mất giữa lúc sửa.
  const update = (index: number, patch: Partial<SprintEvent>) => {
    const current = config.sprintEvents[index]
    if (current === undefined) return
    const next = { ...current, ...patch }
    if (next.issueKey.trim() === '' && next.matchSummary.trim() === '') return
    void save({
      sprintEvents: config.sprintEvents.map((ev, i) => (i === index ? next : ev)),
    })
  }

  const draftIssueKey = draft.issueKey.trim().toUpperCase()
  const draftMatch = draft.matchSummary.trim()
  const canAdd = draftIssueKey !== '' || draftMatch !== ''

  const add = () => {
    if (!canAdd) return
    void save({
      sprintEvents: [
        ...config.sprintEvents,
        { ...draft, issueKey: draftIssueKey, matchSummary: draftMatch },
      ],
    })
    setDraft(EMPTY_EVENT_DRAFT)
  }

  const remove = (index: number) => {
    void save({ sprintEvents: config.sprintEvents.filter((_, i) => i !== index) })
  }

  return (
    <Card title={t.options.events.title}>
      <div style={{ display: 'grid', gap: space.x3 }}>
        <Hint>{t.options.events.hint1}</Hint>
        <Hint>{t.options.events.hint2}</Hint>

        {loading && <Hint>{t.options.events.loadingSubtasks}</Hint>}
        {loadError !== null && (
          <Banner kind="warn">{t.options.events.loadError(loadError)}</Banner>
        )}
        {!loading && loadError === null && subtasks.length === 0 && (
          <Banner kind="warn">{t.options.events.noSubtasks}</Banner>
        )}

        <div className="wl-table-scroll">
          <table className="wl-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left' }}>{t.options.events.colName}</th>
                <th scope="col" style={{ textAlign: 'left' }}>{t.options.events.colSubtask}</th>
                <th scope="col" style={{ textAlign: 'left' }}>{t.options.events.colIssueKey}</th>
                <th scope="col">{t.options.events.colMinutes}</th>
                <th scope="col" style={{ textAlign: 'left' }}>{t.options.events.colComment}</th>
                <th scope="col"><span style={{ visibility: 'hidden' }}>{t.common.remove}</span></th>
              </tr>
            </thead>
            <tbody>
              {config.sprintEvents.map((ev, i) => {
                const id = ev.matchSummary !== '' ? ev.matchSummary : ev.issueKey
                // Cấu hình ĐÃ LƯU có thể vừa trở thành nhập nhằng (sprint mới
                // sinh thêm sub-task cùng tên) — phải nói ngay tại dòng đó.
                const ambiguousCount = dupCounts.get(normalizeSummary(ev.matchSummary)) ?? 0
                return (
                  <tr key={`${id}#${i}`}>
                    <th scope="row" style={{ textAlign: 'left', fontWeight: 400 }}>
                      <input
                        value={ev.name} style={{ width: '100%' }}
                        aria-label={t.options.events.nameAria(id)}
                        onChange={(e) => update(i, { name: e.target.value })}
                      />
                    </th>
                    <td style={{ textAlign: 'left' }}>
                      <SubtaskSelect
                        value={ev.matchSummary} options={options}
                        label={t.options.events.subtaskAria(id)}
                        onChange={(next) => update(i, { matchSummary: next })}
                      />
                      {ambiguousCount > 1 && (
                        <AmbiguousNote summary={ev.matchSummary.trim()} count={ambiguousCount} />
                      )}
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <IssueKeyCell
                        value={ev.issueKey}
                        canClear={ev.matchSummary !== ''}
                        label={t.options.events.issueKeyAria(id)}
                        onCommit={(next) => update(i, { issueKey: next })}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min={0} value={ev.defaultMinutes} style={{ width: 72 }}
                        aria-label={t.options.events.minutesAria(id)}
                        onChange={(e) => update(i, { defaultMinutes: Number(e.target.value) })}
                      />
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input
                        value={ev.comment} style={{ width: '100%' }}
                        aria-label={t.options.events.commentAria(id)}
                        onChange={(e) => update(i, { comment: e.target.value })}
                      />
                    </td>
                    <td>
                      <Button
                        variant="danger" size="sm"
                        aria-label={t.options.events.removeAria(id)}
                        onClick={() => remove(i)}
                      >
                        {t.common.remove}
                      </Button>
                    </td>
                  </tr>
                )
              })}
              <tr>
                <td style={{ textAlign: 'left' }}>
                  <input
                    value={draft.name} style={{ width: '100%' }}
                    placeholder={t.options.events.newNamePlaceholder}
                    aria-label={t.options.events.newNameAria}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </td>
                <td style={{ textAlign: 'left' }}>
                  <SubtaskSelect
                    value={draft.matchSummary} options={options}
                    label={t.options.events.newSubtaskAria}
                    onChange={(next) => setDraft({ ...draft, matchSummary: next })}
                  />
                </td>
                <td style={{ textAlign: 'left' }}>
                  <input
                    value={draft.issueKey} style={{ width: 110 }}
                    placeholder={t.options.events.newIssueKeyPlaceholder}
                    aria-label={t.options.events.newIssueKeyAria}
                    onChange={(e) => setDraft({ ...draft, issueKey: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number" min={0} value={draft.defaultMinutes} style={{ width: 72 }}
                    aria-label={t.options.events.newMinutesAria}
                    onChange={(e) => setDraft({ ...draft, defaultMinutes: Number(e.target.value) })}
                  />
                </td>
                <td style={{ textAlign: 'left' }}>
                  <input
                    value={draft.comment} style={{ width: '100%' }}
                    placeholder={t.options.events.newCommentPlaceholder}
                    aria-label={t.options.events.newCommentAria}
                    onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
                  />
                </td>
                <td>
                  <Button variant="primary" size="sm" onClick={add} disabled={!canAdd}>
                    {t.common.add}
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  )
}

// Card cuối: cập nhật extension. Nó ở đây chứ không phải một trang riêng vì
// mỗi lần dùng là một lần "vào cấu hình xem có gì mới", và repo là một field
// cấu hình như mọi field khác.
//
// Vì sao phải làm tay: extension cài bằng "Load unpacked" thì Chrome không có
// đường tự cập nhật (không update_url, requestUpdateCheck chỉ có nghĩa với bản
// từ Web Store). Nên tính năng này chỉ làm được đúng một việc — nói cho người
// dùng biết có bản mới và đưa họ tới file zip.
function UpdateSection({ config, save }: SectionProps) {
  const t = useT()
  // Ngày/giờ phải theo ngôn ngữ đang chọn, không theo locale của browser: một
  // UI tiếng Anh mà hiện "21/08/2026" đọc ra như lỗi.
  const locale = useLocale()
  const { status, checking, error, check } = useUpdate()
  const [draft, setDraft] = useState(config.updateRepo)
  const fieldId = useId()

  const trimmed = draft.trim()
  const dirty = trimmed !== config.updateRepo
  const invalid = trimmed !== '' && !isRepoSlug(trimmed)

  const latest = status?.latest ?? null
  const checkedAt = status && status.lastCheckedAt > 0
    ? new Date(status.lastCheckedAt).toLocaleString(intlLocale(locale))
    : null

  return (
    <Card title={t.options.update.title}>
      <div style={{ display: 'grid', gap: space.x3 }}>
        <Hint>{t.options.update.hint}</Hint>

        <div className="wl-field">
          <label className="wl-field__label" htmlFor={fieldId}>{t.options.update.repoLabel}</label>
          <div style={{ display: 'flex', gap: space.x2, flexWrap: 'wrap' }}>
            <input
              id={fieldId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && dirty && !invalid) void save({ updateRepo: trimmed }) }}
              placeholder={t.options.update.repoPlaceholder}
              style={{ flex: '1 1 240px', minWidth: 0 }}
            />
            <Button
              variant="primary"
              onClick={() => void save({ updateRepo: trimmed })}
              disabled={!dirty || invalid}
            >
              {t.common.save}
            </Button>
          </div>
          {invalid && (
            <p style={{ margin: 0, fontSize: fontSize.md, color: colors.danger }}>
              {t.options.update.repoInvalid}
            </p>
          )}
        </div>

        <div style={{
          display: 'flex', gap: space.x3, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: fontSize.md }}>
            {t.options.update.current(status?.currentVersion ?? '—')}
          </span>
          <Button
            variant="secondary" size="sm"
            onClick={() => void check()}
            disabled={checking || config.updateRepo === ''}
          >
            {checking ? t.options.update.checking : t.options.update.check}
          </Button>
          {checkedAt && (
            <span style={{ fontSize: fontSize.xs, color: colors.muted }}>
              {t.options.update.lastChecked(checkedAt)}
            </span>
          )}
        </div>

        {error && <Banner kind="error">{error}</Banner>}

        {status?.state === 'current' && (
          <Banner kind="success">{t.options.update.upToDate(status.currentVersion)}</Banner>
        )}

        {/* `dismissed` vẫn hiện Ở ĐÂY: người dùng bấm "Để sau" ở side panel là
            muốn banner biến khỏi luồng log giờ, không phải muốn quên hẳn. */}
        {(status?.state === 'available' || status?.state === 'dismissed') && latest && (
          <Banner
            kind="info"
            action={{
              label: t.options.update.download,
              onClick: () => void ext.tabs.create({ url: latest.downloadUrl ?? latest.url }),
            }}
          >
            {t.options.update.available(
              latest.version,
              latest.publishedAt === ''
                ? ''
                : new Date(latest.publishedAt).toLocaleDateString(intlLocale(locale)),
            )}
          </Banner>
        )}

        {status?.state === 'unknown' && status.lastError !== null && (
          <Banner kind="warn">{t.options.update.failed(status.lastError)}</Banner>
        )}
      </div>
    </Card>
  )
}

// Card ngôn ngữ. Đứng cuối vì nó không thuộc luồng cấu hình Jira — nhưng vẫn
// trong cùng trang, không phải một trang riêng cho đúng một field.
//
// Vì sao là config chứ không phải chrome.i18n: `chrome.i18n.getMessage` luôn đọc
// theo ngôn ngữ của BROWSER và không có API override nào, nên một cài đặt ngôn
// ngữ trong app không thể làm bằng nó. Xem src/i18n/index.ts.
function LanguageSection({ config, save }: SectionProps) {
  const t = useT()
  const fieldId = useId()

  return (
    <Card title={t.language.title}>
      <div style={{ display: 'grid', gap: space.x3 }}>
        <Hint>{t.language.hint}</Hint>
        <div className="wl-field" style={{ maxWidth: 320 }}>
          <label className="wl-field__label" htmlFor={fieldId}>{t.language.label}</label>
          <select
            id={fieldId}
            value={config.locale}
            onChange={(e) => void save({ locale: e.target.value as Locale })}
          >
            {/* Tên ngôn ngữ hiện bằng CHÍNH ngôn ngữ đó, không dịch theo UI đang
                dùng: người đang mắc kẹt trong một ngôn ngữ họ không đọc được
                vẫn phải nhận ra được tên của ngôn ngữ mình muốn. */}
            {LOCALES.map((l) => (
              <option key={l} value={l}>{t.language[l]}</option>
            ))}
          </select>
        </div>
      </div>
    </Card>
  )
}
