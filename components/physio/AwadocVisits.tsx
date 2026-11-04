'use client'

/**
 * AwaDoc visits assigned to this physio (convex/awadoc.ts). AwaDoc owns the patient, payment and
 * patient messages; the physio runs the session and tells AwaDoc how it went.
 * Opened from a notification or the end of a call with ?awadoc=<visitId>.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { CalendarClock, CheckCircle2, MapPin, Phone, Video } from '@/components/icons'
import { accentButtonClass, fieldClass, formatNaira, Panel, PhysioDrawer, primaryButtonClass, secondaryButtonClass, softButtonClass, StatusBadge } from '@/components/physio/ui'
import { lagosDateTime, zonedDateKey, zonedDateTimeToUtc, zonedTimeKey } from '@/convex/helpers/lagosTime'
import { useMutationUntyped, useQueryUntyped } from '@/lib/convexUntyped'
import { cn } from '@/lib/utils'

type AwadocVisit = {
  visitId: string
  therapyId: string
  visitNumber: number
  callId: string
  status: 'needs_time' | 'scheduled' | 'started' | 'completed' | 'cancelled'
  scheduledStart?: number
  scheduledEnd?: number
  summary?: string
  payoutKobo: number
  payoutStatus: 'not_due' | 'owed' | 'paid'
  mode: 'virtual' | 'home_visit' | 'office_visit'
  patientName: string
  patientPhone?: string
  address?: string
  complaint?: string
  sessionsRemaining?: number
  followupNotes?: string
}

const MODE_LABEL = { virtual: 'Video call', home_visit: 'Home visit', office_visit: 'Office visit' } as const

const errorText = (err: unknown) => {
  const data = (err as { data?: unknown })?.data
  if (typeof data === 'string') return data
  return err instanceof Error ? err.message.replace(/^.*Uncaught ConvexError: /, '').split('\n')[0] : 'Something went wrong'
}

function statusBadge(visit: AwadocVisit) {
  switch (visit.status) {
    case 'needs_time':
      return <StatusBadge tone="amber">Pick a time</StatusBadge>
    case 'scheduled':
      return <StatusBadge tone="blue">Booked</StatusBadge>
    case 'started':
      return <StatusBadge tone="green" dot>In progress</StatusBadge>
    case 'completed':
      return <StatusBadge tone="neutral">Done</StatusBadge>
    default:
      return <StatusBadge tone="neutral">Cancelled</StatusBadge>
  }
}

export function AwadocVisits() {
  const visits = useQueryUntyped((api as any).awadoc.myVisits) as AwadocVisit[] | undefined
  const startVisit = useMutationUntyped((api as any).awadoc.startVisit)
  const [finishing, setFinishing] = useState<AwadocVisit | null>(null)
  const [timing, setTiming] = useState<AwadocVisit | null>(null)
  const [releasing, setReleasing] = useState<AwadocVisit | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [openedFromLink, setOpenedFromLink] = useState(false)

  // ?awadoc=<visitId> (notification, end of call) opens the right step for that visit
  useEffect(() => {
    if (!visits || openedFromLink || typeof window === 'undefined') return
    const id = new URLSearchParams(window.location.search).get('awadoc')
    if (!id) return
    setOpenedFromLink(true)
    const visit = visits.find((v) => v.visitId === id)
    if (!visit) return
    if (visit.status === 'started') setFinishing(visit)
    else if (visit.status === 'needs_time') setTiming(visit)
    document.getElementById(`awadoc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [visits, openedFromLink])

  if (!visits || visits.length === 0) return null

  const start = async (visit: AwadocVisit) => {
    setBusy(visit.visitId)
    try {
      await startVisit({ visitId: visit.visitId })
      toast.success('Visit started. AwaDoc has been told.')
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Panel
        title="AwaDoc visits"
        description="Patients who booked through the AwaDoc app. AwaDoc takes the payment and messages the patient; you run the session and send a short summary."
      >
        <ul className="divide-y divide-pt-line">
          {visits.map((visit) => {
            const open = visit.status === 'scheduled' || visit.status === 'started'
            return (
              <li key={visit.visitId} id={`awadoc-${visit.visitId}`} className="space-y-3 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-pt-ink">
                      {visit.patientName}
                      {visit.visitNumber > 1 && <span className="font-normal text-pt-muted"> · session {visit.visitNumber}</span>}
                    </p>
                    <p className="text-sm text-pt-muted">
                      {MODE_LABEL[visit.mode]} · {visit.scheduledStart ? lagosDateTime(visit.scheduledStart) : 'time not set yet'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(visit)}
                    <span className="text-xs text-pt-faint">Payout {formatNaira(visit.payoutKobo / 100)}</span>
                  </div>
                </div>

                {visit.complaint && <p className="line-clamp-3 text-sm text-pt-ink/80">“{visit.complaint}”</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-pt-muted">
                  {visit.patientPhone && (
                    <a href={`tel:${visit.patientPhone}`} className="inline-flex items-center gap-1.5 hover:text-pt-ink">
                      <Phone className="h-3.5 w-3.5" /> {visit.patientPhone}
                    </a>
                  )}
                  {visit.address && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> {visit.address}
                    </span>
                  )}
                  {visit.followupNotes && visit.visitNumber > 1 && <span>Plan: {visit.followupNotes}</span>}
                </div>

                {visit.status === 'completed' ? (
                  <p className="inline-flex items-center gap-1.5 text-sm text-pt-muted">
                    <CheckCircle2 className="h-4 w-4" /> Summary sent to AwaDoc
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {visit.status === 'needs_time' && (
                      <Button size="sm" className={primaryButtonClass} onClick={() => setTiming(visit)}>
                        <CalendarClock className="mr-1.5 h-4 w-4" /> Pick a time
                      </Button>
                    )}
                    {open && visit.mode === 'virtual' && (
                      <Button asChild size="sm" className={accentButtonClass}>
                        <Link href={`/video-call/${visit.callId}`}>
                          <Video className="mr-1.5 h-4 w-4" /> {visit.status === 'started' ? 'Rejoin call' : 'Join call'}
                        </Link>
                      </Button>
                    )}
                    {visit.status === 'scheduled' && visit.mode !== 'virtual' && (
                      <Button size="sm" className={accentButtonClass} disabled={busy === visit.visitId} onClick={() => start(visit)}>
                        Start visit
                      </Button>
                    )}
                    {open && (
                      <Button size="sm" className={visit.status === 'started' ? primaryButtonClass : secondaryButtonClass} onClick={() => setFinishing(visit)}>
                        Finish visit
                      </Button>
                    )}
                    {visit.status === 'scheduled' && (
                      <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => setTiming(visit)}>
                        Change time
                      </Button>
                    )}
                    {(visit.status === 'scheduled' || visit.status === 'needs_time') && (
                      <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => setReleasing(visit)}>
                        Can&apos;t make it
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Panel>

      <FinishDrawer visit={finishing} onClose={() => setFinishing(null)} />
      <TimeDrawer visit={timing} onClose={() => setTiming(null)} />
      <ReleaseDrawer visit={releasing} onClose={() => setReleasing(null)} />
    </>
  )
}

function FinishDrawer({ visit, onClose }: { visit: AwadocVisit | null; onClose: () => void }) {
  const completeVisit = useMutationUntyped((api as any).awadoc.completeVisit)
  const [summary, setSummary] = useState('')
  const [more, setMore] = useState(false)
  const [sessions, setSessions] = useState('')
  const [planNotes, setPlanNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visit) return
    setSummary('')
    const left = visit.sessionsRemaining ? visit.sessionsRemaining - 1 : 0
    setMore(left > 0)
    setSessions(left > 0 ? String(left) : '')
    setPlanNotes(visit.followupNotes ?? '')
  }, [visit])

  const submit = async () => {
    if (!visit) return
    setSaving(true)
    try {
      await completeVisit({
        visitId: visit.visitId,
        summary,
        moreSessions: more ? Number(sessions) || 0 : 0,
        planNotes: more ? planNotes : undefined,
      })
      toast.success(more ? 'Done. AwaDoc will confirm the follow-up sessions.' : 'Done. AwaDoc has the summary.')
      onClose()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const planWasOpen = Boolean(visit?.sessionsRemaining)
  return (
    <PhysioDrawer
      open={visit !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Finish AwaDoc visit"
      description={visit ? `${visit.patientName}${visit.visitNumber > 1 ? ` · session ${visit.visitNumber}` : ''}` : undefined}
      keepOpenOnOutsideClick
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className={softButtonClass} onClick={onClose}>
            Cancel
          </Button>
          <Button className={primaryButtonClass} disabled={saving || !summary.trim() || (more && (!Number(sessions) || !planNotes.trim()))} onClick={submit}>
            Send to AwaDoc
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="awadoc-summary" className="text-sm font-medium text-pt-ink">
            Session summary
          </label>
          <Textarea
            id="awadoc-summary"
            rows={5}
            maxLength={2000}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="e.g. Assessed lower back pain; gave a home exercise plan; advised heat and gentle walking."
            className={fieldClass}
          />
          <p className="text-xs text-pt-muted">AwaDoc receives this and may show it to the patient. Keep detailed clinical notes in your own records.</p>
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-pt-line p-3">
          <Checkbox checked={more} onCheckedChange={(checked) => setMore(checked === true)} className="mt-0.5" />
          <span className="text-sm">
            <span className="font-medium text-pt-ink">More sessions needed</span>
            <span className="block text-pt-muted">
              AwaDoc asks the patient to book and pay for them, then each one comes back to you here.
              {planWasOpen && ' Leave this off to close the plan.'}
            </span>
          </span>
        </label>

        {more && (
          <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
            <div className="space-y-1.5">
              <label htmlFor="awadoc-sessions" className="text-sm font-medium text-pt-ink">
                Sessions left
              </label>
              <Input id="awadoc-sessions" type="number" min={1} max={30} value={sessions} onChange={(e) => setSessions(e.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="awadoc-plan" className="text-sm font-medium text-pt-ink">
                How often
              </label>
              <Input
                id="awadoc-plan"
                maxLength={300}
                value={planNotes}
                onChange={(e) => setPlanNotes(e.target.value)}
                placeholder="e.g. 2 sessions a week for 3 weeks"
                className={fieldClass}
              />
            </div>
          </div>
        )}
      </div>
    </PhysioDrawer>
  )
}

function TimeDrawer({ visit, onClose }: { visit: AwadocVisit | null; onClose: () => void }) {
  const setVisitTime = useMutationUntyped((api as any).awadoc.setVisitTime)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visit) return
    const base = visit.scheduledStart ?? Date.now() + 24 * 3600_000
    setDate(zonedDateKey(base))
    setTime(visit.scheduledStart ? zonedTimeKey(base) : '10:00')
  }, [visit])

  const submit = async () => {
    if (!visit || !date || !time) return
    setSaving(true)
    try {
      await setVisitTime({ visitId: visit.visitId, start: zonedDateTimeToUtc(date, time) })
      toast.success('Time saved. AwaDoc will let the patient know.')
      onClose()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PhysioDrawer
      open={visit !== null}
      onOpenChange={(open) => !open && onClose()}
      title={visit?.status === 'needs_time' ? 'Pick a time' : 'Change the time'}
      description={visit ? `${visit.patientName} · ${MODE_LABEL[visit.mode]} · Lagos time` : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className={softButtonClass} onClick={onClose}>
            Cancel
          </Button>
          <Button className={primaryButtonClass} disabled={saving || !date || !time} onClick={submit}>
            Save time
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="awadoc-date" className="text-sm font-medium text-pt-ink">
            Date
          </label>
          <Input id="awadoc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="awadoc-time" className="text-sm font-medium text-pt-ink">
            Time
          </label>
          <Input id="awadoc-time" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} />
        </div>
      </div>
      <p className={cn('mt-3 text-xs text-pt-muted')}>It must be inside your working hours and not clash with another visit.</p>
    </PhysioDrawer>
  )
}

function ReleaseDrawer({ visit, onClose }: { visit: AwadocVisit | null; onClose: () => void }) {
  const releaseVisit = useMutationUntyped((api as any).awadoc.releaseVisit)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visit) setReason('')
  }, [visit])

  const submit = async () => {
    if (!visit) return
    setSaving(true)
    try {
      const result = await releaseVisit({ visitId: visit.visitId, reason: reason || undefined })
      toast.success(result?.reassigned ? 'Handed to another physio.' : 'Handed back. The Rehabify team will find someone.')
      onClose()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PhysioDrawer
      open={visit !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Can't make this visit?"
      description="We'll pass it to another free physio straight away."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className={softButtonClass} onClick={onClose}>
            Keep it
          </Button>
          <Button className={primaryButtonClass} disabled={saving} onClick={submit}>
            Hand it back
          </Button>
        </div>
      }
    >
      <div className="space-y-1.5">
        <label htmlFor="awadoc-release" className="text-sm font-medium text-pt-ink">
          Reason (optional)
        </label>
        <Input id="awadoc-release" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} />
      </div>
    </PhysioDrawer>
  )
}
