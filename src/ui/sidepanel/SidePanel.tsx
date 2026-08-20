// src/ui/sidepanel/SidePanel.tsx
import { useCallback, useEffect, useState } from 'react'
import {
  send, type DayLoadResult, type EventsResolveResult, type WorklogAddResult,
} from '@/sw/messages'
import type { Config } from '@/core/config-schema'
import type { Worklog } from '@/core/coverage'
import { isWeekend } from '@/core/coverage'
import { dayShortfall, myDailyTargetMinutes } from '@/core/deficit'
import type { IssueMetaMap } from '@/core/issue-hierarchy'
import { resolveSprintEvents, type ResolvedSprintEvent } from '@/core/event-resolve'
import {
  findOverlaps, formatMinutes, nextFreeStart, normalizeBreaks, parseHhMm, segmentsEnd,
  splitAroundBreaks, type DayEntry,
} from '@/core/timeline'
import { parseDuration, formatDuration } from '@/core/duration'
import { todayInZone, addDays } from '@/core/jiraTime'
import { Banner } from '@/ui/shared/Banner'
import { UpdateBanner } from '@/ui/shared/UpdateBanner'
import { Button } from '@/ui/shared/Button'
import { Card } from '@/ui/shared/Card'
import { ProgressBar } from '@/ui/shared/ProgressBar'
import { ErrorBanner, toUiError, type UiError } from '@/ui/shared/errors'
import { GearIcon } from '@/ui/shared/icons'
import { colors, fontSize, space } from '@/ui/shared/theme'
import { DatePopover } from './DatePopover'
import { DayBlocks } from './DayBlocks'
import { EventButtons } from './EventButtons'
import { IssuePicker } from './IssuePicker'
import { LogForm } from './LogForm'

const toEntries = (worklogs: Worklog[]): DayEntry[] =>
  worklogs.map((w) => ({
    id: w.id, issueKey: w.issueKey,
    startMinutes: w.startMinutes,
    durationMinutes: Math.round(w.timeSpentSeconds / 60),
  }))


// Lối vào Options LUÔN hiện, không phụ thuộc config/lỗi — trước đây banner
// "Mở Options" chỉ hiện khi jiraBaseUrl rỗng nên biến mất ngay khi cấu hình
// xong, và người dùng không còn cách nào quay lại Options để sửa. Ghost +
// icon-only để nó đọc ra là chrome phụ, không cạnh tranh với Log/tab chính.
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

// Dùng cho hai trạng thái đầu (đang tải / chưa cấu hình) — chưa có header
// ngày để gắn gear vào, nên đặt riêng một hàng.
function SettingsHeader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <SettingsButton />
    </div>
  )
}

export function SidePanel() {
  const [config, setConfig] = useState<Config | null>(null)
  const [date, setDate] = useState('')
  const [worklogs, setWorklogs] = useState<Worklog[]>([])
  // Metadata issue đi CẠNH worklogs (xem core/issue-hierarchy). Rỗng là hợp lệ.
  const [issueMeta, setIssueMeta] = useState<IssueMetaMap>({})
  const [issueKey, setIssueKey] = useState('')
  const [startMinutes, setStartMinutes] = useState(0)
  const [durationInput, setDurationInput] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingDay, setLoadingDay] = useState(false)
  const [error, setError] = useState<UiError | null>(null)
  // Nhiều id: một lần bấm Log có thể sinh hai worklog khi yêu cầu đi qua giờ
  // nghỉ. Undo phải xoá HẾT, không thì nó chỉ hoàn tác một nửa.
  const [lastLogged, setLastLogged] = useState<{ ids: string[]; issueKey: string } | null>(null)
  // Sprint event đã tra issue key theo tên sub-task. null = chưa tra xong.
  const [resolved, setResolved] = useState<ResolvedSprintEvent[] | null>(null)
  const [resolving, setResolving] = useState(false)

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

  // Tra issue key của ceremony theo TÊN sub-task trong sprint đang mở. Chạy lại
  // mỗi lần config đổi vì danh sách event có thể đã khác.
  const resolveEvents = useCallback(async (c: Config, force: boolean) => {
    if (c.sprintEvents.length === 0) { setResolved([]); return }
    setResolving(true)
    try {
      const res = await send<EventsResolveResult>({ type: 'events/resolve', force })
      setResolved(res.events)
    } catch (e) {
      // KHÔNG im lặng rơi về issueKey đã lưu: đó chính là cách giờ ceremony
      // chảy vào sprint cũ mà không ai biết. Event tra-theo-tên bị khoá kèm lý
      // do; event ghim issueKey thủ công vẫn dùng được.
      setResolved(resolveSprintEvents(c.sprintEvents, [], {
        unavailable: `không tra được sprint (${toUiError(e).message})`,
      }))
    } finally { setResolving(false) }
  }, [])

  useEffect(() => {
    if (config) void resolveEvents(config, false)
  }, [config, resolveEvents])

  const reload = useCallback(async (c: Config, d: string) => {
    setLoadingDay(true)
    try {
      const res = await send<DayLoadResult>({ type: 'day/load', date: d })
      setWorklogs(res.worklogs)
      setIssueMeta(res.meta ?? {})
      // Start time luôn nhảy tới khoảng trống kế tiếp sau khi dữ liệu đổi.
      setStartMinutes(nextFreeStart(
        toEntries(res.worklogs), parseHhMm(c.workdayStart), c.slotMinutes,
        parseHhMm(c.workdayEnd), normalizeBreaks(c.breaks),
      ))
      setError(null)
    } catch (e) { setError(toUiError(e)) } finally { setLoadingDay(false) }
  }, [])

  useEffect(() => {
    if (config && date) void reload(config, date)
  }, [config, date, reload])

  const pickEvent = (e: ResolvedSprintEvent) => {
    // Nút đã bị khoá khi issueKey null; chốt lại ở đây để không có đường nào
    // ghi giờ vào một issue "không xác định".
    if (e.issueKey === null) return
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
      // MỘT message cho một lần bấm Log — service worker tự cắt đoạn quanh giờ
      // nghỉ và tự rollback nếu POST thứ hai lỗi.
      const res = await send<WorklogAddResult>({
        type: 'worklog/add',
        issueKey: issueKey.trim(), date, startMinutes,
        timeSpentSeconds: seconds, comment,
      })
      setLastLogged({ ids: res.ids, issueKey: issueKey.trim() })
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
    // Xoá từng cái, KHÔNG dừng ở lỗi đầu tiên: bỏ giữa đường sẽ để lại đúng cái
    // trạng thái một-nửa mà undo đang cố dọn.
    const failed: string[] = []
    for (const id of lastLogged.ids) {
      try {
        await send({ type: 'worklog/delete', issueKey: lastLogged.issueKey, worklogId: id })
      } catch (e) {
        // Text cho người dùng nói đủ việc cần làm; nguyên nhân gốc vẫn phải vào
        // console, không thì không debug được gì.
        console.error('[sidepanel] undo worklog thất bại', lastLogged.issueKey, id, e)
        failed.push(id)
      }
    }
    setLastLogged(null)
    if (failed.length > 0) {
      setError({
        message:
          `Không xoá được worklog ${failed.join(', ')} trên ${lastLogged.issueKey}` +
          ' — xoá tay trong Jira',
        auth: false,
      })
    }
    await reload(config, date)
  }

  if (!config) {
    return (
      <div style={{ padding: space.x3, display: 'grid', gap: space.x3 }}>
        <SettingsHeader />
        {error
          ? error.auth
            ? <ErrorBanner error={error} />
            : (
              <Banner kind="error" action={{ label: 'Thử lại', onClick: loadConfig }}>
                {error.message}
              </Banner>
            )
          : <p style={{ color: colors.muted, margin: 0 }}>Đang tải…</p>}
      </div>
    )
  }
  if (config.jiraBaseUrl === '') {
    return (
      <div style={{ padding: space.x3, display: 'grid', gap: space.x3 }}>
        <SettingsHeader />
        <Banner kind="info" action={{ label: 'Mở Options', onClick: () => chrome.runtime.openOptionsPage() }}>
          Chưa cấu hình Jira.
        </Banner>
      </div>
    )
  }

  const entries = toEntries(worklogs)
  const breaks = normalizeBreaks(config.breaks)
  const dayEndMinutes = parseHhMm(config.workdayEnd)
  const totalSeconds = worklogs.reduce((s, w) => s + w.timeSpentSeconds, 0)
  const selectedMinutes = Math.round((parseDuration(durationInput) ?? 0) / 60)
  // Các đoạn SẼ ghi. Mọi thứ hiển thị bên dưới (preview, timeline, cảnh báo
  // chồng giờ) đọc từ đây, nên panel không thể nói khác với cái sẽ POST.
  const segments = splitAroundBreaks(startMinutes, selectedMinutes, breaks)
  const overlapKeys = [
    ...new Set(
      segments.flatMap((s) =>
        findOverlaps(entries, s.startMinutes, s.durationMinutes).map((o) => o.issueKey),
      ),
    ),
  ]
  const end = segments.length > 0 ? segmentsEnd(segments) : 0
  const pastEndMinutes = end > dayEndMinutes ? end : null
  const today = todayInZone(config.timeZone, new Date())
  // Mục tiêu là hoursPerDay CỦA CHÍNH NGƯỜI DÙNG, không phải 8h cứng: người làm
  // 4h/ngày mà bị báo thiếu giờ mỗi ngày sẽ học cách bỏ qua mọi cảnh báo.
  const targetMinutes = myDailyTargetMinutes(config.members, config.myAccountId)
  const targetSeconds = targetMinutes * 60
  const remaining = targetSeconds - totalSeconds

  // Lối tắt log-bù. Chỉ hiện khi nó THẬT SỰ có ích, ngoài ra không render gì —
  // không placeholder, không hint xám:
  //  • ngày ĐÃ QUA (không phải hôm nay: một ngày đang diễn ra mà chưa đủ giờ là
  //    bình thường, nhắc mỗi ngày là dạy người dùng phớt lờ; không phải tương lai),
  //  • không phải cuối tuần, không phải ngày đã đánh dấu nghỉ,
  //  • và còn thiếu thật.
  // `today` lấy từ timezone của profile Jira, không phải của máy.
  const myDaysOff = config.daysOff[config.myAccountId] ?? []
  const isPastWorkday =
    date !== '' && date < today && !isWeekend(date) && !myDaysOff.includes(date)
  const shortfall = isPastWorkday && !loadingDay
    ? dayShortfall({
        entries, targetMinutes,
        workdayStartMinutes: parseHhMm(config.workdayStart),
        slotMinutes: config.slotMinutes,
        dayEndMinutes, breaks,
      })
    : null
  const canFill = shortfall !== null && shortfall.fillMinutes > 0

  // Prefill, KHÔNG submit: người dùng vẫn phải chọn issue rồi bấm Log. Ghi
  // worklog bằng một cú bấm khi chưa chọn issue là việc app này không làm.
  const fillShortfall = () => {
    if (!shortfall || shortfall.fillMinutes <= 0) return
    setStartMinutes(nextFreeStart(
      entries, parseHhMm(config.workdayStart), config.slotMinutes, dayEndMinutes, breaks,
    ))
    setDurationInput(formatDuration(shortfall.fillMinutes * 60))
  }

  return (
    <div style={{ padding: space.x3, display: 'grid', gap: space.x3, minWidth: 0 }}>
      {/* NHÓM 1 — ngày và tiến độ. Không còn ISO trần: "Thứ Năm, 20/08". */}
      <Card>
        <div style={{ display: 'grid', gap: space.x2, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space.x2, minWidth: 0 }}>
            <Button
              variant="ghost" iconOnly aria-label="Ngày trước"
              onClick={() => setDate(addDays(date, -1))} disabled={busy}
            >
              ←
            </Button>
            {/* Ngày là trigger của lịch tháng — mũi tên giữ nguyên cho ±1 ngày.
                Cả hai đường đều bị khoá khi `busy`: có hai đường đổi ngày giữa
                lúc submit là mở lại đúng cái race đã sửa trước đây. */}
            <DatePopover
              value={date} today={today} disabled={busy}
              onChange={(d) => setDate(d)}
            />
            <Button
              variant="ghost" iconOnly aria-label="Ngày sau"
              onClick={() => setDate(addDays(date, 1))} disabled={busy}
            >
              →
            </Button>
            <SettingsButton />
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: space.x2, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: fontSize.md, fontVariantNumeric: 'tabular-nums' }}>
              {formatDuration(totalSeconds)}
            </strong>
            <span style={{ fontSize: fontSize.sm, color: colors.muted }}>
              / {formatDuration(targetSeconds)}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: fontSize.sm, color: colors.muted }}>
              {remaining > 0 ? `còn thiếu ${formatDuration(remaining)}` : 'đã đủ giờ'}
            </span>
          </div>
          <ProgressBar
            value={totalSeconds} max={targetSeconds} height={8}
            label={`Đã log ${formatDuration(totalSeconds)} trên mục tiêu ${formatDuration(targetSeconds)}`}
          />

          {/* Lối tắt log-bù — hành động PHỤ, đi cạnh con số "còn thiếu", không
              cạnh tranh với nút Log. Bị kẹp thì phải nói ra ngay tại chỗ. */}
          {canFill && shortfall && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: space.x2, flexWrap: 'wrap' }}>
              <Button
                variant="secondary" size="sm" onClick={fillShortfall} disabled={busy}
                title={`Điền sẵn ${formatDuration(shortfall.fillMinutes * 60)} vào ô thời lượng,`
                  + ' bắt đầu từ khoảng trống kế tiếp — bạn vẫn chọn issue rồi bấm Log'}
              >
                Lấp {formatDuration(shortfall.fillMinutes * 60)} vào ngày này
              </Button>
              {shortfall.capped && (
                <span style={{ fontSize: fontSize.xs, color: colors.warning }}>
                  từ {formatMinutes(shortfall.proposedStartMinutes)} đến hết ngày chỉ còn
                  {' '}{formatDuration(shortfall.freeMinutes * 60)} trống
                  {' '}(thiếu {formatDuration(shortfall.missingMinutes * 60)})
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Trên lỗi và trên toàn bộ form: đây là thứ duy nhất nói cho người dùng
          biết bản họ đang chạy đã cũ — extension cài bằng Load unpacked thì
          Chrome không tự update giúp. */}
      <UpdateBanner />

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      {lastLogged && (
        <Banner kind="success" action={{ label: 'Undo', onClick: () => void undo() }}>
          {lastLogged.ids.length > 1
            ? `Đã log ${lastLogged.ids.length} worklog vào ${lastLogged.issueKey} (bỏ qua giờ nghỉ)`
            : `Đã log vào ${lastLogged.issueKey}`}
        </Banner>
      )}

      {/* NHÓM 2 — ngày đã trôi qua thế nào. */}
      <Card title="Trong ngày">
        <div style={{ opacity: loadingDay ? 0.55 : 1, transition: 'opacity .12s ease' }}>
          <DayBlocks
            entries={entries}
            workdayStartMinutes={parseHhMm(config.workdayStart)}
            dayEndMinutes={dayEndMinutes}
            breaks={breaks}
            selection={segments}
            meta={issueMeta}
          />
        </div>
      </Card>

      {/* NHÓM 3 — form ghi giờ, kết thúc bằng nút primary. */}
      <Card title="Ghi giờ">
        <div style={{ display: 'grid', gap: space.x3, minWidth: 0 }}>
          <div className="wl-field">
            <span className="wl-field__label">Sprint event</span>
            <EventButtons
              events={resolved ?? []}
              loading={resolved === null || resolving}
              onPick={pickEvent}
            />
          </div>

          <IssuePicker value={issueKey} onChange={setIssueKey} projects={config.projects} />

          <LogForm
            entries={entries}
            presets={config.durationPresets}
            slotMinutes={config.slotMinutes}
            workdayStartMinutes={parseHhMm(config.workdayStart)}
            dayEndMinutes={dayEndMinutes}
            breaks={breaks}
            segments={segments}
            pastEndMinutes={pastEndMinutes}
            startMinutes={startMinutes}
            durationInput={durationInput}
            comment={comment}
            issueKey={issueKey}
            busy={busy}
            overlapKeys={overlapKeys}
            onStartChange={setStartMinutes}
            onDurationChange={setDurationInput}
            onCommentChange={setComment}
            onSubmit={() => void submit()}
          />
        </div>
      </Card>

      <Button variant="ghost" size="sm" onClick={() => void send({ type: 'dashboard/open' })}>
        Mở dashboard team →
      </Button>
    </div>
  )
}
