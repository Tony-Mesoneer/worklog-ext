// src/ui/sidepanel/IssuePicker.tsx
import { useEffect, useState } from 'react'
import { send } from '@/sw/messages'
import { ErrorBanner, toUiError, type UiError } from '@/ui/shared/errors'
import { colors, radii } from '@/ui/shared/theme'

type Props = { value: string; onChange: (issueKey: string) => void; projects: string[] }

// Nhận issue key từ URL của tab đang mở: /browse/KEY hoặc ?selectedIssue=KEY
const keyFromUrl = (url: string): string | null => {
  const m = /\/browse\/([A-Z][A-Z0-9_]+-\d+)/.exec(url)
    ?? /[?&]selectedIssue=([A-Z][A-Z0-9_]+-\d+)/.exec(url)
  return m?.[1] ?? null
}

const MAX_SHOWN = 10

function IssueButton({ issue, onPick }: {
  issue: { key: string; summary: string }
  onPick: (key: string) => void
}) {
  return (
    <li>
      <button onClick={() => onPick(issue.key)}
              style={{
                width: '100%', textAlign: 'left', fontSize: 12, padding: '4px 6px',
                borderRadius: radii.chip,
              }}>
        <strong>{issue.key}</strong>{' '}
        <span style={{ color: colors.muted }}>
          {issue.summary.length > 48 ? `${issue.summary.slice(0, 48)}…` : issue.summary}
        </span>
      </button>
    </li>
  )
}

export function IssuePicker({ value, onChange, projects }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ key: string; summary: string }[]>([])

  const [mine, setMine] = useState<{ key: string; summary: string }[]>([])
  const [mineLoading, setMineLoading] = useState(true)
  const [mineError, setMineError] = useState<UiError | null>(null)

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
    void send<{ key: string; summary: string }[]>({ type: 'issues/mine' })
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

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input value={value} onChange={(e) => onChange(e.target.value.toUpperCase())}
               placeholder="CAG-123" style={{ width: 100, padding: 4 }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
               placeholder="tìm issue…" style={{ flex: 1, padding: 4 }} />
      </div>

      {showingSearch ? (
        results.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0', maxHeight: 140, overflowY: 'auto' }}>
            {results.map((r) => (
              <IssueButton key={r.key} issue={r}
                           onPick={(k) => { onChange(k); setQuery(''); setResults([]) }} />
            ))}
          </ul>
        )
      ) : (
        <div style={{ margin: '4px 0' }}>
          {mineLoading && <div style={{ fontSize: 12, color: colors.muted }}>Đang tải issue của bạn…</div>}
          {mineError && <ErrorBanner error={mineError} />}
          {!mineLoading && !mineError && mine.length === 0 && (
            <div style={{ fontSize: 12, color: colors.muted }}>
              Không có issue nào assign cho bạn trong sprint hiện tại.
            </div>
          )}
          {!mineLoading && !mineError && mine.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 140, overflowY: 'auto' }}>
              {mine.slice(0, MAX_SHOWN).map((r) => (
                <IssueButton key={r.key} issue={r} onPick={(k) => onChange(k)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
