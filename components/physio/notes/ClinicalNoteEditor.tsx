'use client'

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react'
import { Layers, Plus, Repeat, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { InfoTip, fieldClass, secondaryButtonClass } from '@/components/physio/ui'
import { measureRegion, regionFromText, type ClinicalMeasure, type Region } from '@/convex/helpers/clinicalMeasures'
import { cn } from '@/lib/utils'
import { ChipButton, NoteSection, Pills } from './bits'
import { LastVisit } from './LastVisit'
import { MeasureComposer, type ComposerKind } from './MeasureComposer'
import { KIND_ICONS, MeasureList } from './MeasureList'
import { QuickSetPanel, RetestPanel } from './RetestPanel'
import { orderedSets, type QuickSet } from './quickSets'
import { SymmetryList, sideFromText, sidePairs } from './Symmetry'
import {
  NOTE_TYPES,
  lastMeasuredNote,
  mergeMeasures,
  previousBySeries,
  type ClinicalNote,
  type NoteDraft,
  type NoteType,
  type PendingHandle,
  type PendingResult,
} from './progress'

type SectionId = 'S' | 'O' | 'A' | 'T' | 'P'

/** What each type of note opens with; the others are one tap away. */
const SECTIONS_FOR: Record<NoteType, SectionId[]> = {
  initial_assessment: ['S', 'O', 'A', 'P'],
  treatment_note: ['S', 'O', 'T', 'P'],
  follow_up: ['S', 'P'],
}

const SECTION_NAMES: Record<SectionId, string> = {
  S: 'Subjective',
  O: 'Objective',
  A: 'Assessment',
  T: 'Treatment given',
  P: 'Plan',
}

const SUBJECTIVE_PLACEHOLDERS: Record<NoteType, string> = {
  initial_assessment: 'What the patient tells you: the problem, how it started, what makes it worse or better, their goals…',
  treatment_note: 'Since the last visit: how they’ve been, pain, exercises, anything new…',
  follow_up: 'What the patient reported…',
}

/** One tap adds the heading as a new line, so the history is quick to write and easy to read. */
const SUBJECTIVE_PROMPTS = [
  'Main complaint',
  'How it started',
  'Aggravating',
  'Easing',
  '24-hour pattern',
  'Red flags',
  'Medical history',
  'Medication',
  'Work & activity',
  'Patient’s goals',
]

const PLAN_PROMPTS: { label: string; text: string }[] = [
  { label: 'Education given', text: 'Education: ' },
  { label: 'Home exercises', text: 'Home exercises: ' },
  { label: 'Review in 1 week', text: 'Review in 1 week.' },
  { label: 'Review in 2 weeks', text: 'Review in 2 weeks.' },
  { label: 'Refer on', text: 'Refer to: ' },
]

const TILES: { kind: ComposerKind; label: string }[] = [
  { kind: 'rom', label: 'Range of motion' },
  { kind: 'strength', label: 'Strength' },
  { kind: 'functional', label: 'Functional test' },
  { kind: 'pain', label: 'Pain score' },
  { kind: 'outcome', label: 'Outcome measure' },
  { kind: 'special_test', label: 'Special test' },
]

type Composer = { kind: ComposerKind; editing: ClinicalMeasure | null; n: number }

/** The panel under the measure tiles: repeat earlier measures, pick a quick set, or fill one in. */
type FillPanel = { type: 'retest' } | { type: 'sets' } | { type: 'set'; set: QuickSet }

/** Entries from the open measure form and panel, together (any problem stops the lot). */
function combinePending(handles: (PendingHandle | null)[], quiet?: boolean): PendingResult {
  const none: PendingResult = { kind: 'none' }
  const results = handles.map((handle) => (handle ? handle.collect(quiet) : none))
  const invalid = results.find((result) => result.kind === 'invalid')
  if (invalid) return invalid
  const measures = results.flatMap((result) => (result.kind === 'ok' ? result.measures : []))
  return measures.length ? { kind: 'ok', measures } : { kind: 'none' }
}

/**
 * The clinical note: SOAP, laid out for the type of note. Objective is measured, not typed:
 * range of motion, strength, functional tests, pain, outcome measures and special tests, each
 * compared with last time. Subjective, Assessment and Plan stay free text, with one-tap prompts.
 */
export function ClinicalNoteEditor({
  draft,
  onChange,
  notes,
  measuredNotes,
  sessionDate,
  editingNoteId,
  condition,
  typeEditable,
  checkIn,
  media,
  pendingRef,
}: {
  draft: NoteDraft
  onChange: (draft: NoteDraft) => void
  /** The patient's recent notes (the care team's), newest first, for the last visit */
  notes: ClinicalNote[] | undefined
  /**
   * Every measured note on the record, newest first (getClinicalNoteMeasures), for "last time",
   * re-testing and quick sets. Falls back to `notes` while it loads.
   */
  measuredNotes?: ClinicalNote[]
  /** When this note is (or was) written; measures compare with notes before it */
  sessionDate: number
  editingNoteId?: string
  /** The care episode's condition, to start on the right body area */
  condition?: string
  typeEditable: boolean
  checkIn?: { painScore: number; createdAt: number } | null
  /** Voice note and files (or a line about them when editing) */
  media?: ReactNode
  /** Measures entered in an open form or panel but not yet added, for saving the note */
  pendingRef?: Ref<PendingHandle>
}) {
  const set = (patch: Partial<NoteDraft>) => onChange({ ...draft, ...patch })
  const subjectiveRef = useRef<HTMLTextAreaElement>(null)
  const planRef = useRef<HTMLTextAreaElement>(null)
  const composerPending = useRef<PendingHandle | null>(null)
  const panelPending = useRef<PendingHandle | null>(null)
  useImperativeHandle(pendingRef, () => ({
    collect: (quiet?: boolean) => combinePending([composerPending.current, panelPending.current], quiet),
    started: () => Boolean(composerPending.current?.started() || panelPending.current?.started()),
  }))

  // Measures from the whole record, older than the recent notes too
  const history = measuredNotes ?? notes
  const previous = useMemo(() => previousBySeries(history, sessionDate, editingNoteId), [history, sessionDate, editingNoteId])
  const lastNote = useMemo(
    () => (notes ?? []).find((n) => n._id !== editingNoteId && n.sessionDate < sessionDate) ?? null,
    [notes, sessionDate, editingNoteId]
  )
  const lastMeasured = useMemo(() => lastMeasuredNote(history, sessionDate, editingNoteId), [history, sessionDate, editingNoteId])
  const lastPsfs = useMemo(() => {
    for (const note of history ?? []) {
      if (note._id === editingNoteId || note.sessionDate >= sessionDate) continue
      const psfs = note.measures.find((m) => m.kind === 'psfs')
      if (psfs) return psfs
    }
    return null
  }, [history, sessionDate, editingNoteId])

  // Start on the area last measured, or the one the condition names ("Right knee OA" is the knee)
  const [region, setRegion] = useState<Region | null>(() => {
    const measured = [...draft.measures, ...(lastMeasured?.measures ?? [])].map(measureRegion).find(Boolean)
    return measured ?? regionFromText(condition)
  })
  // Earlier notes can arrive after the drawer opens
  useEffect(() => {
    if (region !== null) return
    const measured = lastMeasured?.measures.map(measureRegion).find(Boolean)
    if (measured) setRegion(measured)
  }, [lastMeasured, region])
  const [composer, setComposer] = useState<Composer | null>(null)
  const [panel, setPanel] = useState<FillPanel | null>(null)
  const [opened, setOpened] = useState<Set<SectionId>>(new Set())
  const pairs = useMemo(() => sidePairs(draft.measures), [draft.measures])

  // Opening one leaves the other open only if something has been typed in it
  const openPanel = (next: FillPanel) => {
    if (!composerPending.current?.started()) setComposer(null)
    setPanel(next)
  }

  const sectionText: Record<SectionId, string> = {
    S: draft.subjective,
    O: draft.objective,
    A: draft.assessment,
    T: draft.treatment,
    P: draft.plan,
  }
  // A section with something in it never disappears when the type changes
  const visible = (id: SectionId) =>
    SECTIONS_FOR[draft.noteType].includes(id) || opened.has(id) || Boolean(sectionText[id].trim()) || (id === 'O' && draft.measures.length > 0)
  const hidden = (['O', 'A', 'T'] as SectionId[]).filter((id) => !visible(id))

  const insertLine = (field: 'subjective' | 'plan', text: string, ref: RefObject<HTMLTextAreaElement | null>) => {
    const current = draft[field]
    const next = current && !current.endsWith('\n') ? `${current}\n${text}` : `${current}${text}`
    set({ [field]: next })
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(next.length, next.length)
    })
  }

  const openComposer = (kind: ComposerKind, editing: ClinicalMeasure | null = null) => {
    if (!panelPending.current?.started()) setPanel(null)
    // Editing a measure from another area shows that area's options
    const editingRegion = editing ? measureRegion(editing) : null
    if (editingRegion) setRegion(editingRegion)
    setComposer((c) => ({ kind, editing, n: (c?.n ?? 0) + 1 }))
  }

  const saveMeasure = (measure: ClinicalMeasure, addAnother: boolean) => {
    const exists = draft.measures.some((m) => m.id === measure.id)
    set({ measures: exists ? draft.measures.map((m) => (m.id === measure.id ? measure : m)) : [...draft.measures, measure] })
    if (!addAnother) setComposer(null)
  }

  const lastSide = [...draft.measures].reverse().find((m) => m.side)?.side

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_17.5rem] xl:items-start xl:gap-6">
      <div className="space-y-5">
        <div className="xl:hidden">
          <LastVisit note={lastNote} checkIn={checkIn} variant="fold" />
        </div>

        {typeEditable && (
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-sm font-medium text-pt-ink">
              Type of note
              <InfoTip>
                Initial assessment opens the full SOAP with prompts. Treatment is shorter and can repeat last visit’s measures. Follow-up is for a call or a quick check. Any part can still be added.
              </InfoTip>
            </p>
            <Pills options={NOTE_TYPES} value={draft.noteType} onChange={(noteType) => noteType && set({ noteType })} label="Type of note" />
          </div>
        )}

        {/* Boxed on larger screens; on phones the sections sit straight in the sheet (no box in a box) */}
        <div className="space-y-5 sm:rounded-2xl sm:border sm:border-pt-line sm:p-5">
          <NoteSection letter="S" title="Subjective">
            <Textarea
              ref={subjectiveRef}
              aria-label="Subjective"
              className={cn(fieldClass, 'min-h-[5.5rem] resize-y')}
              rows={draft.noteType === 'initial_assessment' ? 5 : 3}
              value={draft.subjective}
              onChange={(e) => set({ subjective: e.target.value })}
              placeholder={SUBJECTIVE_PLACEHOLDERS[draft.noteType]}
            />
            {draft.noteType === 'initial_assessment' && (
              <div className="flex flex-wrap gap-1.5" aria-label="Add a heading">
                {SUBJECTIVE_PROMPTS.map((prompt) => (
                  <ChipButton key={prompt} onClick={() => insertLine('subjective', `${prompt}: `, subjectiveRef)}>
                    <Plus className="h-2.5 w-2.5" />
                    {prompt}
                  </ChipButton>
                ))}
              </div>
            )}
          </NoteSection>

          {visible('O') && (
            <NoteSection
              letter="O"
              title="Objective"
              hint="Tap what you measured. Each one is compared with last time and charted on the patient’s progress."
              actions={
                <>
                  {panel?.type !== 'sets' && panel?.type !== 'set' && (
                    <Button
                      type="button"
                      size="sm"
                      className={cn(secondaryButtonClass, 'h-9 gap-1.5 px-2.5 text-xs sm:h-8')}
                      onClick={() => openPanel({ type: 'sets' })}
                    >
                      <Layers className="h-3 w-3" />
                      Quick set
                    </Button>
                  )}
                  {lastMeasured && panel?.type !== 'retest' && (
                    <Button
                      type="button"
                      size="sm"
                      className={cn(secondaryButtonClass, 'h-9 gap-1.5 px-2.5 text-xs sm:h-8')}
                      onClick={() => openPanel({ type: 'retest' })}
                    >
                      <Repeat className="h-3 w-3" />
                      Repeat last measures
                    </Button>
                  )}
                </>
              }
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TILES.map((tile) => {
                  const Icon = KIND_ICONS[tile.kind]
                  const active = composer?.kind === tile.kind && !composer.editing
                  return (
                    <button
                      key={tile.kind}
                      type="button"
                      onClick={() => (active ? setComposer(null) : openComposer(tile.kind))}
                      aria-pressed={active}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition active:scale-[0.98]',
                        active ? 'border-pt-primary bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong text-pt-ink hover:bg-pt-hover'
                      )}
                    >
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-pt-on-primary' : 'text-pt-muted')} />
                      {tile.label}
                    </button>
                  )
                })}
              </div>

              {panel?.type === 'retest' && (
                <RetestPanel
                  notes={history}
                  before={sessionDate}
                  skipNoteId={editingNoteId}
                  pendingRef={panelPending}
                  onCancel={() => setPanel(null)}
                  onAdd={(measures) => {
                    set({ measures: mergeMeasures(draft.measures, measures) })
                    setPanel(null)
                  }}
                />
              )}

              {panel?.type === 'sets' && (
                <QuickSetPicker region={region} condition={condition} onPick={(picked) => setPanel({ type: 'set', set: picked })} onCancel={() => setPanel(null)} />
              )}

              {panel?.type === 'set' && (
                <QuickSetPanel
                  key={panel.set.key}
                  set={panel.set}
                  previous={previous}
                  pendingRef={panelPending}
                  onChangeSet={() => setPanel({ type: 'sets' })}
                  onCancel={() => setPanel(null)}
                  onAdd={(measures) => {
                    set({ measures: mergeMeasures(draft.measures, measures) })
                    setPanel(null)
                  }}
                />
              )}

              {composer && (
                <MeasureComposer
                  key={composer.n}
                  kind={composer.kind}
                  region={region}
                  onRegion={setRegion}
                  initial={composer.editing}
                  previous={previous}
                  lastPsfs={lastPsfs}
                  lastSide={lastSide}
                  onSave={saveMeasure}
                  onCancel={() => setComposer(null)}
                  pendingRef={composerPending}
                />
              )}

              <MeasureList
                measures={draft.measures}
                previous={previous}
                editingId={composer?.editing?.id}
                onEdit={(measure) => openComposer(composerKindOf(measure), measure)}
                onRemove={(id) => {
                  set({ measures: draft.measures.filter((m) => m.id !== id) })
                  if (composer?.editing?.id === id) setComposer(null)
                }}
              />

              {pairs.length > 0 && <SymmetryList items={pairs.map((pair) => ({ pair }))} defaultInvolved={sideFromText(condition)} />}

              <Textarea
                aria-label="Other findings"
                className={cn(fieldClass, 'resize-y')}
                rows={2}
                value={draft.objective}
                onChange={(e) => set({ objective: e.target.value })}
                placeholder="Other findings: observation, posture, gait, palpation…"
              />
            </NoteSection>
          )}

          {visible('A') && (
            <NoteSection letter="A" title="Assessment" hint="Only your care team sees this, not the patient.">
              <Textarea
                aria-label="Assessment"
                className={cn(fieldClass, 'resize-y')}
                rows={3}
                value={draft.assessment}
                onChange={(e) => set({ assessment: e.target.value })}
                placeholder="Clinical impression and working diagnosis, e.g. mechanical low back pain"
              />
            </NoteSection>
          )}

          {visible('T') && (
            <NoteSection letter="T" title="Treatment given">
              <Textarea
                aria-label="Treatment given"
                className={cn(fieldClass, 'resize-y')}
                rows={3}
                value={draft.treatment}
                onChange={(e) => set({ treatment: e.target.value })}
                placeholder="What you did today: manual therapy, exercise, taping, education…"
              />
            </NoteSection>
          )}

          <NoteSection letter="P" title="Plan">
            <Textarea
              ref={planRef}
              aria-label="Plan"
              className={cn(fieldClass, 'resize-y')}
              rows={3}
              value={draft.plan}
              onChange={(e) => set({ plan: e.target.value })}
              placeholder="Goals, home exercises, advice and when to review"
            />
            <div className="flex flex-wrap gap-1.5" aria-label="Add to the plan">
              {PLAN_PROMPTS.map((prompt) => (
                <ChipButton key={prompt.label} onClick={() => insertLine('plan', prompt.text, planRef)}>
                  <Plus className="h-2.5 w-2.5" />
                  {prompt.label}
                </ChipButton>
              ))}
            </div>
          </NoteSection>

          {hidden.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-pt-line pt-4">
              <span className="text-xs text-pt-muted">Add:</span>
              {hidden.map((id) => (
                <ChipButton key={id} onClick={() => setOpened((current) => new Set(current).add(id))}>
                  <Plus className="h-2.5 w-2.5" />
                  {SECTION_NAMES[id]}
                </ChipButton>
              ))}
            </div>
          )}
        </div>

        {media}
      </div>

      <div className="hidden xl:sticky xl:top-0 xl:block">
        <LastVisit note={lastNote} checkIn={checkIn} variant="rail" />
      </div>
    </div>
  )
}

/** Pick a quick set: the ones the condition or body area suggests come first. */
function QuickSetPicker({
  region,
  condition,
  onPick,
  onCancel,
}: {
  region: Region | null
  condition?: string
  onPick: (set: QuickSet) => void
  onCancel: () => void
}) {
  const sets = orderedSets(region, condition)
  return (
    <div className="space-y-3 rounded-2xl border border-pt-line-strong bg-pt-surface p-3 shadow-pt dark:shadow-none sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-pt-ink">
            <Layers className="h-3.5 w-3.5" />
            Quick sets
          </p>
          <p className="text-xs text-pt-muted">Lays out the measures commonly taken for a presentation. Nothing is filled in for you.</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="-m-2 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-pt-muted hover:bg-pt-hover hover:text-pt-ink"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {sets.map(({ set, suggested }) => (
          <button
            key={set.key}
            type="button"
            onClick={() => onPick(set)}
            className={cn(
              'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm text-pt-ink transition hover:bg-pt-hover active:scale-95 sm:min-h-0',
              suggested ? 'border-pt-primary' : 'border-pt-line-strong'
            )}
          >
            {set.label}
            <span className="text-xs tabular-nums text-pt-muted">{set.items.length}</span>
            {suggested && <span className="rounded-full bg-pt-green-bg px-1.5 py-px text-[10px] font-medium text-pt-green-fg">Suggested</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Which form edits a saved measure (PSFS and the questionnaires share the outcome form). */
function composerKindOf(measure: ClinicalMeasure): ComposerKind {
  return measure.kind === 'psfs' ? 'outcome' : measure.kind
}
