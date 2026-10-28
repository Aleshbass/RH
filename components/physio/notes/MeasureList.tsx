'use client'

import { format } from 'date-fns'
import { ClipboardCheck, ClipboardList, Dumbbell, HeartPulse, Pencil, Ruler, Stethoscope, Timer, Trash2, type IconComponent } from '@/components/icons'
import { measureDetail, measureResult, measureTitle, seriesKey, type ClinicalMeasure, type MeasureKind } from '@/convex/helpers/clinicalMeasures'
import { cn } from '@/lib/utils'
import { CHANGE_TONES, changeSince, type Previous } from './progress'

export const KIND_ICONS: Record<MeasureKind, IconComponent> = {
  rom: Ruler,
  strength: Dumbbell,
  functional: Timer,
  pain: HeartPulse,
  psfs: ClipboardList,
  outcome: ClipboardCheck,
  special_test: Stethoscope,
}

const RESULT_TONES: Record<string, string> = {
  Positive: 'text-pt-rose-fg',
  Negative: 'text-pt-green-fg',
}

/**
 * A note's measures, one per row: what, how, the result, and how it moved since the last time
 * it was measured. Rows can be edited and removed while the note is being written.
 */
export function MeasureList({
  measures,
  previous,
  onEdit,
  onRemove,
  editingId,
  compact = false,
  className,
}: {
  measures: ClinicalMeasure[]
  previous?: Map<string, Previous>
  onEdit?: (measure: ClinicalMeasure) => void
  onRemove?: (id: string) => void
  editingId?: string | null
  compact?: boolean
  className?: string
}) {
  if (measures.length === 0) return null
  return (
    <ul className={cn('divide-y divide-pt-line overflow-hidden rounded-2xl border border-pt-line bg-pt-surface', className)}>
      {measures.map((measure) => {
        const Icon = KIND_ICONS[measure.kind]
        const key = seriesKey(measure)
        const before = key ? previous?.get(key) : undefined
        const change = changeSince(measure, before)
        const result = measureResult(measure)
        const detail = measureDetail(measure)
        return (
          <li
            key={measure.id}
            className={cn('flex items-start gap-3', compact ? 'px-3 py-2' : 'px-3.5 py-2.5', editingId === measure.id && 'bg-pt-sunken')}
          >
            {!compact && (
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-pt-sunken text-pt-muted" aria-hidden>
                <Icon className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className={cn('font-medium text-pt-ink', compact ? 'text-xs' : 'text-sm')}>{measureTitle(measure)}</p>
              {detail && <p className={cn('text-pt-muted', compact ? 'text-[11px]' : 'text-xs')}>{detail}</p>}
              {measure.notes && !compact && <p className="mt-0.5 text-xs italic text-pt-muted">{measure.notes}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className={cn('font-semibold tabular-nums text-pt-ink', compact ? 'text-xs' : 'text-sm', RESULT_TONES[result.split(' · ')[0]])}>{result}</p>
              {change && before && (
                <p
                  className={cn('mt-0.5 inline-flex rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums', CHANGE_TONES[change.tone])}
                  title={`Last measured ${format(before.date, 'd MMM yyyy')}: ${measureResult(before.measure)}. ${change.title}`}
                >
                  {change.text}
                  {!compact && change.tone === 'noise' && <span className="ml-1 font-normal opacity-80">within error</span>}
                  {!compact && change.tone !== 'same' && change.tone !== 'noise' && (
                    <span className="ml-1 font-normal opacity-80">since {format(before.date, 'd MMM')}</span>
                  )}
                </p>
              )}
            </div>
            {(onEdit || onRemove) && (
              <div className="-my-1 -mr-1.5 flex shrink-0 items-center">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(measure)}
                    className="grid h-10 w-10 place-items-center rounded-lg text-pt-muted transition hover:bg-pt-hover hover:text-pt-ink sm:h-9 sm:w-9"
                    aria-label={`Edit ${measureTitle(measure)}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(measure.id)}
                    className="grid h-10 w-10 place-items-center rounded-lg text-pt-muted transition hover:bg-pt-rose-bg hover:text-pt-rose-fg sm:h-9 sm:w-9"
                    aria-label={`Remove ${measureTitle(measure)}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
