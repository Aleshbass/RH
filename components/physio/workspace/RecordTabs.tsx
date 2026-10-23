'use client'

import { useMemo, useRef, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CheckCircle2, Copy, Download, FileText, HeartPulse, Loader2, Mail, NotebookPen, Plus, Receipt, Upload } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { CreateInvoiceModal } from '@/components/dashboard/physiotherapist/modals/CreateInvoiceModal'
import { EmptyState, Panel, StatusBadge, formatNaira, primaryButtonClass } from '@/components/physio/ui'
import { useFileUpload } from '@/lib/hooks/useFileUpload'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { NoteMediaControls, NoteMediaView, useNoteMedia } from '@/components/physio/NoteMedia'
import { programError } from '@/components/exercise-programs/errors'
import { DIFFICULTY_LABELS, EXERCISES_LABELS, HIGH_PAIN, MOOD_LABELS, PainPill, type ExerciseLog, type Workspace } from './shared'

// ─────────────────────────────────────────────────────────────────────────────
// Clinical notes
// ─────────────────────────────────────────────────────────────────────────────

type NoteType = 'initial_assessment' | 'treatment_note' | 'follow_up'

const NOTE_TYPES: { value: NoteType; label: string }[] = [
  { value: 'treatment_note', label: 'Treatment' },
  { value: 'initial_assessment', label: 'Assessment' },
  { value: 'follow_up', label: 'Follow-up' },
]

const NOTE_LABELS: Record<string, string> = {
  initial_assessment: 'Assessment',
  treatment_note: 'Treatment note',
  follow_up: 'Follow-up',
  discharge_summary: 'Discharge summary',
  follow_up_outreach: 'Follow-up call',
}

const SOAP = [
  { key: 'subjectiveAssessment', label: 'Subjective', placeholder: 'What the patient tells you: pain, function, how the week went' },
  { key: 'objectiveAssessment', label: 'Objective', placeholder: 'What you measured or observed: ROM, strength, special tests' },
  { key: 'treatmentAdministered', label: 'Treatment', placeholder: 'What you did today' },
  { key: 'planForNextSession', label: 'Plan', placeholder: 'Next steps, home advice, when to review' },
] as const

function NoteComposer({ workspace, onDone }: { workspace: Workspace; onDone: () => void }) {
  const addNote = useMutation(api.physioCare.addClinicalNote)
  const [type, setType] = useState<NoteType>('treatment_note')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const media = useNoteMedia()

  const save = async () => {
    const hasText = Object.values(fields).some((value) => value.trim())
    if (!hasText && !media.hasMedia) {
      toast.error('Write something, record a voice note or attach a file first.')
      return
    }
    setSaving(true)
    try {
      await addNote({
        patientId: workspace.patient._id,
        noteType: type,
        subjectiveAssessment: fields.subjectiveAssessment || undefined,
        objectiveAssessment: fields.objectiveAssessment || undefined,
        treatmentAdministered: fields.treatmentAdministered || undefined,
        planForNextSession: fields.planForNextSession || undefined,
        voiceNoteStorageId: media.voiceStorageId,
        attachments: media.attachmentIds.length ? media.attachmentIds : undefined,
      })
      playSound('success')
      toast.success('Note saved')
      onDone()
    } catch (error) {
      toast.error(programError(error, 'Couldn’t save the note. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title="New clinical note" description={format(new Date(), 'EEEE d MMMM, h:mm a')}>
      <div className="space-y-4 px-5 pb-5 pt-3">
        <div className="inline-flex rounded-xl bg-rh-canvas p-1 dark:bg-white/[0.05]" role="radiogroup" aria-label="Note type">
          {NOTE_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={type === option.value}
              onClick={() => setType(option.value)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm transition-all',
                type === option.value
                  ? 'bg-white font-semibold text-rh-teal shadow-sm dark:bg-rh-ink-3 dark:text-rh-aqua'
                  : 'text-neutral-600 hover:text-rh-night dark:text-neutral-400 dark:hover:text-white'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {SOAP.map((section) => (
          <div key={section.key}>
            <Label htmlFor={`note-${section.key}`}>{section.label}</Label>
            <Textarea
              id={`note-${section.key}`}
              className="mt-1.5 resize-y"
              rows={2}
              value={fields[section.key] ?? ''}
              onChange={(e) => setFields((f) => ({ ...f, [section.key]: e.target.value }))}
              placeholder={section.placeholder}
            />
          </div>
        ))}
        <NoteMediaControls media={media} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onDone} disabled={saving || media.recording}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || media.busy} className={primaryButtonClass}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save note
          </Button>
        </div>
      </div>
    </Panel>
  )
}

export function NotesTab({ workspace, composing, setComposing }: { workspace: Workspace; composing: boolean; setComposing: (v: boolean) => void }) {
  const notes = useQuery(api.physioCare.getClinicalNotes, { patientId: workspace.patient._id }) as
    | {
        _id: string
        sessionDate: number
        noteType: string
        subjectiveAssessment?: string
        objectiveAssessment?: string
        treatmentAdministered?: string
        planForNextSession?: string
        voiceNote?: string | null
        attachments?: { url: string; contentType: string | null; size: number }[]
      }[]
    | undefined
  const isActive = workspace.episode.status === 'active'

  return (
    <div className="space-y-5">
      {composing ? (
        <NoteComposer workspace={workspace} onDone={() => setComposing(false)} />
      ) : (
        isActive && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-rh-teal/30 bg-white px-5 py-4 text-left text-sm text-neutral-500 transition-all hover:border-rh-teal hover:text-rh-teal dark:border-rh-aqua/30 dark:bg-rh-ink-2 dark:hover:text-rh-aqua"
          >
            <NotebookPen className="h-5 w-5" />
            Write a clinical note for today…
          </button>
        )
      )}

      {notes === undefined ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : notes.length === 0 ? (
        <Panel>
          <EmptyState icon={<NotebookPen />} title="No clinical notes yet" description="Notes you write after each visit appear here, newest first." />
        </Panel>
      ) : (
        <ol className="space-y-3">
          {notes.map((note) => (
            <li key={note._id}>
              <Panel>
                <div className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-rh-night dark:text-white">{format(note.sessionDate, 'EEEE d MMMM yyyy')}</p>
                    <StatusBadge tone={note.noteType === 'discharge_summary' ? 'amber' : 'teal'}>{NOTE_LABELS[note.noteType] ?? 'Note'}</StatusBadge>
                  </div>
                  <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {(
                      [
                        ['Subjective', note.subjectiveAssessment],
                        ['Objective', note.objectiveAssessment],
                        [note.noteType === 'discharge_summary' ? 'Summary' : 'Treatment', note.treatmentAdministered],
                        [note.noteType === 'discharge_summary' ? 'Home advice' : 'Plan', note.planForNextSession],
                      ] as const
                    )
                      .filter(([, text]) => Boolean(text))
                      .map(([label, text]) => (
                        <div key={label}>
                          <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{label}</dt>
                          <dd className="mt-0.5 whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-200">{text}</dd>
                        </div>
                      ))}
                  </dl>
                  <NoteMediaView voiceNote={note.voiceNote} attachments={note.attachments} />
                </div>
              </Panel>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Check-ins
// ─────────────────────────────────────────────────────────────────────────────

/** What the patient reported while doing their home programme: pain, difficulty and notes. */
function ExerciseLogsPanel({ logs }: { logs: ExerciseLog[] }) {
  const markReviewed = useMutation(api.physioCare.markExerciseLogReviewed)
  if (logs.length === 0) return null
  return (
    <Panel title="Home exercise logs" description="Pain and notes the patient gave after each exercise in their programme">
      <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
        {logs.map((log) => {
          const highPain = log.painScore !== null && log.painScore >= HIGH_PAIN
          return (
            <li key={log._id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {log.painScore !== null && <PainPill score={log.painScore} />}
                  {log.difficulty && <StatusBadge>{DIFFICULTY_LABELS[log.difficulty]}</StatusBadge>}
                  <span className="truncate text-sm font-medium text-rh-night dark:text-white">{log.exerciseName}</span>
                </div>
                {log.note && <p className="text-sm text-neutral-600 dark:text-neutral-300">“{log.note}”</p>}
                <p className="text-xs text-neutral-400">
                  {format(log.createdAt, 'EEE d MMM, h:mm a')} · {log.programTitle}
                  {log.source === 'link' ? ' · from the WhatsApp link' : ''}
                </p>
              </div>
              {highPain &&
                (log.reviewedAt ? (
                  <span className="inline-flex shrink-0 items-center text-xs text-neutral-400">
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Reviewed
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-xl"
                    onClick={() => markReviewed({ logId: log._id }).catch((error: unknown) => toast.error(programError(error, 'Couldn’t update. Please try again.')))}
                  >
                    Mark reviewed
                  </Button>
                ))}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

export function CheckInsTab({ workspace }: { workspace: Workspace }) {
  const markReviewed = useMutation(api.physioCare.markCheckInReviewed)
  const checkIns = workspace.checkIns
  const exerciseLogs = workspace.exerciseLogs ?? []
  const points = useMemo(() => checkIns.slice(0, 14).reverse(), [checkIns])

  if (checkIns.length === 0) {
    return (
      <div className="space-y-5">
        <Panel>
          <EmptyState
            icon={<HeartPulse />}
            title="No check-ins yet"
            description="Patients check in from their Rehabify home screen: pain, how daily activities feel, mood and whether they did their exercises."
          />
        </Panel>
        <ExerciseLogsPanel logs={exerciseLogs} />
      </div>
    )
  }

  const max = 10
  return (
    <div className="space-y-5">
      <Panel title="Pain over time" description="Lower is better">
        <div className="flex h-40 items-end gap-1.5 px-5 pb-5 pt-4" role="img" aria-label="Pain score for each recent check-in">
          {points.map((c) => (
            <div key={c._id} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-[10px] tabular-nums text-neutral-400">{c.painScore}</span>
              <div
                className={cn(
                  'w-full max-w-8 rounded-t-lg rounded-b-sm transition-all',
                  c.painScore >= 7 ? 'bg-rose-300 dark:bg-rose-400/60' : c.painScore >= 4 ? 'bg-rh-amber/70' : 'bg-rh-teal/70 dark:bg-rh-aqua/60'
                )}
                style={{ height: `${Math.max(6, (c.painScore / max) * 100)}%` }}
              />
              <span className="text-[10px] text-neutral-400">{format(c.createdAt, 'd/M')}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="All check-ins">
        <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
          {checkIns.map((c) => (
            <li key={c._id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <PainPill score={c.painScore} />
                  {c.mood && <StatusBadge>Mood: {MOOD_LABELS[c.mood]}</StatusBadge>}
                  <StatusBadge tone={c.exercisesDone === 'all' ? 'green' : c.exercisesDone === 'some' ? 'neutral' : 'amber'}>
                    {EXERCISES_LABELS[c.exercisesDone]}
                  </StatusBadge>
                  {c.flagged && (
                    <StatusBadge tone="red">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {c.flagReason ?? 'Flagged'}
                    </StatusBadge>
                  )}
                </div>
                {c.note && <p className="text-sm text-neutral-600 dark:text-neutral-300">“{c.note}”</p>}
                <p className="text-xs text-neutral-400">
                  {format(c.createdAt, 'EEE d MMM, h:mm a')}
                  {c.functionScore !== undefined ? ` · daily activities ${c.functionScore}/10` : ''}
                </p>
              </div>
              {c.flagged &&
                (c.reviewedAt ? (
                  <span className="inline-flex shrink-0 items-center text-xs text-neutral-400">
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Reviewed
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-xl"
                    onClick={() => markReviewed({ checkInId: c._id }).catch((error: unknown) => toast.error(programError(error, 'Couldn’t update. Please try again.')))}
                  >
                    Mark reviewed
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      </Panel>

      <ExerciseLogsPanel logs={exerciseLogs} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Files
// ─────────────────────────────────────────────────────────────────────────────

type DocType = 'referralLetter' | 'medicalRecord' | 'insuranceCard' | 'otherDocument'
const DOC_LABELS: Record<DocType, string> = {
  referralLetter: 'Referral letter',
  medicalRecord: 'Medical record or scan',
  insuranceCard: 'Insurance card',
  otherDocument: 'Other',
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilesTab({ workspace }: { workspace: Workspace }) {
  const files = useQuery(api.files.getPatientDocumentsForPhysio, { patientUserId: workspace.patient._id }) as
    | { _id: string; fileName: string; documentType: DocType; uploadedAt: number; fileSize: number; downloadUrl: string }[]
    | undefined
  const attach = useMutation(api.physioCare.attachPatientFile)
  const { uploadFile } = useFileUpload()
  const inputRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState<DocType>('referralLetter')
  const [uploading, setUploading] = useState(false)
  const isActive = workspace.episode.status === 'active'

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const result = await uploadFile(file)
      if (!result?.storageId) throw new Error('Upload failed')
      await attach({
        patientId: workspace.patient._id,
        storageId: result.storageId as Id<'_storage'>,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || 'application/octet-stream',
        documentType: docType,
      })
      toast.success(`${file.name} added`)
    } catch (error) {
      toast.error(programError(error, 'Upload failed. Please try again.'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-5">
      {isActive && (
        <Panel>
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <input ref={inputRef} type="file" className="hidden" accept="application/pdf,image/*" onChange={onFile} />
            <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
              <SelectTrigger className="rounded-xl sm:w-56" aria-label="File type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DOC_LABELS) as DocType[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {DOC_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => inputRef.current?.click()} disabled={uploading} className={primaryButtonClass}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {uploading ? 'Uploading…' : 'Upload a file'}
            </Button>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">PDF or photo, up to 15 MB.</p>
          </div>
        </Panel>
      )}
      <Panel title="Files" description="Referral letters, scans and reports">
        {files === undefined ? (
          <div className="p-5">
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : files.length === 0 ? (
          <EmptyState icon={<FileText />} title="No files yet" />
        ) : (
          <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
            {files.map((file) => (
              <li key={file._id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rh-mist text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-rh-night dark:text-white">{file.fileName}</p>
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {DOC_LABELS[file.documentType] ?? 'File'} · {formatSize(file.fileSize)} · {format(file.uploadedAt, 'd MMM yyyy')}
                  </p>
                </div>
                <Button asChild variant="ghost" size="icon" aria-label={`Download ${file.fileName}`}>
                  <a href={file.downloadUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Payments
// ─────────────────────────────────────────────────────────────────────────────

type Invoice = {
  _id: Id<'invoices'>
  invoiceNumber: string
  patientId: Id<'users'>
  totalAmount: number
  status: string
  issueDate: number
  dueDate: number
  isOverdue: boolean
}

function invoiceBadge(invoice: Invoice) {
  if (invoice.status === 'paid') return <StatusBadge tone="green">Paid</StatusBadge>
  if (invoice.status === 'void') return <StatusBadge>Void</StatusBadge>
  if (invoice.isOverdue) return <StatusBadge tone="red">Overdue</StatusBadge>
  if (invoice.status === 'partial_payment') return <StatusBadge tone="amber">Part paid</StatusBadge>
  return <StatusBadge tone="teal">Waiting</StatusBadge>
}

export function PaymentsTab({ workspace }: { workspace: Workspace }) {
  // Just this patient's invoices (not the physio's whole billing list)
  const invoices = useQuery(api.billing.getMyInvoices, { patientId: workspace.patient._id, limit: 200 }) as Invoice[] | undefined
  const createLink = useAction(api.physioBilling.createPhysioPaymentLink)
  const [requesting, setRequesting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const mine = (invoices ?? []).filter((i) => i.patientId === workspace.patient._id)
  const isActive = workspace.episode.status === 'active'

  const sendLink = async (invoice: Invoice, email: boolean) => {
    setBusyId(invoice._id)
    try {
      const result = await createLink({ invoiceId: invoice._id, emailPatient: email })
      if (!email) {
        await navigator.clipboard.writeText(result.paymentLink)
        toast.success('Payment link copied', { description: 'Paste it into WhatsApp or a text message.' })
      } else {
        toast.success(result.emailed ? 'Payment link emailed' : 'Link ready, but this patient has no email on file')
      }
    } catch (error) {
      toast.error(programError(error, 'Couldn’t create the payment link. Please try again.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-rh-peach p-5 dark:bg-amber-400/10">
          <p className="text-[13px] font-medium text-[#b4690e] dark:text-amber-300">Waiting for payment</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-rh-night dark:text-white">{formatNaira(workspace.payments.unpaidKobo / 100)}</p>
          <p className="text-xs text-[#b4690e]/80 dark:text-amber-300/80">{workspace.payments.unpaidCount} invoice{workspace.payments.unpaidCount === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-2xl bg-rh-mint p-5 dark:bg-emerald-400/10">
          <p className="text-[13px] font-medium text-[#047857] dark:text-emerald-300">Paid</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-rh-night dark:text-white">{formatNaira(workspace.payments.paidKobo / 100)}</p>
          <p className="text-xs text-[#047857]/80 dark:text-emerald-300/80">from this patient</p>
        </div>
      </div>

      <Panel
        title="Invoices"
        actions={
          isActive && (
            <Button size="sm" className={primaryButtonClass} onClick={() => setRequesting(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Request payment
            </Button>
          )
        }
      >
        {invoices === undefined ? (
          <div className="p-5">
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : mine.length === 0 ? (
          <EmptyState icon={<Receipt />} title="No invoices for this patient" description="Request a payment and they can pay by card, transfer or USSD." />
        ) : (
          <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
            {mine.map((invoice) => {
              const unpaid = invoice.status !== 'paid' && invoice.status !== 'void'
              return (
                <li key={invoice._id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold tabular-nums text-rh-night dark:text-white">{formatNaira(invoice.totalAmount / 100)}</p>
                      {invoiceBadge(invoice)}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      #{invoice.invoiceNumber} · issued {Number.isFinite(invoice.issueDate) ? formatDistanceToNow(invoice.issueDate, { addSuffix: true }) : '—'} · due {Number.isFinite(invoice.dueDate) ? format(invoice.dueDate, 'd MMM') : '—'}
                    </p>
                  </div>
                  {unpaid && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" className="rounded-xl" disabled={busyId === invoice._id} onClick={() => sendLink(invoice, false)}>
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Copy pay link
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-xl" disabled={busyId === invoice._id} onClick={() => sendLink(invoice, true)}>
                        {busyId === invoice._id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />}
                        Email link
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <CreateInvoiceModal isOpen={requesting} onClose={() => setRequesting(false)} preselectedPatientId={workspace.patient._id} />
    </div>
  )
}
