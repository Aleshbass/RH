'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { useUser } from '@clerk/nextjs'
import { format } from 'date-fns'
import { CalendarClock, Clock, Home, Loader2, Lock, Video } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import {
  InfoTip,
  Panel,
  StatusBadge,
  accentButtonClass,
  dangerButtonClass,
  primaryButtonClass,
  softButtonClass,
} from '@/components/patient/ui'
import { formatKobo } from '@/lib/rehabify-services'
import { convexErrorMessage, queryString, startMarketplaceCheckout } from '@/components/booking/booking-shared'
import { playSound } from '@/lib/sounds'
import { usableEmail } from '@/lib/auth/joyLoginEmail'
import { cn } from '@/lib/utils'
import { CLOSED_UNPAID_MEDILOAN, MediLoanStatusBadge, OPEN_MEDILOAN, PayWithMediLoan, mediLoanMeta, type MediLoanStatus } from '@/components/patient/MediLoanCard'

/** api.marketplace.booking.getMyOpenBookings */
type OpenBooking = {
  id: string
  serviceId: string | null
  serviceName: string
  physiotherapistName: string | null
  /** Not returned yet; used for the "pick a new time" link when it is. */
  physiotherapistId?: string | null
  sessionDate: number | null
  durationMinutes: number
  isOnline: boolean
  travelZoneName: string | null
  chargeKobo: number
  status: 'held' | 'hold_lapsed' | 'needs_new_time'
  holdExpiresAt: number | null
  scheduledBy: 'patient' | 'physiotherapist'
  isAccess: boolean
  /** The latest MediLoan for this booking, if the patient chose to pay with one */
  mediloan: { status: string; updatedAt: number } | null
}

/**
 * Bookings that are scheduled but not paid yet (pay or cancel), and paid ones whose time was
 * taken while the patient paid. Renders nothing when there are none.
 */
export function OpenBookingsCard() {
  const bookings = useQuery(api.marketplace.booking.getMyOpenBookings) as OpenBooking[] | undefined
  const cancelUnpaid = useMutation(api.marketplace.booking.cancelUnpaidMarketplaceBooking)
  const { user } = useUser()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [newTimeNeeded, setNewTimeNeeded] = useState<Record<string, string>>({})
  const [now, setNow] = useState(() => Date.now())

  // Holds lapse on the clock, not when the query re-runs
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  if (!bookings || bookings.length === 0) return null

  const payNow = async (booking: OpenBooking) => {
    // Patients from Joy have only a placeholder login address until they add their own
    const email = usableEmail(user)
    if (!email) {
      toast.error('Add an email address to your account first, so we can send your receipt.')
      return
    }
    setBusyId(booking.id)
    const checkout = await startMarketplaceCheckout({
      bookingId: booking.id,
      email,
      phone: user?.primaryPhoneNumber?.phoneNumber || undefined,
      name: user?.fullName || user?.firstName || undefined,
    })
    if (checkout.ok) {
      window.location.href = checkout.url
      return
    }
    playSound('error')
    if (checkout.reason === 'slot_taken' || checkout.reason === 'too_late') {
      setNewTimeNeeded((current) => ({ ...current, [booking.id]: checkout.message }))
    } else {
      toast.error("Payment didn't start", { description: checkout.message })
    }
    setBusyId(null)
  }

  const cancel = async (booking: OpenBooking) => {
    setBusyId(booking.id)
    try {
      await cancelUnpaid({ bookingId: booking.id as Id<'marketplaceBookings'> })
      toast.success('Booking cancelled')
    } catch (error) {
      toast.error(convexErrorMessage(error, "We couldn't cancel this booking. Please try again."))
    } finally {
      setBusyId(null)
      setConfirmCancelId(null)
    }
  }

  const newTimeHref = (booking: OpenBooking) =>
    booking.physiotherapistId && booking.serviceId
      ? `/book/${booking.physiotherapistId}/${booking.serviceId}`
      : `/get-care${queryString({ service: booking.serviceId })}`

  return (
    <Panel
      title="Waiting for payment"
      description="A booking is confirmed once it’s paid"
      info="When you book, we hold the time for you for a short while. Pay before the hold ends to confirm the visit. After that, someone else may book the same time."
      className="ring-1 ring-inset ring-pt-amber-bg"
    >
      <ul className="space-y-3">
        {bookings.map((booking) => {
          const paid = booking.status === 'needs_new_time'
          const holdLive = booking.status === 'held' && (booking.holdExpiresAt ?? 0) > now
          const ModeIcon = booking.isOnline ? Video : Home
          const busy = busyId === booking.id
          const takenMessage = newTimeNeeded[booking.id]
          const loanStatus = booking.mediloan?.status as MediLoanStatus | undefined
          const loanOpen = Boolean(loanStatus && OPEN_MEDILOAN.has(loanStatus))
          const loanEnded = Boolean(loanStatus && CLOSED_UNPAID_MEDILOAN.has(loanStatus))

          return (
            <li key={booking.id} className="space-y-3 rounded-2xl bg-pt-sunken p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={paid ? 'green' : 'amber'} dot>
                      {paid ? 'Paid' : 'Pay to confirm'}
                    </StatusBadge>
                    {booking.isAccess && <StatusBadge tone="violet">Rehabify Access</StatusBadge>}
                  </div>
                  <p className="text-[15px] font-semibold text-pt-ink">{booking.serviceName}</p>
                  <p className="text-sm text-pt-muted">
                    {booking.physiotherapistName ? `With ${booking.physiotherapistName}` : 'With your physiotherapist'}
                    {booking.sessionDate ? ` · ${format(booking.sessionDate, 'EEE d MMM, h:mm a')}` : ''}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-pt-muted">
                    <ModeIcon className="h-3.5 w-3.5" aria-hidden />
                    {booking.isOnline ? 'Video call' : `Home visit${booking.travelZoneName ? ` · ${booking.travelZoneName}` : ''}`}
                    {` · ${booking.durationMinutes} min`}
                  </p>
                </div>
                <p className="text-lg font-semibold tabular-nums text-pt-ink">{formatKobo(booking.chargeKobo)}</p>
              </div>

              {paid ? (
                <p className="text-sm text-pt-ink">Paid. We&apos;ll contact you to agree a new time.</p>
              ) : takenMessage ? (
                <div className="space-y-2">
                  <p className="text-sm text-pt-ink">{takenMessage}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" className={cn(primaryButtonClass, 'h-10')}>
                      <Link href={newTimeHref(booking)}>
                        <CalendarClock className="mr-1.5 h-4 w-4" aria-hidden />
                        Pick a new time
                      </Link>
                    </Button>
                    <Button size="sm" className={cn(softButtonClass, 'h-10')} disabled={busy} onClick={() => cancel(booking)}>
                      Cancel this booking
                    </Button>
                  </div>
                </div>
              ) : loanOpen && loanStatus ? (
                // Paying with MediLoan: the loan decides, so Pay and Cancel step aside
                <div className="space-y-1.5">
                  <MediLoanStatusBadge status={loanStatus} />
                  <p className="text-xs leading-relaxed text-pt-muted">
                    {loanStatus === 'initiated'
                      ? 'MyItura has texted you a link to apply. Your booking is confirmed when the loan pays out.'
                      : loanStatus === 'approved'
                        ? 'Approved. Accept the terms in MediLoan so it can pay for this booking.'
                        : `${mediLoanMeta(loanStatus).explain} We keep this booking open meanwhile.`}
                  </p>
                </div>
              ) : (
                <>
                  {loanEnded && loanStatus && (
                    <p className="rounded-xl bg-pt-neutral-bg px-3 py-2 text-xs text-pt-neutral-fg">
                      Your MediLoan for this booking: {mediLoanMeta(loanStatus).label.toLowerCase()}. You can pay now instead.
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-pt-muted">
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {booking.scheduledBy === 'physiotherapist'
                      ? 'Your physiotherapist scheduled this. Pay to confirm it.'
                      : holdLive && booking.holdExpiresAt
                        ? `Your time is held until ${format(booking.holdExpiresAt, 'HH:mm')}.`
                        : 'The hold on this time has ended. Pay now and we’ll keep it if it’s still free.'}
                    {booking.scheduledBy !== 'physiotherapist' && (
                      <InfoTip label="What is a hold?">
                        We keep this time for you while you pay. If the hold ends, you can still pay, and we&apos;ll keep the time
                        if nobody else has booked it.
                      </InfoTip>
                    )}
                  </p>
                  {confirmCancelId === booking.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-pt-ink">Cancel this booking?</span>
                      <Button size="sm" className={cn(dangerButtonClass, 'h-10')} disabled={busy} onClick={() => cancel(booking)}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Yes, cancel'}
                      </Button>
                      <Button size="sm" className={cn(softButtonClass, 'h-10')} disabled={busy} onClick={() => setConfirmCancelId(null)}>
                        Keep it
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className={cn(accentButtonClass, 'h-10 px-4')} disabled={busy} onClick={() => payNow(booking)}>
                        {busy ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Lock className="mr-1.5 h-4 w-4" aria-hidden />
                        )}
                        Pay now {formatKobo(booking.chargeKobo)}
                      </Button>
                      <PayWithMediLoan target={{ bookingId: booking.id }} amountKobo={booking.chargeKobo} what="this booking" />
                      <Button size="sm" className={cn(softButtonClass, 'h-10')} disabled={busy} onClick={() => setConfirmCancelId(booking.id)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
