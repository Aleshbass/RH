'use client'

/**
 * The patient workspace's actions, each in one drawer: write a note, create or revise the care
 * plan (optionally from a template), save a plan as a template, and request a payment.
 */

import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Check,
  ClipboardList,
  Copy,
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
import { fullName, workspaceApi, type CarePlanTemplate, type Workspace } from './shared'

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

type NoteType = 'initial_assessment' | 'treatment_note' | 'follow_up'

const NOTE_TYPES: { value: NoteType; label: string }[] = [
  { value: 'treatment_note', label: 'Treatment' },
  { value: 'initial_assessment', label: 'Assessment' },
  { value: 'follow_up', label: 'Follow-up' },
]

const SOAP = [
  { key: 'subjectiveAssessment', label: 'Subjective', placeholder: 'What the patient tells you: pain, function, how the week went' },
  { key: 'objectiveAssessment', label: 'Objective', placeholder: 'What you measured or observed: ROM, strength, special tests' },
  { key: 'treatmentAdministered', label: 'Treatment', placeholder: 'What you did today' },
  { key: 'planForNextSession', label: 'Plan', placeholder: 'Next steps, home advice, when to review' },
] as const

export function NoteDrawer({ workspace, open, onOpenChange }: { workspace: Workspace; open: boolean; onOpenChange: (open: boolean) => void }) {
  const addNote = useMutationUntyped(workspaceApi.physioCare.addClinicalNote)
  const [type, setType] = useState<NoteType>('treatment_note')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const media = useNoteMedia()

  // A fresh note each time it opens: no text, voice note or files left from the last one
  const resetMedia = media.reset
  useEffect(() => {
    if (!open) return
    setType('treatment_note')
    setFields({})
    resetMedia()
  }, [open, resetMedia])

  const save = async () => {
    if (!Object.values(fields).some((value) => value.trim()) && !media.hasMedia) {
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
      onOpenChange(false)
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t save the note. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PhysioDrawer
      open={open}
      onOpenChange={(next) => !saving && !media.recording && onOpenChange(next)}
      title="New clinical note"
      description={`${workspace.patient.firstName ?? 'Patient'} · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`}
      className="sm:max-w-lg"
      footer={
        <div className="flex gap-2">
          <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} disabled={saving || media.recording} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className={cn(primaryButtonClass, 'h-11 flex-1')} disabled={saving || media.busy} onClick={() => void save()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save note
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Type of note" info="Assessment for a first visit or a re-assessment, Treatment after a session, Follow-up for a call or a check between sessions.">
          <Pills options={NOTE_TYPES} value={type} onChange={setType} label="Type of note" />
        </Field>
        {SOAP.map((section) => (
          <Field key={section.key} label={section.label} htmlFor={`note-${section.key}`}>
            <Textarea
              id={`note-${section.key}`}
              className={cn(fieldClass, 'resize-y')}
              rows={2}
              value={fields[section.key] ?? ''}
              onChange={(e) => setFields((f) => ({ ...f, [section.key]: e.target.value }))}
              placeholder={section.placeholder}
            />
          </Field>
        ))}
        <div>
          <p className="flex items-center gap-1 text-sm font-medium text-pt-ink">
            Voice note and files
            <InfoTip>Talk instead of typing, or attach photos and PDFs (a scan, a referral letter). Only you and the patient’s care team see them.</InfoTip>
          </p>
          <NoteMediaControls media={media} className="mt-1.5" />
        </div>
      </div>
    </PhysioDrawer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Care plan (create or revise), with templates
// ─────────────────────────────────────────────────────────────────────────────

const FREQUENCIES = ['1 session a week', '2 sessions a week', '3 sessions a week', 'Every 2 weeks']

type DraftGoal = { description: string; targetValue: string; timeline: string; achieved?: boolean }

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
      ? plan.goals.map((g) => ({ description: g.description, targetValue: g.targetValue, timeline: g.timeline, achieved: g.achieved }))
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

export function CarePlanDrawer({ workspace, open, onOpenChange }: { workspace: Workspace; open: boolean; onOpenChange: (open: boolean) => void }) {
  const save = useMutationUntyped(workspaceApi.physioCare.saveCarePlan)
  const saveTemplate = useMutationUntyped(workspaceApi.physioCare.saveCarePlanTemplate)
  const noteUsed = useMutationUntyped(workspaceApi.physioCare.noteCarePlanTemplateUsed)
  const [templates, setTemplates] = useState<CarePlanTemplate[] | undefined>(undefined)
  const templatesFailed = useCallback(() => setTemplates([]), [])
  const plan = workspace.plan

  const [step, setStep] = useState<'start' | 'form'>('form')
  const [draft, setDraft] = useState<PlanDraft>(() => draftFromPlan(plan))
  const [fromTemplate, setFromTemplate] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [alsoTemplate, setAlsoTemplate] = useState(false)
  const [saving, setSaving] = useState(false)

  // Each opening starts over: a new plan offers templates first, a revision opens the form
  useEffect(() => {
    if (!open) return
    setDraft(draftFromPlan(plan))
    setStep(plan ? 'form' : 'start')
    setFromTemplate(null)
    setReason('')
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
    const goals = draft.goals.filter((g) => g.description.trim())
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
        changeReason: reason || (fromTemplate ? `Started from the “${fromTemplate}” template` : undefined),
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
                  <InfoTip>What the patient wants to be able to do, how you’ll measure it, and by when. They tick off as you mark them met.</InfoTip>
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
                      <Input className={fieldClass} value={goal.targetValue} onChange={(e) => updateGoal(index, { targetValue: e.target.value })} placeholder="Measure" aria-label="How you’ll measure it" />
                      <Input className={fieldClass} value={goal.timeline} onChange={(e) => updateGoal(index, { timeline: e.target.value })} placeholder="By when" aria-label="By when" />
                    </div>
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
