// src/ui/sidepanel/IssuePicker.tsx
import { useEffect, useState } from 'react'
import { send } from '@/sw/messages'

type Props = { value: string; onChange: (issueKey: string) => void }

// Nhận issue key từ URL của tab đang mở: /browse/KEY hoặc ?selectedIssue=KEY
const keyFromUrl = (url: string): string | null => {
  const m = /\/browse\/([A-Z][A-Z0-9_]+-\d+)/.exec(url)
    ?? /[?&]selectedIssue=([A-Z][A-Z0-9_]+-\d+)/.exec(url)
  return m?.[1] ?? null
}

export function IssuePicker({ value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ key: string; summary: string }[]>([])

  // Prefill từ tab đang active. Chỉ chạy một lần khi mở panel.
  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const k = tab?.url ? keyFromUrl(tab.url) : null
      if (k) onChange(k)
    })
  }, [])

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

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input value={value} onChange={(e) => onChange(e.target.value.toUpperCase())}
               placeholder="CAG-123" style={{ width: 100, padding: 4 }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
               placeholder="tìm issue…" style={{ flex: 1, padding: 4 }} />
      </div>
      {results.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0', maxHeight: 140, overflowY: 'auto' }}>
          {results.map((r) => (
            <li key={r.key}>
              <button onClick={() => { onChange(r.key); setQuery(''); setResults([]) }}
                      style={{ width: '100%', textAlign: 'left', fontSize: 12, padding: 3 }}>
                <strong>{r.key}</strong> {r.summary}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
