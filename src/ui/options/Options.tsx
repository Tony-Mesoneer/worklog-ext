import { useEffect, useState } from 'react'
import { send, type AuthProbeResult } from '@/sw/messages'
import type { Config, ConfigMember, SprintEvent } from '@/core/config-schema'
import { Banner } from '@/ui/shared/Banner'
import { toUiError } from '@/ui/shared/errors'
import { colors, radii } from '@/ui/shared/theme'

// Ở Options thì "mở Options" là vô nghĩa, nên 401/403 có text riêng: nó chỉ
// người dùng xuống đúng khối token bên dưới.
const AUTH_HINT =
  'Jira từ chối request (401/403). Session Jira có thể đã hết hạn, hoặc token sai — thử nhập email + API token ở mục 2.'

export function Options() {
  const [config, setConfig] = useState<Config | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [probe, setProbe] = useState<AuthProbeResult | null>(null)
  const [urlDraft, setUrlDraft] = useState('')
  // Khối token mở khi probe fail (spec §4: "Nếu fail thì hiện form nhập
  // token"), và mở được bằng tay cho người đã biết mình cần token.
  const [showToken, setShowToken] = useState(false)

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

  if (!config) return <div style={{ padding: 16 }}>Đang tải…</div>

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzMismatch = config.timeZone !== 'UTC' && config.timeZone !== browserTz

  return (
    <div style={{ padding: 16, maxWidth: 760, fontFamily: 'system-ui', display: 'grid', gap: 20 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>Worklog — cấu hình</h1>

      {error && <Banner kind="error">{error}</Banner>}

      {tzMismatch && (
        <Banner kind="warn">
          Timezone Jira (<code>{config.timeZone}</code>) khác timezone máy
          (<code>{browserTz}</code>). Worklog sẽ ghi theo timezone Jira.
        </Banner>
      )}

      <section>
        <h2 style={{ fontSize: 15 }}>1. Jira</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://your-site.atlassian.net"
            style={{ flex: 1, padding: 6 }}
          />
          <button onClick={connect}>Kết nối</button>
        </div>
        {probe && (
          <p style={{ fontSize: 13, color: colors.success }}>
            Đã kết nối: {probe.displayName} · {probe.timeZone} · chế độ {probe.mode}
          </p>
        )}
      </section>

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
    <section>
      <h2 style={{ fontSize: 15 }}>2. API token (dự phòng)</h2>
      <p style={{ fontSize: 13, color: colors.muted, margin: '4px 0' }}>
        Mặc định extension dùng session Jira đang đăng nhập trong Chrome. Chỉ cần
        token khi session hết hạn, khi bạn đăng nhập Jira ở profile Chrome khác,
        hoặc khi Jira chặn request bằng session.
      </p>
      {saved && (
        <p style={{ fontSize: 13, color: colors.success, margin: '4px 0' }}>
          Đã lưu token cho <code>{config.token?.email}</code> — đang dùng chế độ token.
        </p>
      )}
      {!open ? (
        <button onClick={() => setOpen(true)}>
          {saved ? 'Sửa token' : 'Nhập API token'}
        </button>
      ) : (
        <div style={{ display: 'grid', gap: 6, maxWidth: 460 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email Atlassian"
            autoComplete="off"
            style={{ padding: 6 }}
          />
          {/* KHÔNG bao giờ đổ token đã lưu ra lại input, và không bao giờ log. */}
          <input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={saved ? 'Token mới (để trống nếu không đổi)' : 'API token'}
            autoComplete="off"
            style={{ padding: 6 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => void submit()}
              disabled={busy || email.trim() === '' || apiToken.trim() === ''}
            >
              Lưu token và kiểm tra
            </button>
            {saved && (
              <button onClick={() => void clear()} disabled={busy}>
                Xoá token, quay lại session
              </button>
            )}
            <button onClick={() => { setApiToken(''); setOpen(false) }} disabled={busy}>
              Đóng
            </button>
          </div>
          <p style={{ fontSize: 12, color: colors.muted, margin: 0 }}>
            Tạo token tại <code>id.atlassian.com</code> → Security → API tokens.
            Token chỉ lưu trong máy này (<code>chrome.storage.local</code>), không
            đồng bộ lên Google account và không gửi đi đâu ngoài Jira.
          </p>
        </div>
      )}
    </section>
  )
}

function ProjectsSection({ config, save }: SectionProps) {
  const [draft, setDraft] = useState('')

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
    <section>
      <h2 style={{ fontSize: 15 }}>3. Project</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder="Project key (vd. CAG)"
          style={{ flex: 1, padding: 6 }}
        />
        <button onClick={add}>Thêm</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {config.projects.map((p) => (
          <span key={p} style={{
            background: colors.surfaceAlt, border: `1px solid ${colors.border}`,
            borderRadius: radii.chip, padding: '2px 10px', fontSize: 13,
            display: 'inline-flex', gap: 6, alignItems: 'center',
          }}>
            {p}
            <button onClick={() => remove(p)} style={{ fontSize: 11 }}>×</button>
          </span>
        ))}
      </div>
    </section>
  )
}

function BoardSection({ config, save }: SectionProps) {
  const [boards, setBoards] = useState<{ id: number; name: string }[]>([])
  // Fetch fail mà chỉ để list rỗng thì người dùng thấy dropdown trống, không
  // chọn được gì, rồi sau đó gặp "Chưa chọn board chính" ở tab points mà không
  // hiểu vì sao. Phải nói ra lỗi tại đây.
  const [boardsError, setBoardsError] = useState<string | null>(null)
  const projectKey = config.projects[0]

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
    <section>
      <h2 style={{ fontSize: 15 }}>4. Board chính</h2>
      <p style={{ fontSize: 13, color: colors.muted }}>
        Dùng cho preset "Sprint hiện tại" và tab Story points.
      </p>
      {!projectKey ? (
        <p style={{ fontSize: 13, color: colors.muted }}>Thêm một project ở trên trước đã.</p>
      ) : boardsError !== null ? (
        <p style={{ fontSize: 13, color: colors.danger }}>
          Không lấy được danh sách board của {projectKey}: {boardsError}
        </p>
      ) : (
        <select
          value={config.primaryBoardId ?? ''}
          onChange={(e) => void save({ primaryBoardId: Number(e.target.value) })}
          style={{ padding: 6 }}
        >
          <option value="" disabled>— chọn board —</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      )}
    </section>
  )
}

function MembersSection({ config, save, setError }: SectionProps & {
  setError: (e: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ accountId: string; displayName: string }[]>([])

  const search = async () => {
    try {
      setFound(await send<{ accountId: string; displayName: string }[]>({
        type: 'users/search', query,
      }))
      setError(null)
    } catch (e) { setError((e as Error).message) }
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
    <section>
      <h2 style={{ fontSize: 15 }}>5. Member theo dõi</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)}
               placeholder="Tên hoặc email" style={{ flex: 1, padding: 6 }} />
        <button onClick={search}>Tìm</button>
      </div>
      {found.length > 0 && (
        <ul>
          {found.map((u) => (
            <li key={u.accountId}>
              {u.displayName} <button onClick={() => add(u)}>Thêm</button>
            </li>
          ))}
        </ul>
      )}
      <table style={{ width: '100%', fontSize: 13, marginTop: 8 }}>
        <thead><tr><th align="left">Member</th><th>Giờ/ngày</th><th>Active</th><th /></tr></thead>
        <tbody>
          {config.members.map((m) => (
            <tr key={m.accountId}>
              <td>{m.displayName}</td>
              <td align="center">
                <input type="number" min={0} max={24} value={m.hoursPerDay} style={{ width: 56 }}
                       onChange={(e) => update(m.accountId, { hoursPerDay: Number(e.target.value) })} />
              </td>
              <td align="center">
                <input type="checkbox" checked={m.active}
                       onChange={(e) => update(m.accountId, { active: e.target.checked })} />
              </td>
              <td align="center">
                <button onClick={() => void save({
                  members: config.members.filter((x) => x.accountId !== m.accountId),
                })}>Xoá</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
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
    <section>
      <h2 style={{ fontSize: 15 }}>6. Sprint event</h2>
      <table style={{ width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            <th align="left">Tên</th>
            <th align="left">Issue key</th>
            <th>Phút mặc định</th>
            <th align="left">Comment mặc định</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {config.sprintEvents.map((ev, i) => (
            <tr key={i}>
              <td>
                <input value={ev.name} style={{ width: '100%' }}
                       onChange={(e) => update(i, { name: e.target.value })} />
              </td>
              {/* Issue key là danh tính của event — không sửa tại chỗ được.
                  Đổi thì xoá dòng và thêm lại, tránh việc lưu ngay mỗi phím
                  gõ khiến trạng thái rỗng thoáng qua bị migrateConfig xoá. */}
              <td>{ev.issueKey}</td>
              <td align="center">
                <input type="number" min={0} value={ev.defaultMinutes} style={{ width: 64 }}
                       onChange={(e) => update(i, { defaultMinutes: Number(e.target.value) })} />
              </td>
              <td>
                <input value={ev.comment} style={{ width: '100%' }}
                       onChange={(e) => update(i, { comment: e.target.value })} />
              </td>
              <td align="center">
                <button onClick={() => remove(i)}>Xoá</button>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              <input value={draft.name} style={{ width: '100%' }}
                     placeholder="Tên"
                     onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </td>
            <td>
              <input value={draft.issueKey} style={{ width: 90 }}
                     placeholder="Issue key"
                     onChange={(e) => setDraft({ ...draft, issueKey: e.target.value })} />
            </td>
            <td align="center">
              <input type="number" min={0} value={draft.defaultMinutes} style={{ width: 64 }}
                     onChange={(e) => setDraft({ ...draft, defaultMinutes: Number(e.target.value) })} />
            </td>
            <td>
              <input value={draft.comment} style={{ width: '100%' }}
                     placeholder="Comment"
                     onChange={(e) => setDraft({ ...draft, comment: e.target.value })} />
            </td>
            <td align="center">
              <button onClick={add} disabled={draft.issueKey.trim() === ''}>Thêm</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
