import { Skeleton } from '@workmesh/ui'
import type { CSSProperties } from 'react'

type SkeletonListProps = {
  columns: number
  items: number
  label: string
}

export function SkeletonList({ columns, items, label }: SkeletonListProps) {
  const safeColumns = Math.max(1, Math.floor(columns))
  const safeItems = Math.max(0, Math.floor(items))
  return <div
    aria-busy="true"
    aria-label={label}
    className="skeleton-list"
    role="status"
    style={{ '--columns': String(safeColumns) } as CSSProperties}
  >
    {Array.from({ length: safeItems }, (_, index) => (
      <Skeleton
        aria-hidden="true"
        aria-label={undefined}
        className="skeleton-list-cell"
        key={index}
        role="presentation"
      />
    ))}
  </div>
}
