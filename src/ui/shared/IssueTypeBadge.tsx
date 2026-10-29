// src/ui/shared/IssueTypeBadge.tsx
//
// Nhãn loại issue (Story, Bug, Task…), đi cạnh StatusBadge. CHỮ là tên type
// thật của instance, MÀU đoán theo issueTypeKind — tên lạ thì màu trung tính.
//
// `name` rỗng/thiếu (snapshot cũ chưa có field) → KHÔNG render gì, cùng luật
// với StatusBadge.
import { issueTypeKind } from '@/core/issue-hierarchy'
import { fontSize, issueTypeColors, radii } from './theme'
import { useT } from './LocaleProvider'

type Props = {
  name: string | undefined
  isSubtask?: boolean
}

export function IssueTypeBadge({ name, isSubtask = false }: Props) {
  const t = useT()
  if (!name || name.trim() === '') return null
  const c = issueTypeColors[issueTypeKind(name, isSubtask)]
  return (
    <span
      title={t.common.issueTypeTitle(name)}
      style={{
        flex: '0 0 auto',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: radii.chip,
        fontSize: fontSize.xs,
        lineHeight: 1.5,
        padding: '0 6px',
        whiteSpace: 'nowrap',
      }}
    >
      {name}
    </span>
  )
}
