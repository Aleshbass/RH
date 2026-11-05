import type { Metadata } from 'next'
import { VisitCheckIn } from './VisitCheckIn'

export const metadata: Metadata = {
  title: 'Your visit | Rehabify',
  robots: { index: false, follow: false },
}

/** One private question after a Rehabify patient's visit, opened from the emailed link (no sign-in). */
export default async function VisitCheckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <main className="min-h-screen bg-rh-canvas px-4 py-10 text-rh-ink sm:py-16">
      <div className="mx-auto max-w-md">
        <VisitCheckIn token={token} />
      </div>
    </main>
  )
}
