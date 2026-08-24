// src/i18n/vi.ts
//
// Bản tiếng Việt. `: Messages` là toàn bộ cơ chế kiểm tra: thiếu key, thừa key,
// hay một hàm sai số tham số đều fail lúc `tsc`. Không có fallback runtime.
//
// Đây là các chuỗi NGUYÊN BẢN của app (UI viết bằng tiếng Việt trước khi có
// i18n), nên bản này là bản gốc chứ không phải bản dịch — giữ đúng từng chữ đã
// có để không ai thấy câu chữ đổi khi nâng cấp.
import type { Messages } from './en'

export const vi: Messages = {
  common: {
    add: 'Thêm',
    remove: 'Xoá',
    close: 'Đóng',
    save: 'Lưu',
    search: 'Tìm',
    connect: 'Kết nối',
    loading: 'Đang tải…',
    retry: 'Thử lại',
    openOptions: 'Mở Options',
    statusTitle: (name: string): string => `Trạng thái: ${name}`,
  },

  language: {
    title: '7. Ngôn ngữ',
    hint: 'Áp dụng cho side panel, dashboard và trang này. Tên extension trong Chrome đi theo ngôn ngữ của browser, không đổi được ở đây.',
    label: 'Ngôn ngữ',
    en: 'English',
    vi: 'Tiếng Việt',
  },

  options: {
    pageTitle: 'Worklog — cấu hình',
    pageSubtitle: 'Mỗi thay đổi lưu ngay, không có nút Save toàn trang.',
    authHint:
      'Jira từ chối request (401/403). Session Jira có thể đã hết hạn, hoặc token sai '
      + '— thử nhập email + API token ở mục 2.',
    tzMismatch: (jiraTz: string, browserTz: string): string =>
      `Timezone Jira (${jiraTz}) khác timezone máy (${browserTz}). `
      + 'Worklog sẽ ghi theo timezone Jira.',

    jira: {
      title: '1. Jira',
      urlLabel: 'Địa chỉ Jira',
      connected: (name: string, timeZone: string, mode: string): string =>
        `Đã kết nối: ${name} · ${timeZone} · chế độ ${mode}`,
      probeFailed: (reason: string): string =>
        `Không xác thực được với Jira: ${reason}. Thử nhập API token ở mục 2.`,
    },

    token: {
      toggleSaved: (email: string): string =>
        `Đang dùng API token (${email}) — sửa hoặc xoá`,
      toggleNew: 'Cần dùng API token thay vì session? (dự phòng)',
      title: 'API token (dự phòng)',
      hint:
        'Mặc định extension dùng session Jira đang đăng nhập trong Chrome. Chỉ cần token '
        + 'khi session hết hạn, khi bạn đăng nhập Jira ở profile Chrome khác, hoặc khi '
        + 'Jira chặn request bằng session.',
      saved: (email: string): string =>
        `Đã lưu token cho ${email} — đang dùng chế độ token.`,
      emailLabel: 'Email Atlassian',
      emailPlaceholder: 'ten@cong-ty.com',
      tokenLabel: 'API token',
      tokenPlaceholder: 'API token',
      tokenPlaceholderReplace: 'Token mới (để trống nếu không đổi)',
      submit: 'Lưu token và kiểm tra',
      clear: 'Xoá token, quay lại session',
      createHint:
        'Tạo token tại id.atlassian.com → Security → API tokens. Token chỉ lưu trong máy '
        + 'này (chrome.storage.local), không đồng bộ lên Google account và không gửi đi '
        + 'đâu ngoài Jira.',
    },

    projects: {
      title: '2. Project',
      keyLabel: 'Project key',
      keyPlaceholder: 'vd. CAG',
      empty: 'Chưa có project nào.',
      removeAria: (key: string): string => `Xoá project ${key}`,
    },

    board: {
      title: '3. Board chính',
      hint: 'Dùng cho preset "Sprint hiện tại" và tab Story points.',
      needProject: 'Thêm một project ở trên trước đã.',
      loadError: (projectKey: string, reason: string): string =>
        `Không lấy được danh sách board của ${projectKey}: ${reason}`,
      label: 'Board',
      choose: '— chọn board —',
    },

    members: {
      title: '4. Member theo dõi',
      searchLabel: 'Tìm người trong Jira',
      searchPlaceholder: 'Tên hoặc email',
      empty: 'Chưa theo dõi member nào — dashboard sẽ trống.',
      colMember: 'Member',
      colHoursPerDay: 'Giờ/ngày',
      colActive: 'Active',
      hoursAria: (name: string): string => `Giờ mỗi ngày của ${name}`,
      activeAria: (name: string): string => `${name} đang active`,
      removeAria: (name: string): string => `Xoá ${name} khỏi danh sách theo dõi`,
    },

    events: {
      title: '5. Sprint event',
      hint1:
        'Mỗi event là một nút một-cú-bấm trong side panel. Chọn sub-task theo TÊN thì mỗi '
        + 'sprint mới nút tự trỏ sang sub-task mới của sprint đó — không còn ghi giờ vào '
        + 'sprint cũ. Chỉ nhập issue key khi muốn ghim cứng một issue.',
      hint2:
        'Mỗi dòng trong danh sách hiện tên sub-task — task cha để phân biệt các sub-task '
        + 'trùng tên. Tên nào bị nhiều sub-task dùng trong cùng sprint thì bị khoá: '
        + 'extension khớp theo tên chính xác nên không thể biết chọn cái nào. Muốn dùng '
        + 'đúng một trong số đó thì nhập issue key.',
      loadingSubtasks: 'Đang tải sub-task của sprint đang mở…',
      loadError: (reason: string): string =>
        `Không tải được danh sách sub-task của sprint (${reason}). Vẫn chọn được tên đã `
        + 'lưu, hoặc nhập issue key thủ công.',
      noSubtasks:
        'Sprint đang mở không có sub-task nào (hoặc chưa chọn project ở mục 3) — chưa có '
        + 'gì để chọn theo tên.',
      colName: 'Tên',
      colSubtask: 'Sub-task trong sprint',
      colIssueKey: 'Issue key (ghim)',
      colMinutes: 'Phút mặc định',
      colComment: 'Comment mặc định',
      noMatch: '— dùng issue key —',
      dupLabel: (value: string, duplicateCount: number, parentLabel: string | null): string =>
        `${value} · trùng tên (${duplicateCount} sub-task), không chọn được`
        + (parentLabel === null ? '' : ` — ${parentLabel}`),
      savedDuplicate: (name: string): string =>
        `${name} — đang lưu, trùng tên trong sprint`,
      savedMissing: (name: string): string =>
        `${name} — đang lưu, không có trong sprint đang mở`,
      ambiguous: (count: number, summary: string): string =>
        `Có ${count} sub-task tên “${summary}” trong sprint đang mở — extension không `
        + 'phân biệt được cái nào, nên nút trong side panel bị khoá. Nhập issue key ở cột '
        + 'bên cạnh để ghim đúng một issue.',
      nameAria: (id: string): string => `Tên event ${id}`,
      subtaskAria: (id: string): string => `Sub-task của ${id}`,
      issueKeyAria: (id: string): string => `Issue key ghim của ${id}`,
      minutesAria: (id: string): string => `Phút mặc định của ${id}`,
      commentAria: (id: string): string => `Comment mặc định của ${id}`,
      removeAria: (id: string): string => `Xoá event ${id}`,
      newNamePlaceholder: 'Tên',
      newNameAria: 'Tên event mới',
      newSubtaskAria: 'Sub-task của event mới',
      newIssueKeyPlaceholder: 'Issue key',
      newIssueKeyAria: 'Issue key ghim của event mới',
      newMinutesAria: 'Phút mặc định của event mới',
      newCommentPlaceholder: 'Comment',
      newCommentAria: 'Comment mặc định của event mới',
      issueKeyPlaceholderOptional: '(không cần)',
      issueKeyPlaceholder: 'CAG-123',
    },

    update: {
      title: '6. Cập nhật',
      hint:
        'Extension cài bằng "Load unpacked" nên Chrome không tự cập nhật. Ở đây chỉ kiểm '
        + 'tra xem repo đã có release mới hơn chưa; tải zip, giải nén thay thư mục đang '
        + 'dùng, rồi bấm Reload ở chrome://extensions.',
      repoLabel: 'Repo GitHub',
      repoPlaceholder: 'owner/worklog-ext',
      repoInvalid: 'Phải là dạng owner/tên, không phải URL.',
      current: (version: string): string => `Đang dùng ${version}`,
      check: 'Kiểm tra ngay',
      checking: 'Đang kiểm tra…',
      lastChecked: (when: string): string => `Kiểm tra lần cuối: ${when}`,
      upToDate: (version: string): string => `Đang ở bản mới nhất (${version}).`,
      available: (version: string, published: string): string =>
        `Có bản ${version}${published === '' ? '' : ` (${published})`}.`,
      download: 'Tải bản mới',
      failed: (reason: string): string => `Chưa kiểm tra được: ${reason}`,
      reload: 'Khởi động lại extension',
      reloadHint:
        'Đã giải nén bản mới đè lên thư mục đang load? Nút này khởi động lại extension để '
        + 'nó đọc lại đúng những file đó — không tải gì, và không phải vào '
        + 'chrome://extensions. Trang này sẽ tự tải lại, và việc đang ghi vào Jira (nếu '
        + 'có) sẽ bị cắt ngang.',
    },
  },

  errors: {
    auth:
      'Session Jira hết hạn hoặc không đủ quyền. Đăng nhập lại Jira rồi thử lại, hoặc '
      + 'nhập API token trong Options.',
    boundary: (message: string): string =>
      `Đã có lỗi khi hiển thị màn hình này. ${message}`,
    boundaryReload: 'Tải lại',
    boundaryDetails: 'Chi tiết lỗi',
    dismiss: 'Ẩn',
  },

  updateBanner: {
    available: (version: string, current: string): string =>
      `Có bản ${version} (đang dùng ${current}).`,
    howTo: 'Giải nén thay thư mục đang dùng, rồi bấm Reload ở chrome://extensions.',
    later: 'Để sau',
    download: 'Tải bản mới',
  },

  sidepanel: {
    settings: 'Cấu hình',
    prevDay: 'Ngày trước',
    nextDay: 'Ngày sau',
    noJira: 'Chưa cấu hình Jira.',
    invalidDuration: 'Duration không hợp lệ',
    noIssue: 'Chưa chọn issue',
    sprintUnavailable: (reason: string): string => `không tra được sprint (${reason})`,
    undoFailed: (issueKey: string, reason: string): string =>
      `Không ghi lại được worklog trên ${issueKey}: ${reason}`,
    deleteFailed: (ids: string, issueKey: string): string =>
      `Không xoá được worklog ${ids} trên ${issueKey} — xoá tay trong Jira`,
    remaining: (duration: string): string => `còn thiếu ${duration}`,
    enough: 'đã đủ giờ',
    progressLabel: (logged: string, target: string): string =>
      `Đã log ${logged} trên mục tiêu ${target}`,
    fillTitle: (duration: string): string =>
      `Điền sẵn ${duration} vào ô thời lượng, bắt đầu từ khoảng trống kế tiếp `
      + '— bạn vẫn chọn issue rồi bấm Log',
    fillButton: (duration: string): string => `Lấp ${duration} vào ngày này`,
    fillWarn: (from: string, free: string, missing: string): string =>
      `từ ${from} đến hết ngày chỉ còn ${free} trống (thiếu ${missing})`,
    deleted: (issueKey: string): string => `Đã xoá worklog trên ${issueKey}`,
    loggedMulti: (count: number, issueKey: string): string =>
      `Đã log ${count} worklog vào ${issueKey} (bỏ qua giờ nghỉ)`,
    logged: (issueKey: string): string => `Đã log vào ${issueKey}`,
    cardDay: 'Trong ngày',
    cardLog: 'Ghi giờ',
    openDashboard: 'Mở dashboard team →',

    noNote: 'Không có ghi chú',
    deleteAria: (duration: string, issueKey: string, time: string): string =>
      `Xoá worklog ${duration} trên ${issueKey} lúc ${time}`,
    deleteTitle: 'Xoá worklog này',

    freeTitle: (duration: string, from: string): string => `Trống ${duration} từ ${from}`,
    freeShort: (duration: string): string => `trống ${duration}`,
    breakTitle: 'Giờ nghỉ trưa',
    breakShort: 'nghỉ trưa',
    willLogHere: 'sẽ ghi vào đây',
    noWorklog: 'Chưa có worklog nào trong ngày.',
    hideTail: 'Ẩn phần cuối ngày',
    showTail: (duration: string, until: string): string => `+ trống ${duration} tới ${until}`,

    startLabel: 'Bắt đầu',
    durationLabel: 'Thời lượng',
    durationPresets: 'Thời lượng có sẵn',
    durationCustom: 'Thời lượng tự nhập',
    noteLabel: 'Ghi chú',
    notePlaceholder: 'không bắt buộc',
    durationUnparsed: (input: string): string =>
      `Không hiểu “${input}” — thử 1h30, 90m, 1.5h`,
    willSplit: (count: number, list: string): string =>
      `Sẽ ghi ${count} worklog: ${list}`,
    startInBreak: (from: string, to: string): string =>
      `${from} nằm trong giờ nghỉ — sẽ ghi từ ${to}`,
    pastEnd: (end: string, workdayEnd: string): string =>
      `Kết thúc ${end}, quá giờ tan làm ${workdayEnd}`,
    overlap: (keys: string): string => `Chồng giờ với ${keys}`,
    logging: 'Đang ghi…',
    logButton: (duration: string): string => `Log ${duration}`.trim(),
    listJoin: (parts: string[]): string =>
      parts.length <= 1
        ? (parts[0] ?? '')
        : `${parts.slice(0, -1).join(', ')} và ${parts[parts.length - 1]}`,

    todayOpenCalendar: 'Hôm nay · mở lịch',
    dateOpenCalendar: (date: string): string => `${date} · mở lịch`,
    pickDate: 'Chọn ngày',
    prevMonth: 'Tháng trước',
    nextMonth: 'Tháng sau',
    today: 'Hôm nay',

    searchIssue: 'Tìm issue',
    searchIssuePlaceholder: 'gõ ≥ 2 ký tự…',
    noIssueMatch: (query: string): string => `Không tìm thấy issue nào khớp “${query}”.`,
    loadingMine: 'Đang tải issue của bạn…',
    noMine: 'Không có issue nào assign cho bạn trong sprint hiện tại.',
    mineLabel: 'Issue của bạn trong sprint',
    parentOf: (parentKey: string, parentSummary: string): string =>
      `↳ thuộc ${parentKey} — ${parentSummary}`,

    resolvingCeremonies: 'Đang tra sub-task ceremony trong sprint…',
    noEvents: 'Chưa cấu hình sprint event — thêm trong Options.',
    eventDisabled: (name: string, reason: string): string => `${name} — ${reason}`,
    unknownIssue: 'không xác định được issue',
  },

  dashboard: {
    title: 'Worklog team',
    customRange: 'Khoảng tự chọn',
    memberCount: (count: number): string => `${count} member`,
    tabCoverage: 'Coverage',
    tabPoints: 'Story points vs giờ',
    filters: 'Bộ lọc',
    summary: 'Tóm tắt',
    noMembers: 'Chưa chọn member nào để theo dõi.',
    stale: 'Không lấy được dữ liệu mới từ Jira — đang hiện snapshot cũ.',
    noDataError: 'Chưa có dữ liệu nào để hiện — xử lý lỗi ở trên rồi bấm "Làm mới".',
    loadingData: 'Đang tải dữ liệu…',

    presetSprint: 'Sprint hiện tại',
    presetThisWeek: 'Tuần này',
    presetLastWeek: 'Tuần trước',
    presetThisMonth: 'Tháng này',
    rangeLabel: 'Khoảng thời gian',
    from: 'Từ ngày',
    to: 'Đến ngày',
    allProjects: 'Tất cả project',
    staleAt: (when: string): string => `dữ liệu cũ lúc ${when}`,
    updatedAt: (when: string): string => `cập nhật ${when}`,
    refresh: 'Làm mới',

    loggedVsCapacity: 'Đã log / capacity',
    toDateNote: (full: string): string => `tới hôm nay · ${full} cả kỳ`,
    coverage: 'Coverage',
    shortHours: 'Thiếu giờ',
    nothingLogged: 'Chưa log gì',
    teamProgress: (logged: string, capacity: string, cut: string, full: string): string =>
      `Cả team đã log ${logged} trên capacity ${capacity}${cut}, cả kỳ ${full}`,
    toDateSuffix: ' tới hôm nay',

    memberIssue: 'Member / Issue',
    totalToDate: 'Tổng / tới hôm nay',
    totalCapacity: 'Tổng / capacity',
    total: 'Tổng',
    totalTeam: 'Tổng cả team',
    totalByMember: 'Tổng theo member',
    unknownProject: 'Không rõ project',
    ownOfParent: ' giờ ghi trực tiếp trên issue cha',
    expand: (name: string): string => `Mở rộng issue của ${name}`,
    collapse: (name: string): string => `Thu gọn issue của ${name}`,
    cellAria: (name: string, date: string, hours: string, off: boolean): string =>
      `${name}, ${date}: ${hours}${off ? ', đã đánh dấu nghỉ' : ''}`,
    notLoggedYet: 'chưa log giờ',
    cellTitle: (off: boolean): string =>
      `${off ? 'Ngày nghỉ · ' : ''}Bấm: xem chi tiết · Bấm phải: đánh dấu nghỉ`,
    dayOffShort: 'off',
    memberProgress: (name: string, logged: string, capacity: string, cut: string, full: string): string =>
      `${name}: đã log ${logged} trên capacity ${capacity}${cut}, cả kỳ ${full}`,
    tableCaption:
      'Giờ đã log của từng member theo ngày. Mỗi ô là một nút: Enter mở chi tiết '
      + 'worklog của ngày đó, trong đó có nút đánh dấu ngày nghỉ.',

    detailAria: (memberName: string, date: string): string =>
      `Chi tiết worklog của ${memberName} ngày ${date}`,
    detailNothing: 'chưa log',
    markDayOff: 'Đánh dấu ngày nghỉ',
    unmarkDayOff: 'Bỏ đánh dấu ngày nghỉ',
    noWorklogs: 'Không có worklog nào.',
    othersReadOnly: 'Ở đây bạn chỉ sửa được giờ của chính mình.',
    addHere: 'Ghi giờ vào ngày này',
    addIssuePlaceholder: 'Issue key, vd. CAG-123',
    addStartsAt: (time: string): string => `Sẽ ghi từ ${time}`,
    addSubmit: 'Log',
    dayFull: 'Ngày này không còn giờ trống.',

    loadingPoints: 'Đang tải…',
    noSprintIssues: 'Sprint hiện tại không có issue nào.',
    currentSprint: 'Sprint hiện tại',
    median: 'Trung vị',
    noEstimateCount: (count: number): string => `${count} issue chưa có story points`,
    colIssue: 'Issue',
    colAssignee: 'Assignee',
    colStatus: 'Status',
    colPoints: 'Points',
    colLogged: 'Đã log',
    notInSprint: 'không có trong sprint này',
    noPointsCell: 'chưa có',
    outlierTitle: 'Lệch xa trung vị h/point của sprint',
  },
}
