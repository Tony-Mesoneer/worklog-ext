import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { send, type AuthProbeResult } from '@/sw/messages'
import type { Config, ConfigMember, SprintEvent } from '@/core/config-schema'
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

      {/* Khối 3–6 theo cùng mẫu: đọc từ `config`, ghi bằng `save({...})`.
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

  return (
    <Card title="2. API token (dự phòng)">
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
        {!open ? (
          <div>
            <Button onClick={() => setOpen(true)}>
              {saved ? 'Sửa token' : 'Nhập API token'}
            </Button>
          </div>
        ) : (
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
        )}
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
    <Card title="3. Project">
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
    <Card title="4. Board chính">
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
    <Card title="5. Member theo dõi">
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

const EMPTY_EVENT_DRAFT: SprintEvent = { name: '', issueKey: '', defaultMinutes: 15, comment: '' }

function EventsSection({ config, save }: SectionProps) {
  // Draft cho dòng mới — chưa lưu, chỉ tồn tại ở local state. Khác với các
  // input khác trong section (vốn ghi thẳng qua `save` mỗi lần đổi), dòng này
  // không có issueKey nên `migrateConfig` sẽ loại bỏ ngay nếu lưu sớm —
  // xem giải thích trong task-12-report.md.
  const [draft, setDraft] = useState<SprintEvent>(EMPTY_EVENT_DRAFT)

  const update = (index: number, patch: Partial<SprintEvent>) => {
    void save({
      sprintEvents: config.sprintEvents.map((ev, i) => (i === index ? { ...ev, ...patch } : ev)),
    })
  }

  const add = () => {
    const issueKey = draft.issueKey.trim()
    if (issueKey === '') return
    void save({ sprintEvents: [...config.sprintEvents, { ...draft, issueKey }] })
    setDraft(EMPTY_EVENT_DRAFT)
  }

  const remove = (index: number) => {
    void save({ sprintEvents: config.sprintEvents.filter((_, i) => i !== index) })
  }

  return (
    <Card title="6. Sprint event">
      <div style={{ display: 'grid', gap: space.x3 }}>
        <Hint>Mỗi event là một nút một-cú-bấm trong side panel.</Hint>
        <div className="wl-table-scroll">
          <table className="wl-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left' }}>Tên</th>
                <th scope="col" style={{ textAlign: 'left' }}>Issue key</th>
                <th scope="col">Phút mặc định</th>
                <th scope="col" style={{ textAlign: 'left' }}>Comment mặc định</th>
                <th scope="col"><span style={{ visibility: 'hidden' }}>Xoá</span></th>
              </tr>
            </thead>
            <tbody>
              {config.sprintEvents.map((ev, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'left' }}>
                    <input
                      value={ev.name} style={{ width: '100%' }}
                      aria-label={`Tên event ${ev.issueKey}`}
                      onChange={(e) => update(i, { name: e.target.value })}
                    />
                  </td>
                  {/* Issue key là danh tính của event — không sửa tại chỗ được.
                      Đổi thì xoá dòng và thêm lại, tránh việc lưu ngay mỗi phím
                      gõ khiến trạng thái rỗng thoáng qua bị migrateConfig xoá. */}
                  <th scope="row" style={{ fontWeight: 400 }}>{ev.issueKey}</th>
                  <td>
                    <input
                      type="number" min={0} value={ev.defaultMinutes} style={{ width: 72 }}
                      aria-label={`Phút mặc định của ${ev.issueKey}`}
                      onChange={(e) => update(i, { defaultMinutes: Number(e.target.value) })}
                    />
                  </td>
                  <td style={{ textAlign: 'left' }}>
                    <input
                      value={ev.comment} style={{ width: '100%' }}
                      aria-label={`Comment mặc định của ${ev.issueKey}`}
                      onChange={(e) => update(i, { comment: e.target.value })}
                    />
                  </td>
                  <td>
                    <Button
                      variant="danger" size="sm"
                      aria-label={`Xoá event ${ev.issueKey}`}
                      onClick={() => remove(i)}
                    >
                      Xoá
                    </Button>
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ textAlign: 'left' }}>
                  <input
                    value={draft.name} style={{ width: '100%' }}
                    placeholder="Tên" aria-label="Tên event mới"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </td>
                <td style={{ textAlign: 'left' }}>
                  <input
                    value={draft.issueKey} style={{ width: 110 }}
                    placeholder="Issue key" aria-label="Issue key của event mới"
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
                  <Button variant="primary" size="sm" onClick={add} disabled={draft.issueKey.trim() === ''}>
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
