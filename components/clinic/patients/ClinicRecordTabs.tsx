'use client'

import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { format, isValid } from 'date-fns'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Loader2, PhoneCall } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'
import { DocumentManager, type DocumentType, type ManagedDocument } from '@/components/patient-documents/DocumentManager'
import { EmptyState, Panel, fieldClass, primaryButtonClass } from '@/components/clinic/ui'
import { friendlyError, isMissingId } from './patient-record-shared'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

/**
 * The clinic's own parts of a patient record, next to the clinical workspace its clinicians
 * write: documents the clinic keeps (referral letters, scans, HMO cards) and the front desk's
 * follow-up calls.
 */

function formatDate(value: number | string | undefined | null, pattern = 'd MMM yyyy') {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(value)
  return isValid(date) ? format(date, pattern) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────────────────────

/** A file on the clinic's record of the patient (getClinicPatientFullRecord's documents). */
export type ClinicDocument = ManagedDocument

/**
 * Anyone on the team with the Patients page can add files. Changing or deleting one is open to them
 * for 24 hours after it was added, then only to the clinic admin (checked on the server).
 */
export function ClinicDocumentsTab({ patientId, documents }: { patientId: Id<'users'>; documents: ClinicDocument[] }) {
  const { requireFullAccess } = useClinicAccess()
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const attachDocument = useMutation(api.clinicTools.attachPatientDocument)

  // One file into storage, then onto the record (DocumentManager adds several in turn)
  const uploadOne = async (file: File, documentType: DocumentType) => {
    const uploadUrl = await generateUploadUrl({ fileType: file.type || 'application/pdf', fileName: file.name })
    const postRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!postRes.ok) throw new Error('The upload did not go through. Please try again.')
    const { storageId } = await postRes.json()
    await attachDocument({
      patientId,
      storageId,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || 'application/pdf',
      documentType,
    })
  }

  return (
    <DocumentManager
      documents={documents}
      uploadOne={uploadOne}
      accept=".pdf,.png,.jpg,.jpeg,.webp"
      uploadHint="PDF or photo, up to 15 MB each. Their clinician sees them too."
      defaultType="medicalRecord"
      title="Documents"
      description="Referral letters, scans, reports and HMO cards"
      guard={(action) => requireFullAccess(action)}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Follow-up calls
// ─────────────────────────────────────────────────────────────────────────────

type CheckInOutcome = 'continuing_care' | 'care_paused' | 'discharged' | 'unreachable'

const CHECK_IN_OUTCOMES: { value: CheckInOutcome; label: string; hint?: string }[] = [
  { value: 'continuing_care', label: 'Doing fine, continuing care' },
  { value: 'unreachable', label: "Couldn't reach the patient" },
  {
    value: 'care_paused',
    label: 'Pausing care',
    hint: 'This pauses their active home programme and removes them from your active patients.',
  },
  {
    value: 'discharged',
    label: 'Discharged',
    hint: 'This ends their care at your clinic and completes their active home programme.',
  },
]

/** "YYYY-MM-DD" from a date input → 09:00 local time on that day. */
function checkInTimestamp(value: string): number | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return undefined
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 9, 0, 0, 0)
  return isValid(date) ? date.getTime() : undefined
}

export type FollowUpCall = {
  _id: string
  sessionDate: number
  subjectiveAssessment?: string
  treatmentAdministered?: string
  clinicianName?: string
}

/** Calls the clinic made to check on the patient, and a form to log the next one. */
export function ClinicFollowUpsTab({
  patientId,
  calls,
  nextCheckInAt,
  phone,
}: {
  patientId: Id<'users'>
  calls: FollowUpCall[]
  nextCheckInAt: number | null
  phone?: string | null
}) {
  const { requireFullAccess } = useClinicAccess()
  const logFollowUp = useMutation(api.clinicTools.logPatientFollowUp)
  const [outcome, setOutcome] = useState<CheckInOutcome>('continuing_care')
  const [notes, setNotes] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [saving, setSaving] = useState(false)

  const hint = CHECK_IN_OUTCOMES.find((o) => o.value === outcome)?.hint
  const canScheduleNext = outcome === 'continuing_care' || outcome === 'unreachable'
  const nextCheckInLabel = formatDate(nextCheckInAt)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!requireFullAccess('Log a follow-up call')) return
    if (isMissingId(patientId)) return
    if (!notes.trim()) {
      toast.error('Write a short note about the call')
      return
    }
    const nextAt = canScheduleNext && nextDate ? checkInTimestamp(nextDate) : undefined
    if (canScheduleNext && nextDate && nextAt === undefined) {
      toast.error('Pick a valid date for the next call')
      return
    }
    setSaving(true)
    try {
      await logFollowUp({ patientId, outcome, notes: notes.trim(), nextCheckInAt: nextAt })
      playSound(outcome === 'discharged' || outcome === 'care_paused' ? 'reject' : 'success')
      toast.success('Follow-up saved')
      setNotes('')
      setNextDate('')
      setOutcome('continuing_care')
    } catch (err) {
      playSound('error')
      toast.error(friendlyError(err, 'Could not save the follow-up. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Log a follow-up call"
        description={nextCheckInLabel ? `Next call due ${nextCheckInLabel}` : 'A quick call to see how they are doing between visits'}
        info="Patients who are due a call show on Home and at the top of Patients. Logging the call sets when the next one is due."
        actions={
          phone ? (
            <Button asChild variant="ghost" size="sm" className="h-9 rounded-xl text-pt-ink hover:bg-pt-hover">
              <a href={`tel:${phone.replace(/\s/g, '')}`}>
                <PhoneCall className="mr-1.5 h-4 w-4" />
                Call
              </a>
            </Button>
          ) : undefined
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4 px-5 pb-5 sm:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className={cn('min-w-0 space-y-1.5', !canScheduleNext && 'sm:col-span-2')}>
              <Label className="text-xs font-medium text-pt-ink">Outcome</Label>
              <Select value={outcome} onValueChange={(val) => setOutcome(val as CheckInOutcome)}>
                <SelectTrigger className={cn(fieldClass, 'h-10')} aria-label="Outcome">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHECK_IN_OUTCOMES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hint && <p className="text-xs text-pt-muted">{hint}</p>}
            </div>
            {canScheduleNext && (
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="followup-next" className="text-xs font-medium text-pt-ink">
                  Next call (optional)
                </Label>
                <Input
                  id="followup-next"
                  type="date"
                  min={format(new Date(), 'yyyy-MM-dd')}
                  value={nextDate}
                  onChange={(e) => setNextDate(e.target.value)}
                  className={cn(fieldClass, 'h-10')}
                />
                {outcome === 'unreachable' && !nextDate && <p className="text-xs text-pt-muted">Leave empty to try again tomorrow.</p>}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="followup-notes" className="text-xs font-medium text-pt-ink">
              Note
            </Label>
            <Textarea
              id="followup-notes"
              rows={3}
              placeholder="e.g. Called on WhatsApp. Knee is better, will book next week."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving} className={cn(primaryButtonClass, 'h-10 w-full sm:w-auto')}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save follow-up
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Earlier calls">
        {calls.length === 0 ? (
          <EmptyState icon={<PhoneCall />} title="No calls logged yet" />
        ) : (
          <ol className="space-y-0.5 px-5 pb-4 sm:px-6">
            {calls.map((call) => (
              <li key={call._id} className="relative border-l border-pt-line py-2.5 pl-4">
                <span className="absolute -left-[4.5px] top-4 h-2 w-2 rounded-full bg-pt-line-strong" aria-hidden />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-medium text-pt-ink">{call.subjectiveAssessment?.replace(/^Check-in:\s*/, '') || 'Follow-up call'}</p>
                  <span className="text-xs text-pt-faint">
                    {[formatDate(call.sessionDate, 'd MMM yyyy, h:mm a'), call.clinicianName].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {call.treatmentAdministered && <p className="mt-0.5 whitespace-pre-line break-words text-sm text-pt-muted">{call.treatmentAdministered}</p>}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}
