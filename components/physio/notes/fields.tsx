'use client'

import { Plus, X } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { fieldClass } from '@/components/physio/ui'
import { MAX_PSFS_ITEMS, walkSpeed, type ClinicalMeasure } from '@/convex/helpers/clinicalMeasures'
import { cn } from '@/lib/utils'
import { MiniLabel } from './bits'

/**
 * Inputs shared by the measure form and the re-test / quick set panel: a number with its unit,
 * the walking speed (entered as a time over a distance) and the PSFS activities.
 */

/** A typed number, accepting a comma as the decimal point; NaN when empty. */
export const parseNumber = (text: string | undefined) => (!text || text.trim() === '' ? Number.NaN : Number(text.replace(',', '.')))

export function UnitInput({
  id,
  value,
  onChange,
  unit,
  step = 1,
  placeholder,
  label,
  className,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  unit?: string
  step?: number
  placeholder?: string
  /** For inputs without a visible label */
  label?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        className={cn(fieldClass, 'h-10 tabular-nums', unit && 'pr-14')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
      {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-pt-muted">{unit}</span>}
    </div>
  )
}

/** The speed the time and distance give, or undefined until both make sense. */
export const speedFrom = (time: string | undefined, distance: string | undefined) => walkSpeed(parseNumber(distance), parseNumber(time))

/** The time over `distance` metres that gives `speed` (to show a saved speed as a time again). */
export const timeFor = (speed: number | undefined, distance: number) =>
  speed && speed > 0 ? String(Math.round((distance / speed) * 100) / 100) : ''

/** Walking speed, entered the way it's measured: the time over the distance timed. */
export function WalkTimeFields({
  idPrefix,
  time,
  distance,
  onTime,
  onDistance,
  hint = 'Time the middle 6 m of a 10 m walk.',
}: {
  idPrefix: string
  time: string
  distance: string
  onTime: (value: string) => void
  onDistance: (value: string) => void
  hint?: string
}) {
  const speed = speedFrom(time, distance)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
      <div>
        <MiniLabel htmlFor={`${idPrefix}-time`}>Time</MiniLabel>
        <UnitInput id={`${idPrefix}-time`} value={time} onChange={onTime} unit="s" step={0.01} placeholder="e.g. 5.2" />
      </div>
      <div>
        <MiniLabel htmlFor={`${idPrefix}-distance`}>Distance timed</MiniLabel>
        <UnitInput id={`${idPrefix}-distance`} value={distance} onChange={onDistance} unit="m" step={0.5} />
      </div>
      <p className="col-span-2 text-[11px] text-pt-faint" aria-live="polite">
        {speed !== undefined ? (
          <>
            Speed: <span className="font-semibold tabular-nums text-pt-ink">{speed} m/s</span> (saved as the result)
          </>
        ) : (
          hint
        )}
      </p>
    </div>
  )
}

export type PsfsRow = { activity: string; score: string }

export const blankRows = (n: number): PsfsRow[] => Array.from({ length: n }, () => ({ activity: '', score: '' }))

/** A PSFS starts with the same activities as last time (to score again), or three blank ones. */
export function startingPsfsRows(last?: ClinicalMeasure | null): PsfsRow[] {
  return last?.items?.length ? last.items.map((item) => ({ activity: item.activity, score: '' })) : blankRows(3)
}

/** The PSFS items from the rows, skipping empty ones. A missing score stays NaN so the check catches it. */
export function psfsItems(rows: PsfsRow[]) {
  return rows
    .filter((row) => row.activity.trim() || row.score.trim())
    .map((row) => ({ activity: row.activity.trim(), score: row.score.trim() === '' ? Number.NaN : Number(row.score) }))
}

/** Something has been entered: a score, or an activity on a new list. */
export const psfsStarted = (rows: PsfsRow[], prefilled: boolean) => rows.some((row) => row.score.trim() || (!prefilled && row.activity.trim()))

const PLACEHOLDERS = ['e.g. Climbing stairs', 'e.g. Getting out of a car', 'e.g. Walking 30 minutes', 'Another activity', 'Another activity']

export function PsfsFields({ rows, setRows, prefilled }: { rows: PsfsRow[]; setRows: (rows: PsfsRow[]) => void; prefilled: boolean }) {
  const update = (index: number, patch: Partial<PsfsRow>) => setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  return (
    <div className="space-y-2 sm:col-span-2">
      <p className="text-xs text-pt-muted">
        {prefilled
          ? 'The same activities as last time. Ask the patient to score each one again.'
          : 'Activities the patient finds hard, each scored 0 (unable) to 10 (able to do it as before).'}
      </p>
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            className={cn(fieldClass, 'h-10 min-w-0 flex-1')}
            value={row.activity}
            maxLength={80}
            onChange={(e) => update(index, { activity: e.target.value })}
            placeholder={PLACEHOLDERS[index]}
            aria-label={`Activity ${index + 1}`}
          />
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={10}
            className={cn(fieldClass, 'h-10 w-20 shrink-0 tabular-nums')}
            value={row.score}
            onChange={(e) => update(index, { score: e.target.value })}
            placeholder="0–10"
            aria-label={`Score for activity ${index + 1}`}
          />
          <button
            type="button"
            onClick={() => setRows(rows.filter((_, i) => i !== index))}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-pt-muted hover:bg-pt-rose-bg hover:text-pt-rose-fg disabled:opacity-40"
            disabled={rows.length <= 1}
            aria-label={`Remove activity ${index + 1}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {rows.length < MAX_PSFS_ITEMS && (
        <button
          type="button"
          onClick={() => setRows([...rows, ...blankRows(1)])}
          className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-pt-ink hover:underline sm:min-h-8"
        >
          <Plus className="h-3 w-3" />
          Add an activity (up to {MAX_PSFS_ITEMS})
        </button>
      )}
    </div>
  )
}
