'use client'

/**
 * Links a care-plan goal to a measured target: a measure already recorded for this patient, or
 * one from the catalogue (with side and method, so later notes line up with it), and the value
 * to aim for. The baseline is the first value recorded in this course of care; the server fills
 * it in on save. Used by CarePlanDrawer.
 */

import { useId, useMemo } from 'react'
import { format } from 'date-fns'
import { Plus, Target, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fieldClass } from '@/components/physio/ui'
import { cn } from '@/lib/utils'
import {
  FUNCTIONAL,
  MAS_GRADES,
  MMT_GRADES,
  OUTCOMES,
  PAIN_AREAS,
  PAIN_CONTEXTS,
  ROM,
  SPECIAL_TESTS,
  STRENGTH,
  STRENGTH_METHOD_LABELS,
  functionalDef,
  measureBetter,
  measureDetail,
  measureNumber,
  measureResult,
  measureTitle,
  measureUnit,
  outcomeDef,
  romDef,
  seriesKey,
  specialTestDef,
  strengthDef,
  type ClinicalMeasure,
  type StrengthMethod,
} from '@/convex/helpers/clinicalMeasures'
import {
  cleanGoalMeasure,
  firstValueSince,
  goalTemplate,
  goalValueText,
  linkFromMeasure,
  seriesPoints,
  templateSeriesKey,
  type GoalMeasure,
  type MeasuredNote,
} from '@/convex/helpers/goalMeasures'

/** A goal's measured target while the plan is being edited. */
export type MeasureDraft = {
  /** The measure without a value; null until one is picked */
  template: ClinicalMeasure | null
  target: string
  /** The baseline already stored for this goal, with the series it belongs to */
  baseline?: { key: string; value: number; at?: number }
}

export const measureDraftFromLink = (link: GoalMeasure): MeasureDraft => ({
  template: goalTemplate(link),
  target: String(link.target),
  baseline: link.baseline !== undefined ? { key: link.seriesKey, value: link.baseline, at: link.baselineAt } : undefined,
})

/** The link to save, or what's missing in words for the physio. */
export function linkFromDraft(draft: MeasureDraft): { link: GoalMeasure; error?: undefined } | { error: string } {
  if (!draft.template) return { error: 'Pick the measure for each measured target, or remove it.' }
  const name = measureTitle(draft.template)
  const target = Number(draft.target.trim().replace(',', '.'))
  if (!draft.target.trim() || !Number.isFinite(target)) return { error: `Set a target for ${name}.` }
  const link = linkFromMeasure(draft.template, target)
  if (!link) return { error: `${name} has no number to aim for.` }
  try {
    cleanGoalMeasure(link)
  } catch (error) {
    const data = (error as { data?: unknown }).data
    return { error: typeof data === 'string' ? data : `Check the target for ${name}.` }
  }
  return { link }
}

/** A measure without undefined fields, as notes store them. */
function make(fields: Partial<ClinicalMeasure> & Pick<ClinicalMeasure, 'kind' | 'key'>): ClinicalMeasure {
  const measure: Record<string, unknown> = { id: 'goal', ...fields }
  for (const key of Object.keys(measure)) {
    if (measure[key] === undefined) delete measure[key]
  }
  return measure as ClinicalMeasure
}

type DetailField = 'side' | 'method' | 'location' | 'context'

type CatalogueOption = { value: string; label: string; template: ClinicalMeasure }

const CATALOGUE: { label: string; options: CatalogueOption[] }[] = [
  {
    label: 'Range of motion',
    options: ROM.map((d) => ({ value: `c:rom:${d.key}`, label: d.title, template: make({ kind: 'rom', key: d.key, method: 'arom' }) })),
  },
  {
    label: 'Strength',
    options: STRENGTH.map((d) => ({ value: `c:strength:${d.key}`, label: d.label, template: make({ kind: 'strength', key: d.key, method: d.methods[0] }) })),
  },
  {
    label: 'Functional tests',
    options: FUNCTIONAL.map((d) => ({ value: `c:functional:${d.key}`, label: d.label, template: make({ kind: 'functional', key: d.key }) })),
  },
  {
    label: 'Pain and outcome measures',
    options: [
      { value: 'c:pain:nprs', label: 'Pain (NPRS)', template: make({ kind: 'pain', key: 'nprs' }) },
      { value: 'c:psfs:psfs', label: 'Patient-Specific Functional Scale', template: make({ kind: 'psfs', key: 'psfs' }) },
      ...OUTCOMES.filter((o) => o.key !== 'mas' && o.key !== 'custom').map((o) => ({
        value: `c:outcome:${o.key}`,
        label: o.label,
        template: make({ kind: 'outcome', key: o.key }),
      })),
    ],
  },
  {
    label: 'Special tests',
    options: SPECIAL_TESTS.filter((t) => t.angle).map((t) => ({
      value: `c:special_test:${t.key}`,
      label: `${t.label}, angle`,
      template: make({ kind: 'special_test', key: t.key }),
    })),
  },
]
const CATALOGUE_BY_VALUE = new Map(CATALOGUE.flatMap((group) => group.options.map((o) => [o.value, o] as const)))

/** Whether a measure is recorded per side, by its catalogue entry. */
function isSided(m: ClinicalMeasure) {
  if (m.kind === 'rom') return Boolean(romDef(m.key)?.sided)
  if (m.kind === 'strength') return Boolean(strengthDef(m.key)?.sided)
  if (m.kind === 'functional') return Boolean(functionalDef(m.key)?.sided)
  if (m.kind === 'special_test') return Boolean(specialTestDef(m.key)?.sided)
  return false
}

/** What the target box is measured in: "°", "s", "/10", "/56". */
function targetUnit(m: ClinicalMeasure) {
  if (m.kind === 'pain' || m.kind === 'psfs') return '/10'
  if (m.kind === 'outcome' && m.key !== 'custom') return `/${outcomeDef(m.key)?.range.max ?? ''}`
  if (m.kind === 'special_test') return '°'
  return measureUnit(m).trim()
}

type Recorded = { key: string; latest: ClinicalMeasure; value: number; date: number }

/** Every numeric measure this patient has on record, most recently measured first. */
function recordedSeries(notes: readonly MeasuredNote[] | undefined): Recorded[] {
  const byKey = new Map<string, Recorded>()
  for (const note of notes ?? []) {
    for (const measure of note.measures ?? []) {
      const key = seriesKey(measure)
      const value = measureNumber(measure)
      if (key === null || value === null) continue
      const known = byKey.get(key)
      if (!known || known.date <= note.sessionDate) byKey.set(key, { key, latest: measure, value, date: note.sessionDate })
    }
  }
  return [...byKey.values()].sort((a, b) => b.date - a.date)
}

const selectClass = cn(fieldClass, 'h-11 w-full border px-3 text-sm')

export function GoalMeasureField({
  value,
  onChange,
  notes,
  since,
  goalLabel,
}: {
  value: MeasureDraft | undefined
  onChange: (next: MeasureDraft | undefined) => void
  /** The patient's measured notes (physioCare.getClinicalNoteMeasures), the same set the server reads baselines from */
  notes: readonly MeasuredNote[] | undefined
  /** Start of this course of care: the baseline is the first value from then on */
  since: number
  goalLabel: string
}) {
  const id = useId()
  const recorded = useMemo(() => recordedSeries(notes), [notes])

  if (!value) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="h-10 rounded-lg px-2 text-sm text-pt-ink hover:bg-pt-surface"
        onClick={() => onChange({ template: null, target: '' })}
        aria-label={`Add a measured target to ${goalLabel}`}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Measured target
      </Button>
    )
  }

  const template = value.template
  const key = template ? templateSeriesKey(template) : null
  const fromRecord = Boolean(key && recorded.some((r) => r.key === key))
  const selected = !template ? '' : fromRecord ? `s:${key}` : `c:${template.kind}:${template.key}`
  const catalogueKnown = CATALOGUE_BY_VALUE.has(selected)

  const pick = (choice: string) => {
    if (!choice) return onChange({ ...value, template: null })
    if (choice.startsWith('s:')) {
      const series = recorded.find((r) => `s:${r.key}` === choice)
      if (series) onChange({ ...value, template: goalTemplate(series.latest) })
      return
    }
    const option = CATALOGUE_BY_VALUE.get(choice)
    if (option) onChange({ ...value, template: { ...option.template } })
  }
  const setField = (field: DetailField, next: string) => {
    if (!template) return
    const changed: Record<string, unknown> = { ...template }
    changed[field] = next || undefined
    onChange({ ...value, template: make(changed as ClinicalMeasure) })
  }

  // Baseline: the one stored for this series, else the first value since care began
  const stored = value.baseline && value.baseline.key === key ? value.baseline : null
  const first = key && !stored ? firstValueSince(notes, key, since) : null
  const baseline = stored ? { value: stored.value, at: stored.at } : first ? { value: first.value, at: first.date } : null
  const points = key ? seriesPoints(notes, key) : []
  const latest = points[points.length - 1]

  const editable = Boolean(template && !fromRecord)
  const graded =
    template && template.kind === 'strength' && template.method !== 'dynamometer'
      ? MMT_GRADES
      : template && template.kind === 'outcome' && template.key === 'mas'
        ? MAS_GRADES
        : null
  const unit = template ? targetUnit(template) : ''

  return (
    <div className="space-y-2.5 rounded-xl border border-pt-line bg-pt-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-pt-ink">
          <Target className="h-3.5 w-3.5" />
          Measured target
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 text-pt-faint hover:bg-pt-hover hover:text-pt-rose-fg"
          onClick={() => onChange(undefined)}
          aria-label={`Remove the measured target from ${goalLabel}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div>
        <label htmlFor={`${id}-measure`} className="sr-only">
          Measure
        </label>
        <select id={`${id}-measure`} value={selected} onChange={(e) => pick(e.target.value)} className={selectClass}>
          <option value="">Choose a measure</option>
          {selected && !fromRecord && !catalogueKnown && template && <option value={selected}>{measureTitle(template)}</option>}
          {recorded.length > 0 && (
            <optgroup label="Recorded for this patient">
              {recorded.map((r) => {
                const detail = r.latest.kind === 'psfs' ? '' : measureDetail(r.latest)
                return (
                  <option key={r.key} value={`s:${r.key}`}>
                    {measureTitle(r.latest)}
                    {detail ? ` · ${detail}` : ''} · last {measureResult(r.latest)}
                  </option>
                )
              })}
            </optgroup>
          )}
          {CATALOGUE.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {template && fromRecord && measureDetail(template) && template.kind !== 'psfs' && (
        <p className="text-xs text-pt-muted">{measureDetail(template)}</p>
      )}

      {editable && template && <CatalogueDetails id={id} template={template} onField={setField} />}

      {template && (
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-target`} className="shrink-0 text-sm text-pt-muted">
            Target
          </label>
          {graded ? (
            <select id={`${id}-target`} value={value.target} onChange={(e) => onChange({ ...value, target: e.target.value })} className={cn(selectClass, 'w-32')}>
              <option value="">Grade</option>
              {graded.map((g) => (
                <option key={g.label} value={String(g.value)}>
                  {g.label}
                  {template.kind === 'strength' ? '/5' : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                id={`${id}-target`}
                className={cn(fieldClass, 'h-11 w-28')}
                inputMode="decimal"
                value={value.target}
                onChange={(e) => onChange({ ...value, target: e.target.value.replace(/[^\d.,-]/g, '') })}
                placeholder="e.g. 120"
              />
              {unit && <span className="text-sm text-pt-muted">{unit}</span>}
            </div>
          )}
        </div>
      )}

      {template && (
        <p className="text-xs text-pt-muted">
          {baseline
            ? `Baseline ${goalValueText(template, baseline.value)}${baseline.at ? ` (${format(baseline.at, 'd MMM')})` : ''}`
            : 'No value yet. The first one you record becomes the baseline.'}
          {latest && baseline && latest.date !== baseline.at ? ` · latest ${goalValueText(template, latest.value)}` : ''}
          {` · ${measureBetter(template) === 'lower' ? 'Lower' : 'Higher'} is better`}
        </p>
      )}
    </div>
  )
}

/** Side, method and test conditions for a catalogue measure, so later notes match it. */
function CatalogueDetails({
  id,
  template,
  onField,
}: {
  id: string
  template: ClinicalMeasure
  onField: (field: DetailField, value: string) => void
}) {
  const fields: { field: DetailField; label: string; value: string; options: { value: string; label: string }[]; empty?: string }[] = []
  if (isSided(template)) {
    fields.push({
      field: 'side',
      label: 'Side',
      value: template.side ?? '',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
      ],
      empty: 'Choose side',
    })
  }
  if (template.kind === 'rom') {
    fields.push({
      field: 'method',
      label: 'Method',
      value: template.method ?? 'arom',
      options: [
        { value: 'arom', label: 'Active (AROM)' },
        { value: 'prom', label: 'Passive (PROM)' },
      ],
    })
  }
  const strength = template.kind === 'strength' ? strengthDef(template.key) : null
  if (strength && strength.methods.length > 1) {
    fields.push({
      field: 'method',
      label: 'Method',
      value: template.method ?? strength.methods[0],
      options: strength.methods.map((m: StrengthMethod) => ({ value: m, label: STRENGTH_METHOD_LABELS[m] })),
    })
  }
  const condition = template.kind === 'functional' ? functionalDef(template.key)?.condition : undefined
  if (condition) {
    fields.push({
      field: 'context',
      label: condition.label,
      value: template.context ?? '',
      options: condition.options.map((o) => ({ value: o, label: o })),
      empty: 'Not recorded',
    })
  }
  if (template.kind === 'pain') {
    fields.push({
      field: 'location',
      label: 'Where',
      value: template.location ?? '',
      options: PAIN_AREAS.map((a) => ({ value: a, label: a })),
      empty: 'Not recorded',
    })
    fields.push({
      field: 'context',
      label: 'When',
      value: template.context ?? '',
      options: PAIN_CONTEXTS.map((c) => ({ value: c.key, label: c.label })),
      empty: 'Not recorded',
    })
  }
  if (fields.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-2">
      {fields.map((f) => (
        <div key={f.field} className="min-w-0">
          <label htmlFor={`${id}-${f.field}`} className="mb-1 block text-xs text-pt-muted">
            {f.label}
          </label>
          <select id={`${id}-${f.field}`} value={f.value} onChange={(e) => onField(f.field, e.target.value)} className={selectClass}>
            {f.empty && <option value="">{f.empty}</option>}
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
