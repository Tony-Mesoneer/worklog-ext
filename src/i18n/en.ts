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
  },

  language: {
    title: '7. Language',
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

    update: {
      title: '6. Updates',
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
    },
  },
}

/** Kiểu mà mọi bộ ngôn ngữ phải khớp. Suy ra từ `en`, không viết tay. */
export type Messages = typeof en
