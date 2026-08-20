// src/core/issue-hierarchy.ts
//
// Quan hệ cha/con giữa các issue, và trạng thái workflow của chúng.
//
// TẠI SAO `IssueMeta` ĐI CẠNH `Worklog` CHỨ KHÔNG NẰM TRONG NÓ:
// `Worklog` là input của buildCoverage — hàm được nhiều test nhất trong project
// và là chỗ mọi con số của dashboard sinh ra. Thêm field BẮT BUỘC vào nó nghĩa
// là mọi fixture, mọi snapshot đã cache và mọi caller phải khai thêm dữ liệu mà
// buildCoverage không dùng tới. Ngoài ra metadata là thuộc tính của ISSUE, không
// phải của từng worklog: nhét vào Worklog sẽ lặp cùng một status/parent trên
// hàng chục worklog cùng issue, và mở đường cho hai worklog cùng issue mang hai
// status khác nhau. Nên nó đi thành một map riêng, khoá theo issue key.
//
// Map thiếu (snapshot cache từ trước thay đổi này) là chuyện BÌNH THƯỜNG: mọi
// hàm ở đây coi meta thiếu là "không biết", không phải lỗi — cùng thái độ tha
// thứ mà migrateConfig đang có.

import type { CoverageIssueRow } from './coverage'

/**
 * `fields.status.statusCategory.key` của Jira. Đúng ba giá trị này cho mọi
 * workflow, nên ba màu là đủ và không bao giờ thiếu màu cho một status mới.
 */
export type StatusCategory = 'new' | 'indeterminate' | 'done'

export type IssueMeta = {
  key: string
  summary: string
  /**
   * Tên status THẬT trong workflow ("In Testing", "Closed"), không phải tên
   * bucket. Người dùng nhận ra workflow của mình, không phải từ vựng của Jira.
   */
  statusName: string
  statusCategory: StatusCategory
  /** null khi issue không phải sub-task (hoặc Jira không trả `fields.parent`). */
  parentKey: string | null
  parentSummary: string | null
  isSubtask: boolean
}

/** Khoá là issue key. Thiếu key = chưa biết gì về issue đó, không phải lỗi. */
export type IssueMetaMap = Record<string, IssueMeta>

/**
 * Chuẩn hoá `statusCategory.key`. Jira còn một giá trị thứ tư — `undefined`,
 * nghĩa là "No Category" — và instance lạ có thể trả chuỗi khác; cả hai rơi về
 * 'new' (màu trung tính) vì đoán "đang làm" hay "xong" từ dữ liệu không biết là
 * cách nói sai với người đọc.
 */
export function toStatusCategory(key: unknown): StatusCategory {
  return key === 'indeterminate' || key === 'done' || key === 'new' ? key : 'new'
}

/**
 * Một nhóm ở cấp trên của danh sách issue.
 *
 * - `isParent = false`: issue không có cha — `own` là row của chính nó,
 *   `children` rỗng. UI vẽ nó y như trước khi có tính năng này.
 * - `isParent = true`: `key`/`summary` là của issue CHA. `own` là row của chính
 *   issue cha nếu nó cũng có dữ liệu (parent cũng log giờ được), null nếu không
 *   — lúc đó nhóm chỉ là một dòng tiêu đề cho các sub-task bên dưới.
 */
export type IssueGroup<T> = {
  key: string
  summary: string
  isParent: boolean
  own: T | null
  children: T[]
}

/**
 * Gom danh sách row phẳng thành nhóm theo `parentKey` trong `meta`.
 *
 * MỘT CẤP, không đệ quy: Jira không cho sub-task có sub-task, nên cây sâu hơn
 * một tầng không tồn tại. Nếu dữ liệu vẫn có (cha của một row lại là sub-task
 * của issue khác), row được gom theo CHA TRỰC TIẾP và dừng ở đó — thà hiển thị
 * nông còn hơn dựng vòng lặp vô hạn.
 *
 * Thứ tự XÁC ĐỊNH và chỉ phụ thuộc `rows`: nhóm xếp theo lần xuất hiện đầu tiên
 * của một row thuộc nhóm đó, con xếp theo thứ tự đầu vào. Caller đã sort rows
 * (ví dụ theo tổng giờ giảm dần) thì thứ tự đó vẫn còn đọc được.
 */
export function groupIssueRowsByParent<T>(
  rows: readonly T[],
  meta: IssueMetaMap,
  keyOf: (row: T) => string,
): IssueGroup<T>[] {
  const groups = new Map<string, IssueGroup<T>>()
  const order: string[] = []

  for (const row of rows) {
    const key = keyOf(row)
    const m = meta[key]
    // Chỉ tin parentKey khi nó khác chính mình: một issue tự làm cha của mình
    // (dữ liệu rác) sẽ tạo nhóm không bao giờ có `own`.
    const parentKey = m?.parentKey && m.parentKey !== key ? m.parentKey : null
    const groupKey = parentKey ?? key

    let group = groups.get(groupKey)
    if (!group) {
      group = {
        key: groupKey,
        summary: (parentKey === null ? m?.summary : m?.parentSummary)
          ?? meta[groupKey]?.summary ?? '',
        isParent: parentKey !== null,
        own: null,
        children: [],
      }
      groups.set(groupKey, group)
      order.push(groupKey)
    }

    if (parentKey === null) {
      // Row của chính node cấp trên. Trùng key (không nên xảy ra vì caller đã
      // gộp theo issue) thì cái sau xuống làm con để không mất dữ liệu.
      if (group.own === null) group.own = row
      else group.children.push(row)
      if (group.summary === '' && m) group.summary = m.summary
    } else {
      group.isParent = true
      group.children.push(row)
      if (group.summary === '') {
        group.summary = m?.parentSummary ?? meta[groupKey]?.summary ?? ''
      }
    }
  }

  return order.map((k) => groups.get(k)!)
}

/**
 * Cộng nhiều `CoverageIssueRow` thành một dòng tổng — dùng cho dòng tiêu đề của
 * nhóm cha trong bảng coverage. Tổng theo TỪNG NGÀY, không chỉ tổng cuối, vì
 * dòng nhóm nằm trong cùng lưới ngày với các dòng con.
 *
 * Nằm ở core (không ở component) vì đây là số học, và số học phải test được.
 * `buildCoverage` KHÔNG đổi: đây là một phép biến đổi sau nó.
 */
export function mergeCoverageIssueRows(
  key: string,
  summary: string,
  rows: readonly CoverageIssueRow[],
): CoverageIssueRow {
  const perDay: Record<string, number> = {}
  let total = 0
  for (const r of rows) {
    for (const [date, seconds] of Object.entries(r.perDay)) {
      perDay[date] = (perDay[date] ?? 0) + seconds
    }
    total += r.total
  }
  return { issueKey: key, issueSummary: summary, perDay, total }
}
