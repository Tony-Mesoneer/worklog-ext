// src/i18n/en.ts
//
// NGUỒN SỰ THẬT của cả nội dung tiếng Anh lẫn KIỂU của mọi bộ ngôn ngữ khác.
// `Messages` suy ra từ chính object này, nên `vi.ts` khai báo `: Messages` sẽ
// fail lúc build nếu thiếu key, thừa key, hay sai số tham số của một hàm. Không
// có cơ chế fallback runtime nào — thiếu bản dịch là lỗi biên dịch, không phải
// một chuỗi rỗng lọt lên UI.
//
// CỐ TÌNH KHÔNG dùng `as const`: nó sẽ biến mọi giá trị thành literal type, và
// `vi: Messages` phải mang ĐÚNG từng chữ tiếng Anh mới hợp kiểu. Không có nó thì
// string widen về `string` và hàm widen về signature — đúng cái ta cần.
//
// Chuỗi có tham số là HÀM, không phải template có placeholder `{0}`: TS kiểm tra
// số lượng và kiểu tham số ngay tại chỗ gọi, còn placeholder thì sai chỉ lộ ra
// lúc chạy.
//
// Chuỗi có định dạng inline (`<code>`, `<em>`) được viết thành văn xuôi thuần ở
// đây. Giữ markup trong dictionary sẽ buộc nó thành .tsx và không test được như
// dữ liệu; đổi lại là mất phần in đậm/monospace trong vài câu gợi ý.

export const en = {
  common: {
    add: 'Add',
    remove: 'Delete',
    close: 'Close',
    save: 'Save',
    search: 'Search',
    connect: 'Connect',
    loading: 'Loading…',
    retry: 'Retry',
    openOptions: 'Open Options',
    statusTitle: (name: string): string => `Status: ${name}`,
  },

  language: {
    title: '8. Language',
    hint: 'Applies to the side panel, dashboard and this page. The extension name in Chrome follows your browser language and cannot be changed here.',
    label: 'Language',
    // Tên ngôn ngữ KHÔNG dịch: người đang mắc kẹt trong một ngôn ngữ họ không
    // đọc được vẫn phải nhận ra tên ngôn ngữ mình muốn. Giống nhau ở mọi bộ.
    en: 'English',
    vi: 'Tiếng Việt',
  },

  options: {
    pageTitle: 'Worklog — settings',
    pageSubtitle: 'Every change saves immediately; there is no page-wide Save button.',
    authHint:
      'Jira rejected the request (401/403). Your Jira session may have expired, '
      + 'or the token is wrong — try entering your email and API token in section 2.',
    tzMismatch: (jiraTz: string, browserTz: string): string =>
      `Jira timezone (${jiraTz}) differs from this machine (${browserTz}). `
      + 'Worklogs are written in the Jira timezone.',

    jira: {
      title: '1. Jira',
      urlLabel: 'Jira address',
      connected: (name: string, timeZone: string, mode: string): string =>
        `Connected: ${name} · ${timeZone} · ${mode} mode`,
      probeFailed: (reason: string): string =>
        `Could not authenticate with Jira: ${reason}. Try entering an API token in section 2.`,
    },

    token: {
      toggleSaved: (email: string): string =>
        `Using an API token (${email}) — edit or remove`,
      toggleNew: 'Need an API token instead of the session? (fallback)',
      title: 'API token (fallback)',
      hint:
        'By default the extension uses the Jira session you are already signed into in '
        + 'Chrome. You only need a token when that session expires, when you are signed '
        + 'into Jira in a different Chrome profile, or when Jira blocks session requests.',
      saved: (email: string): string =>
        `Token saved for ${email} — token mode is active.`,
      emailLabel: 'Atlassian email',
      emailPlaceholder: 'you@company.com',
      tokenLabel: 'API token',
      tokenPlaceholder: 'API token',
      tokenPlaceholderReplace: 'New token (leave empty to keep the current one)',
      submit: 'Save token and verify',
      clear: 'Remove token, back to session',
      createHint:
        'Create a token at id.atlassian.com → Security → API tokens. The token is stored '
        + 'on this machine only (chrome.storage.local); it is not synced to your Google '
        + 'account and is never sent anywhere except Jira.',
    },

    projects: {
      title: '2. Project',
      keyLabel: 'Project key',
      keyPlaceholder: 'e.g. CAG',
      empty: 'No projects yet.',
      removeAria: (key: string): string => `Remove project ${key}`,
    },

    board: {
      title: '3. Primary board',
      hint: 'Used by the "Current sprint" preset and the Story points tab.',
      needProject: 'Add a project above first.',
      loadError: (projectKey: string, reason: string): string =>
        `Could not load the board list for ${projectKey}: ${reason}`,
      label: 'Board',
      choose: '— choose a board —',
    },

    members: {
      title: '4. Tracked members',
      searchLabel: 'Find someone in Jira',
      searchPlaceholder: 'Name or email',
      empty: 'No members tracked yet — the dashboard will be empty.',
      colMember: 'Member',
      colHoursPerDay: 'Hours/day',
      colActive: 'Active',
      hoursAria: (name: string): string => `Hours per day for ${name}`,
      activeAria: (name: string): string => `${name} is active`,
      removeAria: (name: string): string => `Remove ${name} from the tracked list`,
    },

    events: {
      title: '5. Sprint events',
      hint1:
        'Each event is a one-click button in the side panel. Pick a sub-task by NAME and '
        + 'every new sprint points the button at that sprint\'s own sub-task — no more '
        + 'logging into an old sprint. Enter an issue key only to pin one specific issue.',
      hint2:
        'Each row in the list shows the sub-task name and its parent task, so sub-tasks '
        + 'with the same name can be told apart. A name used by several sub-tasks in the '
        + 'same sprint is locked: the extension matches on the exact name, so it cannot '
        + 'know which one you mean. To use one of them, enter its issue key.',
      loadingSubtasks: 'Loading sub-tasks of the open sprint…',
      loadError: (reason: string): string =>
        `Could not load the sprint's sub-task list (${reason}). You can still pick a `
        + 'saved name, or enter an issue key manually.',
      noSubtasks:
        'The open sprint has no sub-tasks (or no project is selected in section 3) — '
        + 'nothing to pick by name yet.',
      colName: 'Name',
      colSubtask: 'Sub-task in sprint',
      colIssueKey: 'Issue key (pin)',
      colMinutes: 'Default minutes',
      colComment: 'Default comment',
      noMatch: '— use issue key —',
      dupLabel: (value: string, duplicateCount: number, parentLabel: string | null): string =>
        `${value} · duplicate name (${duplicateCount} sub-tasks), cannot be selected`
        + (parentLabel === null ? '' : ` — ${parentLabel}`),
      savedDuplicate: (name: string): string =>
        `${name} — saved, duplicate name in the sprint`,
      savedMissing: (name: string): string =>
        `${name} — saved, not in the open sprint`,
      ambiguous: (count: number, summary: string): string =>
        `There are ${count} sub-tasks named “${summary}” in the open sprint — the `
        + 'extension cannot tell them apart, so the side panel button is disabled. Enter '
        + 'an issue key in the next column to pin exactly one issue.',
      nameAria: (id: string): string => `Name of event ${id}`,
      subtaskAria: (id: string): string => `Sub-task of ${id}`,
      issueKeyAria: (id: string): string => `Pinned issue key of ${id}`,
      minutesAria: (id: string): string => `Default minutes of ${id}`,
      commentAria: (id: string): string => `Default comment of ${id}`,
      removeAria: (id: string): string => `Remove event ${id}`,
      newNamePlaceholder: 'Name',
      newNameAria: 'Name of the new event',
      newSubtaskAria: 'Sub-task of the new event',
      newIssueKeyPlaceholder: 'Issue key',
      newIssueKeyAria: 'Pinned issue key of the new event',
      newMinutesAria: 'Default minutes of the new event',
      newCommentPlaceholder: 'Comment',
      newCommentAria: 'Default comment of the new event',
      issueKeyPlaceholderOptional: '(not needed)',
      issueKeyPlaceholder: 'CAG-123',
    },

    hours: {
      title: '6. Working hours',
      hint:
        'The two halves of the workday. A new worklog gets its start time from these, and '
        + 'no worklog is ever written across the gap between them.',
      throughLunch:
        'Working through lunch? Set "Morning ends" and "Afternoon starts" to the same '
        + 'time — that removes the break entirely and lets one worklog span midday.',
      morningStart: 'Morning starts',
      morningEnd: 'Morning ends',
      afternoonStart: 'Afternoon starts',
      afternoonEnd: 'Afternoon ends',
      breakNote: (from: string, to: string): string => `Break: ${from}–${to}.`,
      noBreakNote: 'No break — worklogs can run straight through midday.',
      invalidTime: 'Use HH:MM, e.g. 08:30.',
      morningOrder: 'Morning must end after it starts.',
      middayOrder: 'Afternoon cannot start before morning ends.',
      afternoonOrder: 'Afternoon must end after it starts.',
      save: 'Save hours',
    },

    update: {
      title: '7. Updates',
      hint:
        'The extension is installed via "Load unpacked", so Chrome cannot update it '
        + 'automatically. This only checks whether the repo has a newer release; download '
        + 'the zip, unpack it over the folder you are using, then hit Reload on '
        + 'chrome://extensions.',
      repoLabel: 'GitHub repo',
      repoPlaceholder: 'owner/worklog-ext',
      repoInvalid: 'Must look like owner/name, not a URL.',
      current: (version: string): string => `Running ${version}`,
      check: 'Check now',
      checking: 'Checking…',
      lastChecked: (when: string): string => `Last checked: ${when}`,
      upToDate: (version: string): string => `You are on the latest version (${version}).`,
      available: (version: string, published: string): string =>
        `Version ${version} is available${published === '' ? '' : ` (${published})`}.`,
      download: 'Download update',
      failed: (reason: string): string => `Could not check: ${reason}`,
      reload: 'Restart extension',
      reloadHint:
        'Already unpacked a new version over the folder you load from? This restarts the '
        + 'extension so it re-reads those files — no download, and no trip to '
        + 'chrome://extensions. This page reloads itself, and anything being written to '
        + 'Jira right now is interrupted.',
    },
  },

  errors: {
    auth:
      'Your Jira session expired or lacks permission. Sign in to Jira again and retry, '
      + 'or enter an API token in Options.',
    // ErrorBoundary là màn hình sập — nó nằm NGOÀI LocaleProvider trong main.tsx,
    // nên nó đọc locale từ bản ghi nhớ cuối cùng (xem lastKnownLocale). Nếu chưa
    // có gì, nó dùng ngôn ngữ mặc định: một màn hình lỗi không được phụ thuộc
    // vào đúng cái provider có thể vừa sập.
    boundary: (message: string): string =>
      `Something went wrong rendering this screen. ${message}`,
    boundaryReload: 'Reload',
    boundaryDetails: 'Error details',
    dismiss: 'Dismiss',
  },

  updateBanner: {
    available: (version: string, current: string): string =>
      `Version ${version} is available (you are on ${current}).`,
    howTo: 'Unpack it over the folder you are using, then hit Reload on chrome://extensions.',
    later: 'Later',
    download: 'Download update',
  },

  sidepanel: {
    settings: 'Settings',
    refresh: 'Reload data from Jira',
    prevDay: 'Previous day',
    nextDay: 'Next day',
    noJira: 'Jira is not configured yet.',
    invalidDuration: 'Invalid duration',
    noIssue: 'No issue selected',
    sprintUnavailable: (reason: string): string => `could not look up the sprint (${reason})`,
    undoFailed: (issueKey: string, reason: string): string =>
      `Could not write the worklog back to ${issueKey}: ${reason}`,
    deleteFailed: (ids: string, issueKey: string): string =>
      `Could not delete worklog ${ids} on ${issueKey} — delete it manually in Jira`,
    remaining: (duration: string): string => `${duration} still missing`,
    enough: 'target met',
    progressLabel: (logged: string, target: string): string =>
      `Logged ${logged} of the ${target} target`,
    fillTitle: (duration: string): string =>
      `Prefills ${duration} into the duration field, starting at the next free slot `
      + '— you still pick an issue and press Log',
    fillButton: (duration: string): string => `Fill ${duration} into this day`,
    fillWarn: (from: string, free: string, missing: string): string =>
      `only ${free} free from ${from} to the end of the day (${missing} short)`,
    deleted: (issueKey: string): string => `Deleted a worklog on ${issueKey}`,
    loggedMulti: (count: number, issueKey: string): string =>
      `Logged ${count} worklogs to ${issueKey} (skipping the break)`,
    logged: (issueKey: string): string => `Logged to ${issueKey}`,
    cardDay: 'Today',
    cardLog: 'Log time',
    openDashboard: 'Open team dashboard →',

    noNote: 'No note',
    deleteAria: (duration: string, issueKey: string, time: string): string =>
      `Delete the ${duration} worklog on ${issueKey} at ${time}`,
    deleteTitle: 'Delete this worklog',

    freeTitle: (duration: string, from: string): string => `${duration} free from ${from}`,
    freeShort: (duration: string): string => `${duration} free`,
    breakTitle: 'Lunch break',
    breakShort: 'lunch',
    // Nhãn cho mốc nằm ngoài giờ làm việc trong dropdown "Start".
    outsideHoursShort: 'off hours',
    willLogHere: 'will log here',
    noWorklog: 'No worklogs today yet.',
    hideTail: 'Hide the end of the day',
    showTail: (duration: string, until: string): string => `+ ${duration} free until ${until}`,

    startLabel: 'Start',
    durationLabel: 'Duration',
    durationPresets: 'Preset durations',
    durationCustom: 'Custom duration',
    noteLabel: 'Note',
    notePlaceholder: 'optional',
    durationUnparsed: (input: string): string =>
      `Could not read “${input}” — try 1h30, 90m, 1.5h`,
    willSplit: (count: number, list: string): string =>
      `Will write ${count} worklogs: ${list}`,
    startInBreak: (from: string, to: string): string =>
      `${from} falls inside the break — will start at ${to} instead`,
    pastEnd: (end: string, workdayEnd: string): string =>
      `Ends at ${end}, past the end of the workday (${workdayEnd})`,
    overlap: (keys: string): string => `Overlaps with ${keys}`,
    logging: 'Writing…',
    logButton: (duration: string): string => `Log ${duration}`.trim(),
    // Liệt kê theo lối của từng ngôn ngữ: "A, B and C" ≠ "A, B và C".
    listJoin: (parts: string[]): string =>
      parts.length <= 1
        ? (parts[0] ?? '')
        : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`,

    todayOpenCalendar: 'Today · open calendar',
    dateOpenCalendar: (date: string): string => `${date} · open calendar`,
    pickDate: 'Pick a date',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    today: 'Today',

    searchIssue: 'Find an issue',
    searchIssuePlaceholder: 'type ≥ 2 characters…',
    noIssueMatch: (query: string): string => `No issue matches “${query}”.`,
    loadingMine: 'Loading your issues…',
    noMine: 'No issues assigned to you in the current sprint.',
    mineLabel: 'Your issues in the sprint',
    parentOf: (parentKey: string, parentSummary: string): string =>
      `↳ under ${parentKey} — ${parentSummary}`,

    resolvingCeremonies: 'Looking up ceremony sub-tasks in the sprint…',
    noEvents: 'No sprint events configured — add them in Options.',
    eventDisabled: (name: string, reason: string): string => `${name} — ${reason}`,
    unknownIssue: 'could not determine the issue',
  },

  dashboard: {
    title: 'Team worklog',
    customRange: 'Custom range',
    memberCount: (count: number): string => `${count} members`,
    tabCoverage: 'Coverage',
    tabPoints: 'Story points vs hours',
    filters: 'Filters',
    summary: 'Summary',
    noMembers: 'No members are being tracked yet.',
    stale: 'Could not fetch fresh data from Jira — showing the last snapshot.',
    noDataError: 'Nothing to show yet — fix the error above, then press "Refresh".',
    loadingData: 'Loading data…',

    presetSprint: 'Current sprint',
    presetThisWeek: 'This week',
    presetLastWeek: 'Last week',
    presetThisMonth: 'This month',
    rangeLabel: 'Date range',
    from: 'From',
    to: 'To',
    allProjects: 'All projects',
    staleAt: (when: string): string => `stale since ${when}`,
    updatedAt: (when: string): string => `updated ${when}`,
    refresh: 'Refresh',

    loggedVsCapacity: 'Logged / capacity',
    toDateNote: (full: string): string => `to date · ${full} for the whole range`,
    coverage: 'Coverage',
    shortHours: 'Short on hours',
    nothingLogged: 'Logged nothing',
    teamProgress: (logged: string, capacity: string, cut: string, full: string): string =>
      `The team logged ${logged} of ${capacity} capacity${cut}, ${full} for the whole range`,
    toDateSuffix: ' to date',

    memberIssue: 'Member / Issue',
    totalToDate: 'Total / to date',
    totalCapacity: 'Total / capacity',
    total: 'Total',
    totalTeam: 'Team total',
    totalByMember: 'Total by member',
    unknownProject: 'Unknown project',
    ownOfParent: ' logged directly on the parent issue',
    expand: (name: string): string => `Expand issues of ${name}`,
    collapse: (name: string): string => `Collapse issues of ${name}`,
    cellAria: (name: string, date: string, hours: string, off: boolean): string =>
      `${name}, ${date}: ${hours}${off ? ', marked as a day off' : ''}`,
    notLoggedYet: 'nothing logged',
    cellTitle: (off: boolean): string =>
      `${off ? 'Day off · ' : ''}Click: details · Right-click: mark as a day off`,
    dayOffShort: 'off',
    memberProgress: (name: string, logged: string, capacity: string, cut: string, full: string): string =>
      `${name}: logged ${logged} of ${capacity} capacity${cut}, ${full} for the whole range`,
    tableCaption:
      'Hours logged per member per day. Every cell is a button: Enter opens that '
      + "day's worklog details, which include a button to mark the day off.",

    detailAria: (memberName: string, date: string): string =>
      `Worklog details for ${memberName} on ${date}`,
    detailNothing: 'nothing logged',
    markDayOff: 'Mark as a day off',
    unmarkDayOff: 'Unmark day off',
    noWorklogs: 'No worklogs.',
    // Panel chi tiết của dashboard chỉ cho sửa giờ CỦA MÌNH: Jira đặt author
    // của worklog = người đang xác thực, nên không thể ghi hộ ai; và xoá giờ
    // của người khác cần quyền project admin nên gần như luôn 403.
    othersReadOnly: 'You can only edit your own hours here.',
    addHere: 'Log time on this day',
    addIssuePlaceholder: 'Issue key, e.g. CAG-123',
    addStartsAt: (time: string): string => `Will start at ${time}`,
    addSubmit: 'Log',
    dayFull: 'No free time left on this day.',

    loadingPoints: 'Loading…',
    noSprintIssues: 'The current sprint has no issues.',
    currentSprint: 'Current sprint',
    median: 'Median',
    noEstimateCount: (count: number): string => `${count} issues without story points`,
    colIssue: 'Issue',
    colAssignee: 'Assignee',
    colStatus: 'Status',
    colPoints: 'Points',
    colLogged: 'Logged',
    notInSprint: 'not in this sprint',
    noPointsCell: 'none',
    outlierTitle: "Far from the sprint's median h/point",
  },
}

/** Kiểu mà mọi bộ ngôn ngữ phải khớp. Suy ra từ `en`, không viết tay. */
export type Messages = typeof en
