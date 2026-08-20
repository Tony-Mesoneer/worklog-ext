/*
 * Map config sprintEvent hiện tại sang matchSummary (resolve theo tên).
 *
 * CÁCH CHẠY
 *   1. Mở trang Options của extension (nút ⚙ trong side panel)
 *   2. DevTools (Cmd+Opt+I) → Console → paste file này → Enter
 *   3. Reload trang Options và side panel
 *
 * Snippet KHÔNG in ra token. Nó chỉ sửa sprintEvents, không chạm field khác.
 * Summary dưới đây đã đối chiếu với Jira thật (CAG, sprint đang mở, 2026-08-20).
 */
(async () => {
  // Map theo issueKey đã biết — chắc chắn nhất.
  const BY_KEY = {
    'CAG-3064': 'Sprint Planning',
    'CAG-3065': 'Daily Scrum',
    'CAG-3066': 'Sprint Review',
    'CAG-3067': 'Sprint Retro',
    'CAG-3068': 'Backlog Refinement',
  }
  // Dự phòng: map theo tên event nếu issueKey không nằm trong bảng trên
  // (ví dụ bạn từng điền key placeholder CAG-100..103).
  const BY_NAME = [
    [/daily|standup/i, 'Daily Scrum'],
    [/planning/i, 'Sprint Planning'],
    [/refine|grooming/i, 'Backlog Refinement'],
    [/review|demo/i, 'Sprint Review'],
    [/retro/i, 'Sprint Retro'],
  ]

  const { config } = await chrome.storage.local.get('config')
  if (!config) { console.log('❌ Chưa có config nào trong storage. Cấu hình Options trước.'); return }

  const events = Array.isArray(config.sprintEvents) ? config.sprintEvents : []
  if (events.length === 0) { console.log('❌ Config chưa có sprintEvent nào.'); return }

  const rows = []
  const next = events.map((e) => {
    const key = String(e.issueKey ?? '').trim()
    const name = String(e.name ?? '')
    const already = String(e.matchSummary ?? '').trim()

    const summary = already
      || BY_KEY[key]
      || (BY_NAME.find(([re]) => re.test(name)) ?? [])[1]
      || ''

    rows.push({
      'Tên': name,
      'issueKey cũ': key || '—',
      'matchSummary mới': summary || '⚠️ KHÔNG MAP ĐƯỢC',
      'Kết quả': summary ? (already ? 'đã có, giữ nguyên' : 'đã map') : 'giữ nguyên key cứng',
    })

    // Chỉ xoá issueKey khi đã có matchSummary; nếu không map được thì giữ
    // nguyên hoàn toàn, vì event mất cả hai sẽ bị migrateConfig loại bỏ.
    return summary
      ? { ...e, matchSummary: summary, issueKey: '' }
      : { ...e }
  })

  console.table(rows)

  const unmapped = rows.filter((r) => r['matchSummary mới'].startsWith('⚠️')).length
  await chrome.storage.local.set({ config: { ...config, sprintEvents: next } })

  console.log(`✅ Đã ghi ${next.length} event. ${unmapped ? `⚠️ ${unmapped} event chưa map được — sửa tay trong Options.` : 'Tất cả đã map.'}`)
  console.log('Giờ reload trang Options và side panel. Bấm thử nút Daily: nó phải prefill CAG-3065.')

  // Kiểm luôn migration giờ làm việc đã áp chưa.
  console.log('Giờ làm việc hiện tại:', {
    version: config.version,
    workdayStart: config.workdayStart,
    workdayEnd: config.workdayEnd,
    breaks: config.breaks,
  })
})()
