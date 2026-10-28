import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { makeFunctionReference } from 'convex/server'
import { getConvexClient } from '@/lib/convex-client'
import type { ReportSnapshot } from '@/convex/helpers/progressReport'
import { ProgressReportDocument } from '@/components/reports/ProgressReportDocument'
import { PrintReportButton } from '@/components/reports/PrintReportButton'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Progress report | Rehabify',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

type SharedReport =
  | { state: 'open'; snapshot: ReportSnapshot; sentAt: number; expiresAt: number }
  | { state: 'withdrawn' }
  | { state: 'expired' }

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const reportRef = makeFunctionReference<'query', { token: string }, SharedReport | null>('progressReports:reportByToken')

const longDay = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })

/** A physiotherapy progress report shared with the referring clinician, opened from its private link. */
export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let report: SharedReport | null = null
  try {
    report = await getConvexClient().query(reportRef, { token })
  } catch {
    report = null
  }
  if (!report) notFound()
  // Checked here too: a cached query result doesn't notice the clock passing the expiry
  if (report.state === 'open' && report.expiresAt <= Date.now()) report = { state: 'expired' }

  if (report.state !== 'open') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-rh-canvas px-4 py-16 text-rh-ink">
        <div className="max-w-md rounded-[1.75rem] bg-white p-8 text-center">
          <h1 className="text-xl font-bold tracking-tight">This report is no longer available</h1>
          <p className="mt-2 text-sm text-rh-ink/70">
            {report.state === 'withdrawn'
              ? 'The physiotherapist withdrew this link.'
              : 'Shared report links open for 30 days, and this one has expired.'}{' '}
            Ask the physiotherapist to share it again if you still need it.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-rh-canvas px-4 py-8 text-rh-ink print:bg-white print:p-0 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <p className="text-xs text-rh-ink/60">Private link · opens until {longDay(report.expiresAt)}</p>
          <PrintReportButton />
        </div>
        <ProgressReportDocument report={report.snapshot} sharedAt={report.sentAt} />
      </div>
    </main>
  )
}
