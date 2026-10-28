'use client'

import { useMemo, useRef, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { makeFunctionReference } from 'convex/server'
import { AlertTriangle, CheckCircle2, Copy, Download, FileText, HeartPulse, History, Loader2, Mail, NotebookPen, Pencil, Plus, Receipt, Upload } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, InfoTip, Panel, StatusBadge, formatNaira, primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui'
import { useFileUpload } from '@/lib/hooks/useFileUpload'
import { cn } from '@/lib/utils'
import { NoteMediaView } from '@/components/physio/NoteMedia'
import { programError } from '@/components/exercise-programs/errors'
import { usePracticeMode } from '@/components/physio/practiceMode'
import { DIFFICULTY_LABELS, EXERCISES_LABELS, HIGH_PAIN, MOOD_LABELS, PainPill, type ExerciseLog, type Workspace } from './shared'
import { NoteDrawer, type EditableNote } from './WorkspaceDrawers'
import { NoteHistoryDrawer } from './NoteHistoryDrawer'
import { MeasureList } from '@/components/physio/notes/MeasureList'
import { NOTE_TYPE_LABELS, previousBySeries, type ClinicalNote } from '@/components/physio/notes/progress'

// ─────────────────────────────────────────────────────────────────────────────
// Clinical notes
// ─────────────────────────────────────────────────────────────────────────────

/** A note as getClinicalNotes returns it, with who wrote it and its history count. */
type NoteRow = ClinicalNote & { goals?: string; authorName: string; mine: boolean; revisionCount: number }
/** A measured note from getClinicalNoteMeasures (the whole record, without text or media). */
type MeasuredNote = Pick<ClinicalNote, '_id' | 'sessionDate' | 'noteType' | 'measures'> & { authorName: string; mine: boolean }

const getClinicalNotesRef = makeFunctionReference<'query', { patientId: Id<'users'>; limit?: number }, NoteRow[]>('physioCare:getClinicalNotes')
const getClinicalNoteMeasuresRef = makeFunctionReference<'query', { patientId: Id<'users'> }, MeasuredNote[]>(
  'physioCare:getClinicalNoteMeasures'
)

/** Notes shown at first, and how many more each "Show older notes" adds. */
const NOTES_PAGE = 30

export function NotesTab({ workspace, onWrite }: { workspace: Workspace; onWrite: () => void }) {
  const patientId = workspace.patient._id
  const [shown, setShown] = useState(NOTES_PAGE)
  // One more than shown, so we know whether there are older notes
  const result = useQuery(getClinicalNotesRef, { patientId, limit: shown + 1 })
  // Keep the list on screen while older notes load
  const lastResult = useRef<NoteRow[] | undefined>(undefined)
  if (result !== undefined) lastResult.current = result
  const loaded = result ?? lastResult.current
  const notes = loaded?.slice(0, shown)
  const hasOlder = (loaded?.length ?? 0) > shown
  const loadingOlder = result === undefined && loaded !== undefined
  // Measures across the whole record, so "since last time" still works for older notes
  const measured = useQuery(getClinicalNoteMeasuresRef, { patientId }) as ClinicalNote[] | undefined
  const isActive = workspace.episode.status === 'active'
  const [editing, setEditing] = useState<EditableNote | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const hasColleagues = notes?.some((n) => !n.mine) ?? false

  return (
    <div className="space-y-5">
      {isActive && (
        <button
          type="button"
          onClick={onWrite}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-pt-line-strong bg-pt-surface px-5 py-4 text-left text-sm text-pt-muted transition-colors hover:border-pt-ink/40 hover:text-pt-ink"
        >
          <NotebookPen className="h-5 w-5" />
          Write a clinical note for today…
        </button>
      )}

      {notes === undefined ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : notes.length === 0 ? (
        <Panel>
          <EmptyState icon={<NotebookPen />} title="No clinical notes yet" description="Notes written after each visit appear here, newest first." />
        </Panel>
      ) : (
        <div className="space-y-3">
          {hasColleagues && (
            <p className="px-1 text-xs text-pt-muted">Includes notes by your clinic colleagues. Only the person who wrote a note can edit it.</p>
          )}
          <ol className="space-y-3">
          {notes.map((note) => (
            <li key={note._id}>
              <Panel>
                <div className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-pt-ink">{format(note.sessionDate, 'EEEE d MMMM yyyy')}</p>
                      {(!note.mine || note.editedAt) && (
                        <p className="text-xs text-pt-muted">
                          {[
                            note.mine ? null : `By ${note.authorName}`,
                            note.editedAt ? `Edited ${format(note.editedAt, 'd MMM yyyy, HH:mm')}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusBadge tone={note.noteType === 'discharge_summary' ? 'violet' : 'teal'}>{NOTE_TYPE_LABELS[note.noteType] ?? 'Note'}</StatusBadge>
                      {note.revisionCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-10 gap-1.5 px-2.5 text-pt-muted hover:text-pt-ink"
                          onClick={() => setHistoryId(note._id)}
                        >
                          <History className="h-3.5 w-3.5" />
                          History ({note.revisionCount})
                        </Button>
                      )}
                      {/* Only the author edits; colleagues' notes are read-only */}
                      {note.mine && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-10 gap-1.5 px-2.5 text-pt-muted hover:text-pt-ink"
                          onClick={() =>
                            setEditing({
                              _id: note._id,
                              sessionDate: note.sessionDate,
                              noteType: note.noteType,
                              subjectiveAssessment: note.subjectiveAssessment,
                              objectiveAssessment: note.objectiveAssessment,
                              treatmentAdministered: note.treatmentAdministered,
                              planForNextSession: note.planForNextSession,
                              diagnosis: note.diagnosis,
                              measures: note.measures ?? [],
                              hasMedia: Boolean(note.voiceNote) || Boolean(note.attachments?.length),
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                  <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {(
                      [
                        ['Subjective', note.subjectiveAssessment],
                        ['Objective', note.objectiveAssessment],
                        ['Assessment', note.diagnosis],
                        ['Goals', note.goals],
                        [note.noteType === 'discharge_summary' ? 'Summary' : 'Treatment', note.treatmentAdministered],
                        [note.noteType === 'discharge_summary' ? 'Home advice' : 'Plan', note.planForNextSession],
                      ] as const
                    )
                      .filter(([, text]) => Boolean(text))
                      .map(([label, text]) => (
                        <div key={label}>
                          <dt className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">{label}</dt>
                          <dd className="mt-0.5 whitespace-pre-line text-sm text-pt-ink">{text}</dd>
                        </div>
                      ))}
                  </dl>
                  {(note.measures?.length ?? 0) > 0 && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-pt-faint">Measures</p>
                      <MeasureList measures={note.measures} previous={previousBySeries(measured ?? notes, note.sessionDate, note._id)} />
                    </div>
                  )}
                  <NoteMediaView voiceNote={note.voiceNote} attachments={note.attachments} />
                </div>
              </Panel>
            </li>
          ))}
          {hasOlder && (
            <li className="flex justify-center pt-1">
              <Button
                variant="outline"
                className={cn(secondaryButtonClass, 'h-10 rounded-xl')}
                disabled={loadingOlder}
                onClick={() => setShown((n) => n + NOTES_PAGE)}
              >
                {loadingOlder && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Show older notes
              </Button>
            </li>
          )}
          </ol>
        </div>
      )}

      <NoteDrawer workspace={workspace} note={editing} open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} />
      <NoteHistoryDrawer noteId={historyId} open={historyId !== null} onOpenChange={(open) => !open && setHistoryId(null)} />
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
                  <span className="truncate text-sm font-medium text-rh-ink dark:text-white">{log.exerciseName}</span>
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
                  c.painScore >= 7 ? 'bg-pt-rose-fg/70' : c.painScore >= 4 ? 'bg-pt-ink/30' : 'bg-pt-accent/70'
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
                  <StatusBadge tone={c.exercisesDone === 'all' ? 'green' : c.exercisesDone === 'some' ? 'neutral' : 'rose'}>
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
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rh-honeydew text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-rh-ink dark:text-white">{file.fileName}</p>
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
  /** For a Rehabify Care invoice this is the physio's payout, never what the patient paid */
  totalAmount: number
  rehabifyCare?: boolean
  status: string
  issueDate: number
  dueDate: number
  isOverdue: boolean
}

function invoiceBadge(invoice: Invoice) {
  if (invoice.status === 'paid') return <StatusBadge tone="green">Paid</StatusBadge>
  if (invoice.status === 'void') return <StatusBadge>Void</StatusBadge>
  if (invoice.isOverdue) return <StatusBadge tone="red">Overdue</StatusBadge>
  if (invoice.status === 'partial_payment') return <StatusBadge tone="blue">Part paid</StatusBadge>
  return <StatusBadge tone="teal">Waiting</StatusBadge>
}

export function PaymentsTab({ workspace, onRequest }: { workspace: Workspace; onRequest: () => void }) {
  // Just this patient's invoices (not the physio's whole billing list)
  const invoices = useQuery(api.billing.getMyInvoices, { patientId: workspace.patient._id, limit: 200 }) as Invoice[] | undefined
  const createLink = useAction(api.physioBilling.createPhysioPaymentLink)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Rehabify Care payouts only ever show for a Rehabify Care patient, never to an independent physio
  const { isIndependent } = usePracticeMode()
  const mine = (invoices ?? []).filter((i) => i.patientId === workspace.patient._id && !(isIndependent && i.rehabifyCare))
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
        <div className="rounded-3xl border border-pt-line bg-pt-surface p-5 shadow-pt dark:shadow-none">
          <p className="flex items-center gap-1 text-[13px] font-medium text-pt-muted">
            Waiting for payment
            <InfoTip>Invoices sent to this patient that aren’t paid yet. Send the pay link again from the list below.</InfoTip>
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-pt-ink">{formatNaira(workspace.payments.unpaidKobo / 100)}</p>
          <p className="text-xs text-pt-muted">{workspace.payments.unpaidCount} invoice{workspace.payments.unpaidCount === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-3xl border border-pt-line bg-pt-surface p-5 shadow-pt dark:shadow-none">
          <p className="text-[13px] font-medium text-pt-muted">Paid</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-pt-green-fg">{formatNaira(workspace.payments.paidKobo / 100)}</p>
          <p className="text-xs text-pt-muted">to you, for this patient</p>
        </div>
      </div>

      <Panel
        title="Invoices"
        actions={
          isActive && (
            <Button size="sm" className={primaryButtonClass} onClick={onRequest}>
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
                      <p className="text-sm font-semibold tabular-nums text-rh-ink dark:text-white">{formatNaira(invoice.totalAmount / 100)}</p>
                      {invoiceBadge(invoice)}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {invoice.rehabifyCare && 'Your payout · Paid through Rehabify · '}#{invoice.invoiceNumber} · issued {Number.isFinite(invoice.issueDate) ? formatDistanceToNow(invoice.issueDate, { addSuffix: true }) : '—'} · due {Number.isFinite(invoice.dueDate) ? format(invoice.dueDate, 'd MMM') : '—'}
                    </p>
                  </div>
                  {unpaid && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" className={cn(secondaryButtonClass, 'h-9')} disabled={busyId === invoice._id} onClick={() => sendLink(invoice, false)}>
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Copy pay link
                      </Button>
                      <Button size="sm" className={cn(secondaryButtonClass, 'h-9')} disabled={busyId === invoice._id} onClick={() => sendLink(invoice, true)}>
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

    </div>
  )
}
