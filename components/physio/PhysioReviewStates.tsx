'use client'

import Link from 'next/link'
import { useClerk } from '@clerk/nextjs'
import { Clock, FileText } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { primaryButtonClass } from '@/components/clinic/ui'
import { PageContainer } from '@/components/physio/ui'
import { SetupChecklistCard, type SetupStatus } from '@/components/physio/SetupChecklist'
import { SUPPORT_EMAIL } from '@/lib/contact'

/**
 * Shown inside the dashboard while an application is being reviewed. The physio can't see
 * patients yet, but can finish setup so they're ready to start on approval.
 */
export function PhysioUnderReview({ setup }: { setup: SetupStatus | null }) {
  return (
    <PageContainer className="max-w-3xl">
      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-white/[0.07] dark:bg-rh-ink-2 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            <Clock className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
              We&apos;re reviewing your application
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              We check your licence and ID, usually within 1–2 business days. We&apos;ll email you when you&apos;re
              approved. Patients, appointments and messages open up then.
            </p>
          </div>
        </div>
      </div>

      {setup && !setup.isComplete && <SetupChecklistCard setup={setup} />}

      {setup?.isComplete && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Your setup is complete. You&apos;ll be live for patients as soon as you&apos;re approved.
        </p>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {/* Rehabify payouts are for Rehabify Care patients: not for physios who see only their own */}
        {setup?.practiceMode !== 'independent' && (
          <Link href="/payout-policy" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
            How payouts work
          </Link>
        )}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
          Contact support
        </a>
      </div>
    </PageContainer>
  )
}

/** Full-screen state for a declined application, with the reason and a way to fix it. */
export function PhysioDeclined({ reason }: { reason?: string }) {
  const { signOut } = useClerk()
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4 dark:bg-rh-ink">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 dark:border-white/[0.07] dark:bg-rh-ink-2 sm:p-8">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <FileText className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          We couldn&apos;t approve your application
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Update the details below and send it again. Our team will take another look.
        </p>
        {reason && (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-white/[0.07] dark:bg-rh-ink">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Reason from our team</p>
            <p className="mt-1 whitespace-pre-line text-sm text-neutral-800 dark:text-neutral-200">{reason}</p>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild className={primaryButtonClass}>
            <Link href="/physiotherapist">Update application</Link>
          </Button>
          <Button asChild variant="outline">
            <a href={`mailto:${SUPPORT_EMAIL}`}>Contact support</a>
          </Button>
          <Button variant="ghost" onClick={() => signOut({ redirectUrl: '/' })} className="text-neutral-500">
            Sign out
          </Button>
        </div>
      </div>
    </div>
  )
}
