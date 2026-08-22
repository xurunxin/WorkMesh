import { SkeletonList } from './lib/skeleton-list'

export default function Loading() {
  return (
    <main className="center">
      <SkeletonList rows={4} />
    </main>
  )
}
