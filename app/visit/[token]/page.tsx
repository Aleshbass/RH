import type { Metadata } from 'next'
import { VisitDoorPage } from './VisitDoorPage'

export const metadata: Metadata = {
  title: 'Who’s at your door | Rehabify',
  robots: { index: false, follow: false },
}

/** A home visit's "who's at your door" page: the physio's photo and the door code, from the patient's link (no sign-in). */
export default async function VisitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <main className="min-h-screen bg-pt-canvas px-4 py-10 text-pt-ink sm:py-16">
      <div className="mx-auto max-w-md">
        <VisitDoorPage token={token} />
      </div>
    </main>
  )
}
