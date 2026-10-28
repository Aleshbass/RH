'use client'

import { useEffect, useImperativeHandle, useMemo, useState, type ReactNode, type Ref } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, ChevronDown, ExternalLink, Info, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VideoEmbed } from '@/components/media/VideoEmbed'
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui'
import {
  DEVICES,
  FUNCTIONAL,
  MAS_GRADES,
  MMT_GRADES,
  OUTCOMES,
  PAIN_AREAS,
  PAIN_CONTEXTS,
  REGIONS,
  ROM,
  SPECIAL_TESTS,
  STRENGTH,
  STRENGTH_METHOD_LABELS,
  functionalDef,
  measureProblem,
  measureResult,
  measureTitle,
  outcomeDef,
  romDef,
  seriesKey,
  specialTestDef,
  strengthDef,
  type ClinicalMeasure,
  type Region,
  type Side,
  type StrengthMethod,
} from '@/convex/helpers/clinicalMeasures'
import { cn } from '@/lib/utils'
import { MiniLabel, Pills } from './bits'
import {
  PsfsFields,
  UnitInput,
  WalkTimeFields,
  parseNumber,
  psfsItems,
  psfsStarted,
  speedFrom,
  startingPsfsRows,
  timeFor,
  type PsfsRow,
} from './fields'
import { guideFor, MMT_MEANINGS, type Guide } from './guides'
import { newMeasureId, sameMeasure, type PendingHandle, type PendingResult, type Previous } from './progress'

export type ComposerKind = 'rom' | 'strength' | 'functional' | 'pain' | 'outcome' | 'special_test'

const SIDES: { value: Side; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
]

const PAIN_AREA_FOR_REGION: Partial<Record<Region, string>> = {
  cervical: 'Neck',
  thoracic: 'Upper back',
  lumbar: 'Lower back',
  shoulder: 'Shoulder',
  elbow: 'Elbow',
  wrist_hand: 'Wrist & hand',
  hip: 'Hip',
  knee: 'Knee',
  ankle_foot: 'Ankle & foot',
}

/** Which list a kind picks from, so the area pills only offer areas that have something in it. */
const REGIONAL: Partial<Record<ComposerKind, { key: string; region: Region }[]>> = {
  rom: ROM,
  strength: STRENGTH,
  special_test: SPECIAL_TESTS,
}

const firstInRegion = (kind: ComposerKind, region: Region | null) =>
  REGIONAL[kind]?.find((d) => !region || d.region === region)?.key ?? ''

/** Pain buttons: mild, moderate and severe in the patient tints (as on the patient's check-in). */
function painClass(score: number, selected: boolean) {
  if (!selected) return 'border-pt-line bg-pt-surface text-pt-muted hover:bg-pt-hover hover:text-pt-ink'
  if (score >= 7) return 'border-transparent bg-pt-rose-fg text-pt-surface'
  if (score >= 4) return 'border-transparent bg-pt-amber-fg text-pt-surface'
  return 'border-transparent bg-pt-green-fg text-pt-surface'
}

function startingMeasure(kind: ComposerKind, region: Region | null, lastSide?: Side): ClinicalMeasure {
  const id = newMeasureId()
  switch (kind) {
    case 'rom':
      return { id, kind, key: firstInRegion(kind, region), method: 'arom', side: lastSide }
    case 'strength': {
      const key = firstInRegion(kind, region)
      return { id, kind, key, method: strengthDef(key)?.methods[0] ?? 'mmt', side: lastSide }
    }
    case 'functional':
      return { id, kind, key: 'tug' }
    case 'pain':
      return { id, kind, key: 'nprs', location: region ? PAIN_AREA_FOR_REGION[region] : undefined, context: 'now' }
    case 'outcome':
      return { id, kind: 'psfs', key: 'psfs' }
    case 'special_test':
      return { id, kind, key: firstInRegion(kind, region), side: lastSide }
  }
}

/** The measure without empty fields, as it's saved. */
function tidy(m: ClinicalMeasure): ClinicalMeasure {
  const out = { ...m }
  for (const key of Object.keys(out) as (keyof ClinicalMeasure)[]) {
    const value = out[key]
    if (value === undefined || (typeof value === 'string' && value.trim() === '' && key !== 'id' && key !== 'key')) delete out[key]
  }
  return out
}

/**
 * Add (or edit) one measure inside the note: only the fields that measure needs, the last value
 * for comparison, and how to do the test, all without leaving the note.
 */
export function MeasureComposer({
  kind,
  region,
  onRegion,
  initial = null,
  previous,
  lastPsfs = null,
  lastSide,
  onSave,
  onCancel,
  pendingRef,
}: {
  kind: ComposerKind
  region: Region | null
  onRegion: (region: Region) => void
  /** The measure being edited */
  initial?: ClinicalMeasure | null
  previous: Map<string, Previous>
  /** The patient's last PSFS, so the same activities are scored again */
  lastPsfs?: ClinicalMeasure | null
  lastSide?: Side
  onSave: (measure: ClinicalMeasure, addAnother: boolean) => void
  onCancel: () => void
  /** Lets the note pick up what's entered here but not yet added, when the note is saved */
  pendingRef?: Ref<PendingHandle>
}) {
  const editing = initial !== null
  // The area counts as unset when it has nothing of this kind (dizziness has no range of motion),
  // so the list is never empty: the physio picks an area that has some instead
  const regionalList = REGIONAL[kind]
  const area = region && regionalList && !regionalList.some((d) => d.region === region) ? null : region
  const [m, setM] = useState<ClinicalMeasure>(() => initial ?? startingMeasure(kind, area, lastSide))
  const initialTimed = initial ? functionalDef(initial.key)?.timed : undefined
  const [valueText, setValueText] = useState(() => (initial?.value !== undefined && !(initial.kind === 'functional' && initialTimed) ? String(initial.value) : ''))
  // Walking speed is entered as a time over a distance; a saved speed shows as its time again
  const [distanceText, setDistanceText] = useState(() => String(initialTimed?.defaultDistance ?? 6))
  const [timeText, setTimeText] = useState(() => (initial?.kind === 'functional' && initialTimed ? timeFor(initial.value, initialTimed.defaultDistance) : ''))
  const [startTime] = useState(timeText)
  const [rows, setRows] = useState<PsfsRow[]>(() =>
    initial?.items ? initial.items.map((item) => ({ activity: item.activity, score: String(item.score) })) : startingPsfsRows(lastPsfs)
  )
  const psfsPrefilled = !initial && Boolean(lastPsfs?.items?.length)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<ClinicalMeasure>) => {
    setError(null)
    setM((current) => ({ ...current, ...patch }))
  }

  // A new area shows that area's movements and tests
  useEffect(() => {
    if (editing || !regionalList || !area) return
    setM((current) => {
      const inRegion = regionalList.find((d) => d.key === current.key)?.region === area
      if (inRegion) return current
      const key = firstInRegion(kind, area)
      return { ...current, key, method: kind === 'strength' ? strengthDef(key)?.methods[0] ?? 'mmt' : current.method }
    })
  }, [editing, kind, area, regionalList])

  const parsedValue = valueText.trim() === '' ? undefined : parseNumber(valueText)
  const timed = m.kind === 'functional' ? functionalDef(m.key)?.timed : undefined
  const angle = m.kind === 'special_test' ? specialTestDef(m.key)?.angle : undefined
  const usesTypedValue =
    m.kind === 'rom' ||
    (m.kind === 'functional' && !timed) ||
    (m.kind === 'strength' && m.method === 'dynamometer') ||
    (m.kind === 'outcome' && m.key !== 'mas') ||
    Boolean(angle)

  const built = useMemo((): ClinicalMeasure => {
    if (m.kind === 'psfs') return tidy({ ...m, items: psfsItems(rows), value: undefined })
    let value = usesTypedValue ? parsedValue : m.value
    if (timed) {
      // An untouched time keeps the saved speed exactly (the time shown is rounded)
      const untouched = initial?.kind === 'functional' && initial.key === m.key && timeText === startTime && Number(distanceText) === timed.defaultDistance
      value = untouched ? initial?.value : speedFrom(timeText, distanceText)
    }
    if (m.kind === 'special_test' && !angle) value = undefined
    // A side only where the movement or test has one (neck flexion has none)
    const sided =
      m.kind === 'rom'
        ? romDef(m.key)?.sided
        : m.kind === 'strength'
          ? strengthDef(m.key)?.sided
          : m.kind === 'functional'
            ? functionalDef(m.key)?.sided
            : m.kind === 'special_test'
              ? specialTestDef(m.key)?.sided
              : true
    return tidy({ ...m, side: sided ? m.side : undefined, value })
  }, [m, rows, usesTypedValue, parsedValue, timed, angle, initial, timeText, startTime, distanceText])

  // An angle test's earlier angle shows before today's is typed
  const key = seriesKey(angle && built.value === undefined ? { ...built, value: 0 } : built)
  const last = key ? previous.get(key) : undefined
  const guide = guideFor(m.kind, m.key)

  /** Something has been entered that isn't in the note yet. */
  const started = () => {
    if (initial) return !sameMeasure(built, tidy(initial))
    if (m.kind === 'psfs') return psfsStarted(rows, psfsPrefilled)
    if (timed) return timeText.trim() !== ''
    if (usesTypedValue && valueText.trim() !== '') return true
    if (m.kind === 'special_test') return Boolean(m.result)
    if (m.kind === 'outcome' && m.key === 'custom') return Boolean(m.label?.trim())
    return m.value !== undefined
  }

  useImperativeHandle(pendingRef, () => ({
    started,
    collect: (quiet = false): PendingResult => {
      if (!started()) return { kind: 'none' }
      const problem = measureProblem(built)
      if (problem) {
        if (!quiet) setError(problem)
        return { kind: 'invalid', message: `${measureTitle(built)}: ${problem}` }
      }
      return { kind: 'ok', measures: [built] }
    },
  }))

  const save = (addAnother: boolean) => {
    const problem = measureProblem(built)
    if (problem) {
      setError(problem)
      return
    }
    onSave(built, addAnother)
    if (!addAnother) return
    // Ready for the next one: same area, side and method, the next movement or test in the list
    const list: { key: string; region?: Region }[] = regionalList ?? (m.kind === 'functional' ? FUNCTIONAL : [])
    const options = list.filter((d) => !d.region || !area || d.region === area)
    const index = options.findIndex((d) => d.key === m.key)
    const nextKey = options[(index + 1) % Math.max(options.length, 1)]?.key ?? m.key
    setM({
      id: newMeasureId(),
      kind: m.kind,
      key: nextKey,
      side: m.side,
      method: m.kind === 'strength' ? (strengthDef(nextKey)?.methods.includes(m.method as StrengthMethod) ? m.method : strengthDef(nextKey)?.methods[0]) : m.method,
    })
    setValueText('')
    setTimeText('')
    setDistanceText(String(functionalDef(nextKey)?.timed?.defaultDistance ?? 6))
    setError(null)
  }

  const canAddAnother = !editing && (m.kind === 'rom' || m.kind === 'strength' || m.kind === 'special_test' || m.kind === 'functional')
  const regionOptions = regionalList ? REGIONS.filter((r) => regionalList.some((d) => d.region === r.key)) : []

  return (
    <div className="space-y-4 rounded-2xl border border-pt-line-strong bg-pt-surface p-3 shadow-pt dark:shadow-none sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-pt-ink">{editing ? 'Edit measure' : COMPOSER_TITLES[kind]}</p>
        <button
          type="button"
          onClick={onCancel}
          className="-m-2 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-pt-muted hover:bg-pt-hover hover:text-pt-ink"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {regionalList && !editing && (
        <div>
          <MiniLabel>Area</MiniLabel>
          <Pills
            options={regionOptions.map((r) => ({ value: r.key, label: r.label }))}
            value={area}
            onChange={(next) => next && onRegion(next)}
            label="Body area"
            size="sm"
          />
        </div>
      )}

      {kind === 'outcome' && !editing && (
        <div>
          <MiniLabel>Outcome measure</MiniLabel>
          <Pills
            options={[{ value: 'psfs', label: 'PSFS' }, ...OUTCOMES.map((o) => ({ value: o.key as string, label: o.short }))]}
            value={m.kind === 'psfs' ? 'psfs' : m.key}
            onChange={(next) => {
              if (!next) return
              setError(null)
              setValueText('')
              setM(next === 'psfs' ? { id: m.id, kind: 'psfs', key: 'psfs' } : { id: m.id, kind: 'outcome', key: next, better: next === 'custom' ? 'higher' : undefined })
            }}
            label="Outcome measure"
            size="sm"
          />
        </div>
      )}

      {(!regionalList || area || editing) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {m.kind === 'rom' && <RomFields m={m} set={set} region={area} valueText={valueText} setValueText={setValueText} />}
          {m.kind === 'strength' && <StrengthFields m={m} set={set} region={area} valueText={valueText} setValueText={setValueText} />}
          {m.kind === 'functional' && (
            <FunctionalFields
              m={m}
              set={set}
              valueText={valueText}
              setValueText={setValueText}
              time={timeText}
              distance={distanceText}
              onTime={(next) => {
                setError(null)
                setTimeText(next)
              }}
              onDistance={(next) => {
                setError(null)
                setDistanceText(next)
              }}
              onTest={(key) => setDistanceText(String(functionalDef(key)?.timed?.defaultDistance ?? 6))}
            />
          )}
          {m.kind === 'pain' && <PainFields m={m} set={set} />}
          {m.kind === 'psfs' && (
            <PsfsFields
              rows={rows}
              setRows={(next) => {
                setError(null)
                setRows(next)
              }}
              prefilled={psfsPrefilled}
            />
          )}
          {m.kind === 'outcome' && <OutcomeFields m={m} set={set} valueText={valueText} setValueText={setValueText} />}
          {m.kind === 'special_test' && <SpecialTestFields m={m} set={set} region={area} valueText={valueText} setValueText={setValueText} />}

          <div className="sm:col-span-2">
            <MiniLabel htmlFor={`measure-notes-${m.id}`}>Notes (optional)</MiniLabel>
            <Input
              id={`measure-notes-${m.id}`}
              className={cn(fieldClass, 'h-10')}
              value={m.notes ?? ''}
              maxLength={300}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder={m.kind === 'special_test' ? 'e.g. pain at end of range' : 'e.g. end-range discomfort'}
            />
          </div>
        </div>
      )}

      {regionalList && !area && !editing && <p className="text-xs text-pt-muted">Pick an area to see its {kind === 'special_test' ? 'tests' : 'movements'}.</p>}

      {last && (
        <p className="text-xs text-pt-muted">
          Last time ({format(last.date, 'd MMM')}): <span className="font-semibold text-pt-ink">{measureResult(last.measure)}</span>
        </p>
      )}

      {guide && <GuideBlock guide={guide} isTest={m.kind === 'special_test'} />}

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-pt-rose-fg" role="alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" className="h-9 rounded-xl text-pt-muted" onClick={onCancel}>
          Cancel
        </Button>
        {canAddAnother && (
          <Button type="button" className={cn(secondaryButtonClass, 'h-9')} onClick={() => save(true)}>
            Add &amp; next
          </Button>
        )}
        <Button type="button" className={cn(primaryButtonClass, 'h-9')} onClick={() => save(false)}>
          {editing ? 'Save changes' : 'Add to note'}
        </Button>
      </div>
    </div>
  )
}

const COMPOSER_TITLES: Record<ComposerKind, string> = {
  rom: 'Range of motion',
  strength: 'Strength',
  functional: 'Functional test',
  pain: 'Pain score',
  outcome: 'Outcome measure',
  special_test: 'Special test',
}

type FieldProps = { m: ClinicalMeasure; set: (patch: Partial<ClinicalMeasure>) => void }
type ValueProps = { valueText: string; setValueText: (value: string) => void }

function Field({ label, htmlFor, children, wide = false }: { label: string; htmlFor?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn(wide && 'sm:col-span-2')}>
      <MiniLabel htmlFor={htmlFor}>{label}</MiniLabel>
      {children}
    </div>
  )
}

function Choose({ value, onChange, options, placeholder, id }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; placeholder: string; id?: string }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} className={cn(fieldClass, 'h-10')}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SideField({ m, set, optional = false }: FieldProps & { optional?: boolean }) {
  return (
    <Field label={optional ? 'Side (optional)' : 'Side'}>
      <Pills options={SIDES} value={m.side} onChange={(side) => set({ side: side ?? undefined })} label="Side" clearable={optional} />
    </Field>
  )
}

function RomFields({ m, set, region, valueText, setValueText }: FieldProps & ValueProps & { region: Region | null }) {
  const def = romDef(m.key)
  const options = ROM.filter((d) => !region || d.region === region).map((d) => ({ value: d.key, label: d.label }))
  return (
    <>
      <Field label="Movement" htmlFor={`rom-key-${m.id}`}>
        <Choose id={`rom-key-${m.id}`} value={m.key} onChange={(key) => set({ key })} options={options} placeholder="Pick a movement" />
      </Field>
      <Field label="Type">
        <Pills
          options={[
            { value: 'arom', label: 'Active (AROM)' },
            { value: 'prom', label: 'Passive (PROM)' },
          ]}
          value={m.method as 'arom' | 'prom' | undefined}
          onChange={(method) => method && set({ method })}
          label="Active or passive"
        />
      </Field>
      {def?.sided && <SideField m={m} set={set} />}
      <Field label="Measurement" htmlFor={`rom-value-${m.id}`}>
        <UnitInput id={`rom-value-${m.id}`} value={valueText} onChange={setValueText} unit={def?.unit === 'cm' ? 'cm' : '°'} />
        {def?.normal && <p className="mt-1 text-[11px] text-pt-faint">Typical: {def.normal}</p>}
      </Field>
    </>
  )
}

function StrengthFields({ m, set, region, valueText, setValueText }: FieldProps & ValueProps & { region: Region | null }) {
  const def = strengthDef(m.key)
  const options = STRENGTH.filter((d) => !region || d.region === region).map((d) => ({ value: d.key, label: d.label }))
  const grade = MMT_GRADES.find((g) => g.value === m.value)
  return (
    <>
      <Field label="Muscle group" htmlFor={`strength-key-${m.id}`}>
        <Choose
          id={`strength-key-${m.id}`}
          value={m.key}
          onChange={(key) => {
            const methods = strengthDef(key)?.methods ?? ['mmt']
            set({ key, method: methods.includes(m.method as StrengthMethod) ? m.method : methods[0], value: undefined })
          }}
          options={options}
          placeholder="Pick a muscle group"
        />
      </Field>
      {def && def.methods.length > 1 && (
        <Field label="Test method">
          <Pills
            options={def.methods.map((method) => ({ value: method, label: STRENGTH_METHOD_LABELS[method] }))}
            value={m.method as StrengthMethod}
            onChange={(method) => method && set({ method, value: undefined })}
            label="Test method"
          />
        </Field>
      )}
      {def?.sided && <SideField m={m} set={set} />}
      {m.method === 'dynamometer' ? (
        <Field label="Force" htmlFor={`strength-value-${m.id}`}>
          <UnitInput id={`strength-value-${m.id}`} value={valueText} onChange={setValueText} unit="kg" step={0.1} />
        </Field>
      ) : (
        <Field label="Grade (Oxford scale)" wide>
          <Pills
            options={MMT_GRADES.map((g) => ({ value: String(g.value), label: g.label, title: MMT_MEANINGS[g.label] }))}
            value={m.value !== undefined ? String(m.value) : null}
            onChange={(value) => value !== null && set({ value: Number(value) })}
            label="MMT grade"
          />
          {grade && <p className="mt-1 text-[11px] text-pt-faint">{grade.label}: {MMT_MEANINGS[grade.label]}</p>}
        </Field>
      )}
    </>
  )
}

function FunctionalFields({
  m,
  set,
  valueText,
  setValueText,
  time,
  distance,
  onTime,
  onDistance,
  onTest,
}: FieldProps &
  ValueProps & {
    time: string
    distance: string
    onTime: (value: string) => void
    onDistance: (value: string) => void
    onTest: (key: string) => void
  }) {
  const def = functionalDef(m.key)
  return (
    <>
      <Field label="Test" htmlFor={`functional-key-${m.id}`}>
        <Choose
          id={`functional-key-${m.id}`}
          value={m.key}
          onChange={(key) => {
            onTest(key)
            set({ key, device: undefined, context: undefined, side: functionalDef(key)?.sided ? m.side : undefined })
          }}
          options={FUNCTIONAL.map((d) => ({ value: d.key, label: `${d.label} (${d.short})` }))}
          placeholder="Pick a test"
        />
      </Field>
      {def?.timed ? (
        <WalkTimeFields idPrefix={`functional-${m.id}`} time={time} distance={distance} onTime={onTime} onDistance={onDistance} />
      ) : (
        <Field label="Result" htmlFor={`functional-value-${m.id}`}>
          <UnitInput id={`functional-value-${m.id}`} value={valueText} onChange={setValueText} unit={def?.unit} step={def?.step} />
          {def?.hint && <p className="mt-1 text-[11px] text-pt-faint">{def.hint}</p>}
        </Field>
      )}
      {def?.sided && <SideField m={m} set={set} />}
      {def?.device && (
        <Field label="Walking aid" htmlFor={`functional-device-${m.id}`}>
          <Choose id={`functional-device-${m.id}`} value={m.device ?? ''} onChange={(device) => set({ device })} options={DEVICES.map((d) => ({ value: d, label: d }))} placeholder="None" />
        </Field>
      )}
      {def?.condition && (
        <Field label={def.condition.label}>
          <Pills
            options={def.condition.options.map((o) => ({ value: o, label: o }))}
            value={m.context}
            onChange={(context) => set({ context: context ?? undefined })}
            label={def.condition.label}
            clearable
          />
        </Field>
      )}
    </>
  )
}

function PainFields({ m, set }: FieldProps) {
  return (
    <>
      <Field label="Pain score (0 = no pain, 10 = worst imaginable)" wide>
        {/* Two rows on phones so each number stays a comfortable tap */}
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11 sm:gap-1" role="radiogroup" aria-label="Pain score from 0 to 10">
          {Array.from({ length: 11 }, (_, score) => (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={m.value === score}
              onClick={() => set({ value: score })}
              className={cn('h-10 rounded-lg border text-sm font-semibold tabular-nums transition active:scale-90 sm:h-9', painClass(score, m.value === score))}
            >
              {score}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Where" htmlFor={`pain-location-${m.id}`}>
        <Choose id={`pain-location-${m.id}`} value={m.location ?? ''} onChange={(location) => set({ location })} options={PAIN_AREAS.map((a) => ({ value: a, label: a }))} placeholder="Pick an area" />
      </Field>
      <SideField m={m} set={set} optional />
      <Field label="When" wide>
        <Pills options={PAIN_CONTEXTS.map((c) => ({ value: c.key, label: c.label }))} value={m.context} onChange={(context) => set({ context: context ?? undefined })} label="When" />
      </Field>
    </>
  )
}

function OutcomeFields({ m, set, valueText, setValueText }: FieldProps & ValueProps) {
  const def = outcomeDef(m.key)
  if (!def) return null
  if (m.key === 'mas') {
    return (
      <>
        <Field label="Muscle" htmlFor={`mas-muscle-${m.id}`}>
          <Input id={`mas-muscle-${m.id}`} className={cn(fieldClass, 'h-10')} value={m.location ?? ''} maxLength={60} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Elbow flexors" />
        </Field>
        <SideField m={m} set={set} optional />
        <Field label="Grade" wide>
          <Pills options={MAS_GRADES.map((g) => ({ value: String(g.value), label: g.label }))} value={m.value !== undefined ? String(m.value) : null} onChange={(value) => value !== null && set({ value: Number(value) })} label="Modified Ashworth grade" />
          <p className="mt-1 text-[11px] text-pt-faint">{def.hint}</p>
        </Field>
      </>
    )
  }
  if (m.key === 'custom') {
    return (
      <>
        <Field label="Name" htmlFor={`custom-label-${m.id}`}>
          <Input id={`custom-label-${m.id}`} className={cn(fieldClass, 'h-10')} value={m.label ?? ''} maxLength={60} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. Single-leg hop" />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
          <Field label="Value" htmlFor={`custom-value-${m.id}`}>
            <UnitInput id={`custom-value-${m.id}`} value={valueText} onChange={setValueText} step={0.1} />
          </Field>
          <Field label="Unit" htmlFor={`custom-unit-${m.id}`}>
            <Input id={`custom-unit-${m.id}`} className={cn(fieldClass, 'h-10')} value={m.unit ?? ''} maxLength={16} onChange={(e) => set({ unit: e.target.value })} placeholder="cm" />
          </Field>
        </div>
        {/* Per side for things like a single-leg hop, so left and right chart apart and compare */}
        <SideField m={m} set={set} optional />
        <Field label="Better is" wide>
          <Pills
            options={[
              { value: 'higher', label: 'Higher' },
              { value: 'lower', label: 'Lower' },
            ]}
            value={m.better}
            onChange={(better) => better && set({ better })}
            label="Better is"
          />
          <p className="mt-1 text-[11px] text-pt-faint">{def.hint}</p>
        </Field>
      </>
    )
  }
  return (
    <Field label="Total score" htmlFor={`outcome-value-${m.id}`} wide>
      <UnitInput id={`outcome-value-${m.id}`} value={valueText} onChange={setValueText} unit={`/ ${def.range.max}`} step={def.whole ? 1 : 0.1} />
      <p className="mt-1 text-[11px] text-pt-faint">{def.hint}</p>
    </Field>
  )
}

function SpecialTestFields({ m, set, region, valueText, setValueText }: FieldProps & ValueProps & { region: Region | null }) {
  const def = specialTestDef(m.key)
  const options = SPECIAL_TESTS.filter((d) => !region || d.region === region).map((d) => ({ value: d.key, label: d.label }))
  return (
    <>
      <Field label="Test" htmlFor={`test-key-${m.id}`}>
        <Choose id={`test-key-${m.id}`} value={m.key} onChange={(key) => set({ key })} options={options} placeholder="Pick a test" />
        {def && <p className="mt-1 text-[11px] text-pt-faint">Looks for: {def.checks}</p>}
      </Field>
      {def?.sided && <SideField m={m} set={set} optional />}
      <Field label="Result" wide>
        <Pills
          options={[
            { value: 'positive', label: 'Positive' },
            { value: 'negative', label: 'Negative' },
            { value: 'inconclusive', label: 'Inconclusive' },
          ]}
          value={m.result}
          onChange={(result) => result && set({ result })}
          label="Result"
        />
      </Field>
      {def?.angle && (
        <Field label="Angle (optional)" htmlFor={`test-angle-${m.id}`}>
          <UnitInput id={`test-angle-${m.id}`} value={valueText} onChange={setValueText} unit="°" placeholder="e.g. 45" />
          <p className="mt-1 text-[11px] text-pt-faint">Hip flexion when symptoms come on. A recorded angle charts across visits.</p>
        </Field>
      )}
    </>
  )
}

/** How to do the test, in the note: steps, what a positive means, and a demonstration video. */
function GuideBlock({ guide, isTest }: { guide: Guide; isTest: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl bg-pt-sunken">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-pt-ink"
      >
        <Info className="h-3.5 w-3.5 text-pt-muted" />
        How to do it{guide.youtubeId ? ' (with video)' : ''}
        <ChevronDown className={cn('ml-auto h-3.5 w-3.5 text-pt-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-pt-ink">
          <p>{guide.how}</p>
          {guide.positive && (
            <p>
              <span className="font-semibold">{isTest ? 'Positive: ' : 'Good to know: '}</span>
              {guide.positive}
            </p>
          )}
          {guide.caution && (
            <p className="flex items-start gap-1.5 rounded-lg bg-pt-amber-bg px-2 py-1.5 text-pt-amber-fg">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {guide.caution}
            </p>
          )}
          {guide.youtubeId && <VideoEmbed youtubeId={guide.youtubeId} className="rounded-xl" />}
          {guide.form && (
            <a href={guide.form.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
              {guide.form.label}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  )
}
