'use client'

import { useEffect, useRef, useState } from 'react'
import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { CalendarPlus, Check, Loader2, Phone } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Panel, StatusBadge, primaryButtonClass } from '@/components/clinic/ui'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'
import { friendlyError } from '@/components/clinic/patients/patient-record-shared'
import { playSound } from '@/lib/sounds'

export type ClinicBookingRequest = {
  _id: string
  patientId: string
  patientName: string
  patientPhone: string | null
  kind: 'appointment' | 'change_clinician' | 'service'
  kindLabel: string
  message: string | null
  preferredTimes: string | null
  service: string | null
  clinicianId: string | null
  clinicianName: string | null
  createdAt: number
}

const requestsRef = makeFunctionReference<'query', Record<string, never>, ClinicBookingRequest[]>('clinicTools:getClinicBookingRequests')
const resolveRef = makeFunctionReference<
  'mutation',
  { requestId: string; outcome: 'done' | 'declined'; response?: string },
  { changed: boolean }
>('clinicTools:resolveClinicBookingRequest')

/**
 * Patients' requests from their portal: another appointment, a different clinician or a service.
 * "Book" opens the booking form for that patient; marking it done (or saying why not) tells them.
 */
export function BookingRequests({ onBook }: { onBook: (patientId: string, clinicianId: string | null) => void }) {
  const requests = useQuery(requestsRef, {})
  const resolve = useMutation(resolveRef)
  const { requireFullAccess } = useClinicAccess()
  const [declining, setDeclining] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const count = requests?.length ?? 0

  // Opened from Home or a notification (?requests=1): bring the requests into view
  useEffect(() => {
    if (count === 0) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('requests') !== '1') return
    params.delete('requests')
    const query = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [count])

  if (!requests || requests.length === 0) return null

  const close = async (request: ClinicBookingRequest, outcome: 'done' | 'declined') => {
    if (!requireFullAccess('Answer request')) return
    setBusy(request._id)
    try {
      await resolve({ requestId: request._id, outcome, response: outcome === 'declined' ? reason.trim() : undefined })
      playSound(outcome === 'done' ? 'success' : 'reject')
      toast.success(outcome === 'done' ? `${request.patientName} has been told` : 'Reply sent')
      setDeclining(null)
      setReason('')
    } catch (err) {
      playSound('error')
      toast.error(friendlyError(err, 'Could not update the request. Please try again.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div ref={panelRef} className="scroll-mt-24">
    <Panel
      title={`Requests from patients · ${requests.length}`}
      description="Asked for in their patient portal. Book them in, then mark the request done."
      info="Patients can ask for another appointment, a different clinician or a service. Booking it or saying why not tells them in their portal."
    >
      <ul className="divide-y divide-pt-line">
        {requests.map((request) => (
          <li key={request._id} className="space-y-3 px-5 py-3 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-pt-ink">
                  {request.patientName}
                  <StatusBadge tone={request.kind === 'change_clinician' ? 'violet' : 'blue'}>{request.kindLabel}</StatusBadge>
                </p>
                <p className="text-xs text-pt-muted">
                  {[
                    request.service && `Service: ${request.service}`,
                    request.preferredTimes && `Prefers ${request.preferredTimes}`,
                    request.clinicianName && `Clinician: ${request.clinicianName}`,
                    formatDistanceToNow(new Date(request.createdAt), { addSuffix: true }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {request.message && <p className="text-sm text-pt-ink">“{request.message}”</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {request.patientPhone && (
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <a href={`tel:${request.patientPhone.replace(/\s+/g, '')}`} aria-label={`Call ${request.patientName}`}>
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
                <Button size="sm" className={`h-8 ${primaryButtonClass}`} onClick={() => onBook(request.patientId, request.kind === 'change_clinician' ? null : request.clinicianId)}>
                  <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                  Book
                </Button>
                <Button size="sm" variant="outline" className="h-8" disabled={busy === request._id} onClick={() => void close(request, 'done')}>
                  {busy === request._id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                  Done
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-pt-muted" onClick={() => setDeclining(declining === request._id ? null : request._id)}>
                  Can&apos;t do it
                </Button>
              </div>
            </div>
            {declining === request._id && (
              <div className="space-y-2 rounded-lg bg-pt-sunken p-3">
                <Textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Tell the patient why, and what they can do instead"
                  className="resize-none text-sm"
                />
                <div className="flex justify-end">
                  <Button size="sm" disabled={!reason.trim() || busy === request._id} onClick={() => void close(request, 'declined')} className="h-8">
                    Send reply
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
    </div>
  )
}
