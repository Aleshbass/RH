'use client'

/**
 * The patient workspace's actions, each in one drawer: write a note, create or revise the care
 * plan (optionally from a template), save a plan as a template, and request a payment.
 */

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useUser } from '@clerk/nextjs'
import { toast } from 'sonner'
import {
  Check,
  ClipboardList,
  Copy,
  FileSignature,
  FileText,
  Loader2,
  Mail,
  Plus,
  Receipt,
  Search,
  Trash2,
  WhatsApp,
} from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NoteMediaControls, useNoteMedia } from '@/components/physio/NoteMedia'
import {
  fieldClass,
  formatNaira,
  InfoTip,
  PhysioDrawer,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from '@/components/physio/ui'
import { programError } from '@/components/exercise-programs/errors'
import { useBooking } from '@/components/physio/schedule/BookingDrawer'
import { useCareBillingMode } from '@/components/physio/practiceMode'
import { useMutationUntyped, useQueryUntyped, useActionUntyped } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { ClinicalNoteEditor } from '@/components/physio/notes/ClinicalNoteEditor'
import { clearNoteDraft, loadNoteDraft, saveNoteDraft } from '@/components/physio/notes/draftStore'
import { ScribePanel } from '@/components/physio/notes/scribe/ScribePanel'
import type { ScribeNextStepsData } from '@/components/physio/notes/scribe/ScribeNextSteps'
import { SCRIBE_NAME, scribeApi, scribeError, type ScribeCarePlan, type ScribeSession } from '@/components/physio/notes/scribe/scribeApi'
import { draftToNote, nameScore } from '@/components/physio/notes/scribe/scribeTools'
import type { ScribeDraft } from '@/convex/helpers/scribeDraft'
import { useMutation } from 'convex/react'
import {
  draftHasContent,
  emptyDraft,
  isEditableNoteType,
  mergeMeasures,
  readNotes,
  sameDraft,
  type ClinicalNote,
  type NoteDraft,
  type PendingHandle,
} from '@/components/physio/notes/progress'
import type { ClinicalMeasure } from '@/convex/helpers/clinicalMeasures'
import { autoTargetText, goalTemplate, type GoalMeasure, type MeasuredNote } from '@/convex/helpers/goalMeasures'
import { fullName, workspaceApi, type CarePlanTemplate, type Workspace } from './shared'
import { GoalMeasureField, linkFromDraft, measureDraftFromLink, type MeasureDraft } from './GoalMeasureField'

const DAY_MS = 24 * 60 * 60 * 1000

/** A labelled field, with an optional "i" beside the label. */
function Field({ label, htmlFor, info, hint, children }: { label: string; htmlFor?: string; info?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-sm font-medium text-pt-ink">
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-pt-muted">{hint}</p>}
    </div>
  )
}

/** A row of pill choices; the selected one is ink. */
function Pills<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T | null; onChange: (value: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm transition active:scale-95',
            value === option.value ? 'border-pt-primary bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong text-pt-ink hover:bg-pt-hover'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function toDateInput(ms?: number | null) {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinical note
// ─────────────────────────────────────────────────────────────────────────────

/** A note being edited: its current wording and measures (voice notes and files stay as they are). */
export type EditableNote = {
  _id: string
  sessionDate: number
  noteType: string
  subjectiveAssessment?: string
  objectiveAssessment?: string
  treatmentAdministered?: string
  planForNextSession?: string
  diagnosis?: string
  measures: ClinicalMeasure[]
  hasMedia: boolean
}

export function NoteDrawer({
  workspace,
  open,
  onOpenChange,
  note = null,
  appointmentId,
  onScribeSigned,
}: {
  workspace: Workspace
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Opens the drawer on this note to edit it, instead of a new note */
  note?: EditableNote | null
  /** The visit a new note is for (an AI scribe recording is linked to it) */
  appointmentId?: Id<'appointments'>
  /** After an AI-drafted note is signed: the exercises and follow-up the session mentioned */
  onScribeSigned?: (steps: ScribeNextStepsData) => void
}) {
  const patientId = workspace.patient._id
  const addNote = useMutationUntyped(workspaceApi.physioCare.addClinicalNote)
  const updateNote = useMutationUntyped(workspaceApi.physioCare.updateClinicalNote)
  // Recent notes for the last visit beside the note; every measured note on the record (the care
  // team's, older ones too) for "last time", re-testing and quick sets
  const notesResult = useQueryUntyped(workspaceApi.physioCare.getClinicalNotes, open ? { patientId } : 'skip')
  const measuredResult = useQueryUntyped(workspaceApi.physioCare.getClinicalNoteMeasures, open ? { patientId } : 'skip')
  const notes: ClinicalNote[] | undefined = useMemo(() => readNotes(notesResult), [notesResult])
  const measuredNotes = useMemo(() => readNotes(measuredResult), [measuredResult])
  const pending = useRef<PendingHandle | null>(null)
  // Drafts belong to the signed-in user (a shared computer keeps each person's apart)
  const { user } = useUser()
  const userId = user?.id ?? null
  const [draft, setDraft] = useState<NoteDraft>(() => emptyDraft())
  // The note as it was when the drawer opened, so an unchanged edit saves nothing
  const [startDraft, setStartDraft] = useState<NoteDraft | null>(null)
  const [restored, setRestored] = useState(false)
  const [openedAt, setOpenedAt] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const discarded = useRef(false)
  const media = useNoteMedia()
  // The AI scribe recording this new note is drafted from, and whether it's recording or drafting
  const signScribe = useMutation(scribeApi.sign)
  const [scribe, setScribe] = useState<ScribeSession | null>(null)
  const [scribeBusy, setScribeBusy] = useState(false)
  const [replaceWith, setReplaceWith] = useState<ScribeDraft | null>(null)
  const lastApplied = useRef<NoteDraft | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const editing = note !== null
  const noteId = note?._id
  // Discharge summaries and follow-up calls keep their type
  const typeEditable = !editing || isEditableNoteType(note.noteType)

  // The note being edited as it is now, or a new note (an initial assessment when it's the
  // patient's first). Either way, this user's unsaved draft of it comes back if there is one.
  const resetMedia = media.reset
  const firstNote = workspace.notesCount === 0
  useEffect(() => {
    if (!open) return
    setOpenedAt(Date.now())
    setConfirmClose(false)
    discarded.current = false
    const current: NoteDraft | null = note
      ? {
          noteType: isEditableNoteType(note.noteType) ? note.noteType : 'treatment_note',
          subjective: note.subjectiveAssessment ?? '',
          objective: note.objectiveAssessment ?? '',
          assessment: note.diagnosis ?? '',
          treatment: note.treatmentAdministered ?? '',
          plan: note.planForNextSession ?? '',
          measures: note.measures,
        }
      : null
    const saved = userId ? loadNoteDraft(userId, patientId, note?._id, current ?? undefined) : null
    setStartDraft(current)
    setDraft(saved ?? current ?? emptyDraft(firstNote ? 'initial_assessment' : 'treatment_note'))
    setRestored(Boolean(saved))
    resetMedia()
    lastApplied.current = null
    setReplaceWith(null)
  }, [open, note, patientId, firstNote, resetMedia, userId])

  /** The AI's draft into the editor; if the physio has written something of their own, ask first. */
  const applyScribeDraft = useCallback((next: ScribeDraft, force = false) => {
    const current = draftRef.current
    const own = lastApplied.current ? !sameDraft(current, lastApplied.current) : draftHasContent({ ...current, measures: [] })
    if (own && !force) {
      setReplaceWith(next)
      return
    }
    const note = draftToNote(next, current.measures)
    lastApplied.current = note
    setDraft(note)
    setReplaceWith(null)
    setOpenedAt(Date.now())
  }, [])
  const addScribeMeasures = useCallback((measures: ClinicalMeasure[]) => {
    setDraft((current) => {
      const next = { ...current, measures: mergeMeasures(current.measures, measures) }
      if (lastApplied.current && sameDraft(current, lastApplied.current)) lastApplied.current = next
      return next
    })
  }, [])
  const scribeDraft = !editing && scribe?.draft ? scribe : null

  // The note is kept in this browser as it's written, so a closed tab or a crash loses nothing.
  // An edit is kept only while it differs from the saved note.
  useEffect(() => {
    if (!open || !userId) return
    const timer = setTimeout(() => {
      if (discarded.current) return
      if (startDraft && sameDraft(draft, startDraft)) clearNoteDraft(userId, patientId, noteId)
      else saveNoteDraft(userId, patientId, draft, noteId, startDraft ?? undefined)
    }, 400)
    return () => clearTimeout(timer)
  }, [open, userId, patientId, noteId, draft, startDraft])

  const discardDraft = () => {
    if (userId) clearNoteDraft(userId, patientId, noteId)
    setDraft(startDraft ?? emptyDraft(draft.noteType))
    setRestored(false)
    setOpenedAt(Date.now())
  }

  /** Something would be lost by closing: changed text or measures, a measure being typed, or a recording or file. */
  const unsaved = () =>
    (startDraft ? !sameDraft(draft, startDraft) : draftHasContent(draft)) ||
    Boolean(pending.current?.started()) ||
    (!editing && media.hasMedia)

  // Escape, a click outside, the close button and Cancel all come through here
  const requestClose = () => {
    if (saving || media.recording) return
    if (scribeBusy) {
      toast('Stop the recording (or wait for the draft) before closing.')
      return
    }
    if (unsaved()) setConfirmClose(true)
    else onOpenChange(false)
  }

  const discardAndClose = () => {
    discarded.current = true
    if (userId) clearNoteDraft(userId, patientId, noteId)
    setConfirmClose(false)
    onOpenChange(false)
  }

  const save = async () => {
    // A measure typed into an open form or panel but not added yet is saved with the note
    const waiting = pending.current?.collect() ?? { kind: 'none' as const }
    if (waiting.kind === 'invalid') {
      toast.error(`${waiting.message} Fix it, or close that form, then save.`)
      return
    }
    const final: NoteDraft = waiting.kind === 'ok' ? { ...draft, measures: mergeMeasures(draft.measures, waiting.measures) } : draft
    const hasText = [final.subjective, final.objective, final.assessment, final.treatment, final.plan].some((text) => text.trim())
    if (!hasText && final.measures.length === 0 && !(editing ? note.hasMedia : media.hasMedia)) {
      toast.error(editing ? 'A note can’t be empty. Write something or add a measure first.' : 'Write something, add a measure, record a voice note or attach a file first.')
      return
    }
    // Nothing changed: no new version, and the note isn't marked as edited
    if (editing && startDraft && sameDraft(final, startDraft)) {
      discarded.current = true
      if (userId) clearNoteDraft(userId, patientId, noteId)
      toast('No changes to save')
      onOpenChange(false)
      return
    }
    setSaving(true)
    try {
      if (scribeDraft) {
        await signScribe({
          scribeSessionId: scribeDraft._id,
          noteType: final.noteType,
          subjectiveAssessment: final.subjective || undefined,
          objectiveAssessment: final.objective || undefined,
          treatmentAdministered: final.treatment || undefined,
          planForNextSession: final.plan || undefined,
          diagnosis: final.assessment || undefined,
          measures: final.measures.length ? final.measures : undefined,
          voiceNoteStorageId: media.voiceStorageId,
          attachments: media.attachmentIds.length ? media.attachmentIds : undefined,
        })
        discarded.current = true
        if (userId) clearNoteDraft(userId, patientId)
        setDraft(emptyDraft())
        playSound('success')
        toast.success('Note signed')
        onOpenChange(false)
        const steps = scribeDraft.draft!
        if (steps.exercises.length || steps.followUp || steps.carePlan) {
          onScribeSigned?.({ exercises: steps.exercises, followUp: steps.followUp, carePlan: steps.carePlan })
        }
        return
      }
      if (editing) {
        await updateNote({
          noteId: note._id,
          noteType: typeEditable ? final.noteType : undefined,
          subjectiveAssessment: final.subjective,
          objectiveAssessment: final.objective,
          treatmentAdministered: final.treatment,
          planForNextSession: final.plan,
          diagnosis: final.assessment,
          measures: final.measures,
        })
        discarded.current = true
        if (userId) clearNoteDraft(userId, patientId, noteId)
        playSound('success')
        toast.success('Note updated')
        onOpenChange(false)
        return
      }
      await addNote({
        patientId,
        noteType: final.noteType,
        subjectiveAssessment: final.subjective || undefined,
        objectiveAssessment: final.objective || undefined,
        treatmentAdministered: final.treatment || undefined,
        planForNextSession: final.plan || undefined,
        diagnosis: final.assessment || undefined,
        measures: final.measures.length ? final.measures : undefined,
        voiceNoteStorageId: media.voiceStorageId,
        attachments: media.attachmentIds.length ? media.attachmentIds : undefined,
      })
      discarded.current = true
      if (userId) clearNoteDraft(userId, patientId)
      setDraft(emptyDraft())
      playSound('success')
      toast.success('Note saved')
      onOpenChange(false)
    } catch (error) {
      playSound('error')
      toast.error(scribeDraft ? scribeError(error, 'Couldn’t sign the note. Please try again.') : programError(error, 'Couldn’t save the note. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <PhysioDrawer
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
      // A stray tap beside the drawer must not interrupt a note. On touch screens it also made
      // "Keep editing" count as a tap outside, so "Discard your changes?" came straight back.
      keepOpenOnOutsideClick
      title={editing ? 'Edit clinical note' : 'New clinical note'}
      description={`${workspace.patient.firstName ?? 'Patient'} · ${new Date(editing ? note.sessionDate : openedAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`}
      // Wide on desktop: the note beside the last visit. sm:max-w-none keeps the phone sheet full width.
      className="sm:max-w-none md:max-w-2xl lg:max-w-3xl xl:max-w-5xl"
      footer={
        <div className="flex gap-2">
          <Button className={cn(secondaryButtonClass, 'h-11 flex-1 sm:flex-none sm:px-6')} disabled={saving || media.recording || scribeBusy} onClick={requestClose}>
            {editing ? 'Cancel' : 'Close'}
          </Button>
          <Button className={cn(primaryButtonClass, 'h-11 flex-1')} disabled={saving || media.busy || scribeBusy} onClick={() => void save()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : scribeDraft ? <FileSignature className="mr-2 h-4 w-4" /> : null}
            {editing ? 'Save changes' : scribeDraft ? 'Sign note' : 'Save note'}
          </Button>
        </div>
      }
    >
      {!editing && open && (
        <ScribePanel
          patientId={patientId}
          patientFirstName={workspace.patient.firstName || 'The patient'}
          appointmentId={appointmentId}
          noteMeasures={draft.measures}
          onDraft={applyScribeDraft}
          onAddMeasures={addScribeMeasures}
          onSessionChange={setScribe}
          onBusyChange={setScribeBusy}
        />
      )}
      {restored && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-pt-blue-bg px-3 py-2 text-sm text-pt-blue-fg">
          {editing ? 'Your unsaved changes to this note are back.' : 'Your unsaved note is back where you left it.'}
          <button type="button" onClick={discardDraft} className="font-semibold underline underline-offset-2">
            Discard it
          </button>
        </div>
      )}
      <ClinicalNoteEditor
        key={openedAt}
        draft={draft}
        onChange={setDraft}
        notes={notes}
        measuredNotes={measuredNotes}
        pendingRef={pending}
        sessionDate={editing ? note.sessionDate : openedAt}
        editingNoteId={note?._id}
        condition={workspace.episode.condition}
        typeEditable={typeEditable}
        checkIn={workspace.checkIns[0] ?? null}
        media={
          editing ? (
            <p className="text-xs text-pt-muted">
              The earlier wording and measures are kept with the patient’s record, and the note shows when it was edited.
              {note.hasMedia ? ' Its voice note and files stay as they are.' : ''}
            </p>
          ) : (
            <div>
              <p className="flex items-center gap-1 text-sm font-medium text-pt-ink">
                Voice note and files
                <InfoTip>Talk instead of typing, or attach photos and PDFs (a scan, a referral letter). Only you and the patient’s care team see them.</InfoTip>
              </p>
              <NoteMediaControls media={media} className="mt-1.5" />
            </div>
          )
        }
      />
    </PhysioDrawer>

    <AlertDialog open={replaceWith !== null} onOpenChange={(next) => !next && setReplaceWith(null)}>
      <AlertDialogContent className="rounded-2xl border-pt-line bg-pt-surface text-pt-ink">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-pt-ink">Use the AI draft?</AlertDialogTitle>
          <AlertDialogDescription className="text-pt-muted">
            The note’s sections will be replaced with the AI’s draft. Measures already in the note stay.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={cn(secondaryButtonClass, 'h-11 sm:h-10')}>Keep my note</AlertDialogCancel>
          <AlertDialogAction
            className={cn(primaryButtonClass, 'h-11 sm:h-10')}
            onClick={(event) => {
              event.preventDefault()
              if (replaceWith) applyScribeDraft(replaceWith, true)
            }}
          >
            Use the AI draft
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
      <AlertDialogContent className="rounded-2xl border-pt-line bg-pt-surface text-pt-ink">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-pt-ink">Discard your changes?</AlertDialogTitle>
          <AlertDialogDescription className="text-pt-muted">
            {editing
              ? 'Your changes to this note haven’t been saved. The note stays as it was.'
              : `This note hasn’t been saved${media.hasMedia ? ', and its voice note and files will be lost' : ''}.${scribe ? ' The recording and AI draft are kept for 7 days: open a new note for this patient to carry on.' : ''}`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={cn(secondaryButtonClass, 'h-11 sm:h-10')}>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            className="h-11 rounded-xl bg-pt-rose-fg text-pt-surface hover:bg-pt-rose-fg/90 sm:h-10"
            onClick={(event) => {
              event.preventDefault()
              discardAndClose()
            }}
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Care plan (create or revise), with templates
// ─────────────────────────────────────────────────────────────────────────────

const FREQUENCIES = ['1 session a week', '2 sessions a week', '3 sessions a week', 'Every 2 weeks']

type DraftGoal = { description: string; targetValue: string; timeline: string; achieved?: boolean; measure?: MeasureDraft }

type PlanDraft = {
  title: string
  description: string
  goals: DraftGoal[]
  frequency: string
  planned: string
  reviewDate: string
  precautions: string
}

function draftFromPlan(plan: Workspace['plan']): PlanDraft {
  return {
    title: plan?.title ?? '',
    description: plan?.description ?? '',
    goals: plan?.goals.length
      ? plan.goals.map((g) => ({
          description: g.description,
          // Text written from the target is written again on save, so a new target doesn't leave it stale
          targetValue: g.measure && g.targetValue === autoTargetText(g.measure) ? '' : g.targetValue,
          timeline: g.timeline,
          achieved: g.achieved,
          measure: g.measure ? measureDraftFromLink(g.measure) : undefined,
        }))
      : [{ description: '', targetValue: '', timeline: '' }],
    frequency: plan?.sessionFrequency ?? '',
    planned: plan?.plannedSessions ? String(plan.plannedSessions) : '',
    reviewDate: toDateInput(plan?.reviewDate),
    precautions: plan?.precautions ?? '',
  }
}

function draftFromTemplate(template: CarePlanTemplate): PlanDraft {
  return {
    title: template.title,
    description: template.description ?? '',
    goals: template.goals.length ? template.goals.map((g) => ({ ...g })) : [{ description: '', targetValue: '', timeline: '' }],
    frequency: template.sessionFrequency ?? '',
    planned: template.plannedSessions ? String(template.plannedSessions) : '',
    reviewDate: template.reviewAfterDays ? toDateInput(Date.now() + template.reviewAfterDays * DAY_MS) : '',
    precautions: template.precautions ?? '',
  }
}

/** A goal from a Rehabify Scribe draft. A measured goal's target stays empty unless the physio said it. */
function goalFromScribe(goal: ScribeCarePlan['goals'][number]): DraftGoal {
  return {
    description: goal.description,
    targetValue: '',
    timeline: goal.timeline,
    measure: goal.measure ? { template: goalTemplate(goal.measure), target: goal.target !== undefined ? String(goal.target) : '' } : undefined,
  }
}

const reviewIn = (weeks?: number) => (weeks ? toDateInput(Date.now() + weeks * 7 * DAY_MS) : '')

/** A new plan from a Rehabify Scribe draft. */
function draftFromScribe(plan: ScribeCarePlan): PlanDraft {
  return {
    title: plan.title,
    description: plan.summary,
    goals: plan.goals.length ? plan.goals.map(goalFromScribe) : [{ description: '', targetValue: '', timeline: '' }],
    frequency: plan.sessionFrequency,
    planned: plan.plannedSessions ? String(plan.plannedSessions) : '',
    reviewDate: reviewIn(plan.reviewInWeeks),
    precautions: plan.precautions,
  }
}

/** The current plan with a Rehabify Scribe draft's changes: goals said to be met ticked, new goals added, the rest only where it changed. */
function patchFromScribe(base: PlanDraft, plan: ScribeCarePlan): PlanDraft {
  const met = (description: string) =>
    plan.achievedGoals.some((said) => said.trim().toLowerCase() === description.trim().toLowerCase() || nameScore(said, description) >= 0.6)
  const kept = base.goals.filter((g) => g.description.trim() || plan.goals.length === 0)
  return {
    ...base,
    title: base.title || plan.title,
    description: base.description || plan.summary,
    goals: [...kept.map((g) => (g.description.trim() && met(g.description) ? { ...g, achieved: true } : g)), ...plan.goals.map(goalFromScribe)],
    frequency: plan.sessionFrequency || base.frequency,
    planned: plan.plannedSessions ? String(plan.plannedSessions) : base.planned,
    reviewDate: plan.reviewInWeeks ? reviewIn(plan.reviewInWeeks) : base.reviewDate,
    precautions: plan.precautions ? (base.precautions ? `${base.precautions}\n${plan.precautions}` : plan.precautions) : base.precautions,
  }
}

function templateSummary(template: CarePlanTemplate) {
  return [
    `${template.goals.length} goal${template.goals.length === 1 ? '' : 's'}`,
    template.sessionFrequency,
    template.plannedSessions ? `${template.plannedSessions} sessions` : null,
    template.usageCount ? `used ${template.usageCount}×` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function TemplateRow({ template, onUse }: { template: CarePlanTemplate; onUse: () => void }) {
  const remove = useMutationUntyped(workspaceApi.physioCare.deleteCarePlanTemplate)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const del = async () => {
    setBusy(true)
    try {
      await remove({ templateId: template.id })
      toast.success('Template deleted')
    } catch (error) {
      toast.error(programError(error, 'Couldn’t delete it. Please try again.'))
      setBusy(false)
      setConfirming(false)
    }
  }
  return (
    <li className="flex items-center gap-2 rounded-2xl border border-pt-line px-3 py-2.5 transition-colors hover:bg-pt-hover">
      <button type="button" onClick={onUse} className="min-w-0 flex-1 text-left focus-visible:outline-none">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-pt-ink">{template.title}</span>
          {!template.mine && <StatusBadge tone={template.fromRehabify ? 'green' : 'blue'}>{template.fromRehabify ? 'Rehabify' : 'Clinic'}</StatusBadge>}
        </span>
        <span className="block truncate text-xs text-pt-muted">{templateSummary(template)}</span>
      </button>
      {template.mine &&
        (confirming ? (
          <span className="flex shrink-0 items-center gap-1">
            <Button size="sm" className="h-8 rounded-xl bg-pt-rose-bg px-2.5 text-pt-rose-fg shadow-none hover:brightness-95" disabled={busy} onClick={() => void del()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Delete'}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 rounded-xl px-2.5 text-pt-muted" disabled={busy} onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete template ${template.title}`}
            className="shrink-0 rounded-lg p-2 text-pt-faint transition-colors hover:bg-pt-surface hover:text-pt-rose-fg"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ))}
      <Button size="sm" className={cn(secondaryButtonClass, 'h-8 shrink-0 px-3')} onClick={onUse}>
        Use
      </Button>
    </li>
  )
}

/** Step one of a new plan: pick a template, or start blank. */
export function TemplatePicker({ templates, onPick, onBlank }: { templates: CarePlanTemplate[]; onPick: (template: CarePlanTemplate) => void; onBlank: () => void }) {
  const [search, setSearch] = useState('')
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return templates
    return templates.filter((t) => `${t.title} ${t.description ?? ''} ${t.goals.map((g) => g.description).join(' ')}`.toLowerCase().includes(q))
  }, [templates, search])

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBlank}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-pt-line-strong px-4 py-3.5 text-left transition-colors hover:bg-pt-hover"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pt-sunken text-pt-ink">
          <Plus className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-sm font-semibold text-pt-ink">Start a blank plan</span>
          <span className="block text-xs text-pt-muted">Write the goals, frequency and precautions yourself</span>
        </span>
      </button>

      <div>
        <p className="flex items-center gap-1 text-sm font-medium text-pt-ink">
          Or start from a template
          <InfoTip>
            A template fills in the goals, frequency, planned sessions, review date and precautions. Change anything for this patient before you save.
            Save your own from any care plan with “Save as template”.
          </InfoTip>
        </p>
        {templates.length > 5 && (
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates" className={cn(fieldClass, 'pl-9')} aria-label="Search templates" />
          </div>
        )}
        <ul className="mt-2 space-y-2">
          {shown.map((template) => (
            <TemplateRow key={template.id} template={template} onUse={() => onPick(template)} />
          ))}
          {shown.length === 0 && <li className="py-6 text-center text-sm text-pt-muted">No templates match “{search}”.</li>}
        </ul>
      </div>
    </div>
  )
}

/** If the templates can't load (e.g. the backend is mid-deploy), the plan form still works without them. */
class TemplatesBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function TemplatesSource({ onChange }: { onChange: (templates: CarePlanTemplate[]) => void }) {
  const templates = useQueryUntyped(workspaceApi.physioCare.listCarePlanTemplates, {}) as CarePlanTemplate[] | undefined
  useEffect(() => {
    if (templates) onChange(templates)
  }, [templates, onChange])
  return null
}

export function CarePlanDrawer({
  workspace,
  open,
  onOpenChange,
  prefill = null,
}: {
  workspace: Workspace
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A plan (or changes) Rehabify Scribe drafted from the session, to check before saving */
  prefill?: ScribeCarePlan | null
}) {
  const save = useMutationUntyped(workspaceApi.physioCare.saveCarePlan)
  const saveTemplate = useMutationUntyped(workspaceApi.physioCare.saveCarePlanTemplate)
  const noteUsed = useMutationUntyped(workspaceApi.physioCare.noteCarePlanTemplateUsed)
  const [templates, setTemplates] = useState<CarePlanTemplate[] | undefined>(undefined)
  const templatesFailed = useCallback(() => setTemplates([]), [])
  const plan = workspace.plan
  // Measures on record (clinic colleagues' included), for goals with a measured target. The
  // server reads baselines from the same notes when the plan is saved.
  const measuredNotes = useQueryUntyped(workspaceApi.physioCare.getClinicalNoteMeasures, open ? { patientId: workspace.patient._id } : 'skip') as
    | MeasuredNote[]
    | undefined

  const [step, setStep] = useState<'start' | 'form'>('form')
  const [draft, setDraft] = useState<PlanDraft>(() => draftFromPlan(plan))
  const [fromTemplate, setFromTemplate] = useState<string | null>(null)
  const [fromScribe, setFromScribe] = useState(false)
  const [reason, setReason] = useState('')
  const [alsoTemplate, setAlsoTemplate] = useState(false)
  const [saving, setSaving] = useState(false)

  // Each opening starts over: a new plan offers templates first, a revision opens the form
  useEffect(() => {
    if (!open) return
    if (prefill) {
      // From Rehabify Scribe: straight to the form, filled in
      setDraft(plan ? patchFromScribe(draftFromPlan(plan), prefill) : draftFromScribe(prefill))
      setStep('form')
      setReason(plan ? prefill.changeReason : '')
      setFromScribe(true)
    } else {
      setDraft(draftFromPlan(plan))
      setStep(plan ? 'form' : 'start')
      setReason('')
      setFromScribe(false)
    }
    setFromTemplate(null)
    setAlsoTemplate(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // No templates yet: go straight to the form
  useEffect(() => {
    if (step === 'start' && templates && templates.length === 0) setStep('form')
  }, [step, templates])

  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const updateGoal = (index: number, patch: Partial<DraftGoal>) =>
    setDraft((d) => ({ ...d, goals: d.goals.map((g, i) => (i === index ? { ...g, ...patch } : g)) }))

  const pick = (template: CarePlanTemplate) => {
    setDraft(draftFromTemplate(template))
    setFromTemplate(template.title)
    setStep('form')
    noteUsed({ templateId: template.id }).catch(() => undefined)
  }

  const submit = async () => {
    const goals: { description: string; targetValue: string; timeline: string; achieved?: boolean; measure?: GoalMeasure }[] = []
    for (const { measure, ...goal } of draft.goals.filter((g) => g.description.trim())) {
      if (!measure) {
        goals.push(goal)
        continue
      }
      const linked = linkFromDraft(measure)
      if (linked.error !== undefined) return toast.error(linked.error)
      goals.push({ ...goal, measure: linked.link })
    }
    if (!draft.title.trim()) return toast.error('Give the plan a title.')
    if (goals.length === 0) return toast.error('Add at least one functional goal.')
    if (plan && !reason.trim()) return toast.error('Say why the plan is changing.')
    setSaving(true)
    try {
      const reviewDate = draft.reviewDate ? new Date(`${draft.reviewDate}T09:00:00`).getTime() : undefined
      await save({
        patientId: workspace.patient._id,
        title: draft.title,
        description: draft.description || undefined,
        goals,
        sessionFrequency: draft.frequency || undefined,
        plannedSessions: draft.planned ? Number(draft.planned) : undefined,
        reviewDate,
        precautions: draft.precautions || undefined,
        changeReason:
          reason ||
          (fromTemplate ? `Started from the “${fromTemplate}” template` : fromScribe ? `Drafted with ${SCRIBE_NAME} from the session` : undefined),
      })
      if (alsoTemplate) {
        await saveTemplate({
          title: draft.title,
          description: draft.description || undefined,
          goals: goals.map(({ description, targetValue, timeline }) => ({ description, targetValue, timeline })),
          sessionFrequency: draft.frequency || undefined,
          plannedSessions: draft.planned ? Number(draft.planned) : undefined,
          precautions: draft.precautions || undefined,
          reviewAfterDays: reviewDate ? Math.max(1, Math.round((reviewDate - Date.now()) / DAY_MS)) : undefined,
          shareWithClinic: false,
        }).catch((error: unknown) => toast.error(programError(error, 'The plan is saved, but the template couldn’t be.')))
      }
      playSound('success')
      toast.success(plan ? 'Care plan updated' : 'Care plan created', {
        description: `${workspace.patient.firstName ?? 'Your patient'} can see it in their app.`,
      })
      onOpenChange(false)
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t save the plan. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const choosing = step === 'start'
  return (
    <>
      {open && (
        <TemplatesBoundary onError={templatesFailed}>
          <TemplatesSource onChange={setTemplates} />
        </TemplatesBoundary>
      )}
      <PhysioDrawer
        open={open}
        onOpenChange={(next) => !saving && onOpenChange(next)}
        title={plan ? `Revise care plan (version ${plan.version + 1})` : 'New care plan'}
        description={choosing ? 'Start blank, or from a plan you’ve used before.' : `For ${workspace.patient.firstName ?? 'your patient'}. They see it in their app.`}
        className="sm:max-w-xl"
        footer={
          choosing ? undefined : (
            <div className="flex gap-2">
              <Button
                className={cn(secondaryButtonClass, 'h-11 flex-1')}
                disabled={saving}
                onClick={() => (!plan && templates && templates.length > 0 ? setStep('start') : onOpenChange(false))}
              >
                {!plan && templates && templates.length > 0 ? 'Back' : 'Cancel'}
              </Button>
              <Button className={cn(primaryButtonClass, 'h-11 flex-1')} disabled={saving} onClick={() => void submit()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {plan ? 'Save new version' : 'Create plan'}
              </Button>
            </div>
          )
        }
      >
        {choosing ? (
          templates === undefined ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-pt-muted" />
            </div>
          ) : (
            <TemplatePicker templates={templates} onPick={pick} onBlank={() => setStep('form')} />
          )
        ) : (
          <div className="space-y-5">
            {fromScribe && (
              <p className="flex items-start gap-2 rounded-2xl bg-pt-amber-bg p-3 text-sm text-pt-amber-fg">
                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {plan
                    ? `${SCRIBE_NAME} filled in the changes from the session: goals said to be met are ticked and new goals added. Check everything before saving.`
                    : `Drafted by ${SCRIBE_NAME} from the session. Check every goal, and set targets for the measured ones before saving.`}
                </span>
              </p>
            )}
            {fromTemplate && (
              <p className="flex items-start gap-2 rounded-2xl bg-pt-sunken p-3 text-sm text-pt-muted">
                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-pt-ink" />
                <span>
                  Filled in from <b className="text-pt-ink">{fromTemplate}</b>. Change anything for this patient.
                </span>
              </p>
            )}
            <Field label="Plan title" htmlFor="cp-title">
              <Input id="cp-title" className={fieldClass} value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Return to running after ankle sprain" />
            </Field>
            <Field label="Summary (optional)" htmlFor="cp-desc">
              <Textarea id="cp-desc" className={cn(fieldClass, 'resize-none')} rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="The approach in a sentence or two" />
            </Field>

            <div>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1 text-sm font-medium text-pt-ink">
                  Functional goals
                  <InfoTip>
                    What the patient wants to be able to do, how you’ll measure it, and by when. They tick off as you mark them met. Add a measured target to
                    track a goal against the measures in your notes: the first value recorded in this course of care is its baseline.
                  </InfoTip>
                </p>
                <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-pt-ink hover:bg-pt-hover" onClick={() => set('goals', [...draft.goals, { description: '', targetValue: '', timeline: '' }])}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add goal
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {draft.goals.map((goal, index) => (
                  <div key={index} className="space-y-2 rounded-2xl bg-pt-sunken p-3">
                    <div className="flex gap-2">
                      <Input className={fieldClass} value={goal.description} onChange={(e) => updateGoal(index, { description: e.target.value })} placeholder="e.g. Climb stairs without a rail" aria-label={`Goal ${index + 1}`} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-pt-faint hover:bg-pt-surface hover:text-pt-rose-fg"
                        onClick={() => set('goals', draft.goals.length > 1 ? draft.goals.filter((_, i) => i !== index) : draft.goals)}
                        aria-label="Remove goal"
                        disabled={draft.goals.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pr-11">
                      <Input
                        className={fieldClass}
                        value={goal.targetValue}
                        onChange={(e) => updateGoal(index, { targetValue: e.target.value })}
                        placeholder={goal.measure ? 'Measure (optional)' : 'Measure'}
                        aria-label="How you’ll measure it"
                      />
                      <Input className={fieldClass} value={goal.timeline} onChange={(e) => updateGoal(index, { timeline: e.target.value })} placeholder="By when" aria-label="By when" />
                    </div>
                    <GoalMeasureField
                      value={goal.measure}
                      onChange={(measure) => updateGoal(index, { measure })}
                      notes={measuredNotes}
                      since={workspace.episode.startedAt}
                      goalLabel={goal.description.trim() || `goal ${index + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Field label="Session frequency">
              <Pills options={FREQUENCIES.map((f) => ({ value: f, label: f }))} value={draft.frequency} onChange={(value) => set('frequency', value)} label="Session frequency" />
              <Input className={cn(fieldClass, 'mt-2')} value={draft.frequency} onChange={(e) => set('frequency', e.target.value)} placeholder="Or type your own" aria-label="Session frequency" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Planned sessions" htmlFor="cp-planned">
                <Input id="cp-planned" className={fieldClass} inputMode="numeric" value={draft.planned} onChange={(e) => set('planned', e.target.value.replace(/[^\d]/g, ''))} placeholder="8" />
              </Field>
              <Field label="Review date" htmlFor="cp-review" info="You’re reminded on Today when the review is due.">
                <Input id="cp-review" className={fieldClass} type="date" value={draft.reviewDate} onChange={(e) => set('reviewDate', e.target.value)} />
              </Field>
            </div>

            <Field label="Precautions and safety guidance" htmlFor="cp-precautions" info="Shown to the patient with their plan and exercises.">
              <Textarea
                id="cp-precautions"
                className={cn(fieldClass, 'resize-none')}
                rows={3}
                value={draft.precautions}
                onChange={(e) => set('precautions', e.target.value)}
                placeholder="e.g. No weight-bearing over 50% until week 4. Stop if pain goes above 5/10."
              />
            </Field>

            <Field
              label={plan ? 'Why is the plan changing?' : 'Reason for this plan (optional)'}
              htmlFor="cp-reason"
              hint="Kept with this version, and shown to your patient."
            >
              <Input
                id="cp-reason"
                className={fieldClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={plan ? 'e.g. Progressed after 4-week review: pain down, range of motion up' : 'e.g. Initial assessment findings'}
              />
            </Field>

            {!fromTemplate && (
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-pt-sunken p-3">
                <Checkbox checked={alsoTemplate} onCheckedChange={(checked) => setAlsoTemplate(Boolean(checked))} className="mt-0.5" />
                <span className="text-sm text-pt-ink">
                  Also save as a template
                  <span className="block text-xs text-pt-muted">Start the next patient with a similar problem from this plan.</span>
                </span>
              </label>
            )}
          </div>
        )}
      </PhysioDrawer>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Save a care plan as a template
// ─────────────────────────────────────────────────────────────────────────────

const REVIEW_AFTER = [
  { value: '14', label: '2 weeks' },
  { value: '28', label: '4 weeks' },
  { value: '42', label: '6 weeks' },
  { value: '0', label: 'None' },
] as const

type ReviewAfter = (typeof REVIEW_AFTER)[number]['value']

export function SaveTemplateDrawer({ plan, open, onOpenChange }: { plan: NonNullable<Workspace['plan']>; open: boolean; onOpenChange: (open: boolean) => void }) {
  const saveTemplate = useMutationUntyped(workspaceApi.physioCare.saveCarePlanTemplate)
  const me = useQueryUntyped(workspaceApi.users.getMyUser, open ? {} : 'skip') as { clinicId?: string } | null | undefined
  const [name, setName] = useState(plan.title)
  const [reviewAfter, setReviewAfter] = useState<ReviewAfter>('28')
  const [share, setShare] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(plan.title)
    setShare(false)
    // The plan's own review interval, to the nearest offered option
    const days = plan.reviewDate ? Math.round((plan.reviewDate - plan.updatedAt) / DAY_MS) : 0
    setReviewAfter(days <= 0 ? '0' : days <= 21 ? '14' : days <= 35 ? '28' : '42')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async () => {
    if (!name.trim()) return toast.error('Give the template a name.')
    setSaving(true)
    try {
      await saveTemplate({
        title: name,
        description: plan.description || undefined,
        goals: plan.goals.map(({ description, targetValue, timeline }) => ({ description, targetValue, timeline })),
        sessionFrequency: plan.sessionFrequency || undefined,
        plannedSessions: plan.plannedSessions || undefined,
        precautions: plan.precautions || undefined,
        reviewAfterDays: reviewAfter === '0' ? undefined : Number(reviewAfter),
        shareWithClinic: share,
      })
      playSound('success')
      toast.success('Saved as a template', { description: 'Use it from “New care plan” for your next patient.' })
      onOpenChange(false)
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t save the template. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PhysioDrawer
      open={open}
      onOpenChange={(next) => !saving && onOpenChange(next)}
      title="Save as template"
      description="Start the next plan from this one."
      footer={
        <div className="flex gap-2">
          <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className={cn(primaryButtonClass, 'h-11 flex-1')} disabled={saving} onClick={() => void submit()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save template
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field label="Template name" htmlFor="tpl-name" hint="Name it by the problem, e.g. “ACL reconstruction, weeks 0–6”.">
          <Input id="tpl-name" className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Review after" info="When you use the template, the review date is set this far from that day.">
          <Pills options={[...REVIEW_AFTER]} value={reviewAfter} onChange={setReviewAfter} label="Review after" />
        </Field>
        <div className="rounded-2xl bg-pt-sunken p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">What’s saved</p>
          <ul className="mt-2 space-y-1.5 text-sm text-pt-ink">
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-pt-green-fg" />
              {plan.goals.length} goal{plan.goals.length === 1 ? '' : 's'}, not marked as met
            </li>
            {plan.sessionFrequency && (
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-pt-green-fg" />
                {plan.sessionFrequency}
                {plan.plannedSessions ? ` · ${plan.plannedSessions} sessions` : ''}
              </li>
            )}
            {plan.precautions && (
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-pt-green-fg" />
                Precautions
              </li>
            )}
          </ul>
          <p className="mt-2 text-xs text-pt-muted">Nothing about this patient is saved: no name, notes or check-ins.</p>
        </div>
        {me?.clinicId && (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-pt-line p-3">
            <Checkbox checked={share} onCheckedChange={(checked) => setShare(Boolean(checked))} className="mt-0.5" />
            <span className="text-sm text-pt-ink">
              Share with my clinic
              <span className="block text-xs text-pt-muted">Other physios in your clinic can start plans from it. Only you can delete it.</span>
            </span>
          </label>
        )}
      </div>
    </PhysioDrawer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Request a payment
// ─────────────────────────────────────────────────────────────────────────────

type Item = { description: string; amount: string }

const DUE_OPTIONS = [
  { value: '0', label: 'Today' },
  { value: '3', label: 'In 3 days' },
  { value: '7', label: 'In a week' },
  { value: '14', label: 'In 2 weeks' },
] as const

type DueIn = (typeof DUE_OPTIONS)[number]['value']

const ITEM_SUGGESTIONS = ['Physiotherapy session', 'Initial assessment', 'Home visit', 'Video consultation']

export function RequestPaymentDrawer({ workspace, open, onOpenChange }: { workspace: Workspace; open: boolean; onOpenChange: (open: boolean) => void }) {
  const createInvoice = useMutationUntyped(workspaceApi.billing.createInvoice)
  const createLink = useActionUntyped(workspaceApi.physioBilling.createPhysioPaymentLink)
  const me = useQueryUntyped(workspaceApi.users.getMyUser, open ? {} : 'skip') as { clinicId?: string } | null | undefined
  // Rehabify Care patients pay Rehabify's set prices per session, so there's no amount to type.
  // Independent physios only have their own patients (always "own").
  const billing = useCareBillingMode(open ? workspace.patient._id : null)
  const openBooking = useBooking()
  const [items, setItems] = useState<Item[]>([{ description: '', amount: '' }])
  const [dueIn, setDueIn] = useState<DueIn>('7')
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState<{ invoiceId: Id<'invoices'>; invoiceNumber?: string; total: number } | null>(null)
  const [linkBusy, setLinkBusy] = useState<'copy' | 'email' | 'whatsapp' | null>(null)
  const name = workspace.patient.firstName || 'your patient'

  useEffect(() => {
    if (!open) return
    setItems([{ description: '', amount: '' }])
    setDueIn('7')
    setSent(null)
  }, [open])

  const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  // Same sums as billing.createInvoice: Rehabify takes nothing from a physio's own invoice; their
  // patient pays only Paystack's 1.5% + ₦100 on top. A clinic's patient pays the quoted price.
  const throughClinic = Boolean(me?.clinicId)
  const processing = throughClinic || subtotal <= 0 ? 0 : Math.round(subtotal * 0.015) + 100
  const patientPays = subtotal + processing

  const setItem = (index: number, patch: Partial<Item>) => setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const submit = async () => {
    const clean = items.filter((item) => item.description.trim() || Number(item.amount) > 0)
    if (clean.length === 0 || clean.some((item) => !item.description.trim() || !(Number(item.amount) > 0))) {
      return toast.error('Each item needs a description and an amount.')
    }
    setSaving(true)
    try {
      const due = new Date(Date.now() + Number(dueIn) * DAY_MS)
      due.setHours(23, 59, 59, 0)
      const result = (await createInvoice({
        patientId: workspace.patient._id,
        appointmentIds: [],
        items: clean.map((item) => ({ description: item.description.trim(), quantity: 1, unitPrice: Number(item.amount), totalPrice: Number(item.amount) })),
        discountAmount: 0,
        notes: '',
        dueDate: due.getTime(),
      })) as { success: boolean; invoiceId?: Id<'invoices'>; invoiceNumber?: string; message: string }
      if (!result.success || !result.invoiceId) throw new Error(result.message)
      playSound('success')
      setSent({ invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber, total: subtotal })
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t create the request. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const share = async (how: 'copy' | 'email' | 'whatsapp') => {
    if (!sent) return
    setLinkBusy(how)
    try {
      const result = (await createLink({ invoiceId: sent.invoiceId, emailPatient: how === 'email' })) as { paymentLink: string; emailed: boolean }
      if (how === 'copy') {
        await navigator.clipboard.writeText(result.paymentLink)
        toast.success('Payment link copied')
      } else if (how === 'email') {
        toast.success(result.emailed ? `Emailed to ${name}` : 'Link ready, but this patient has no email on file')
      } else {
        const phone = (workspace.patient.phoneNumber ?? '').replace(/\D/g, '').replace(/^0/, '234')
        const text = `Hi ${name}, here's the link to pay for your physiotherapy (${formatNaira(sent.total)}): ${result.paymentLink}`
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      toast.error(programError(error, 'Couldn’t create the payment link. Please try again.'))
    } finally {
      setLinkBusy(null)
    }
  }

  if (billing?.mode === 'rehabify') {
    return (
      <PhysioDrawer
        open={open}
        onOpenChange={onOpenChange}
        title="Request payment"
        description={`${workspace.patient.firstName ?? 'Your patient'} pays Rehabify’s set prices.`}
        footer={
          <div className="flex gap-2">
            <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              className={cn(primaryButtonClass, 'h-11 flex-[2]')}
              onClick={() => {
                onOpenChange(false)
                openBooking({ patient: { id: workspace.patient._id, name: fullName(workspace.patient) } })
              }}
            >
              Book a paid session
            </Button>
          </div>
        }
      >
        <div className="flex gap-2.5 rounded-2xl bg-pt-blue-bg p-4 text-sm text-pt-blue-fg">
          <Receipt className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {workspace.patient.firstName ?? 'This patient'} came through Rehabify, so each session is paid at Rehabify’s price. Book the session
            (or accept their request) and they get the invoice. It’s confirmed once they pay.
          </span>
        </div>
      </PhysioDrawer>
    )
  }

  return (
    <PhysioDrawer
      open={open}
      onOpenChange={(next) => !saving && onOpenChange(next)}
      title={sent ? 'Payment request sent' : 'Request payment'}
      description={sent ? `${name} has been told in their app.` : `${workspace.patient.firstName ?? 'Your patient'} pays by card, transfer or USSD.`}
      footer={
        sent ? (
          <Button className={cn(primaryButtonClass, 'h-11 w-full')} onClick={() => onOpenChange(false)}>
            Done
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className={cn(primaryButtonClass, 'h-11 flex-1')} disabled={saving || subtotal <= 0} onClick={() => void submit()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send request
            </Button>
          </div>
        )
      }
    >
      {sent ? (
        <div className="space-y-5">
          <div className="flex flex-col items-center rounded-2xl bg-pt-sunken px-4 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pt-accent text-[#06210a]">
              <Receipt className="h-5 w-5" />
            </span>
            <p className="mt-3 text-2xl font-semibold tabular-nums text-pt-ink">{formatNaira(sent.total)}</p>
            <p className="text-sm text-pt-muted">{sent.invoiceNumber ? `Invoice #${sent.invoiceNumber}` : 'Invoice created'}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-sm font-medium text-pt-ink">
              Send them the pay link
              <InfoTip>The link opens a secure Paystack page. When they pay, the invoice is marked paid and you get a notification.</InfoTip>
            </p>
            <div className="mt-2 grid gap-2">
              <Button className="h-11 rounded-xl bg-[#25D366] text-white shadow-none hover:bg-[#1ebe5b]" disabled={linkBusy !== null} onClick={() => void share('whatsapp')}>
                {linkBusy === 'whatsapp' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WhatsApp className="mr-2 h-4 w-4" />}
                Send on WhatsApp
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button className={cn(secondaryButtonClass, 'h-11')} disabled={linkBusy !== null} onClick={() => void share('copy')}>
                  {linkBusy === 'copy' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                  Copy link
                </Button>
                <Button className={cn(secondaryButtonClass, 'h-11')} disabled={linkBusy !== null} onClick={() => void share('email')}>
                  {linkBusy === 'email' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                  Email it
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-pt-ink">What it’s for</p>
            <div className="mt-2 space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    className={cn(fieldClass, 'min-w-0 flex-1')}
                    value={item.description}
                    onChange={(e) => setItem(index, { description: e.target.value })}
                    placeholder="e.g. Physiotherapy session"
                    aria-label={`Item ${index + 1}`}
                    list="payment-item-suggestions"
                  />
                  <div className="relative w-32 shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-pt-muted">₦</span>
                    <Input
                      className={cn(fieldClass, 'pl-7 tabular-nums')}
                      inputMode="numeric"
                      value={item.amount}
                      onChange={(e) => setItem(index, { amount: e.target.value.replace(/[^\d]/g, '') })}
                      placeholder="15000"
                      aria-label={`Amount for item ${index + 1}`}
                    />
                  </div>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-pt-faint hover:text-pt-rose-fg" onClick={() => setItems((list) => list.filter((_, i) => i !== index))} aria-label="Remove item">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <datalist id="payment-item-suggestions">
                {ITEM_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <Button type="button" variant="ghost" size="sm" className="mt-1 h-8 rounded-lg px-2 text-pt-ink hover:bg-pt-hover" onClick={() => setItems((list) => [...list, { description: '', amount: '' }])}>
              <Plus className="mr-1 h-4 w-4" />
              Add another item
            </Button>
          </div>

          <Field label="Pay by">
            <Pills options={[...DUE_OPTIONS]} value={dueIn} onChange={setDueIn} label="Pay by" />
          </Field>

          <div className="rounded-2xl bg-pt-sunken p-4 text-sm">
            <div className="flex justify-between text-pt-muted">
              <span>You charge</span>
              <span className="tabular-nums text-pt-ink">{formatNaira(subtotal)}</span>
            </div>
            {!throughClinic && (
              <div className="mt-1.5 flex justify-between text-pt-muted">
                <span className="flex items-center gap-1">
                  Card and transfer fee
                  <InfoTip>
                    Paystack’s 1.5% + ₦100, added to what the patient pays. Rehabify takes nothing. If they pay you directly,
                    record it as paid instead.
                  </InfoTip>
                </span>
                <span className="tabular-nums">{formatNaira(processing)}</span>
              </div>
            )}
            <div className="mt-3 flex justify-between border-t border-pt-line pt-3 font-semibold text-pt-ink">
              <span>{name} pays</span>
              <span className="tabular-nums">{formatNaira(patientPays)}</span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-pt-muted">
              <FileText className="h-3.5 w-3.5" />
              {throughClinic ? 'Billed through your clinic, to the clinic’s payout account.' : `You receive ${formatNaira(subtotal)} to your payout account.`}
            </p>
          </div>
        </div>
      )}
    </PhysioDrawer>
  )
}
