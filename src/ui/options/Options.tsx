import { useEffect, useState } from 'react'
import { send, type AuthProbeResult } from '@/sw/messages'
import type { Config, ConfigMember, SprintEvent } from '@/core/config-schema'
import { Banner } from '@/ui/shared/Banner'

export function Options() {
  const [config, setConfig] = useState<Config | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [probe, setProbe] = useState<AuthProbeResult | null>(null)
  const [urlDraft, setUrlDraft] = useState('')

  useEffect(() => {
    send<Config>({ type: 'config/load' })
      .then((c) => { setConfig(c); setUrlDraft(c.jiraBaseUrl) })
      .catch((e: Error) => setError(e.message))
  }, [])

  const save = async (patch: Partial<Config>) => {
    try {
      setConfig(await send<Config>({ type: 'config/save', patch }))
      setError(null)
    } catch (e) { setError((e as Error).message) }
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
      setProbe(await send<AuthProbeResult>({ type: 'auth/probe' }))
    } catch (e) { setError((e as Error).message) }
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
          <p style={{ fontSize: 13, color: '#2e7d32' }}>
            Đã kết nối: {probe.displayName} · {probe.timeZone} · chế độ {probe.mode}
          </p>
        )}
      </section>

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
            background: '#eee', borderRadius: 12, padding: '2px 10px', fontSize: 13,
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
  const projectKey = config.projects[0]

  useEffect(() => {
    if (!projectKey) { setBoards([]); return }
    let cancelled = false
    send<{ id: number; name: string }[]>({ type: 'boards/load', projectKey })
      .then((bs) => { if (!cancelled) setBoards(bs) })
      .catch(() => { if (!cancelled) setBoards([]) })
    return () => { cancelled = true }
  }, [projectKey])

  return (
    <section>
      <h2 style={{ fontSize: 15 }}>4. Board chính</h2>
      <p style={{ fontSize: 13, color: '#555' }}>
        Dùng cho preset "Sprint hiện tại" và tab Story points.
      </p>
      {!projectKey ? (
        <p style={{ fontSize: 13, color: '#888' }}>Thêm một project ở trên trước đã.</p>
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
