// src/ui/sidepanel/IssuePicker.tsx
import { useEffect, useId, useState } from 'react'
import { send, type IssuesMineResult, type IssuesRecentResult } from '@/sw/messages'
import type { IssueMeta } from '@/core/issue-hierarchy'
import { StatusBadge } from '@/ui/shared/StatusBadge'
import { ErrorBanner, toUiError, type UiError } from '@/ui/shared/errors'
import { colors, fontSize, space } from '@/ui/shared/theme'
import { useT } from '@/ui/shared/LocaleProvider'
import { ext } from '@/platform/ext'

type Props = { value: string; onChange: (issueKey: string) => void; projects: string[] }

// Nhận issue key từ URL của tab đang mở: /browse/KEY hoặc ?selectedIssue=KEY
const keyFromUrl = (url: string): string | null => {
  const m = /\/browse\/([A-Z][A-Z0-9_]+-\d+)/.exec(url)
    ?? /[?&]selectedIssue=([A-Z][A-Z0-9_]+-\d+)/.exec(url)
  return m?.[1] ?? null
}

const MAX_SHOWN = 10

// `meta` optional: kết quả GÕ TÌM (pickIssues: /issue/picker + JQL key/text)
// chỉ có key + summary. Không có meta thì nút hiện đúng như trước — một dòng,
// không badge, không dòng cha.
function IssueButton({ issue, meta, current, onPick }: {
  issue: { key: string; summary: string }
  meta?: IssueMeta | undefined
  current: boolean
  onPick: (key: string) => void
}) {
  const t = useT()
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
          + (parentKey ? `\n${t.sidepanel.parentOf(parentKey, meta?.parentSummary ?? '')}` : '')
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
  const t = useT()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ key: string; summary: string }[]>([])

  const [mine, setMine] = useState<IssueMeta[]>([])
  const [mineLoading, setMineLoading] = useState(true)
  const [mineError, setMineError] = useState<UiError | null>(null)

  // `recent` KHÔNG có state lỗi riêng: nó là danh sách bổ sung, và lỗi của nó
  // gần như luôn cùng nguyên nhân với lỗi của `mine` (chưa cấu hình, hết
  // session, Jira sập) — mà cái đó ErrorBanner của `mine` đã nói. Hai banner
  // cùng nội dung trong một panel 320px là ồn, không phải thông tin.
  const [recent, setRecent] = useState<IssueMeta[]>([])

  const keyFieldId = useId()
  const searchFieldId = useId()

  // Prefill từ tab đang active. Chỉ chạy một lần khi mở panel.
  useEffect(() => {
    void ext.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
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

  // Issue vừa log giờ gần đây — bù đúng chỗ `issues/mine` bỏ sót: việc không
  // assign cho mình, việc của sprint đã đóng, việc ngoài sprint. Ceremony đã bị
  // service worker loại (excludeSprintEventIssues) vì chúng có nút riêng.
  useEffect(() => {
    let cancelled = false
    void send<IssuesRecentResult>({ type: 'issues/recent' })
      .then((r) => { if (!cancelled) setRecent(r) })
      .catch(() => { if (!cancelled) setRecent([]) })
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

  const mineShown = mine.slice(0, MAX_SHOWN)
  // Issue đã có ở danh sách trên thì không lặp lại: cùng một ticket hiện hai
  // lần trong một panel hẹp làm người dùng phải đọc hai lần để biết đó là một.
  const mineKeys = new Set(mineShown.map((r) => r.key))
  const recentShown = recent.filter((r) => !mineKeys.has(r.key)).slice(0, MAX_SHOWN)

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
          <label className="wl-field__label" htmlFor={searchFieldId}>{t.sidepanel.searchIssue}</label>
          <input
            id={searchFieldId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.sidepanel.searchIssuePlaceholder}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* BẤT ĐỐI XỨNG CÓ CHỦ Ý: danh sách dưới (gõ tìm) không có badge trạng
          thái, danh sách "issue của bạn trong sprint" thì có.
          Gõ tìm đi qua /rest/api/3/issue/picker — endpoint duy nhất xếp hạng
          theo issue người dùng VỪA XEM, điều JQL không làm được — cộng một JQL
          key/text chạy song song để bắt issue CHƯA từng xem (xem pickIssues).
          Picker chỉ trả key + summary; thiếu badge ở đây là cái giá đã cân
          nhắc. */}
      {showingSearch ? (
        results.length === 0 ? (
          <div style={hint}>{t.sidepanel.noIssueMatch(query.trim())}</div>
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
          {mineLoading && <div style={hint}>{t.sidepanel.loadingMine}</div>}
          {mineError && <ErrorBanner error={mineError} />}
          {!mineLoading && !mineError && mineShown.length === 0 && (
            <div style={hint}>
              {recentShown.length === 0 ? t.sidepanel.noMineNoRecent : t.sidepanel.noMine}
            </div>
          )}
          {!mineError && (mineShown.length > 0 || recentShown.length > 0) && (
            // MỘT vùng cuộn cho cả hai mục, không phải hai vùng cuộn cạnh nhau:
            // hai <ul> mỗi cái cao 132px đẩy nút Log ra khỏi vùng nhìn của panel
            // 320px, và người dùng phải cuộn hai lần để đọc một danh sách gợi ý.
            <div style={{ display: 'grid', gap: space.x1, maxHeight: 200, overflowY: 'auto' }}>
              {mineShown.length > 0 && (
                <>
                  <span className="wl-field__label">{t.sidepanel.mineLabel}</span>
                  <ul className="wl-list">
                    {mineShown.map((r) => (
                      <IssueButton
                        key={r.key} issue={r} meta={r} current={r.key === value}
                        onPick={(k) => onChange(k)}
                      />
                    ))}
                  </ul>
                </>
              )}
              {recentShown.length > 0 && (
                <>
                  <span className="wl-field__label">{t.sidepanel.recentLabel}</span>
                  <ul className="wl-list">
                    {recentShown.map((r) => (
                      <IssueButton
                        key={r.key} issue={r} meta={r} current={r.key === value}
                        onPick={(k) => onChange(k)}
                      />
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
