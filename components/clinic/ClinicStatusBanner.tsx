'use client'

import { useClinicAccess } from './ClinicAccessContext'
import { Clock, AlertCircle, ShieldOff } from '@/components/icons'

/**
 * One calm line explaining why changes are turned off (clinic not set up or not yet approved,
 * access paused, clinic suspended). Nothing for a live clinic.
 */
export default function ClinicStatusBanner() {
  const {
    isReadOnly,
    isPendingApproval,
    isOnboardingIncomplete,
    isDeclined,
    isStaff,
    isSuspended,
    isClinicSuspended,
    clinicSuspendedReason,
    isLoaded,
    nonMember,
  } = useClinicAccess()

  if (!isLoaded || nonMember) return null

  // Rehabify suspended the whole clinic: the most important thing to say, so it wins
  if (isClinicSuspended) {
    return (
      <div className="border-b border-rose-200 bg-rose-50 px-4 py-2.5 dark:border-rose-900/50 dark:bg-rose-950/30 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-start gap-3">
          <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-rose-700 dark:text-rose-400" />
          <p className="min-w-0 flex-1 text-sm text-rose-900 dark:text-rose-200">
            <span className="font-medium">Rehabify has suspended this clinic.</span> You can still view your records, but
            changes, bookings and payouts are turned off.
            {clinicSuspendedReason && <span className="mt-0.5 block text-rose-800/90 dark:text-rose-300/90">Reason: {clinicSuspendedReason}</span>}
            <span className="mt-0.5 block">
              Contact{' '}
              <a href="mailto:support@physioaroundme.com" className="font-medium underline underline-offset-2">
                support@physioaroundme.com
              </a>{' '}
              to restore access.
            </span>
          </p>
        </div>
      </div>
    )
  }

  if (!isReadOnly && !isDeclined) return null

  const content = isSuspended
    ? 'The clinic owner has paused your access. You can look around, but changes are turned off.'
    : isStaff && (isDeclined || isOnboardingIncomplete)
    ? "The clinic isn't fully set up yet, so changes are turned off. The clinic owner can finish it."
    : isDeclined
    ? 'Your clinic application was not approved. Contact support@physioaroundme.com to update your documents.'
    : isPendingApproval
    ? isStaff
      ? 'Rehabify is still verifying this clinic. You can look around; changes unlock once it is approved.'
      : "We're reviewing your clinic. You can look around; booking, billing and patient records unlock once you're approved."
    : 'Finish setting up your clinic to add patients and take payments.'

  const Icon = isSuspended || isDeclined ? AlertCircle : Clock

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2">
        <Icon className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
        <p className="min-w-0 flex-1 text-sm text-amber-900 dark:text-amber-200">{content}</p>
        {isOnboardingIncomplete && !isStaff && !isDeclined && !isSuspended && (
          <a
            href="/clinic-owner"
            className="rounded-md bg-rh-lime px-3 py-1.5 text-sm font-medium text-rh-ink hover:bg-rh-lime-deep"
          >
            Finish setup
          </a>
        )}
      </div>
    </div>
  )
}
