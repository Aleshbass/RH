'use client'

import { useImperativeHandle, useMemo, useState, type ComponentType, type ReactNode, type Ref } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, ChevronDown, Layers, Repeat, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { primaryButtonClass } from '@/components/physio/ui'
import {
  MAS_GRADES,
  MMT_GRADES,
  functionalDef,
  measureDetail,
  measureProblem,
  measureResult,
  measureTitle,
  measureUnit,
  outcomeDef,
  seriesKey,
  specialTestDef,
  type ClinicalMeasure,
  type Side,
} from '@/convex/helpers/clinicalMeasures'
import { cn } from '@/lib/utils'
import { Pills } from './bits'
import { PsfsFields, UnitInput, WalkTimeFields, parseNumber, psfsItems, psfsStarted, speedFrom, startingPsfsRows, type PsfsRow } from './fields'
import type { QuickSet } from './quickSets'
import {
  newMeasureId,
  retestItems,
  retestKey,
  type ClinicalNote,
  type PendingHandle,
  type PendingResult,
  type Previous,
  type RetestItem,
} from './progress'

type Entry = { value?: string; result?: ClinicalMeasure['result']; time?: string; distance?: string; rows?: PsfsRow[] }

/** A measure to fill in, taken the same way as `template`, with its last result when there is one. */
type FillRow = { id: string; template: ClinicalMeasure; last?: { measure: ClinicalMeasure; date: number } }

/** A new measure taken the same way as `m` (what, side, method, where, conditions), without its result. */
function sameWayAs(m: ClinicalMeasure): ClinicalMeasure {
  const next: ClinicalMeasure = { id: newMeasureId(), kind: m.kind, key: m.key }
  for (const field of ['side', 'method', 'location', 'context', 'device', 'label', 'unit', 'better'] as const) {
    if (m[field] !== undefined) Object.assign(next, { [field]: m[field] })
  }
  return next
}

type InputKind = 'mmt' | 'mas' | 'result' | 'walk' | 'psfs' | 'number'

/** Grades and test results are picked, walking speed is timed, everything else is typed. */
function inputFor(m: ClinicalMeasure): InputKind {
  if (m.kind === 'psfs') return 'psfs'
  if (m.kind === 'special_test') return 'result'
  if (m.kind === 'strength' && m.method !== 'dynamometer') return 'mmt'
  if (m.kind === 'outcome' && m.key === 'mas') return 'mas'
  if (m.kind === 'functional' && functionalDef(m.key)?.timed) return 'walk'
  return 'number'
}

const RESULTS = [
  { value: 'positive' as const, label: 'Positive' },
  { value: 'negative' as const, label: 'Negative' },
  { value: 'inconclusive' as const, label: 'Unsure' },
]

const defaultDistance = (m: ClinicalMeasure) => String(functionalDef(m.key)?.timed?.defaultDistance ?? 6)
const psfsRowsFor = (row: FillRow, entry: Entry) => entry.rows ?? startingPsfsRows(row.last?.measure)
const psfsPrefilled = (row: FillRow) => Boolean(row.last?.measure.items?.length)

function isFilled(row: FillRow, entry: Entry): boolean {
  switch (inputFor(row.template)) {
    case 'psfs':
      return psfsStarted(psfsRowsFor(row, entry), psfsPrefilled(row))
    case 'walk':
      return Boolean(entry.time?.trim())
    case 'result':
      return Boolean(entry.result || entry.value?.trim())
    default:
      return Boolean(entry.value?.trim())
  }
}

function buildMeasure(row: FillRow, entry: Entry): ClinicalMeasure {
  const next = sameWayAs(row.template)
  switch (inputFor(row.template)) {
    case 'psfs':
      next.items = psfsItems(psfsRowsFor(row, entry))
      break
    case 'walk': {
      const speed = speedFrom(entry.time, entry.distance ?? defaultDistance(row.template))
      if (speed !== undefined) next.value = speed
      break
    }
    case 'result':
      if (entry.result) next.result = entry.result
      if (entry.value?.trim() && specialTestDef(next.key)?.angle) next.value = parseNumber(entry.value)
      break
    default:
      next.value = parseNumber(entry.value)
  }
  return next
}

function placeholderFor(m: ClinicalMeasure) {
  if (m.kind === 'pain') return '0–10'
  if (m.kind === 'outcome' && m.key !== 'custom') {
    const def = outcomeDef(m.key)
    if (def) return `${def.range.min}–${def.range.max}`
  }
  return 'Today'
}

/**
 * A list of measures to take now, each with a box for today's result. Rows left empty are
 * skipped. Used to repeat earlier measures and for quick sets.
 */
function MeasureFillPanel({
  icon: Icon,
  title,
  description,
  controls,
  rows,
  earlier = [],
  onAdd,
  onCancel,
  pendingRef,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description: ReactNode
  controls?: ReactNode
  rows: FillRow[]
  /** Older measures, folded away */
  earlier?: FillRow[]
  onAdd: (measures: ClinicalMeasure[]) => void
  onCancel: () => void
  pendingRef?: Ref<PendingHandle>
}) {
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [error, setError] = useState<string | null>(null)
  const setEntry = (id: string, patch: Entry) => {
    setError(null)
    setEntries((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }
  const all = [...rows, ...earlier]
  const filled = all.filter((row) => isFilled(row, entries[row.id] ?? {}))

  const collect = (quiet = false): PendingResult => {
    const measures: ClinicalMeasure[] = []
    for (const row of filled) {
      const measure = buildMeasure(row, entries[row.id] ?? {})
      const problem = measureProblem(measure)
      if (problem) {
        const detail = measure.kind === 'psfs' ? '' : measureDetail(measure)
        const message = `${measureTitle(measure)}${detail ? ` (${detail})` : ''}: ${problem}`
        if (!quiet) setError(message)
        return { kind: 'invalid', message }
      }
      measures.push(measure)
    }
    return measures.length ? { kind: 'ok', measures } : { kind: 'none' }
  }

  useImperativeHandle(pendingRef, () => ({ collect, started: () => filled.length > 0 }))

  const add = () => {
    const result = collect()
    if (result.kind === 'ok') onAdd(result.measures)
  }

  const renderRow = (row: FillRow, showDate: boolean) => {
    const m = row.template
    const kind = inputFor(m)
    const entry = entries[row.id] ?? {}
    const detail = kind === 'psfs' ? '' : measureDetail(m)
    const angle = kind === 'result' ? specialTestDef(m.key)?.angle : undefined
    const label = [measureTitle(m), detail].filter(Boolean).join(', ')
    return (
      <li key={row.id} className="space-y-2 px-3 py-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-pt-ink">{measureTitle(m)}</p>
            <p className="text-xs text-pt-muted">
              {kind === 'psfs' ? (psfsPrefilled(row) ? 'Same activities, scored again' : 'Up to 5 activities, each scored 0–10') : detail}
              {row.last && kind !== 'psfs' && (
                <>
                  {detail ? ' · ' : ''}last <span className="font-semibold text-pt-ink">{measureResult(row.last.measure)}</span>
                  {showDate && ` on ${format(row.last.date, 'd MMM')}`}
                </>
              )}
            </p>
          </div>
          {(kind === 'number' || kind === 'mmt' || kind === 'mas' || kind === 'result') && (
            <div className="shrink-0 space-y-2 sm:w-56">
              {kind === 'number' && (
                <UnitInput
                  value={entry.value ?? ''}
                  onChange={(value) => setEntry(row.id, { value })}
                  unit={measureUnit(m).trim() || undefined}
                  step={m.kind === 'functional' ? functionalDef(m.key)?.step : 0.1}
                  placeholder={placeholderFor(m)}
                  label={`Today’s ${label}`}
                />
              )}
              {(kind === 'mmt' || kind === 'mas') && (
                <Pills
                  options={(kind === 'mmt' ? MMT_GRADES : MAS_GRADES).map((g) => ({ value: String(g.value), label: g.label }))}
                  value={entry.value ?? null}
                  onChange={(value) => setEntry(row.id, { value: value ?? undefined })}
                  label={`Today’s ${label} grade`}
                  size="sm"
                  clearable
                />
              )}
              {kind === 'result' && (
                <>
                  <Pills
                    options={RESULTS}
                    value={entry.result ?? null}
                    onChange={(result) => setEntry(row.id, { result: result ?? undefined })}
                    label={`Today’s ${label} result`}
                    size="sm"
                    clearable
                  />
                  {angle && (
                    <UnitInput
                      value={entry.value ?? ''}
                      onChange={(value) => setEntry(row.id, { value })}
                      unit="°"
                      placeholder="Angle (optional)"
                      label={`Today’s ${label} angle`}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
        {kind === 'walk' && (
          <WalkTimeFields
            idPrefix={`fill-${row.id.replace(/[^a-z0-9]+/gi, '-')}`}
            time={entry.time ?? ''}
            distance={entry.distance ?? defaultDistance(m)}
            onTime={(time) => setEntry(row.id, { time })}
            onDistance={(distance) => setEntry(row.id, { distance })}
          />
        )}
        {kind === 'psfs' && (
          <PsfsFields rows={psfsRowsFor(row, entry)} setRows={(next) => setEntry(row.id, { rows: next })} prefilled={psfsPrefilled(row)} />
        )}
      </li>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-pt-line-strong bg-pt-surface p-3 shadow-pt dark:shadow-none sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-pt-ink">
            <Icon className="h-3.5 w-3.5" />
            {title}
          </p>
          <p className="text-xs text-pt-muted">{description}</p>
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

      {controls}

      {rows.length > 0 && <ul className="divide-y divide-pt-line rounded-xl border border-pt-line">{rows.map((row) => renderRow(row, false))}</ul>}

      {earlier.length > 0 && (
        <details className="group rounded-xl border border-pt-line" open={rows.length === 0}>
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm font-medium text-pt-ink [&::-webkit-details-marker]:hidden">
            Earlier, not repeated since ({earlier.length})
            <ChevronDown className="ml-auto h-3.5 w-3.5 text-pt-muted transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y divide-pt-line border-t border-pt-line">{earlier.map((row) => renderRow(row, true))}</ul>
        </details>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-pt-rose-fg" role="alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="h-10 rounded-xl text-pt-muted sm:h-9" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" className={cn(primaryButtonClass, 'h-10 sm:h-9')} disabled={filled.length === 0} onClick={add}>
          {filled.length > 0 ? `Add ${filled.length} to note` : 'Add to note'}
        </Button>
      </div>
    </div>
  )
}

const retestRow = (item: RetestItem): FillRow => ({ id: retestKey(item.measure), template: item.measure, last: item })

/**
 * Re-test what was measured before, in one place: everything from the last visit that measured
 * anything (whoever took it), with older measures not repeated since folded below. Measuring the
 * same things the same way each visit is what makes progress visible.
 */
export function RetestPanel({
  notes,
  before,
  skipNoteId,
  onAdd,
  onCancel,
  pendingRef,
}: {
  /** The patient's measured notes, newest first */
  notes: ClinicalNote[] | undefined
  /** Only measures from before this time (the note's date) */
  before: number
  skipNoteId?: string
  onAdd: (measures: ClinicalMeasure[]) => void
  onCancel: () => void
  pendingRef?: Ref<PendingHandle>
}) {
  const { lastDate, recent, earlier } = useMemo(() => retestItems(notes, before, skipNoteId), [notes, before, skipNoteId])
  return (
    <MeasureFillPanel
      icon={Repeat}
      title="Repeat last measures"
      description={
        lastDate
          ? `From ${format(lastDate, 'd MMM yyyy')}. Fill in what you re-tested today; leave the rest empty.`
          : 'Nothing measured before this note yet.'
      }
      rows={recent.map(retestRow)}
      earlier={earlier.map(retestRow)}
      onAdd={onAdd}
      onCancel={onCancel}
      pendingRef={pendingRef}
    />
  )
}

type SideChoice = Side | 'both'

const SIDE_CHOICES: { value: SideChoice; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'both', label: 'Both' },
]

/**
 * A quick set laid out to fill in: the measures commonly taken for a presentation, each with its
 * last result if the patient has one. Sided measures are taken on the side(s) chosen at the top;
 * both sides gives a left–right comparison.
 */
export function QuickSetPanel({
  set,
  previous,
  defaultSide,
  onChangeSet,
  onAdd,
  onCancel,
  pendingRef,
}: {
  set: QuickSet
  /** The latest earlier value of each measure (previousBySeries) */
  previous: Map<string, Previous>
  /** The side the condition names */
  defaultSide?: Side | null
  onChangeSet: () => void
  onAdd: (measures: ClinicalMeasure[]) => void
  onCancel: () => void
  pendingRef?: Ref<PendingHandle>
}) {
  const [sides, setSides] = useState<SideChoice>(defaultSide ?? 'both')
  const hasSided = set.items.some((item) => item.sided)
  const rows = useMemo(
    () =>
      set.items.flatMap((item, index): FillRow[] => {
        const forSides: (Side | undefined)[] = item.sided ? (sides === 'both' ? ['left', 'right'] : [sides]) : [undefined]
        return forSides.map((side) => {
          const template: ClinicalMeasure = { id: '', ...item.measure, ...(side ? { side } : {}) }
          // Angle tests (SLR) look up their earlier angle with a stand-in value
          const key = seriesKey(template.kind === 'special_test' ? { ...template, value: 0 } : template)
          const prev = key ? previous.get(key) : undefined
          return { id: `${set.key}-${index}-${side ?? ''}`, template, last: prev ? { measure: prev.measure, date: prev.date } : undefined }
        })
      }),
    [set, sides, previous]
  )
  return (
    <MeasureFillPanel
      icon={Layers}
      title={`Quick set: ${set.label}`}
      description="Measures often taken for this. Fill in what you tested; rows left empty are skipped."
      controls={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {hasSided ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-pt-muted">Side</span>
              <Pills options={SIDE_CHOICES} value={sides} onChange={(next) => next && setSides(next)} label="Side" size="sm" />
            </div>
          ) : (
            <span />
          )}
          <button type="button" onClick={onChangeSet} className="min-h-10 text-xs font-medium text-pt-ink underline underline-offset-2 sm:min-h-8">
            Change set
          </button>
        </div>
      }
      rows={rows}
      onAdd={onAdd}
      onCancel={onCancel}
      pendingRef={pendingRef}
    />
  )
}
