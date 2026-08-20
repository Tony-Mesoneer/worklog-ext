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

// Ở Options thì "mở Options" là vô nghĩa, nên 401/403 có text riêng: nó chỉ
// người dùng xuống đúng khối token bên dưới.
const AUTH_HINT =
  'Jira từ chối request (401/403). Session Jira có thể đã hết hạn, hoặc token sai — thử nhập email + API token ở mục 2.'

// Dòng giải thích dưới tiêu đề section — cùng một kiểu ở cả sáu khối.
function Hint({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: fontSize.md, color: colors.muted, lineHeight: 1.5 }}>
      {children}
    </p>
  )
}

export function Options() {
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
    setError(ui.auth ? AUTH_HINT : ui.message)
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
        ? AUTH_HINT
        : `Không xác thực được với Jira: ${ui.message}. Thử nhập API token ở mục 2.`)
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
        <h1 style={{ fontSize: fontSize.xxl, margin: 0, fontWeight: 700 }}>Worklog — cấu hình</h1>
        <p style={{ margin: '2px 0 0', color: colors.muted }}>
          Mỗi thay đổi lưu ngay, không có nút Save toàn trang.
        </p>
      </header>

      {error && <Banner kind="error">{error}</Banner>}

      {tzMismatch && (
        <Banner kind="warn">
          Timezone Jira (<code>{config.timeZone}</code>) khác timezone máy
          (<code>{browserTz}</code>). Worklog sẽ ghi theo timezone Jira.
        </Banner>
      )}

      <Card title="1. Jira">
        <div style={{ display: 'grid', gap: space.x2 }}>
          <div className="wl-field">
            <label className="wl-field__label" htmlFor={urlId}>Địa chỉ Jira</label>
            <div style={{ display: 'flex', gap: space.x2, flexWrap: 'wrap' }}>
              <input
                id={urlId}
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://your-site.atlassian.net"
                style={{ flex: '1 1 240px', minWidth: 0 }}
              />
              <Button variant="primary" onClick={connect}>Kết nối</Button>
            </div>
          </div>
          {probe && (
            <p style={{ fontSize: fontSize.md, color: colors.success, margin: 0 }}>
              Đã kết nối: {probe.displayName} · {probe.timeZone} · chế độ {probe.mode}
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
            ? `Đang dùng API token (${config.token?.email}) — sửa hoặc xoá`
            : 'Cần dùng API token thay vì session? (dự phòng)'}
        </Button>
      </div>
    )
  }

  return (
    <Card title="API token (dự phòng)">
      <div style={{ display: 'grid', gap: space.x3 }}>
        <Hint>
          Mặc định extension dùng session Jira đang đăng nhập trong Chrome. Chỉ cần
          token khi session hết hạn, khi bạn đăng nhập Jira ở profile Chrome khác,
          hoặc khi Jira chặn request bằng session.
        </Hint>
        {saved && (
          <p style={{ fontSize: fontSize.md, color: colors.success, margin: 0 }}>
            Đã lưu token cho <code>{config.token?.email}</code> — đang dùng chế độ token.
          </p>
        )}
        <div style={{ display: 'grid', gap: space.x2, maxWidth: 480 }}>
          <div className="wl-field">
            <label className="wl-field__label" htmlFor={emailId}>Email Atlassian</label>
            <input
              id={emailId}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ten@cong-ty.com"
              autoComplete="off"
            />
          </div>
          {/* KHÔNG bao giờ đổ token đã lưu ra lại input, và không bao giờ log. */}
          <div className="wl-field">
            <label className="wl-field__label" htmlFor={tokenId}>API token</label>
            <input
              id={tokenId}
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={saved ? 'Token mới (để trống nếu không đổi)' : 'API token'}
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
              Lưu token và kiểm tra
            </Button>
            {saved && (
              <Button variant="danger" onClick={() => void clear()} disabled={busy}>
                Xoá token, quay lại session
              </Button>
            )}
            <Button variant="ghost" onClick={() => { setApiToken(''); setOpen(false) }} disabled={busy}>
              Đóng
            </Button>
          </div>
          <Hint>
            Tạo token tại <code>id.atlassian.com</code> → Security → API tokens.
            Token chỉ lưu trong máy này (<code>chrome.storage.local</code>), không
            đồng bộ lên Google account và không gửi đi đâu ngoài Jira.
          </Hint>
        </div>
      </div>
    </Card>
  )
}

function ProjectsSection({ config, save }: SectionProps) {
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
    <Card title="2. Project">
      <div style={{ display: 'grid', gap: space.x3 }}>
        <div className="wl-field">
          <label className="wl-field__label" htmlFor={fieldId}>Project key</label>
          <div style={{ display: 'flex', gap: space.x2, flexWrap: 'wrap' }}>
            <input
              id={fieldId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add() }}
              placeholder="vd. CAG"
              style={{ flex: '1 1 200px', minWidth: 0 }}
            />
            <Button variant="primary" onClick={add} disabled={draft.trim() === ''}>Thêm</Button>
          </div>
        </div>
        {config.projects.length === 0 ? (
          <Hint>Chưa có project nào.</Hint>
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
                  aria-label={`Xoá project ${p}`}
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
    <Card title="3. Board chính">
      <div style={{ display: 'grid', gap: space.x3 }}>
        <Hint>Dùng cho preset "Sprint hiện tại" và tab Story points.</Hint>
        {!projectKey ? (
          <Hint>Thêm một project ở trên trước đã.</Hint>
        ) : boardsError !== null ? (
          <Banner kind="error">
            Không lấy được danh sách board của {projectKey}: {boardsError}
          </Banner>
        ) : (
          <div className="wl-field" style={{ maxWidth: 320 }}>
            <label className="wl-field__label" htmlFor={selectId}>Board</label>
            <select
              id={selectId}
              value={config.primaryBoardId ?? ''}
              onChange={(e) => void save({ primaryBoardId: Number(e.target.value) })}
            >
              <option value="" disabled>— chọn board —</option>
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
    <Card title="4. Member theo dõi">
      <div style={{ display: 'grid', gap: space.x3 }}>
        <div className="wl-field">
          <label className="wl-field__label" htmlFor={fieldId}>Tìm người trong Jira</label>
          <div style={{ display: 'flex', gap: space.x2, flexWrap: 'wrap' }}>
            <input
              id={fieldId} value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void search() }}
              placeholder="Tên hoặc email"
              style={{ flex: '1 1 200px', minWidth: 0 }}
            />
            <Button variant="primary" loading={searching} onClick={() => void search()}>Tìm</Button>
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
                <Button size="sm" onClick={() => add(u)}>Thêm</Button>
              </li>
            ))}
          </ul>
        )}

        {config.members.length === 0 ? (
          <Hint>Chưa theo dõi member nào — dashboard sẽ trống.</Hint>
        ) : (
          <div className="wl-table-scroll">
            <table className="wl-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left' }}>Member</th>
                  <th scope="col">Giờ/ngày</th>
                  <th scope="col">Active</th>
                  <th scope="col"><span style={{ visibility: 'hidden' }}>Xoá</span></th>
                </tr>
              </thead>
              <tbody>
                {config.members.map((m) => (
                  <tr key={m.accountId}>
                    <th scope="row">{m.displayName}</th>
                    <td>
                      <input
                        type="number" min={0} max={24} value={m.hoursPerDay} style={{ width: 64 }}
                        aria-label={`Giờ mỗi ngày của ${m.displayName}`}
                        onChange={(e) => update(m.accountId, { hoursPerDay: Number(e.target.value) })}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox" checked={m.active}
                        aria-label={`${m.displayName} đang active`}
                        onChange={(e) => update(m.accountId, { active: e.target.checked })}
                      />
                    </td>
                    <td>
                      <Button
                        variant="danger" size="sm"
                        aria-label={`Xoá ${m.displayName} khỏi danh sách theo dõi`}
                        onClick={() => void save({
                          members: config.members.filter((x) => x.accountId !== m.accountId),
                        })}
                      >
                        Xoá
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

const NO_MATCH = '— dùng issue key —'

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
      placeholder={canClear ? '(không cần)' : 'CAG-123'}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
    />
  )
}

// Dấu hiệu "không chọn được" đứng NGAY SAU tên, trước tên cha: option bị cắt
// theo bề rộng dropdown, và phần bị cắt phải là tên cha (thông tin phụ) chứ
// không phải lý do bị khoá.
const dupLabel = (o: CeremonyOption) =>
  `${o.value} · trùng tên (${o.duplicateCount} sub-task), không chọn được` +
  (o.parentLabel === null ? '' : ` — ${o.parentLabel}`)

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
  // Tên ĐANG LƯU mà không có option dùng được nào mang giá trị đó vẫn phải là
  // một option, không thì <select> tự nhảy về "dùng issue key" và ghi đè cấu
  // hình đang có. Nói rõ nó đang ở tình trạng nào thay vì hiện tên trơ trọi.
  const saved = value.trim()
  const usableMatch = options.some((o) => o.usable && o.value === saved)
  const dupMatch = options.find((o) => !o.usable && o.value === saved)
  const savedNote = dupMatch !== undefined
    ? `${saved} — đang lưu, trùng tên trong sprint`
    : `${saved} — đang lưu, không có trong sprint đang mở`

  return (
    <select
      value={saved} style={{ width: '100%', maxWidth: 320 }}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{NO_MATCH}</option>
      {saved !== '' && !usableMatch && (
        <option value={saved}>{savedNote}</option>
      )}
      {options.map((o) => (
        <option key={o.issueKey} value={o.value} disabled={!o.usable}>
          {o.usable ? o.label : dupLabel(o)}
        </option>
      ))}
    </select>
  )
}

// Cảnh báo tại chỗ cho cấu hình ĐÃ LƯU đã trở thành nhập nhằng. Side panel đã
// nói lý do nút bị khoá, nhưng Options là nơi SỬA được, nên nó phải nói ở đây
// nữa — không thì người dùng chỉ biết có chuyện khi bấm nút và thấy nút xám.
function AmbiguousNote({ summary, count }: { summary: string; count: number }) {
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
      Có {count} sub-task tên “{summary}” trong sprint đang mở — extension không
      phân biệt được cái nào, nên nút trong side panel bị khoá. Nhập issue key ở
      cột bên cạnh để ghim đúng một issue.
    </p>
  )
}

function EventsSection({ config, save }: SectionProps) {
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
    <Card title="5. Sprint event">
      <div style={{ display: 'grid', gap: space.x3 }}>
        <Hint>
          Mỗi event là một nút một-cú-bấm trong side panel. Chọn <em>sub-task</em> theo
          TÊN thì mỗi sprint mới nút tự trỏ sang sub-task mới của sprint đó — không
          còn ghi giờ vào sprint cũ. Chỉ nhập <em>issue key</em> khi muốn ghim cứng
          một issue.
        </Hint>
        <Hint>
          Mỗi dòng trong danh sách hiện <em>tên sub-task — task cha</em> để phân biệt
          các sub-task trùng tên. Tên nào bị <em>nhiều</em> sub-task dùng trong cùng
          sprint thì bị khoá: extension khớp theo tên chính xác nên không thể biết
          chọn cái nào. Muốn dùng đúng một trong số đó thì nhập <em>issue key</em>.
        </Hint>

        {loading && <Hint>Đang tải sub-task của sprint đang mở…</Hint>}
        {loadError !== null && (
          <Banner kind="warn">
            Không tải được danh sách sub-task của sprint ({loadError}). Vẫn chọn được
            tên đã lưu, hoặc nhập issue key thủ công.
          </Banner>
        )}
        {!loading && loadError === null && subtasks.length === 0 && (
          <Banner kind="warn">
            Sprint đang mở không có sub-task nào (hoặc chưa chọn project ở mục 3) —
            chưa có gì để chọn theo tên.
          </Banner>
        )}

        <div className="wl-table-scroll">
          <table className="wl-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left' }}>Tên</th>
                <th scope="col" style={{ textAlign: 'left' }}>Sub-task trong sprint</th>
                <th scope="col" style={{ textAlign: 'left' }}>Issue key (ghim)</th>
                <th scope="col">Phút mặc định</th>
                <th scope="col" style={{ textAlign: 'left' }}>Comment mặc định</th>
                <th scope="col"><span style={{ visibility: 'hidden' }}>Xoá</span></th>
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
                        aria-label={`Tên event ${id}`}
                        onChange={(e) => update(i, { name: e.target.value })}
                      />
                    </th>
                    <td style={{ textAlign: 'left' }}>
                      <SubtaskSelect
                        value={ev.matchSummary} options={options}
                        label={`Sub-task của ${id}`}
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
                        label={`Issue key ghim của ${id}`}
                        onCommit={(next) => update(i, { issueKey: next })}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min={0} value={ev.defaultMinutes} style={{ width: 72 }}
                        aria-label={`Phút mặc định của ${id}`}
                        onChange={(e) => update(i, { defaultMinutes: Number(e.target.value) })}
                      />
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input
                        value={ev.comment} style={{ width: '100%' }}
                        aria-label={`Comment mặc định của ${id}`}
                        onChange={(e) => update(i, { comment: e.target.value })}
                      />
                    </td>
                    <td>
                      <Button
                        variant="danger" size="sm"
                        aria-label={`Xoá event ${id}`}
                        onClick={() => remove(i)}
                      >
                        Xoá
                      </Button>
                    </td>
                  </tr>
                )
              })}
              <tr>
                <td style={{ textAlign: 'left' }}>
                  <input
                    value={draft.name} style={{ width: '100%' }}
                    placeholder="Tên" aria-label="Tên event mới"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </td>
                <td style={{ textAlign: 'left' }}>
                  <SubtaskSelect
                    value={draft.matchSummary} options={options}
                    label="Sub-task của event mới"
                    onChange={(next) => setDraft({ ...draft, matchSummary: next })}
                  />
                </td>
                <td style={{ textAlign: 'left' }}>
                  <input
                    value={draft.issueKey} style={{ width: 110 }}
                    placeholder="Issue key" aria-label="Issue key ghim của event mới"
                    onChange={(e) => setDraft({ ...draft, issueKey: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number" min={0} value={draft.defaultMinutes} style={{ width: 72 }}
                    aria-label="Phút mặc định của event mới"
                    onChange={(e) => setDraft({ ...draft, defaultMinutes: Number(e.target.value) })}
                  />
                </td>
                <td style={{ textAlign: 'left' }}>
                  <input
                    value={draft.comment} style={{ width: '100%' }}
                    placeholder="Comment" aria-label="Comment mặc định của event mới"
                    onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
                  />
                </td>
                <td>
                  <Button variant="primary" size="sm" onClick={add} disabled={!canAdd}>
                    Thêm
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
