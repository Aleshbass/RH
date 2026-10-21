'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { useUser } from '@clerk/nextjs'
import { format } from 'date-fns'
import { CalendarClock, Home, Loader2, Lock, Video } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Panel, StatusBadge, primaryButtonClass, softButtonClass } from '@/components/physio/ui'
import { formatKobo } from '@/lib/rehabify-services'
import { convexErrorMessage, queryString, startMarketplaceCheckout } from '@/components/booking/booking-shared'
import { playSound } from '@/lib/sounds'

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
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) {
      toast.error('No email address found on your account.')
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
    <Panel title="Your scheduled bookings" description="A booking is confirmed once it's paid">
      <ul className="space-y-3 px-5 pb-5 pt-3">
        {bookings.map((booking) => {
          const paid = booking.status === 'needs_new_time'
          const holdLive = booking.status === 'held' && (booking.holdExpiresAt ?? 0) > now
          const ModeIcon = booking.isOnline ? Video : Home
          const busy = busyId === booking.id
          const takenMessage = newTimeNeeded[booking.id]

          return (
            <li key={booking.id} className="space-y-3 rounded-2xl bg-rh-canvas p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={paid ? 'green' : 'amber'}>{paid ? 'Paid' : 'Scheduled — pay to confirm'}</StatusBadge>
                    {booking.isAccess && <StatusBadge tone="teal">Rehabify Access</StatusBadge>}
                  </div>
                  <p className="text-[15px] font-semibold text-rh-night">{booking.serviceName}</p>
                  <p className="text-sm text-neutral-600">
                    {booking.physiotherapistName ? `With ${booking.physiotherapistName}` : 'With your physiotherapist'}
                    {booking.sessionDate ? ` · ${format(booking.sessionDate, 'EEE d MMM, h:mm a')}` : ''}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <ModeIcon className="h-3.5 w-3.5" aria-hidden />
                    {booking.isOnline ? 'Video call' : `Home visit${booking.travelZoneName ? ` · ${booking.travelZoneName}` : ''}`}
                    {` · ${booking.durationMinutes} min`}
                  </p>
                </div>
                <p className="text-lg font-semibold tabular-nums text-rh-night">{formatKobo(booking.chargeKobo)}</p>
              </div>

              {paid ? (
                <p className="text-sm text-neutral-700">Paid — we&apos;ll contact you to agree a new time.</p>
              ) : takenMessage ? (
                <div className="space-y-2">
                  <p className="text-sm text-neutral-700">{takenMessage}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" className={primaryButtonClass}>
                      <Link href={newTimeHref(booking)}>
                        <CalendarClock className="mr-1.5 h-4 w-4" aria-hidden />
                        Pick a new time
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => cancel(booking)}>
                      Cancel this booking
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-neutral-500">
                    {booking.scheduledBy === 'physiotherapist'
                      ? 'Your physiotherapist scheduled this. Pay to confirm it.'
                      : holdLive && booking.holdExpiresAt
                        ? `Your time is held until ${format(booking.holdExpiresAt, 'HH:mm')}.`
                        : 'The hold on this time has ended. Pay now and we’ll keep it if it’s still free.'}
                  </p>
                  {confirmCancelId === booking.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-neutral-700">Cancel this booking?</span>
                      <Button size="sm" variant="destructive" disabled={busy} onClick={() => cancel(booking)}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Yes, cancel'}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmCancelId(null)}>
                        Keep it
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className={primaryButtonClass} disabled={busy} onClick={() => payNow(booking)}>
                        {busy ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Lock className="mr-1.5 h-4 w-4" aria-hidden />
                        )}
                        Pay now {formatKobo(booking.chargeKobo)}
                      </Button>
                      <Button size="sm" className={softButtonClass} disabled={busy} onClick={() => setConfirmCancelId(booking.id)}>
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
