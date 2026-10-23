import { Skeleton } from '@/components/ui/skeleton'

/**
 * Shown the moment a physio clicks to another page, while that page loads. The portal shell
 * (sidebar and header) stays mounted, so this only fills the content area.
 */
export default function PhysioPageLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64 rounded-lg" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  )
}
