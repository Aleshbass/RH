'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Dumbbell,
  Layers,
  Library,
  Loader2,
  Mic,
  Plus,
  Save,
  Send,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useNoteMedia } from '@/components/physio/NoteMedia'
import { primaryButtonClass, useIsPhone } from '@/components/physio/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { programError } from './errors'
import { EducationBrowser } from './EducationLibrary'
import { ExercisePreviewDialog } from './ExercisePreviewDialog'
import { LibraryPicker, entryPoster } from './LibraryPicker'
import { RegionChips, TemplatePickerDrawer, VisibilityChoice, templateRefs, type TemplateDetail, type TemplateVisibility } from './templates'
import {
  isLocalImage,
  itemsSummary,
  sideLabel,
  type CareTeamProgram,
  type LibraryData,
  type LibraryEntry,
  type LibraryResourceRow,
} from './types'

/** Keep in step with MAX_ITEMS in convex/exercisePrograms.ts. */
const MAX_ITEMS = 30
const MAX_GOALS = 10
const NEW_PROGRAMME = 'new'
const FREQUENCIES = ['Once a day', 'Twice a day', '3 times a day', '3 times a week', 'Every other day']

type DraftType = 'library' | 'custom' | 'education'

/** One row being built: a library exercise, the clinician's own exercise, or education. */
type Draft = {
  key: string
  type: DraftType
  entry: LibraryEntry | null
  exerciseId: Id<'exercises'> | null
  name: string
  side: 'L' | 'R' | 'both' | null
  sets: number
  reps: number
  hold: number | null
  frequency: string
  /** Instructions for an exercise, or the text of an education item. */
  note: string
  /** Education from the Rehabify Library (null for education the clinician writes). */
  resource: ResourceLabel | null
  /** Position in the programme being edited, so the patient's logs follow the item. */
  fromIndex?: number
}

/** What the dialog shows for a library resource; `missing` when it has left the library. */
type ResourceLabel = { key: string; title: string; source: string; kind: 'link' | 'youtube' | 'guide'; missing?: boolean }

/** One item as the server accepts it (itemFields in convex/exercisePrograms.ts), plus its old position when editing. */
type PayloadItem = {
  exerciseId?: Id<'exercises'>
  kind?: 'exercise' | 'education'
  name?: string
  side?: 'L' | 'R'
  sets?: number
  reps?: number
  holdSeconds?: number
  frequency?: string
  note?: string
  resourceKey?: string
  fromIndex?: number
}

let draftCounter = 0
const nextKey = () => `d${++draftCounter}`

/** Library defaults can be 0 or out of range on older exercises; the server only accepts these ranges. */
function clampInt(value: number | null | undefined, lo: number, hi: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < lo) return fallback
  return Math.min(hi, Math.round(value))
}

function blankDraft(type: DraftType): Draft {
  return { key: nextKey(), type, entry: null, exerciseId: null, name: '', side: null, sets: 3, reps: 10, hold: null, frequency: 'Once a day', note: '', resource: null }
}

function resourceDraft(row: LibraryResourceRow): Draft {
  return {
    ...blankDraft('education'),
    name: row.title.slice(0, 120),
    resource: { key: row.key, title: row.title, source: row.source, kind: row.kind },
  }
}

function draftFor(entry: LibraryEntry): Draft {
  const hold = entry.defaults.holdSeconds
  return {
    key: nextKey(),
    type: 'library',
    entry,
    exerciseId: entry._id,
    name: entry.name,
    side: entry.sided ? 'L' : null,
    sets: clampInt(entry.defaults.sets, 1, 10, 3),
    reps: clampInt(entry.defaults.reps, 1, 50, 10),
    hold: hold ? clampInt(hold, 1, 120, 5) : null,
    frequency: entry.defaults.frequency?.trim() || 'Once a day',
    note: '',
    resource: null,
  }
}

const currentUserRef = makeFunctionReference<'query', Record<string, never>, { _id: Id<'users'>; clinicId?: Id<'clinics'> } | null>('queries:getCurrentUser')

function draftsFromProgram(program: Pick<CareTeamProgram, 'items'>): Draft[] {
  return program.items.map((item) => {
    const dose = {
      sets: clampInt(item.sets, 1, 10, 3),
      reps: clampInt(item.reps, 1, 50, 10),
      hold: item.holdSeconds ? clampInt(item.holdSeconds, 1, 120, 5) : null,
      frequency: item.frequency ?? 'Once a day',
      note: item.note ?? '',
      fromIndex: item.index,
    }
    if (item.kind === 'education') {
      const resource: ResourceLabel | null = item.resource
        ? { key: item.resource.key, title: item.resource.title, source: item.resource.source, kind: item.resource.kind }
        : item.resourceKey
          ? { key: item.resourceKey, title: item.name, source: 'Rehabify Library', kind: 'guide', missing: true }
          : null
      return { ...blankDraft('education'), name: item.name, note: item.note ?? '', resource, fromIndex: item.index }
    }
    if (item.custom) return { ...blankDraft('custom'), ...dose, name: item.name }
    return {
      ...blankDraft('library'),
      ...dose,
      entry: item.exercise,
      exerciseId: item.exerciseId,
      name: item.name,
      side: item.side,
    }
  })
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number | null; onChange: (v: number | null) => void; min: number; max: number }) {
  // What is typed is kept here while the box has focus, so it can be emptied and retyped
  // ("10" → "" → "8"). Showing the saved value instead put a 1 back as soon as the box was
  // cleared, so every number typed after it started with 1.
  const [text, setText] = useState<string | null>(null)
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">{label}</span>
      <Input
        inputMode="numeric"
        className="mt-1 h-9 rounded-lg"
        value={text ?? value ?? ''}
        placeholder="—"
        onFocus={(e) => {
          setText(value === null ? '' : String(value))
          // Tapping the box selects the number, so typing replaces it
          e.target.select()
        }}
        onBlur={() => setText(null)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, '').slice(0, 3)
          if (!raw) {
            setText('')
            return onChange(null)
          }
          const typed = Number(raw)
          setText(typed > max ? String(max) : raw)
          onChange(Math.max(min, Math.min(max, typed)))
        }}
      />
    </label>
  )
}

function DoseFields({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-[5rem_5rem_6rem_1fr]">
      <NumberField label="Sets" value={draft.sets} min={1} max={10} onChange={(v) => update({ sets: v ?? 1 })} />
      <NumberField label="Reps" value={draft.reps} min={1} max={50} onChange={(v) => update({ reps: v ?? 1 })} />
      <NumberField label="Hold (s)" value={draft.hold} min={1} max={120} onChange={(v) => update({ hold: v })} />
      <label className="col-span-3 block sm:col-span-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">How often</span>
        <Input list="rh-frequencies" className="mt-1 h-9 rounded-lg" value={draft.frequency} onChange={(e) => update({ frequency: e.target.value })} />
      </label>
    </div>
  )
}

function GoalsEditor({ goals, onChange }: { goals: string[]; onChange: (goals: string[]) => void }) {
  return (
    <div className="space-y-2">
      {goals.map((goal, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            aria-label={`Goal ${index + 1}`}
            className="h-9 rounded-xl"
            value={goal}
            onChange={(e) => onChange(goals.map((g, i) => (i === index ? e.target.value : g)))}
            placeholder="e.g. Climb stairs without holding the rail"
          />
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-neutral-400 hover:text-red-600" onClick={() => onChange(goals.filter((_, i) => i !== index))} aria-label={`Remove goal ${index + 1}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {goals.length < MAX_GOALS && (
        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-rh-ink dark:text-rh-lime" onClick={() => onChange([...goals, ''])}>
          <Plus className="mr-1 h-4 w-4" /> Add a goal
        </Button>
      )}
    </div>
  )
}

const RESOURCE_KIND_LABEL = { youtube: 'Video', link: 'Web page', guide: 'Written guide' } as const

/**
 * Education from the Rehabify Library (videos, hospital leaflets and pages, Rehabify's written
 * guides), browsed page by page. Every item can be watched or read before it's added; each pick
 * becomes an education item that keeps its library key.
 */
function ResourcePickerDialog({
  open,
  onOpenChange,
  added,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  added: Set<string>
  onAdd: (row: LibraryResourceRow) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-3xl border-pt-line bg-pt-surface p-0 text-pt-ink sm:max-w-4xl">
        <DialogHeader className="border-b border-pt-line px-6 pb-4 pt-5 text-left">
          <DialogTitle>Education from the Rehabify Library</DialogTitle>
          <DialogDescription>Watch or read anything before you add it. Your patient sees it in their programme.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{open && <EducationBrowser mode="pick" added={added} onAdd={onAdd} />}</div>
        <div className="flex items-center justify-between gap-3 border-t border-pt-line px-6 py-3">
          <p className="text-sm text-pt-muted">{added.size === 0 ? 'Nothing added yet' : `${added.size} added`}</p>
          <Button className={primaryButtonClass} onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export type ProgramDialogMode = 'send' | 'new' | 'edit' | 'template'

/**
 * Builds a home programme in three steps: 1 choose exercises from the library (or add your own
 * exercise or education), 2 set the dose and instructions, 3 choose the programme (an existing one
 * or a new one), add written or voice notes, and send.
 *
 * - mode "send" (default): step 3 picks one of the patient's programmes, or creates a new one.
 * - mode "new": always creates a new programme.
 * - mode "edit": changes `program` (title, goals, notes and every item).
 * - mode "template": builds a programme template instead (no patient); `templateId` edits one.
 * Pass `program` with mode "send" to preselect it ("Add exercises" on a programme), and
 * `templateId` with mode "send" or "new" to start from a template.
 */
export function SendProgramDialog({
  patientId,
  patientName,
  open,
  onOpenChange,
  initial,
  initialResources,
  onSent,
  mode = 'send',
  program,
  templateId,
}: {
  /** Not needed when building a template */
  patientId?: Id<'users'>
  patientName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: LibraryEntry[]
  /** Education from the Rehabify Library to start with (e.g. "Send to a patient" in the Library). */
  initialResources?: LibraryResourceRow[]
  /** Called after a new programme is created (e.g. to offer a WhatsApp link). */
  onSent?: (programId: Id<'exercisePrograms'>) => void
  mode?: ProgramDialogMode
  program?: CareTeamProgram | null
  /** A template to start from (send, new) or to edit (template) */
  templateId?: Id<'programTemplates'>
}) {
  const editing = mode === 'edit' && Boolean(program)
  const templateMode = mode === 'template'
  const me = useQuery(currentUserRef, open ? {} : 'skip')
  const hasClinic = Boolean(me?.clinicId)
  const library = useQuery(api.exerciseLibrary.listLibrary, open ? {} : 'skip') as LibraryData | null | undefined
  // Clinic plans: where a new programme leaves the clinic's monthly allowance (null otherwise)
  const allowance = useQuery(api.exercisePrograms.programmeAllowanceFor, open && mode === 'send' && patientId ? { patientId } : 'skip') as
    | { allowance: number; count: number; alreadyCounted: boolean; overage: boolean; unitKobo: number }
    | null
    | undefined
  const programs = useQuery(api.exercisePrograms.listForPatient, open && mode === 'send' && patientId ? { patientId } : 'skip') as
    | CareTeamProgram[]
    | null
    | undefined
  const create = useMutation(api.exercisePrograms.createProgram)
  const addTo = useMutation(api.exercisePrograms.addExercisesToProgram)
  const update = useMutation(api.exercisePrograms.updateProgram)
  const saveTemplate = useMutation(templateRefs.save)
  const media = useNoteMedia()
  const listEndRef = useRef<HTMLDivElement>(null)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [target, setTarget] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [goals, setGoals] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [keepVoice, setKeepVoice] = useState(false)
  const [preview, setPreview] = useState<LibraryEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false)
  // Templates: the one this programme started from (credited on send), and saving as one
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [pickedTemplate, setPickedTemplate] = useState<Id<'programTemplates'> | null>(null)
  const [usedTemplate, setUsedTemplate] = useState<Id<'programTemplates'> | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<Id<'programTemplates'> | null>(null)
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [templateRegion, setTemplateRegion] = useState<string | null>(null)
  const [templateVisibility, setTemplateVisibility] = useState<TemplateVisibility>('private')
  const appliedTemplate = useRef<string | null>(null)
  const loadTemplateId = pickedTemplate ?? (open ? (templateId ?? null) : null)
  const loadedTemplate = useQuery(templateRefs.get, open && loadTemplateId ? { templateId: loadTemplateId } : 'skip')

  useEffect(() => {
    if (!open) return
    if (editing && program) {
      setDrafts(draftsFromProgram(program))
      setStep(2)
      setTitle(program.title)
      setGoals(program.goals)
      setNote(program.note ?? '')
      setKeepVoice(Boolean(program.voiceNoteUrl))
    } else {
      const starting = [...(initial ?? []).map(draftFor), ...(initialResources ?? []).map(resourceDraft)]
      setDrafts(starting)
      setStep(starting.length ? 2 : 1)
      setTitle('')
      setGoals([])
      setNote('')
      setKeepVoice(false)
    }
    setTarget(mode === 'new' ? NEW_PROGRAMME : (program?._id ?? null))
    setPickedTemplate(null)
    setUsedTemplate(null)
    setEditingTemplate(null)
    setSaveAsTemplate(false)
    setTemplateName('')
    setTemplateDescription('')
    setTemplateRegion(null)
    setTemplateVisibility('private')
    appliedTemplate.current = null
    media.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /** Loads a template into the builder: to send it, to start a new template from it, or to edit your own. */
  const applyTemplate = (t: TemplateDetail) => {
    setDrafts(draftsFromProgram(t).map(({ fromIndex: _from, ...d }) => d))
    setStep(2)
    setGoals(t.goals)
    setNote((current) => current || (t.note ?? ''))
    if (templateMode) {
      setTemplateName(t.title)
      setTemplateRegion(t.bodyRegion)
      if (t.mine) {
        setEditingTemplate(t._id)
        setTemplateDescription(t.description ?? '')
        setTemplateVisibility(t.visibility)
      }
    } else {
      setUsedTemplate(t._id)
      setTitle((current) => current || t.title)
    }
  }

  useEffect(() => {
    if (!open || !loadedTemplate || appliedTemplate.current === loadedTemplate._id) return
    appliedTemplate.current = loadedTemplate._id
    applyTemplate(loadedTemplate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadedTemplate])

  const activePrograms = useMemo(
    () => (programs ?? []).filter((p) => p.status === 'active').sort((a, b) => b.updatedAt - a.updatedAt),
    [programs]
  )
  // Until the clinician picks, new exercises go to the most recently updated programme, so they
  // don't end up in a separate programme by accident.
  const chosen = mode === 'new' ? NEW_PROGRAMME : (target ?? activePrograms[0]?._id ?? NEW_PROGRAMME)
  const existing = mode === 'send' && chosen !== NEW_PROGRAMME ? (activePrograms.find((p) => p._id === chosen) ?? program ?? null) : null
  const creating = !editing && !existing

  const itemCount = drafts.reduce((n, d) => n + (d.side === 'both' ? 2 : 1), 0)
  const selected = useMemo(() => new Set(drafts.filter((d) => d.exerciseId).map((d) => d.exerciseId as string)), [drafts])

  const toggle = (entry: LibraryEntry) =>
    setDrafts((current) => (current.some((d) => d.exerciseId === entry._id) ? current.filter((d) => d.exerciseId !== entry._id) : [...current, draftFor(entry)]))
  const patchDraft = (key: string, patch: Partial<Draft>) => setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  const move = (index: number, by: number) =>
    setDrafts((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item)
      return next
    })
  const addOwn = (type: 'custom' | 'education') => {
    setDrafts((current) => [...current, blankDraft(type)])
    setStep(2)
    setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
  }
  const addedResources = useMemo(() => new Set(drafts.flatMap((d) => (d.resource ? [d.resource.key] : []))), [drafts])
  const addResource = (row: LibraryResourceRow) => setDrafts((current) => [...current, resourceDraft(row)])
  const closeResourcePicker = (o: boolean) => {
    setResourcePickerOpen(o)
    if (!o && drafts.some((d) => d.resource)) setStep(2)
  }

  /** Checks what the server would refuse, so mistakes show here with the item named. */
  const problem = (): string | null => {
    if (drafts.length === 0) return 'Add at least one exercise or education item.'
    for (const [i, d] of drafts.entries()) {
      if (d.type === 'custom' && !d.name.trim()) return `Give item ${i + 1} an exercise name, or remove it.`
      if (d.type === 'education' && !(d.resource && !d.resource.missing) && !d.name.trim() && !d.note.trim()) return `Item ${i + 1} is empty education. Give it a title or some text, or remove it.`
      if (d.type === 'library' && d.entry?.sided && !d.side) return `Choose a side for ${d.name}.`
    }
    const total = (existing && !editing ? existing.items.length : 0) + itemCount
    if (total > MAX_ITEMS) {
      return existing
        ? `"${existing.title}" would have ${total} items; the most is ${MAX_ITEMS}. Remove some, or create a new programme.`
        : `A programme can have up to ${MAX_ITEMS} items (this one has ${total}).`
    }
    return null
  }

  const payloadItems = () =>
    drafts.flatMap((d): PayloadItem[] => {
      const fromIndex = d.fromIndex
      if (d.type === 'education') {
        // A resource that has left the library is kept as plain education (its title and note)
        const resourceKey = d.resource && !d.resource.missing ? d.resource.key : undefined
        return [{ kind: 'education' as const, name: d.name.trim() || undefined, note: d.note.trim() || undefined, resourceKey, fromIndex }]
      }
      const dose = {
        sets: d.sets,
        reps: d.reps,
        holdSeconds: d.hold ?? undefined,
        frequency: d.frequency.trim() || 'Once a day',
        note: d.note.trim() || undefined,
      }
      if (d.type === 'custom') return [{ ...dose, name: d.name.trim(), fromIndex }]
      const exercise = { ...dose, exerciseId: d.exerciseId as Id<'exercises'> }
      if (d.side === 'both') return [{ ...exercise, side: 'L' as const, fromIndex }, { ...exercise, side: 'R' as const }]
      return [{ ...exercise, side: d.side ?? undefined, fromIndex }]
    })

  const submit = async () => {
    const issue = problem()
    if (issue) {
      playSound('error')
      return toast.error(issue)
    }
    if (templateMode ? !templateName.trim() : (creating || editing) && !title.trim()) {
      playSound('error')
      return toast.error(templateMode ? 'Give the template a name, e.g. Knee OA, early loading.' : 'Give the programme a title.')
    }
    if (media.busy) return toast.error('Wait for the voice note to finish uploading.')
    const withIndex = payloadItems()
    const items = withIndex.map(({ fromIndex: _from, ...item }) => item)
    const voice = media.voiceStorageId ? { voiceNoteStorageId: media.voiceStorageId, voiceNoteSeconds: media.voice?.seconds } : {}
    const cleanGoals = goals.map((g) => g.trim()).filter(Boolean)
    // "Save as a template" after sending: a failure here never undoes the send
    const keepAsTemplate = async (fallbackTitle: string) => {
      if (!saveAsTemplate) return
      try {
        await saveTemplate({
          title: templateName.trim() || fallbackTitle,
          bodyRegion: templateRegion ?? undefined,
          goals: cleanGoals,
          note: note.trim() || undefined,
          items,
          visibility: templateVisibility,
        })
        toast.success('Saved as a template', { description: 'Find it in Library › Templates.' })
      } catch (error) {
        toast.error(programError(error, 'The programme went out, but the template didn’t save.'))
      }
    }
    setSaving(true)
    try {
      if (templateMode) {
        await saveTemplate({
          templateId: editingTemplate ?? undefined,
          title: templateName.trim(),
          description: templateDescription.trim() || undefined,
          bodyRegion: templateRegion ?? undefined,
          goals: cleanGoals,
          note: note.trim() || undefined,
          items,
          visibility: templateVisibility,
        })
        playSound('success')
        toast.success(editingTemplate ? 'Template saved' : 'Template created', {
          description: templateVisibility === 'public' ? 'Every physio can use it now, with credit to you.' : undefined,
        })
        onOpenChange(false)
        return
      }
      if (editing && program) {
        await update({
          programId: program._id,
          title: title.trim(),
          note: note.trim(),
          goals: goals.map((g) => g.trim()).filter(Boolean),
          items: withIndex,
          ...voice,
          removeVoiceNote: !media.voiceStorageId && !keepVoice && Boolean(program.voiceNoteUrl) ? true : undefined,
        })
        playSound('success')
        toast.success('Programme saved', { description: `${patientName} sees the changes in their app now.` })
        onOpenChange(false)
      } else if (existing) {
        await addTo({ programId: existing._id, items, note: note.trim() || undefined, templateId: usedTemplate ?? undefined, ...voice })
        playSound('send')
        toast.success(`Added to “${existing.title}”`, { description: `${patientName} can see the new ${itemsSummary(items)} in their app now.` })
        await keepAsTemplate(existing.title)
        onOpenChange(false)
      } else {
        if (!patientId) throw new Error('no patient')
        const programId = await create({
          patientId,
          templateId: usedTemplate ?? undefined,
          title: title.trim(),
          note: note.trim() || undefined,
          goals: goals.map((g) => g.trim()).filter(Boolean),
          items,
          ...voice,
        })
        playSound('send')
        toast.success('Programme sent', { description: `${patientName} can see it in their app now.` })
        await keepAsTemplate(title.trim())
        onOpenChange(false)
        onSent?.(programId)
      }
    } catch (error) {
      playSound('error')
      toast.error(programError(error, editing ? 'Couldn’t save the programme. Please try again.' : 'Couldn’t send the programme. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const isPhone = useIsPhone()
  const steps = ['Choose exercises', 'Set the dose', templateMode ? 'Name & sharing' : editing ? 'Programme details' : 'Programme & notes']
  const heading = templateMode
    ? editingTemplate
      ? `Edit template “${templateName || '…'}”`
      : 'New programme template'
    : editing
      ? `Edit “${program?.title}”`
      : mode === 'new'
        ? `New home programme for ${patientName}`
        : `Send exercises to ${patientName}`
  const submitLabel = templateMode ? (editingTemplate ? 'Save template' : 'Create template') : editing ? 'Save changes' : existing ? `Add to “${existing.title}”` : `Send to ${patientName}`

  return (
    <>
      {/* A wide drawer: from the right on a computer, from the bottom on a phone */}
      <Sheet open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
        <SheetContent
          side={isPhone ? 'bottom' : 'right'}
          className={cn(
            'flex flex-col gap-0 overflow-hidden border-pt-line bg-pt-surface p-0 text-pt-ink [&>button:last-child]:right-4 [&>button:last-child]:top-4 [&>button:last-child]:rounded-full [&>button:last-child]:p-1.5 [&>button:last-child]:hover:bg-pt-hover',
            isPhone ? 'max-h-[94dvh] rounded-t-3xl' : 'h-full w-full sm:max-w-4xl'
          )}
        >
          {isPhone && <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-pt-line-strong" aria-hidden />}
          <SheetHeader className="gap-1 border-b border-pt-line px-6 pb-4 pt-5 text-left">
            <SheetTitle className="pr-8 text-[17px] font-semibold tracking-tight text-pt-ink">{heading}</SheetTitle>
            <SheetDescription className="text-sm text-pt-muted">
              {templateMode
                ? 'Build it once, name it, and use it for any patient with one tap. Share it with every physio to earn points when they use it.'
                : `Exercises from the library come with a 3D demonstration. Add your own exercises or education too; everything shows in ${patientName}'s app.`}
            </SheetDescription>
            <ol className="mt-3 flex flex-wrap gap-2 text-xs">
              {steps.map((label, i) => (
                <li key={label}>
                  <button
                    type="button"
                    disabled={saving || (i + 1 > step && drafts.length === 0)}
                    onClick={() => setStep((i + 1) as 1 | 2 | 3)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition disabled:cursor-not-allowed',
                      step === i + 1
                        ? 'bg-rh-lime text-rh-ink dark:bg-rh-lime dark:text-rh-ink'
                        : step > i + 1
                          ? 'bg-rh-honeydew text-[#047857] dark:bg-emerald-400/10 dark:text-emerald-300'
                          : 'bg-rh-canvas text-neutral-500 dark:bg-white/[0.05] dark:text-neutral-400'
                    )}
                  >
                    <span className="tabular-nums">{i + 1}</span> {label}
                  </button>
                </li>
              ))}
            </ol>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-rh-canvas px-4 py-3 text-sm dark:bg-white/[0.03]">
                  <Button type="button" size="sm" className={cn(primaryButtonClass, 'h-8 rounded-full')} onClick={() => setTemplatePickerOpen(true)}>
                    <Layers className="mr-1.5 h-3.5 w-3.5" /> Start from a template
                  </Button>
                  <span className="text-neutral-600 dark:text-neutral-300">Not in the library?</span>
                  <Button type="button" size="sm" variant="outline" className="h-8 rounded-full" onClick={() => addOwn('custom')}>
                    <Dumbbell className="mr-1.5 h-3.5 w-3.5 text-rh-ink dark:text-rh-lime" /> Add your own exercise
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 rounded-full" onClick={() => addOwn('education')}>
                    <BookOpen className="mr-1.5 h-3.5 w-3.5 text-pt-violet-fg" /> Add education
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setResourcePickerOpen(true)}>
                    <Library className="mr-1.5 h-3.5 w-3.5 text-pt-violet-fg" /> Education from the Rehabify Library
                  </Button>
                </div>
                {library === undefined ? (
                  <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-rh-ink" /></div>
                ) : !library ? (
                  <p className="py-10 text-center text-sm text-neutral-500">The exercise library isn&apos;t available to your account. You can still add your own exercises and education.</p>
                ) : (
                  <LibraryPicker items={library.items} selected={selected} onToggle={toggle} onPreview={setPreview} />
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                {drafts.length === 0 && (
                  <p className="rounded-2xl bg-rh-canvas p-6 text-center text-sm text-neutral-500 dark:bg-white/[0.03]">Nothing added yet. Pick exercises from the library, or add your own below.</p>
                )}
                <ul className="space-y-3">
                  {drafts.map((d, index) => {
                    const poster = d.entry ? entryPoster(d.entry) : null
                    return (
                      <li key={d.key} className="rounded-2xl border border-black/[0.06] bg-white p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                        <div className="flex gap-3">
                          <div
                            className={cn(
                              'relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl sm:h-20 sm:w-20',
                              d.type === 'education' ? 'bg-pt-violet-bg' : 'bg-rh-honeydew dark:bg-white/[0.05]'
                            )}
                          >
                            {poster ? (
                              <Image src={poster} alt="" fill sizes="80px" unoptimized={!isLocalImage(poster)} className="object-contain" draggable={false} />
                            ) : d.type === 'education' ? (
                              <BookOpen className="h-6 w-6 text-pt-violet-fg" />
                            ) : (
                              <Dumbbell className="h-6 w-6 text-rh-ink/60 dark:text-rh-lime/60" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                                  {d.type === 'library'
                                    ? 'Library exercise'
                                    : d.type === 'custom'
                                      ? 'Your own exercise'
                                      : d.resource && !d.resource.missing
                                        ? `Education · ${RESOURCE_KIND_LABEL[d.resource.kind]} from ${d.resource.source}`
                                        : 'Education'}
                                </p>
                                {d.type === 'library' ? (
                                  <p className="font-semibold text-rh-ink dark:text-white">{d.name}</p>
                                ) : (
                                  <Input
                                    aria-label={d.type === 'custom' ? 'Exercise name' : 'Education title'}
                                    className="mt-1 h-9 rounded-lg"
                                    value={d.name}
                                    onChange={(e) => patchDraft(d.key, { name: e.target.value })}
                                    placeholder={d.type === 'custom' ? 'Exercise name, e.g. Wall push-up' : 'Title, e.g. Pacing your activity'}
                                  />
                                )}
                              </div>
                              <div className="flex shrink-0 items-center">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(index, 1)} disabled={index === drafts.length - 1} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-400 hover:text-red-600" onClick={() => setDrafts((c) => c.filter((x) => x.key !== d.key))} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </div>

                            {d.type === 'library' && !d.entry && (
                              <p className="flex items-center gap-1.5 rounded-xl bg-rh-blush px-3 py-2 text-xs text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
                                <TriangleAlert className="h-3.5 w-3.5" /> This exercise is no longer in the library. Remove it, or replace it with another.
                              </p>
                            )}
                            {d.type === 'library' && d.entry?.sided && (
                              <div className="flex flex-wrap gap-1.5">
                                {(['L', 'R', 'both'] as const).map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => patchDraft(d.key, { side: s })}
                                    className={cn(
                                      'rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95',
                                      d.side === s ? 'border-rh-lime bg-rh-lime text-rh-ink dark:border-rh-lime dark:bg-rh-lime dark:text-rh-ink' : 'border-black/[0.08] hover:bg-rh-honeydew dark:border-white/10 dark:hover:bg-white/[0.05]'
                                    )}
                                  >
                                    {s === 'both' ? 'Both sides' : sideLabel(d.entry?.animation?.slug, s)}
                                  </button>
                                ))}
                              </div>
                            )}

                            {d.resource?.missing && (
                              <p className="flex items-center gap-1.5 rounded-xl bg-rh-blush px-3 py-2 text-xs text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
                                <TriangleAlert className="h-3.5 w-3.5" /> This resource is no longer in the Rehabify Library. It stays as its title and your note.
                              </p>
                            )}
                            {d.type === 'education' ? (
                              <Textarea
                                aria-label={d.resource ? 'Note for the patient' : 'Education text'}
                                rows={d.resource ? 2 : 4}
                                className="resize-y rounded-lg"
                                value={d.note}
                                onChange={(e) => patchDraft(d.key, { note: e.target.value })}
                                placeholder={
                                  d.resource
                                    ? 'A note to go with it (optional), e.g. Read this before our next session'
                                    : 'What you want them to know, e.g. how to pace activity, posture tips, when to rest or call you'
                                }
                              />
                            ) : (
                              <>
                                <DoseFields draft={d} update={(patch) => patchDraft(d.key, patch)} />
                                {d.type === 'custom' ? (
                                  <Textarea
                                    aria-label="Instructions"
                                    rows={2}
                                    className="resize-y rounded-lg"
                                    value={d.note}
                                    onChange={(e) => patchDraft(d.key, { note: e.target.value })}
                                    placeholder="How to do it, step by step, and what to avoid"
                                  />
                                ) : (
                                  <Input className="h-9 rounded-lg" value={d.note} onChange={(e) => patchDraft(d.key, { note: e.target.value })} placeholder="Instructions for this exercise (optional), e.g. Only bend to where it's comfortable" />
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <div ref={listEndRef} className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setStep(1)}>
                    <Library className="mr-1.5 h-3.5 w-3.5 text-rh-ink dark:text-rh-lime" /> Add from the library
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 rounded-full" onClick={() => addOwn('custom')}>
                    <Dumbbell className="mr-1.5 h-3.5 w-3.5 text-rh-ink dark:text-rh-lime" /> Add your own exercise
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 rounded-full" onClick={() => addOwn('education')}>
                    <BookOpen className="mr-1.5 h-3.5 w-3.5 text-pt-violet-fg" /> Add education
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setResourcePickerOpen(true)}>
                    <Library className="mr-1.5 h-3.5 w-3.5 text-pt-violet-fg" /> Education from the Rehabify Library
                  </Button>
                </div>
                <datalist id="rh-frequencies">{FREQUENCIES.map((f) => <option key={f} value={f} />)}</datalist>
              </div>
            )}

            {step === 3 && (
              <div className="mx-auto max-w-2xl space-y-5">
                {mode === 'send' && (
                  <div>
                    <Label htmlFor="hep-programme">Programme</Label>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Add these to one of {patientName}&apos;s programmes, or start a new one.</p>
                    {programs === undefined ? (
                      <div className="mt-2 flex items-center gap-2 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading programmes…</div>
                    ) : (
                      <Select value={chosen} onValueChange={setTarget}>
                        <SelectTrigger id="hep-programme" className="mt-1.5 h-10 w-full rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {activePrograms.map((p) => (
                            <SelectItem key={p._id} value={p._id}>
                              {p.title} · {itemsSummary(p.items)}
                            </SelectItem>
                          ))}
                          <SelectItem value={NEW_PROGRAMME}>
                            <span className="inline-flex items-center gap-1.5 font-medium text-rh-ink dark:text-rh-lime"><Plus className="h-3.5 w-3.5" /> Create a new programme</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {existing && (
                      <p className="mt-2 rounded-xl bg-rh-honeydew px-3 py-2 text-xs text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime">
                        {itemCount} item{itemCount === 1 ? '' : 's'} will be added to the end of “{existing.title}”, which has {existing.items.length} now.
                      </p>
                    )}
                  </div>
                )}

                {templateMode && (
                  <>
                    <div>
                      <Label htmlFor="tpl-name">Template name</Label>
                      <Input id="tpl-name" className="mt-1.5 rounded-xl" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Knee OA, early loading" />
                    </div>
                    <div>
                      <Label htmlFor="tpl-desc">When to use it (optional)</Label>
                      <Textarea id="tpl-desc" className="mt-1.5 resize-none rounded-xl" rows={2} value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} placeholder="e.g. Weeks 1–3 after diagnosis, pain under 5/10" />
                    </div>
                    <div>
                      <Label>Body area</Label>
                      <div className="mt-2">
                        <RegionChips value={templateRegion} onChange={setTemplateRegion} />
                      </div>
                    </div>
                    <div>
                      <Label>Who can use it</Label>
                      <div className="mt-2">
                        <VisibilityChoice value={templateVisibility} onChange={setTemplateVisibility} hasClinic={hasClinic} />
                      </div>
                    </div>
                  </>
                )}

                {(creating || editing) && !(mode === 'send' && programs === undefined) && (
                  <>
                    {!templateMode && (
                      <div>
                        <Label htmlFor="hep-title">Programme title</Label>
                        <Input id="hep-title" className="mt-1.5 rounded-xl" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Knee strength, weeks 1–2" />
                      </div>
                    )}
                    <div>
                      <Label>Goals (optional)</Label>
                      <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">Shown at the top of the programme in {patientName}&apos;s app.</p>
                      <GoalsEditor goals={goals} onChange={setGoals} />
                    </div>
                  </>
                )}

                <div>
                  <Label htmlFor="hep-note">{existing ? 'Add a note (optional)' : `Note to ${patientName} (optional)`}</Label>
                  {existing && <p className="text-xs text-neutral-500 dark:text-neutral-400">It&apos;s added below the programme&apos;s current note, with today&apos;s date.</p>}
                  <Textarea id="hep-note" className="mt-1.5 resize-none rounded-xl" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="How to fit these into the day, what to expect, when to stop…" />
                </div>

                {!templateMode && (
                <div>
                  <Label>Voice note (optional)</Label>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Talk them through it. Up to 10 minutes; it plays at the top of their programme.
                    {(existing?.voiceNoteUrl || (editing && keepVoice)) && ' A new recording replaces the current one.'}
                  </p>
                  {editing && keepVoice && program?.voiceNoteUrl && !media.voice && (
                    <div className="mt-2 flex items-center gap-2 rounded-2xl bg-rh-honeydew p-2 pl-3 dark:bg-white/[0.05]">
                      <Mic className="h-4 w-4 shrink-0 text-rh-ink dark:text-rh-lime" />
                      <audio controls preload="none" src={program.voiceNoteUrl} className="h-9 min-w-0 flex-1" />
                      <Button type="button" variant="ghost" size="icon" onClick={() => setKeepVoice(false)} aria-label="Remove the current voice note"><X className="h-4 w-4" /></Button>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {media.recording ? (
                      <Button type="button" variant="outline" onClick={media.stopRecording} className="rounded-full border-rose-300 bg-rh-blush text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                        <span className="mr-2 h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
                        Stop · {Math.floor(media.elapsed / 60)}:{String(media.elapsed % 60).padStart(2, '0')}
                        <Square className="ml-2 h-3.5 w-3.5 fill-current" />
                      </Button>
                    ) : !media.voice ? (
                      <Button type="button" variant="outline" onClick={() => void media.startRecording()} disabled={!media.canRecord || media.uploading} className="rounded-full">
                        <Mic className="mr-2 h-4 w-4 text-rh-ink dark:text-rh-lime" /> {editing && keepVoice ? 'Record a new voice note' : 'Record a voice note'}
                      </Button>
                    ) : null}
                    {media.uploading && <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</span>}
                  </div>
                  {media.voice && (
                    <div className="mt-2 flex items-center gap-2 rounded-2xl bg-rh-honeydew p-2 pl-3 dark:bg-white/[0.05]">
                      <Mic className="h-4 w-4 shrink-0 text-rh-ink dark:text-rh-lime" />
                      <audio controls src={media.voice.previewUrl} className="h-9 min-w-0 flex-1" />
                      <Button type="button" variant="ghost" size="icon" onClick={media.removeVoice} aria-label="Remove voice note"><X className="h-4 w-4" /></Button>
                    </div>
                  )}
                </div>
                )}

                {!templateMode && !editing && (
                  <div className="rounded-2xl border border-pt-line p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-[#16181c]" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} />
                      <span>
                        <span className="block text-sm font-semibold text-pt-ink">Also save as a template</span>
                        <span className="block text-xs text-pt-muted">Reuse it for the next patient with the same problem in one tap.</span>
                      </span>
                    </label>
                    {saveAsTemplate && (
                      <div className="mt-4 space-y-4">
                        <Input className="rounded-xl" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder={title.trim() || existing?.title || 'Template name, e.g. Knee OA, early loading'} aria-label="Template name" />
                        <RegionChips value={templateRegion} onChange={setTemplateRegion} />
                        <VisibilityChoice value={templateVisibility} onChange={setTemplateVisibility} hasClinic={hasClinic} />
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-2xl bg-rh-canvas p-4 text-sm dark:bg-white/[0.03]">
                  <p className="font-medium text-rh-ink dark:text-white">
                    {itemsSummary(drafts.flatMap((d) => (d.side === 'both' ? [d, d] : [d])).map((d) => ({ kind: d.type === 'education' ? 'education' : 'exercise' })))}
                  </p>
                  <p className="mt-0.5 text-neutral-500">{drafts.map((d) => d.name.trim() || (d.type === 'education' ? 'Education' : 'Exercise')).join(' · ')}</p>
                </div>

                {creating && allowance && !allowance.alreadyCounted && allowance.count * 5 >= allowance.allowance * 4 && (
                  <p className={cn('rounded-xl px-3 py-2.5 text-xs leading-relaxed', allowance.overage ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-muted')}>
                    {allowance.overage
                      ? `This is patient programme ${allowance.count} of ${allowance.allowance} on your clinic's plan this month. ₦${(allowance.unitKobo / 100).toLocaleString('en-NG')} is added to the clinic's next invoice.`
                      : `Patient programme ${allowance.count} of ${allowance.allowance} on your clinic's plan this month. Past ${allowance.allowance}, each new patient programme is ₦${(allowance.unitKobo / 100).toLocaleString('en-NG')} extra.`}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-pt-line px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
            <div className="text-sm text-neutral-500">{drafts.length > 0 && step === 1 && `${drafts.length} selected`}</div>
            <div className="flex gap-2">
              {step > 1 && (
                <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as 1 | 2)} disabled={saving}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
                </Button>
              )}
              {step < 3 ? (
                <Button className={primaryButtonClass} disabled={drafts.length === 0} onClick={() => setStep((s) => (s + 1) as 2 | 3)}>
                  Next <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button className={cn(primaryButtonClass, 'max-w-[18rem]')} onClick={submit} disabled={saving || drafts.length === 0 || (mode === 'send' && programs === undefined)}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editing ? <Save className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
                  <span className="truncate">{submitLabel}</span>
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <ExercisePreviewDialog entry={preview} onOpenChange={(o) => !o && setPreview(null)} />
      <ResourcePickerDialog open={resourcePickerOpen} onOpenChange={closeResourcePicker} added={addedResources} onAdd={addResource} />
      <TemplatePickerDrawer
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        hasClinic={hasClinic}
        onPick={(id) => {
          setTemplatePickerOpen(false)
          appliedTemplate.current = null
          setPickedTemplate(id)
        }}
      />
    </>
  )
}
