import { Fragment, useEffect, useState } from 'react'
import { send, type PointsLoadResult } from '@/sw/messages'
import { buildPointsTable, type PointsRow, type PointsTable as Data } from '@/core/points'
import type { IssueMeta, IssueMetaMap } from '@/core/issue-hierarchy'
import {
  groupIssueRowsByParent, groupRowsByProject, UNKNOWN_PROJECT,
} from '@/core/issue-hierarchy'
import { Card } from '@/ui/shared/Card'
import { StatusBadge } from '@/ui/shared/StatusBadge'
import { hoursLabel } from '@/ui/shared/format'
import { ErrorBanner, toUiError, type UiError } from '@/ui/shared/errors'
import { colors, fontSize, space, table as tableColors } from '@/ui/shared/theme'

// Thụt lề của sub-task. Ở tab này việc gom nhóm không chỉ để đẹp: story points
// gần như luôn nằm ở issue CHA còn giờ thì log ở sub-task, nên danh sách phẳng
// cho ra "cha 5 điểm / 0h" cạnh "con 0 điểm / 14h" và cột h/point vô nghĩa. Xếp
// con dưới cha là thứ làm cột đó đọc được.
const CHILD_INDENT = 22

// Nhãn của dòng project. Board của Jira có thể trải nhiều project qua filter
// của nó, nên tab này cũng cần tầng project — và dùng ĐÚNG một luật với tab
// Coverage: nhiều project thì gom, một project thì không bọc gì.
const projectLabel = (projectKey: string): string =>
  projectKey === UNKNOWN_PROJECT ? 'Không rõ project' : projectKey

// h/point, trung vị, cờ outlier KHÔNG đổi: buildPointsTable vẫn là nơi duy nhất
// tính chúng, ở đây chỉ đổi thứ tự vẽ và thụt lề.
function IssueRow({ row, meta, child }: {
  row: PointsRow
  meta: IssueMeta | undefined
  child: boolean
}) {
  const noPoints = row.storyPoints === null || row.storyPoints === 0
  return (
    <tr style={{ background: row.isOutlier ? colors.accentSofter : undefined }}>
      <th scope="row" style={{ fontWeight: 400, paddingLeft: child ? CHILD_INDENT : undefined }}>
        <strong>{child ? '↳ ' : ''}{row.key}</strong> {row.summary}
      </th>
      <td style={{ textAlign: 'left' }}>{row.assigneeName ?? '—'}</td>
      <td style={{ textAlign: 'left' }}>
        {meta
          ? <StatusBadge name={meta.statusName} category={meta.statusCategory} />
          : row.status}
      </td>
      <td className="wl-table__num" style={{ color: noPoints ? colors.danger : undefined }}>
        {noPoints ? 'chưa có' : row.storyPoints}
      </td>
      <td className="wl-table__num">{hoursLabel(row.timeSpentSeconds)}</td>
      <td
        className="wl-table__num"
        style={{
          fontWeight: row.isOutlier ? 700 : 400,
          color: row.isOutlier ? colors.accentRing : undefined,
        }}
        title={row.isOutlier ? 'Lệch xa trung vị h/point của sprint' : undefined}
      >
        {row.hoursPerPoint === null ? '—' : row.hoursPerPoint.toFixed(1)}
      </td>
    </tr>
  )
}

/**
 * Các hàng issue đã gom theo cha. Gom SAU khi buildPointsTable đã sort theo
 * h/point: thứ tự trong nhóm và thứ tự các nhóm vẫn phản ánh sort đó (xem
 * groupIssueRowsByParent). Tách ra component vì nó được dùng cả khi có tầng
 * project và khi không.
 */
function ParentGroups({ rows, meta, keyPrefix }: {
  rows: readonly PointsRow[]
  meta: IssueMetaMap
  keyPrefix: string
}) {
  return (
    <>
      {groupIssueRowsByParent(rows, meta, (r) => r.key).map((group) => (
        <Fragment key={`${keyPrefix}${group.key}`}>
          {/* Cha không có row trong sprint (nằm ngoài sprint đang mở): vẫn hiện
              một dòng tiêu đề, nếu không thì sub-task lại trông như issue độc
              lập — đúng cái cần sửa. */}
          {group.isParent && group.own === null && (
            <tr>
              <th scope="row" style={{ fontWeight: 600, color: colors.muted }}>
                {group.key} {group.summary}
              </th>
              <td colSpan={5} style={{ textAlign: 'left', color: colors.muted }}>
                không có trong sprint này
              </td>
            </tr>
          )}
          {(group.own ? [group.own, ...group.children] : group.children).map((r) => (
            <IssueRow
              key={r.key} row={r} meta={meta[r.key]}
              child={group.isParent && r.key !== group.key}
            />
          ))}
        </Fragment>
      ))}
    </>
  )
}

export function PointsPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [meta, setMeta] = useState<IssueMetaMap>({})
  const [sprintName, setSprintName] = useState('')
  const [error, setError] = useState<UiError | null>(null)

  useEffect(() => {
    void send<PointsLoadResult>({ type: 'points/load' })
      .then((res) => {
        setSprintName(res.sprintName)
        setMeta(res.meta ?? {})
        setData(buildPointsTable(res.issues))
      })
      .catch((e: unknown) => setError(toUiError(e)))
  }, [])

  if (error) return <ErrorBanner error={error} />
  if (!data) {
    return <Card><p style={{ margin: 0, color: colors.muted }}>Đang tải…</p></Card>
  }
  if (data.rows.length === 0) {
    return <Card><p style={{ margin: 0, color: colors.muted }}>Sprint hiện tại không có issue nào.</p></Card>
  }

  const med = data.medianHoursPerPoint
  // Sprint của MỘT board có thể chứa nhiều project (board lấy issue qua filter).
  // null = chỉ một project → không bọc gì, bảng y như trước.
  const byProject = groupRowsByProject(data.rows, meta, (r) => r.key)

  return (
    <>
      <Card title="Sprint hiện tại">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.x5, alignItems: 'baseline' }}>
          <strong style={{ fontSize: fontSize.lg }}>{sprintName}</strong>
          <span style={{ color: colors.muted }}>
            Trung vị{' '}
            <strong style={{ color: colors.text }}>
              {med === null ? '—' : `${med.toFixed(1)} h/point`}
            </strong>
          </span>
          <span style={{ color: data.noEstimate.length > 0 ? colors.danger : colors.muted }}>
            {data.noEstimate.length} issue chưa có story points
          </span>
        </div>
      </Card>

      <Card flush>
        <div className="wl-table-scroll">
          <table className="wl-table">
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', minWidth: 240 }}>Issue</th>
                <th scope="col" style={{ textAlign: 'left' }}>Assignee</th>
                <th scope="col" style={{ textAlign: 'left' }}>Status</th>
                <th scope="col">Points</th>
                <th scope="col">Đã log</th>
                <th scope="col">h/point</th>
              </tr>
            </thead>
            <tbody>
              {byProject === null
                ? <ParentGroups rows={data.rows} meta={meta} keyPrefix="" />
                : byProject.map((pg) => (
                  <Fragment key={`p-${pg.projectKey}`}>
                    <tr>
                      <th
                        scope="row"
                        colSpan={6}
                        style={{ fontWeight: 700, background: tableColors.groupRowBg }}
                      >
                        {projectLabel(pg.projectKey)}
                      </th>
                    </tr>
                    <ParentGroups
                      rows={pg.rows} meta={meta} keyPrefix={`${pg.projectKey}-`}
                    />
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
