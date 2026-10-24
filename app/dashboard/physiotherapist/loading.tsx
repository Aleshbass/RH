import { PageSkeleton } from '@/components/patient/ui'

/**
 * Shown the moment a physio clicks to another page, while that page loads. The portal shell
 * (sidebar and header) stays mounted, so this only fills the content area.
 */
export default function PhysioPageLoading() {
  return <PageSkeleton />
}
