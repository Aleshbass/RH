'use client'

/**
 * Every wording of a clinical note, newest first: the current version on top, then each earlier
 * one with when it was written and who replaced it. Used by the physio workspace (Notes tab) and
 * the clinic's patient record. Clinician only; the server checks the same access as reading the
 * note (physioCare.getClinicalNoteHistory).
 */

import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format } from 'date-fns'
import { History } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { PhysioDrawer } from '@/components/physio/ui'
import { measureDetail, measureResult, measureTitle, type ClinicalMeasure } from '@/convex/helpers/clinicalMeasures'
import { NOTE_TYPE_LABELS } from '@/components/physio/notes/progress'
import { cn } from '@/lib/utils'

type NoteWording = {
  noteType: string
  diagnosis?: string
  goals?: string
  subjectiveAssessment?: string
  objectiveAssessment?: string
  treatmentAdministered?: string
  planForNextSession?: string
  measures: ClinicalMeasure[]
}

/** What physioCare.getClinicalNoteHistory returns. */
export type NoteHistory = {
  noteId: Id<'sessionLogs'>
  sessionDate: number
  authorName: string
  mine: boolean
  current: NoteWording & { savedAt: number }
  earlier: (NoteWording & { key: string; savedAt: number; replacedAt: number; replacedByName: string })[]
} | null

export const getClinicalNoteHistoryRef = makeFunctionReference<'query', { noteId: Id<'sessionLogs'> }, NoteHistory>(
  'physioCare:getClinicalNoteHistory'
)

type Variant = 'physio' | 'clinic'
type Field = Exclude<keyof NoteWording, 'noteType' | 'measures'>

/** Section names as each screen shows them. */
function sectionLabels(variant: Variant, noteType: string): Record<Field, string> {
  const discharge = noteType === 'discharge_summary'
  if (variant === 'clinic') {
    return {
      diagnosis: 'Diagnosis',
      goals: 'Goals',
      subjectiveAssessment: 'Patient report',
      objectiveAssessment: 'Findings',
      treatmentAdministered: discharge ? 'Summary' : 'Treatment given',
      planForNextSession: discharge ? 'Home advice' : 'Plan',
    }
  }
  return {
    subjectiveAssessment: 'Subjective',
    objectiveAssessment: 'Objective',
    diagnosis: 'Assessment',
    goals: 'Goals',
    treatmentAdministered: discharge ? 'Summary' : 'Treatment',
    planForNextSession: discharge ? 'Home advice' : 'Plan',
  }
}

const FIELD_ORDER: Record<Variant, Field[]> = {
  physio: ['subjectiveAssessment', 'objectiveAssessment', 'diagnosis', 'goals', 'treatmentAdministered', 'planForNextSession'],
  clinic: ['diagnosis', 'goals', 'subjectiveAssessment', 'objectiveAssessment', 'treatmentAdministered', 'planForNextSession'],
}

const STYLES = {
  physio: {
    card: 'rounded-2xl border border-pt-line bg-pt-surface p-4',
    current: 'border-pt-line-strong',
    title: 'text-sm font-semibold text-pt-ink',
    meta: 'text-xs text-pt-muted',
    label: 'text-[11px] font-semibold uppercase tracking-wider text-pt-faint',
    text: 'text-sm text-pt-ink',
    empty: 'text-sm text-pt-muted',
    badge: 'bg-pt-accent-soft text-pt-accent-ink',
    changed: 'bg-pt-amber-bg text-pt-amber-fg',
  },
  clinic: {
    card: 'rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900',
    current: 'border-neutral-300 dark:border-neutral-700',
    title: 'text-sm font-medium text-neutral-900 dark:text-neutral-100',
    meta: 'text-xs text-neutral-500 dark:text-neutral-400',
    label: 'text-xs text-neutral-500 dark:text-neutral-400',
    text: 'text-sm text-neutral-700 dark:text-neutral-300',
    empty: 'text-sm text-neutral-500 dark:text-neutral-400',
    badge: 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900',
    changed: 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200',
  },
} as const

const when = (ms: number) => format(ms, 'd MMM yyyy, HH:mm')
const sameMeasures = (a: ClinicalMeasure[], b: ClinicalMeasure[]) => JSON.stringify(a) === JSON.stringify(b)

function measureLine(m: ClinicalMeasure) {
  const detail = measureDetail(m)
  return `${measureTitle(m)}${detail ? ` (${detail})` : ''}: ${measureResult(m)}`
}

function Tag({ children, className }: { children: string; className: string }) {
  return <span className={cn('rounded-full px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal', className)}>{children}</span>
}

function Version({
  variant,
  wording,
  heading,
  meta,
  current,
  newer,
}: {
  variant: Variant
  wording: NoteWording
  heading: string
  meta: string
  current?: boolean
  /** The wording that replaced this one, to mark what changed */
  newer?: NoteWording
}) {
  const s = STYLES[variant]
  const labels = sectionLabels(variant, wording.noteType)
  const rows = FIELD_ORDER[variant]
    .map((key) => ({ key, label: labels[key], value: wording[key]?.trim() || '', changed: newer ? (newer[key]?.trim() || '') !== (wording[key]?.trim() || '') : false }))
    .filter((row) => row.value || row.changed)
  const measuresChanged = newer ? !sameMeasures(newer.measures, wording.measures) : false

  return (
    <li className={cn(s.card, current && s.current, 'space-y-3')}>
      <div className="flex flex-wrap items-center gap-2">
        <p className={s.title}>{heading}</p>
        {current && <Tag className={s.badge}>Current</Tag>}
        {wording.noteType && NOTE_TYPE_LABELS[wording.noteType] && <span className={s.meta}>{NOTE_TYPE_LABELS[wording.noteType]}</span>}
      </div>
      <p className={cn(s.meta, '-mt-2')}>{meta}</p>
      {rows.length === 0 && wording.measures.length === 0 ? (
        <p className={s.empty}>No written sections.</p>
      ) : (
        <dl className="space-y-2.5">
          {rows.map((row) => (
            <div key={row.key}>
              <dt className={cn(s.label, 'flex items-center gap-1.5')}>
                {row.label}
                {row.changed && <Tag className={s.changed}>Changed</Tag>}
              </dt>
              <dd className={cn(s.text, 'mt-0.5 whitespace-pre-line break-words')}>{row.value || <span className={s.empty}>Empty</span>}</dd>
            </div>
          ))}
          {(wording.measures.length > 0 || measuresChanged) && (
            <div>
              <dt className={cn(s.label, 'flex items-center gap-1.5')}>
                Measures
                {measuresChanged && <Tag className={s.changed}>Changed</Tag>}
              </dt>
              <dd className="mt-0.5">
                {wording.measures.length === 0 ? (
                  <span className={s.empty}>None</span>
                ) : (
                  <ul className={cn(s.text, 'space-y-0.5')}>
                    {wording.measures.map((m) => (
                      <li key={m.id} className="break-words">
                        {measureLine(m)}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          )}
        </dl>
      )}
    </li>
  )
}

function HistoryBody({ variant, history }: { variant: Variant; history: NoteHistory | undefined }) {
  const s = STYLES[variant]
  if (history === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    )
  }
  if (history === null) return <p className={s.empty}>This note’s history isn’t available to you.</p>
  const total = history.earlier.length + 1
  return (
    <ol className="space-y-3">
      <Version
        variant={variant}
        current
        wording={history.current}
        heading={`Version ${total}`}
        meta={`Saved ${when(history.current.savedAt)} by ${history.mine ? 'you' : history.authorName}`}
      />
      {history.earlier.map((version, index) => (
        <Version
          key={version.key}
          variant={variant}
          wording={version}
          newer={index === 0 ? history.current : history.earlier[index - 1]}
          heading={`Version ${total - index - 1}`}
          meta={`Written ${when(version.savedAt)} · replaced ${when(version.replacedAt)} by ${version.replacedByName}`}
        />
      ))}
    </ol>
  )
}

export function NoteHistoryDrawer({
  noteId,
  open,
  onOpenChange,
  variant = 'physio',
}: {
  noteId: Id<'sessionLogs'> | string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  variant?: Variant
}) {
  const history = useQuery(getClinicalNoteHistoryRef, open && noteId ? { noteId: noteId as Id<'sessionLogs'> } : 'skip')
  const description = history
    ? `${format(history.sessionDate, 'd MMM yyyy')} · ${history.mine ? 'Your note' : history.authorName}. Earlier wording is kept and can’t be changed.`
    : 'Earlier wording is kept and can’t be changed.'

  if (variant === 'clinic') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 border-l border-neutral-200 bg-white p-0 shadow-none dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-lg"
        >
          <SheetHeader className="shrink-0 border-b border-neutral-200 px-5 py-4 pr-12 text-left dark:border-neutral-800">
            <SheetTitle className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-white">
              <History className="h-4 w-4" />
              Note history
            </SheetTitle>
            <SheetDescription className="text-xs text-neutral-500 dark:text-neutral-400">{description}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <HistoryBody variant="clinic" history={history} />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <PhysioDrawer open={open} onOpenChange={onOpenChange} title="Note history" description={description} className="sm:max-w-xl">
      <HistoryBody variant="physio" history={history} />
    </PhysioDrawer>
  )
}
