// src/ui/sidepanel/IssuePicker.tsx
import { useEffect, useId, useState } from 'react'
import { send, type IssuesMineResult } from '@/sw/messages'
import type { IssueMeta } from '@/core/issue-hierarchy'
import { StatusBadge } from '@/ui/shared/StatusBadge'
import { ErrorBanner, toUiError, type UiError } from '@/ui/shared/errors'
import { colors, fontSize, space } from '@/ui/shared/theme'

type Props = { value: string; onChange: (issueKey: string) => void; projects: string[] }

// Nhận issue key từ URL của tab đang mở: /browse/KEY hoặc ?selectedIssue=KEY
const keyFromUrl = (url: string): string | null => {
  const m = /\/browse\/([A-Z][A-Z0-9_]+-\d+)/.exec(url)
    ?? /[?&]selectedIssue=([A-Z][A-Z0-9_]+-\d+)/.exec(url)
  return m?.[1] ?? null
}

const MAX_SHOWN = 10

// `meta` optional: kết quả GÕ TÌM đi qua /rest/api/3/issue/picker, endpoint đó
// chỉ trả key + summary. Không có meta thì nút hiện đúng như trước — một dòng,
// không badge, không dòng cha.
function IssueButton({ issue, meta, current, onPick }: {
  issue: { key: string; summary: string }
  meta?: IssueMeta | undefined
  current: boolean
  onPick: (key: string) => void
}) {
  const parentKey = meta?.parentKey ?? null
  return (
    <li>
      {/* aria-current: issue đang chọn được tô accent, đó là chỗ accent làm
          việc thật — trước đây không có phản hồi nào cho lựa chọn. */}
      <button
        type="button"
        className="wl-option"
        aria-current={current}
        onClick={() => onPick(issue.key)}
        title={
          `${issue.key} — ${issue.summary}`
          + (meta && meta.statusName !== '' ? ` · ${meta.statusName}` : '')
          + (parentKey ? `\n↳ thuộc ${parentKey} — ${meta?.parentSummary ?? ''}` : '')
        }
      >
        <span className="wl-option__row">
          <span className="wl-option__key">{issue.key}</span>
          {meta && <StatusBadge name={meta.statusName} category={meta.statusCategory} />}
          <span className="wl-option__sum">{issue.summary}</span>
        </span>
        {/* Dòng thứ hai CHỈ khi là sub-task: nó trả lời "cái này nằm trong việc
            nào", câu hỏi mà danh sách phẳng cũ không trả lời được. */}
        {parentKey !== null && (
          <span className="wl-option__parent">
            ↳ {parentKey}{meta?.parentSummary ? ` ${meta.parentSummary}` : ''}
          </span>
        )}
      </button>
    </li>
  )
}

export function IssuePicker({ value, onChange, projects }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ key: string; summary: string }[]>([])

  const [mine, setMine] = useState<IssueMeta[]>([])
  const [mineLoading, setMineLoading] = useState(true)
  const [mineError, setMineError] = useState<UiError | null>(null)

  const keyFieldId = useId()
  const searchFieldId = useId()

  // Prefill từ tab đang active. Chỉ chạy một lần khi mở panel.
  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const k = tab?.url ? keyFromUrl(tab.url) : null
      if (k) onChange(k)
    })
  }, [])

  // Danh sách issue của mình trong sprint hiện tại — lựa chọn mặc định khi ô
  // tìm kiếm còn trống (spec §7), thay vì bắt gõ ≥2 ký tự mới thấy gì đó.
  useEffect(() => {
    let cancelled = false
    setMineLoading(true)
    setMineError(null)
    void send<IssuesMineResult>({ type: 'issues/mine' })
      .then((r) => { if (!cancelled) setMine(r) })
      .catch((e: unknown) => { if (!cancelled) setMineError(toUiError(e)) })
      .finally(() => { if (!cancelled) setMineLoading(false) })
    return () => { cancelled = true }
  }, [projects])

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    let cancelled = false
    const timer = setTimeout(() => {
      void send<{ key: string; summary: string }[]>({ type: 'issues/pick', query })
        .then((r) => { if (!cancelled) setResults(r) })
        .catch(() => { if (!cancelled) setResults([]) })
    }, 250) // debounce: mỗi ký tự một request là lạm dụng rate limit
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  const showingSearch = query.trim().length >= 2
  const hint = { fontSize: fontSize.sm, color: colors.muted }

  return (
    <div style={{ display: 'grid', gap: space.x2, minWidth: 0 }}>
      {/* Hai ô cùng hàng nhưng WRAP được: panel Chrome hẹp tới 320px, không
          được sinh cuộn ngang. */}
      <div style={{ display: 'flex', gap: space.x2, flexWrap: 'wrap' }}>
        <div className="wl-field" style={{ flex: '0 0 104px' }}>
          <label className="wl-field__label" htmlFor={keyFieldId}>Issue key</label>
          <input
            id={keyFieldId}
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            placeholder="CAG-123"
            style={{ width: '100%' }}
          />
        </div>
        <div className="wl-field" style={{ flex: '1 1 130px' }}>
          <label className="wl-field__label" htmlFor={searchFieldId}>Tìm issue</label>
          <input
            id={searchFieldId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="gõ ≥ 2 ký tự…"
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* BẤT ĐỐI XỨNG CÓ CHỦ Ý: danh sách dưới (gõ tìm) không có badge trạng
          thái, danh sách "issue của bạn trong sprint" thì có.
          Gõ tìm đi qua /rest/api/3/issue/picker — endpoint duy nhất xếp hạng
          theo issue người dùng VỪA XEM, điều JQL không làm được — và nó chỉ trả
          key + summary. Đổi sang JQL để lấy status là mất đúng cái làm nó hữu
          ích; bắn thêm request thứ hai để bù metadata thì mỗi lần gõ tốn hai
          round-trip. Thiếu badge ở đây là cái giá đã cân nhắc. */}
      {showingSearch ? (
        results.length === 0 ? (
          <div style={hint}>Không tìm thấy issue nào khớp "{query.trim()}".</div>
        ) : (
          <ul className="wl-list" style={{ maxHeight: 132, overflowY: 'auto' }}>
            {results.map((r) => (
              <IssueButton
                key={r.key} issue={r} current={r.key === value}
                onPick={(k) => { onChange(k); setQuery(''); setResults([]) }}
              />
            ))}
          </ul>
        )
      ) : (
        <>
          {mineLoading && <div style={hint}>Đang tải issue của bạn…</div>}
          {mineError && <ErrorBanner error={mineError} />}
          {!mineLoading && !mineError && mine.length === 0 && (
            <div style={hint}>Không có issue nào assign cho bạn trong sprint hiện tại.</div>
          )}
          {!mineLoading && !mineError && mine.length > 0 && (
            <>
              <span className="wl-field__label">Issue của bạn trong sprint</span>
              <ul className="wl-list" style={{ maxHeight: 132, overflowY: 'auto' }}>
                {mine.slice(0, MAX_SHOWN).map((r) => (
                  <IssueButton
                    key={r.key} issue={r} meta={r} current={r.key === value}
                    onPick={(k) => onChange(k)}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
