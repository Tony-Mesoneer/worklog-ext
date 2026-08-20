// src/ui/sidepanel/SidePanel.tsx
import { useCallback, useEffect, useState } from 'react'
import { send, type DayLoadResult } from '@/sw/messages'
import type { Config, SprintEvent } from '@/core/config-schema'
import type { Worklog } from '@/core/coverage'
import { nextFreeStart, parseHhMm, type DayEntry } from '@/core/timeline'
import { parseDuration, formatDuration } from '@/core/duration'
import { todayInZone, addDays } from '@/core/jiraTime'
import { Banner } from '@/ui/shared/Banner'
import { ErrorBanner, toUiError, type UiError } from '@/ui/shared/errors'
import { DayTimeline } from './DayTimeline'
import { EventButtons } from './EventButtons'
import { IssuePicker } from './IssuePicker'
import { LogForm } from './LogForm'

const toEntries = (worklogs: Worklog[]): DayEntry[] =>
  worklogs.map((w) => ({
    id: w.id, issueKey: w.issueKey,
    startMinutes: w.startMinutes,
    durationMinutes: Math.round(w.timeSpentSeconds / 60),
  }))

export function SidePanel() {
  const [config, setConfig] = useState<Config | null>(null)
  const [date, setDate] = useState('')
  const [worklogs, setWorklogs] = useState<Worklog[]>([])
  const [issueKey, setIssueKey] = useState('')
  const [startMinutes, setStartMinutes] = useState(0)
  const [durationInput, setDurationInput] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UiError | null>(null)
  const [lastLogged, setLastLogged] = useState<{ id: string; issueKey: string } | null>(null)

  const loadConfig = useCallback(() => {
    setError(null)
    void send<Config>({ type: 'config/load' })
      .then((c) => {
        setConfig(c)
        setDate(todayInZone(c.timeZone, new Date()))
        setStartMinutes(parseHhMm(c.workdayStart))
      })
      .catch((e: unknown) => setError(toUiError(e)))
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  const reload = useCallback(async (c: Config, d: string) => {
    try {
      const res = await send<DayLoadResult>({ type: 'day/load', date: d })
      setWorklogs(res.worklogs)
      // Start time luôn nhảy tới khoảng trống kế tiếp sau khi dữ liệu đổi.
      setStartMinutes(nextFreeStart(toEntries(res.worklogs), parseHhMm(c.workdayStart), c.slotMinutes))
      setError(null)
    } catch (e) { setError(toUiError(e)) }
  }, [])

  useEffect(() => {
    if (config && date) void reload(config, date)
  }, [config, date, reload])

  const pickEvent = (e: SprintEvent) => {
    setIssueKey(e.issueKey)
    setDurationInput(e.defaultMinutes >= 60 && e.defaultMinutes % 60 === 0
      ? `${e.defaultMinutes / 60}h` : `${e.defaultMinutes}m`)
    setComment(e.comment)
  }

  const submit = async () => {
    if (!config) return
    const seconds = parseDuration(durationInput)
    if (seconds === null) { setError({ message: 'Duration không hợp lệ', auth: false }); return }
    if (issueKey.trim() === '') { setError({ message: 'Chưa chọn issue', auth: false }); return }

    setBusy(true)
    try {
      const res = await send<{ id: string }>({
        type: 'worklog/add',
        issueKey: issueKey.trim(), date, startMinutes,
        timeSpentSeconds: seconds, comment,
      })
      setLastLogged({ id: res.id, issueKey: issueKey.trim() })
      setDurationInput('')
      setComment('')
      await reload(config, date)
      // Undo hết hiệu lực sau 8 giây.
      setTimeout(() => setLastLogged(null), 8000)
    } catch (e) {
      // Giữ nguyên form: người dùng không phải nhập lại. Message của
      // MessageError đã chứa text gốc từ Jira (xem jiraErrorMessage).
      setError(toUiError(e))
    } finally { setBusy(false) }
  }

  const undo = async () => {
    if (!lastLogged || !config) return
    try {
      await send({ type: 'worklog/delete', issueKey: lastLogged.issueKey, worklogId: lastLogged.id })
      setLastLogged(null)
      await reload(config, date)
    } catch (e) {
      // Text cho người dùng nói đủ việc cần làm; nguyên nhân gốc vẫn phải vào
      // console, không thì không debug được gì.
      console.error('[sidepanel] undo worklog thất bại', e)
      setError({
        message: `Không xoá được worklog ${lastLogged.id} trên ${lastLogged.issueKey} — xoá tay trong Jira`,
        auth: false,
      })
    }
  }

  if (!config) {
    return (
      <div style={{ padding: 12 }}>
        {error
          ? error.auth
            ? <ErrorBanner error={error} />
            : (
              <Banner kind="error" action={{ label: 'Thử lại', onClick: loadConfig }}>
                {error.message}
              </Banner>
            )
          : 'Đang tải…'}
      </div>
    )
  }
  if (config.jiraBaseUrl === '') {
    return (
      <div style={{ padding: 12 }}>
        <Banner kind="info" action={{ label: 'Mở Options', onClick: () => chrome.runtime.openOptionsPage() }}>
          Chưa cấu hình Jira.
        </Banner>
      </div>
    )
  }

  const entries = toEntries(worklogs)
  const totalSeconds = worklogs.reduce((s, w) => s + w.timeSpentSeconds, 0)
  const target = 8 * 3600

  return (
    <div style={{ padding: 10, fontFamily: 'system-ui', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => setDate(addDays(date, -1))} disabled={busy}>←</button>
        <strong style={{ fontSize: 13 }}>{date}</strong>
        <button onClick={() => setDate(addDays(date, 1))} disabled={busy}>→</button>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: totalSeconds >= target ? '#2e7d32' : '#ef6c00' }}>
          {formatDuration(totalSeconds)} / {formatDuration(target)}
        </span>
      </div>

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      {lastLogged && (
        <Banner kind="info" action={{ label: 'Undo', onClick: () => void undo() }}>
          Đã log vào {lastLogged.issueKey}
        </Banner>
      )}

      <DayTimeline
        entries={entries}
        workdayStartMinutes={parseHhMm(config.workdayStart)}
        slotMinutes={config.slotMinutes}
        selectedStart={startMinutes}
        selectedDuration={Math.round((parseDuration(durationInput) ?? 0) / 60)}
      />

      <EventButtons events={config.sprintEvents} onPick={pickEvent} />
      <IssuePicker value={issueKey} onChange={setIssueKey} projects={config.projects} />

      <LogForm
        entries={entries}
        presets={config.durationPresets}
        slotMinutes={config.slotMinutes}
        workdayStartMinutes={parseHhMm(config.workdayStart)}
        startMinutes={startMinutes}
        durationInput={durationInput}
        comment={comment}
        issueKey={issueKey}
        busy={busy}
        onStartChange={setStartMinutes}
        onDurationChange={setDurationInput}
        onCommentChange={setComment}
        onSubmit={() => void submit()}
      />

      <button onClick={() => void send({ type: 'dashboard/open' })} style={{ fontSize: 12 }}>
        Mở dashboard team
      </button>
    </div>
  )
}
