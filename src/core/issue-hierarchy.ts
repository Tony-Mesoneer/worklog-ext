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
  /**
   * Project key LẤY TỪ JIRA (`fields.project.key`), không cắt từ issue key.
   * Một project bị đổi key vẫn phục vụ key cũ (`CAG-3052` vẫn mở được sau khi
   * project đổi thành `CGW`), nên cắt tiền tố sẽ gom nhóm dưới một key KHÔNG
   * CÒN TỒN TẠI — lead lọc theo project mới sẽ không thấy issue đó.
   * null = chưa biết (Jira không trả field, hoặc meta thiếu).
   */
  projectKey: string | null
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

// --- gom theo PROJECT ------------------------------------------------------
//
// Vì sao có tầng này: coverage query không còn lọc theo `config.projects` (một
// worklog trên issue ngoài project vẫn là giờ THẬT của member, bỏ nó ra là mất
// dữ liệu im lặng), nên danh sách issue của một member có thể trải trên nhiều
// project. Không gom lại thì `ABC-12` nằm lẫn giữa các `CAG-…` mà không có gì
// nói vì sao.

/** Project không biết được (meta thiếu). Không phải lỗi — xem đầu file. */
export const UNKNOWN_PROJECT = ''

export type ProjectGroup<T> = {
  /** Project key từ Jira, hoặc `UNKNOWN_PROJECT` khi meta không có. */
  projectKey: string
  rows: T[]
}

/**
 * Các project key CÓ MẶT trong `rows`, theo thứ tự xuất hiện đầu tiên.
 *
 * Row không có meta (hoặc meta không có projectKey) tính vào `UNKNOWN_PROJECT`
 * — nó vẫn là MỘT nhóm, nên dữ liệu thiếu meta hoàn toàn cho đúng một nhóm và
 * bảng vẽ phẳng y như trước, chứ không biến mất khỏi tổng.
 */
export function distinctProjectKeys<T>(
  rows: readonly T[],
  meta: IssueMetaMap,
  keyOf: (row: T) => string,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const p = meta[keyOf(row)]?.projectKey ?? UNKNOWN_PROJECT
    if (seen.has(p)) continue
    seen.add(p)
    out.push(p)
  }
  return out
}

/**
 * Gom `rows` theo project — nhưng CHỈ khi có nhiều hơn một project.
 *
 * `null` = "không cần tầng project": đúng một project (trường hợp thường ngày,
 * đo trên Jira thật: từ 2026-06-01 chỉ có 2 issue ngoài CAG) hoặc không có row
 * nào. Một cái bọc "CAG" duy nhất chỉ thêm một bậc thụt lề và không nói gì —
 * caller vẽ danh sách phẳng như trước, không có nhánh hiển thị nào phải đổi.
 *
 * Thứ tự XÁC ĐỊNH: nhóm theo lần xuất hiện đầu tiên của một row thuộc project
 * đó, row trong nhóm theo thứ tự đầu vào. Caller đã sort `rows` (ví dụ theo
 * tổng giờ giảm dần) thì thứ tự đó vẫn đọc được — cùng quy tắc với
 * groupIssueRowsByParent.
 */
export function groupRowsByProject<T>(
  rows: readonly T[],
  meta: IssueMetaMap,
  keyOf: (row: T) => string,
): ProjectGroup<T>[] | null {
  const keys = distinctProjectKeys(rows, meta, keyOf)
  if (keys.length <= 1) return null

  const groups = new Map<string, ProjectGroup<T>>(
    keys.map((projectKey) => [projectKey, { projectKey, rows: [] }]),
  )
  for (const row of rows) {
    const p = meta[keyOf(row)]?.projectKey ?? UNKNOWN_PROJECT
    groups.get(p)!.rows.push(row)
  }
  return keys.map((k) => groups.get(k)!)
}
