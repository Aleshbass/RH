'use client'

import type { ComponentType, ReactNode } from 'react'
import { useClinicAccess } from './ClinicAccessContext'
import { Clock, AlertCircle, ShieldOff } from '@/components/icons'
import { cn } from '@/lib/utils'

/**
 * A rounded strip at the top of the page: ink when something needs the clinic, rose when Rehabify
 * suspended it. Shared by the clinic banners so they look alike.
 */
export function ClinicNotice({
  tone,
  icon: Icon,
  children,
  action,
}: {
  tone: 'ink' | 'rose' | 'quiet'
  icon: ComponentType<{ className?: string }>
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-5 py-3 sm:px-6',
        tone === 'ink' && 'bg-pt-primary text-pt-on-primary',
        tone === 'rose' && 'bg-pt-rose-bg text-pt-rose-fg',
        tone === 'quiet' && 'border border-pt-line bg-pt-surface text-pt-ink'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', tone === 'ink' ? 'text-pt-accent' : tone === 'quiet' && 'text-pt-muted')} />
      <div className={cn('min-w-0 flex-1 text-sm leading-relaxed', tone === 'ink' && '[&_.notice-muted]:opacity-75')}>{children}</div>
      {action}
    </div>
  )
}

/** The lime action at the end of a notice (Pay now, Finish setup). */
export const noticeActionClass =
  'inline-flex h-9 shrink-0 items-center rounded-xl bg-pt-accent px-3.5 text-sm font-semibold text-[#06210a] transition hover:bg-[#00b80e] active:scale-[0.98]'

/** A quieter action for a notice (See your plan). */
export const noticeSecondaryClass =
  'inline-flex h-9 shrink-0 items-center rounded-xl border border-pt-line-strong bg-pt-surface px-3.5 text-sm font-medium text-pt-ink transition hover:bg-pt-hover'

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
      <ClinicNotice tone="rose" icon={ShieldOff}>
        <span className="font-semibold">Rehabify has suspended this clinic.</span> You can still view your records, but changes,
        bookings and payouts are turned off.
        {clinicSuspendedReason && <span className="mt-0.5 block opacity-90">Reason: {clinicSuspendedReason}</span>}
        <span className="mt-0.5 block">
          Contact{' '}
          <a href="mailto:support@physioaroundme.com" className="font-semibold underline underline-offset-2">
            support@physioaroundme.com
          </a>{' '}
          to restore access.
        </span>
      </ClinicNotice>
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

  return (
    <ClinicNotice
      tone="ink"
      icon={isSuspended || isDeclined ? AlertCircle : Clock}
      action={
        isOnboardingIncomplete && !isStaff && !isDeclined && !isSuspended ? (
          <a href="/clinic-owner" className={noticeActionClass}>
            Finish setup
          </a>
        ) : undefined
      }
    >
      {content}
    </ClinicNotice>
  )
}
