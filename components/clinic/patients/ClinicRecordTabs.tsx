'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { format, isValid } from 'date-fns'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Download, FileText, Loader2, PhoneCall, Upload } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'
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

function formatFileSize(bytes: number | undefined) {
  if (!bytes) return null
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────────────────────

type DocumentType = 'medicalRecord' | 'referralLetter' | 'insuranceCard' | 'otherDocument'

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'medicalRecord', label: 'Medical record or scan' },
  { value: 'referralLetter', label: 'Referral letter' },
  { value: 'insuranceCard', label: 'Insurance / HMO card' },
  { value: 'otherDocument', label: 'Other' },
]

export type ClinicDocument = {
  _id: string
  fileName: string
  documentType?: string
  fileSize?: number
  uploadedAt?: number
  downloadUrl?: string | null
}

export function ClinicDocumentsTab({ patientId, documents }: { patientId: Id<'users'>; documents: ClinicDocument[] }) {
  const { requireFullAccess } = useClinicAccess()
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const attachDocument = useMutation(api.clinicTools.attachPatientDocument)
  const [docType, setDocType] = useState<DocumentType>('medicalRecord')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    if (!requireFullAccess('Upload document')) return
    setUploading(true)
    try {
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
        documentType: docType,
      })
      playSound('success')
      toast.success(`${file.name} added`)
    } catch (err) {
      playSound('error')
      toast.error(friendlyError(err, 'Could not upload the document. Please try again.'))
    } finally {
      setUploading(false)
    }
  }

  const typeLabel = (value?: string) => DOCUMENT_TYPES.find((t) => t.value === value)?.label ?? 'Document'
  const sorted = [...documents].sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0))

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void upload(file)
            }}
          />
          <Select value={docType} onValueChange={(val) => setDocType(val as DocumentType)}>
            <SelectTrigger className={cn(fieldClass, 'h-10 sm:w-60')} aria-label="Document type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className={cn(primaryButtonClass, 'h-10')}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Upload a document'}
          </Button>
          <p className="text-xs text-pt-muted">PDF or photo. Their clinician sees it too.</p>
        </div>
      </Panel>

      <Panel title="Documents" description="Referral letters, scans, reports and HMO cards">
        {sorted.length === 0 ? (
          <EmptyState icon={<FileText />} title="No documents yet" />
        ) : (
          <ul className="px-2 pb-2 sm:px-3">
            {sorted.map((doc) => (
              <li key={doc._id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pt-sunken text-pt-ink">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-pt-ink">{doc.fileName}</p>
                  <p className="truncate text-xs text-pt-muted">
                    {[typeLabel(doc.documentType), formatFileSize(doc.fileSize), formatDate(doc.uploadedAt)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {doc.downloadUrl && (
                  <Button asChild variant="ghost" size="icon" className="rounded-xl hover:bg-pt-hover" aria-label={`Open ${doc.fileName}`}>
                    <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
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
