'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { Check, Hourglass, Loader2, MapPin, Video, X } from '@/components/icons'
import { Panel, StatusBadge, primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui'
import type { Id } from '@/convex/_generated/dataModel'
import { lagosDateTime, lagosTime } from '@/convex/helpers/lagosTime'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { useNow } from './shared'

type BookingRequest = {
  bookingId: Id<'marketplaceBookings'>
  patientName: string
  serviceName: string
  mode: 'virtual' | 'home'
  area: string | null
  sessionDate: number | null
  durationMinutes: number
  payoutKobo: number
  travelShareKobo: number
  patientNote: string | null
  dueAt: number
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const requestsRef = makeFunctionReference<'query', Record<string, never>, BookingRequest[]>('rehabifyFollowUps:getMyBookingRequests')
const respondRef = makeFunctionReference<
  'mutation',
  { bookingId: Id<'marketplaceBookings'>; accept: boolean; reason?: string },
  { accepted: boolean }
>('rehabifyFollowUps:respondToBookingRequest')

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`

function timeLeft(dueAt: number, now: number) {
  const minutes = Math.max(0, Math.round((dueAt - now) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60 ? `${minutes % 60}m` : ''}`.trim()
}

/**
 * Paid bookings patients made with this physio: accept to confirm, or decline so the patient
 * can choose someone else. Shows the payout only, never what the patient paid.
 */
export function BookingRequests() {
  const requests = useQuery(requestsRef, {})
  const respond = useMutation(respondRef)
  const now = useNow(30_000)
  const [busy, setBusy] = useState<string | null>(null)
  const [declining, setDeclining] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  if (!requests?.length) return null

  const answer = async (request: BookingRequest, accept: boolean) => {
    setBusy(`${request.bookingId}:${accept}`)
    try {
      await respond({ bookingId: request.bookingId, accept, ...(accept ? {} : { reason: reason.trim() || undefined }) })
      playSound(accept ? 'success' : 'reject')
      toast.success(accept ? `Confirmed. ${request.patientName} has been told.` : 'Declined. We’ll offer the patient someone else.')
      setDeclining(null)
      setReason('')
    } catch (error) {
      toast.error(error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Something went wrong. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel
      title={
        <>
          New bookings to accept <StatusBadge tone="ink">{requests.length}</StatusBadge>
        </>
      }
      description="Paid by the patient. Confirm in time, or the patient is offered someone else."
    >
      <ul className="divide-y divide-pt-line">
        {requests.map((request) => {
          const urgent = request.dueAt - now < 60 * 60_000
          return (
            <li key={request.bookingId} className="px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-pt-ink">
                    {request.patientName} · {request.serviceName}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-pt-muted">
                    <span>{request.sessionDate ? lagosDateTime(request.sessionDate) : 'Time to agree'}</span>
                    <span className="inline-flex items-center gap-1">
                      {request.mode === 'virtual' ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                      {request.mode === 'virtual' ? 'Video' : `Home visit${request.area ? `, ${request.area}` : ''}`}
                    </span>
                    <span>{request.durationMinutes} min</span>
                  </p>
                  {request.patientNote && <p className="mt-2 rounded-xl bg-pt-sunken px-3 py-2 text-sm text-pt-ink">“{request.patientNote}”</p>}
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <p className="text-lg font-semibold tabular-nums text-pt-ink">{naira(request.payoutKobo)}</p>
                  <p className="text-xs text-pt-muted">
                    Your payout{request.travelShareKobo ? ` + ${naira(request.travelShareKobo)} travel` : ''}
                  </p>
                </div>
              </div>

              {declining === request.bookingId ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={300}
                    placeholder="Reason (optional, not shown to the patient)"
                    className="h-10 flex-1 rounded-xl bg-pt-sunken px-3 text-sm text-pt-ink placeholder:text-pt-faint focus:outline-none focus:ring-2 focus:ring-pt-ink"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setDeclining(null)} className={cn(secondaryButtonClass, 'h-10 px-4 text-sm')}>
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => answer(request, false)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {busy === `${request.bookingId}:false` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Decline booking
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => answer(request, true)}
                    className={cn(primaryButtonClass, 'inline-flex h-10 items-center gap-1.5 px-4 text-sm font-semibold')}
                  >
                    {busy === `${request.bookingId}:true` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setDeclining(request.bookingId)}
                    className={cn(secondaryButtonClass, 'inline-flex h-10 items-center gap-1.5 px-4 text-sm')}
                  >
                    <X className="h-3.5 w-3.5" />
                    Decline
                  </button>
                  <span className={cn('ml-auto inline-flex items-center gap-1.5 text-xs font-medium', urgent ? 'text-red-600 dark:text-red-400' : 'text-pt-muted')}>
                    <Hourglass className="h-3 w-3" />
                    {timeLeft(request.dueAt, now)} left · answer by {lagosTime(request.dueAt)}
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
