'use client'

import { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Inbox, Loader2, Mail, MapPin, Phone } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useClinicPreview } from '@/components/clinic/ClinicPreviewContext'
import { Panel, StatusBadge, primaryButtonClass } from '@/components/clinic/ui'
import { friendlyError, useClinicianOptions } from '@/components/clinic/patients/patient-record-shared'

/**
 * Rehabify referrals inside the Patients page ("Referred by Rehabify"): new referrals to accept
 * (assigning a clinician) or decline, and how earlier ones are progressing. Needs the clinic's
 * Referrals permission; the backend checks it too (respondToRehabifyReferral).
 */

/** Shape returned by api.clinicTools.getClinicRehabifyReferrals */
export type ClinicReferral = {
  _id: string
  trackingCode?: string
  patientName: string
  patientPhone?: string
  patientEmail?: string
  condition?: string
  clinicalNotes?: string
  priority?: 'standard' | 'urgent' | 'high' | string
  status: string
  city?: string
  partnerSource?: string
  createdAt: number
  assignedPhysiotherapistId?: string | null
  /** The patient record an accepted referral became */
  patientId?: string | null
}

type ClinicianOption = { id: string; name: string }

// Before booking, including ones Rehabify has already contacted (convex/clinicTools.ts CLINIC_ACCEPTABLE_REFERRAL)
const WAITING = new Set(['received', 'pending', 'consent_pending', 'contacted', 'intake_started', 'intake_completed', 'qualified'])

export const isWaitingReferral = (referral: ClinicReferral) => WAITING.has(referral.status)

function sourceLabel(raw?: string) {
  if (!raw) return null
  return raw
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function priorityBadge(priority?: string) {
  if (priority === 'urgent') return <StatusBadge tone="red">Urgent</StatusBadge>
  if (priority === 'high') return <StatusBadge tone="amber">High priority</StatusBadge>
  return null
}

/** How far an accepted referral has got, as the clinic records visits, programmes and discharge. */
export function ReferralProgressBadge({ status }: { status: string }) {
  switch (status) {
    case 'received':
    case 'pending':
      return <StatusBadge tone="amber">Awaiting response</StatusBadge>
    case 'accepted':
    case 'booked':
      return <StatusBadge tone="teal">Referral accepted</StatusBadge>
    case 'attended':
      return <StatusBadge tone="teal">First visit done</StatusBadge>
    case 'treatment_active':
    case 'in_treatment':
      return <StatusBadge tone="green">In treatment</StatusBadge>
    case 'completed':
      return <StatusBadge tone="green">Referral completed</StatusBadge>
    case 'cancelled':
    case 'closed':
      return <StatusBadge>Referral closed</StatusBadge>
    default:
      return <StatusBadge>{status.replace(/_/g, ' ')}</StatusBadge>
  }
}

/**
 * New referrals waiting for a response, most urgent first, with Accept / Decline.
 * `others` are earlier referrals that don't match a row in the patient list (shown for the record).
 */
export function ReferralInbox({
  waiting,
  others = [],
}: {
  waiting: ClinicReferral[]
  others?: ClinicReferral[]
}) {
  const { requireFullAccess } = useClinicPreview()
  const [acceptTarget, setAcceptTarget] = useState<ClinicReferral | null>(null)
  const [declineTarget, setDeclineTarget] = useState<ClinicReferral | null>(null)

  // The owner and active clinicians (front-desk staff can't take on patients)
  const clinicianOptions = useClinicianOptions()
  const clinicians = useMemo<ClinicianOption[]>(
    () => clinicianOptions.options.map((o) => ({ id: o.id, name: o.label })),
    [clinicianOptions.options]
  )
  const clinicianNames = useMemo(() => new Map(clinicians.map((c) => [c.id, c.name])), [clinicians])

  const sorted = useMemo(() => {
    const rank = (p?: string) => (p === 'urgent' ? 0 : p === 'high' ? 1 : 2)
    return waiting.slice().sort((a, b) => rank(a.priority) - rank(b.priority) || b.createdAt - a.createdAt)
  }, [waiting])

  return (
    <>
      <section className="space-y-3" aria-labelledby="referrals-waiting">
        <h2 id="referrals-waiting" className="text-sm font-semibold text-neutral-900 dark:text-white">
          New referrals from Rehabify{' '}
          <span className="font-normal text-neutral-500 dark:text-neutral-400">({sorted.length})</span>
        </h2>
        {sorted.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            <Inbox className="h-4 w-4 shrink-0 text-neutral-400" />
            Nothing waiting. New referrals from Rehabify appear here for you to accept.
          </p>
        ) : (
          sorted.map((ref) => (
            <WaitingCard
              key={ref._id}
              referral={ref}
              onAccept={() => requireFullAccess('Accept referral', () => setAcceptTarget(ref))}
              onDecline={() => requireFullAccess('Decline referral', () => setDeclineTarget(ref))}
            />
          ))
        )}
      </section>

      {others.length > 0 && (
        <Panel title="Earlier referrals" description="Referrals that aren't in the patient list below.">
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {others.map((ref) => {
              const clinician = ref.assignedPhysiotherapistId
                ? clinicianNames.get(String(ref.assignedPhysiotherapistId))
                : undefined
              const source = sourceLabel(ref.partnerSource)
              return (
                <li key={ref._id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{ref.patientName}</p>
                      <ReferralProgressBadge status={ref.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {[ref.condition, clinician ? `with ${clinician}` : null].filter(Boolean).join(' · ')}
                    </p>
                    {source && (
                      <p className="mt-0.5 truncate text-xs text-neutral-400 dark:text-neutral-500">Source: {source}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                    {format(new Date(ref.createdAt), 'd MMM yyyy')}
                  </p>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      <Dialog open={!!acceptTarget} onOpenChange={(o) => !o && setAcceptTarget(null)}>
        <DialogContent className="max-w-md">
          {acceptTarget && (
            <AcceptForm
              key={acceptTarget._id}
              referral={acceptTarget}
              clinicians={clinicians}
              onClose={() => setAcceptTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!declineTarget} onOpenChange={(o) => !o && setDeclineTarget(null)}>
        <DialogContent className="max-w-md">
          {declineTarget && (
            <DeclineForm key={declineTarget._id} referral={declineTarget} onClose={() => setDeclineTarget(null)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function WaitingCard({
  referral: ref,
  onAccept,
  onDecline,
}: {
  referral: ClinicReferral
  onAccept: () => void
  onDecline: () => void
}) {
  const [showDetails, setShowDetails] = useState(false)
  const source = sourceLabel(ref.partnerSource)

  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-4 dark:bg-neutral-900 sm:p-5',
        ref.priority === 'urgent' ? 'border-red-200 dark:border-red-900/60' : 'border-neutral-200 dark:border-neutral-800'
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{ref.patientName}</h3>
            <StatusBadge tone="teal">Referred by Rehabify</StatusBadge>
            {priorityBadge(ref.priority)}
          </div>
          {ref.condition && <p className="text-sm text-neutral-700 dark:text-neutral-300">{ref.condition}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            <span>Received {formatDistanceToNow(new Date(ref.createdAt), { addSuffix: true })}</span>
            {ref.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {ref.city}
              </span>
            )}
            {ref.patientPhone && (
              <a
                href={`tel:${ref.patientPhone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white"
              >
                <Phone className="h-3 w-3" />
                {ref.patientPhone}
              </a>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" className="h-9 flex-1 sm:flex-none" onClick={onDecline}>
            Decline
          </Button>
          <Button size="sm" className={cn('h-9 flex-1 sm:flex-none', primaryButtonClass)} onClick={onAccept}>
            Accept
          </Button>
        </div>
      </div>

      <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          className="text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
        >
          {showDetails ? 'Hide details' : 'Show details'}
        </button>
        {showDetails && (
          <div className="mt-2 space-y-2 text-sm">
            <p className="whitespace-pre-line text-neutral-700 dark:text-neutral-300">
              {ref.clinicalNotes?.trim() || 'No clinical notes were included.'}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
              {ref.patientEmail && (
                <a
                  href={`mailto:${ref.patientEmail}`}
                  className="inline-flex min-w-0 items-center gap-1 break-all hover:text-neutral-900 dark:hover:text-white"
                >
                  <Mail className="h-3 w-3 shrink-0" />
                  {ref.patientEmail}
                </a>
              )}
              {source && <span>Source: {source}</span>}
              {ref.trackingCode && <span>Ref: {ref.trackingCode}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AcceptForm({
  referral,
  clinicians,
  onClose,
}: {
  referral: ClinicReferral
  clinicians: ClinicianOption[]
  onClose: () => void
}) {
  const { requireFullAccess } = useClinicPreview()
  const respond = useMutation(api.clinicTools.respondToRehabifyReferral)
  const [clinicianId, setClinicianId] = useState(clinicians.length === 1 ? clinicians[0].id : '')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!requireFullAccess('Accept referral')) return
    if (!clinicianId) return toast.error('Choose who will see this patient.')
    setSaving(true)
    try {
      await respond({
        referralId: referral._id as Id<'inboundReferrals'>,
        action: 'accept',
        assignedClinicianId: clinicianId as Id<'users'>,
        notes: note.trim() || undefined,
      })
      toast.success(`${referral.patientName} accepted and added to your patients`)
      onClose()
    } catch (err: unknown) {
      toast.error(friendlyError(err, 'Could not accept the referral. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">Accept {referral.patientName}</DialogTitle>
        <DialogDescription className="text-sm">
          They will be added to your patients and assigned to the clinician you choose.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-sm">Clinician</Label>
          <Select value={clinicianId} onValueChange={setClinicianId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Who will see this patient?" />
            </SelectTrigger>
            <SelectContent>
              {clinicians.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-neutral-500">No clinicians available</p>
              ) : (
                clinicians.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">
            Note <span className="font-normal text-neutral-500">(optional)</span>
          </Label>
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. We will call to book a first visit this week"
            className="text-sm"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving || !clinicianId} className={cn('h-9', primaryButtonClass)}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {saving ? 'Accepting…' : 'Accept referral'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function DeclineForm({ referral, onClose }: { referral: ClinicReferral; onClose: () => void }) {
  const { requireFullAccess } = useClinicPreview()
  const respond = useMutation(api.clinicTools.respondToRehabifyReferral)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!requireFullAccess('Decline referral')) return
    setSaving(true)
    try {
      await respond({
        referralId: referral._id as Id<'inboundReferrals'>,
        action: 'decline',
        notes: reason.trim() || undefined,
      })
      toast.success('Referral declined and returned to Rehabify')
      onClose()
    } catch (err: unknown) {
      toast.error(friendlyError(err, 'Could not decline the referral. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">Decline {referral.patientName}?</DialogTitle>
        <DialogDescription className="text-sm">
          The referral goes back to Rehabify so they can find another clinic for this patient. It will no longer appear
          here.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-sm">
            Reason <span className="font-normal text-neutral-500">(optional)</span>
          </Label>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Fully booked this month"
            className="text-sm"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={saving} onClick={onClose}>
            Keep it
          </Button>
          <Button type="submit" size="sm" disabled={saving} className="h-9 bg-red-600 text-white hover:bg-red-700">
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {saving ? 'Declining…' : 'Decline referral'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
