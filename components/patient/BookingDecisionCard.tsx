'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { toast } from 'sonner'
import { Hourglass, Loader2, UserRound } from '@/components/icons'
import { Panel, StatusBadge, primaryButtonClass, softButtonClass } from '@/components/patient/ui'
import { convexErrorMessage } from '@/components/booking/booking-shared'
import type { Id } from '@/convex/_generated/dataModel'
import { lagosDateTime, lagosTime } from '@/convex/helpers/lagosTime'
import { formatKobo } from '@/lib/rehabify-services'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Option = { physiotherapistId: Id<'users'>; name: string; imageUrl: string | null; yearsOfExperience: number | null }
type AwaitingBooking = {
  bookingId: Id<'marketplaceBookings'>
  serviceName: string
  physiotherapistName: string
  sessionDate: number | null
  isOnline: boolean
  paidKobo: number
  state: 'waiting' | 'choose' | 'care_team'
  dueAt: number | null
  declinedForNoResponse: boolean
  refundRequested: boolean
  options: Option[]
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const bookingsRef = makeFunctionReference<'query', Record<string, never>, AwaitingBooking[]>('rehabifyFollowUps:getMyBookingsAwaitingPhysio')
const chooseRef = makeFunctionReference<'mutation', { bookingId: Id<'marketplaceBookings'>; physiotherapistId: Id<'users'> }, { dueAt: number }>(
  'rehabifyFollowUps:chooseReplacementPhysio'
)
const refundRef = makeFunctionReference<'mutation', { bookingId: Id<'marketplaceBookings'> }, { amountKobo: number }>(
  'rehabifyFollowUps:requestRefundForUntakenBooking'
)
const careTeamRef = makeFunctionReference<'mutation', { bookingId: Id<'marketplaceBookings'> }, { success: boolean }>('rehabifyFollowUps:askCareTeamAboutBooking')

/**
 * Paid bookings waiting for the physio to confirm, and what to do if they can't: pick another
 * physio free at the same time, get a full refund, or ask the care team.
 */
export function BookingDecisionCard() {
  const bookings = useQuery(bookingsRef, {})
  const choose = useMutation(chooseRef)
  const refund = useMutation(refundRef)
  const careTeam = useMutation(careTeamRef)
  const [busy, setBusy] = useState<string | null>(null)

  if (!bookings?.length) return null

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key)
    try {
      await action()
      playSound('success')
      toast.success(done)
    } catch (error) {
      playSound('error')
      toast.error(convexErrorMessage(error, 'Something went wrong. Please try again.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel title="Your bookings" description="Paid, and waiting for your physiotherapist to confirm">
      <ul className="space-y-3">
        {bookings.map((b) => (
          <li key={b.bookingId} className="space-y-3 rounded-2xl bg-pt-sunken p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-pt-ink">{b.serviceName}</p>
                <p className="text-sm text-pt-muted">
                  {b.sessionDate ? lagosDateTime(b.sessionDate) : 'Time to agree'} · {b.isOnline ? 'Video call' : 'Home visit'}
                </p>
              </div>
              {b.state === 'waiting' && (
                <StatusBadge tone="amber">
                  <Hourglass className="mr-1 h-3 w-3" /> Waiting to confirm
                </StatusBadge>
              )}
              {b.state === 'choose' && <StatusBadge tone="rose">Needs your choice</StatusBadge>}
              {b.state === 'care_team' && <StatusBadge>Care team on it</StatusBadge>}
            </div>

            {b.state === 'waiting' && (
              <p className="text-sm text-pt-ink">
                {b.physiotherapistName} will confirm by {b.dueAt ? lagosTime(b.dueAt) : 'soon'}. We’ll let you know straight away.
              </p>
            )}

            {b.state === 'care_team' && (
              <p className="text-sm text-pt-ink">
                Our care team will contact you within one business day to arrange another physiotherapist or time. You can still get a full refund
                instead.
              </p>
            )}

            {b.state === 'choose' && (
              <>
                <p className="text-sm text-pt-ink">
                  {b.declinedForNoResponse ? `${b.physiotherapistName} didn’t confirm in time.` : `${b.physiotherapistName} can’t take this booking.`}{' '}
                  Your payment is safe. Choose what you’d like to do.
                </p>
                {b.options.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-pt-muted">Free at the same time</p>
                    {b.options.map((option) => {
                      const key = `${b.bookingId}:${option.physiotherapistId}`
                      return (
                        <div key={option.physiotherapistId} className="flex items-center gap-3 rounded-xl bg-pt-surface p-3">
                          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pt-sunken text-pt-muted">
                            {option.imageUrl ? (
                              <Image src={option.imageUrl} alt="" fill unoptimized sizes="40px" className="object-cover" />
                            ) : (
                              <UserRound className="h-4 w-4" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-pt-ink">{option.name}</span>
                            {option.yearsOfExperience ? <span className="text-xs text-pt-muted">{option.yearsOfExperience} years’ experience</span> : null}
                          </span>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() =>
                              run(key, () => choose({ bookingId: b.bookingId, physiotherapistId: option.physiotherapistId }), `Sent to ${option.name}. They’ll confirm soon.`)
                            }
                            className={cn(primaryButtonClass, 'inline-flex h-9 items-center gap-1.5 px-3.5 text-sm font-semibold')}
                          >
                            {busy === key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Choose
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {(b.state === 'choose' || b.state === 'care_team') && (
              <div className="flex flex-wrap gap-2">
                {b.state === 'choose' && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run(`${b.bookingId}:team`, () => careTeam({ bookingId: b.bookingId }), 'Our care team will be in touch within a business day.')}
                    className={cn(softButtonClass, 'inline-flex h-9 items-center gap-1.5 px-3.5 text-sm')}
                  >
                    {busy === `${b.bookingId}:team` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {b.options.length ? 'Find me someone else' : 'Ask the care team to help'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy !== null || b.refundRequested}
                  onClick={() =>
                    run(`${b.bookingId}:refund`, () => refund({ bookingId: b.bookingId }), 'Refund requested. We’ll confirm it within 3 business days.')
                  }
                  className={cn(softButtonClass, 'inline-flex h-9 items-center gap-1.5 px-3.5 text-sm')}
                >
                  {busy === `${b.bookingId}:refund` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {b.refundRequested ? 'Refund requested' : `Full refund (${formatKobo(b.paidKobo)})`}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
