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
    },
  },
}
