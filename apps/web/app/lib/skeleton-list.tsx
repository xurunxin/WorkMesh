import { Skeleton } from '@workmesh/ui'

export function SkeletonList({ rows = 6, columns = 1 }: { rows?: number; columns?: number }) {
  return <div className="skeleton-list" role="status" aria-label="Loading">
    {Array.from({ length: rows }, (_, row) => (
      <div key={row} className="skeleton-list-row" style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '.5rem' }}>
        {Array.from({ length: columns }, (_, col) => <Skeleton key={col} aria-busy="true" className="skeleton-list-cell" />)}
      </div>
    ))}
  </div>
}
