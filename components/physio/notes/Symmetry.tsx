'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ArrowLeftRight } from '@/components/icons'
import {
  functionalDef,
  measureBetter,
  measureDetail,
  measureNumber,
  measureResult,
  measureTitle,
  romDef,
  seriesKey,
  type Better,
  type ClinicalMeasure,
  type Side,
} from '@/convex/helpers/clinicalMeasures'
import { cn } from '@/lib/utils'
import { Pills } from './bits'
import type { ClinicalNote } from './progress'

/**
 * A limb symmetry index (LSI) of 90% or more is a common criterion before returning to sport,
 * for example for strength and hop tests after ACL reconstruction (Grindem et al. 2016 and
 * Kyritsis et al. 2016, both Br J Sports Med). It's one guide among several, not a pass mark.
 */
export const LSI_TARGET = 90

/** Measures where one side as a percentage of the other means something (not grades or deficits). */
function hasRatio(m: ClinicalMeasure): boolean {
  switch (m.kind) {
    case 'rom': {
      const def = romDef(m.key)
      return Boolean(def?.sided && def.better === 'higher')
    }
    case 'strength':
      return m.method === 'dynamometer'
    case 'functional':
      return functionalDef(m.key)?.sided ?? false
    case 'outcome':
      return m.key === 'custom'
    default:
      return false
  }
}

export type SidePair = {
  key: string
  title: string
  detail: string
  better: Better
  left: ClinicalMeasure
  right: ClinicalMeasure
  leftValue: number
  rightValue: number
}

/** Left and right of the same test, measured the same way, from one visit's measures. */
export function sidePairs(measures: ClinicalMeasure[]): SidePair[] {
  const bySide = new Map<string, { left?: ClinicalMeasure; right?: ClinicalMeasure }>()
  for (const m of measures) {
    if (!m.side || !hasRatio(m) || measureNumber(m) === null) continue
    const key = seriesKey({ ...m, side: undefined })
    if (!key) continue
    const sides = bySide.get(key) ?? {}
    if (m.side === 'left') sides.left = m
    else sides.right = m
    bySide.set(key, sides)
  }
  const pairs: SidePair[] = []
  for (const [key, { left, right }] of bySide) {
    if (!left || !right) continue
    pairs.push({
      key,
      title: measureTitle(left),
      detail: measureDetail({ ...left, side: undefined }),
      better: measureBetter(left),
      left,
      right,
      leftValue: measureNumber(left) ?? 0,
      rightValue: measureNumber(right) ?? 0,
    })
  }
  return pairs
}

/** The weaker side: the lower value where higher is better, the higher one where lower is better. */
export function worseSide(pair: SidePair): Side {
  const leftWorse = pair.better === 'higher' ? pair.leftValue < pair.rightValue : pair.leftValue > pair.rightValue
  return leftWorse ? 'left' : 'right'
}

/**
 * Involved ÷ uninvolved × 100. For tests where lower is better (timed), it's uninvolved ÷
 * involved, so a slower involved side still reads below 100%.
 */
export function symmetryIndex(pair: SidePair, involved: Side): number | null {
  const mine = involved === 'left' ? pair.leftValue : pair.rightValue
  const other = involved === 'left' ? pair.rightValue : pair.leftValue
  const ratio = pair.better === 'higher' ? (other > 0 ? mine / other : null) : mine > 0 ? other / mine : null
  return ratio === null || !Number.isFinite(ratio) ? null : Math.round(ratio * 100)
}

/** The side a condition names ("Right ACL reconstruction"), if it names just one. */
export function sideFromText(text?: string | null): Side | null {
  const lower = text?.toLowerCase() ?? ''
  const left = /\b(left|lt)\b/.test(lower)
  const right = /\b(right|rt)\b/.test(lower)
  return left !== right ? (left ? 'left' : 'right') : null
}

export type SymmetryItem = { pair: SidePair; date?: number; first?: { pair: SidePair; date: number } }

/** For progress: each test's latest left–right pair, with its first one when they differ. */
export function symmetryHistory(notes: ClinicalNote[]): SymmetryItem[] {
  const items = new Map<string, SymmetryItem>()
  for (const note of [...notes].sort((a, b) => a.sessionDate - b.sessionDate)) {
    for (const pair of sidePairs(note.measures)) {
      const known = items.get(pair.key)
      items.set(pair.key, {
        pair,
        date: note.sessionDate,
        first: known ? known.first ?? { pair: known.pair, date: known.date ?? note.sessionDate } : undefined,
      })
    }
  }
  return [...items.values()].sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
}

type Involved = 'auto' | Side

const INVOLVED_OPTIONS: { value: Involved; label: string }[] = [
  { value: 'auto', label: 'Weaker side' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
]

function Index({ value }: { value: number | null }) {
  if (value === null) return <span className="text-sm text-pt-muted">—</span>
  const meets = value >= LSI_TARGET
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        meets ? 'bg-pt-green-bg text-pt-green-fg' : 'bg-pt-amber-bg text-pt-amber-fg'
      )}
      title={meets ? `At or above ${LSI_TARGET}%` : `Below ${LSI_TARGET}%`}
    >
      {value}%
    </span>
  )
}

/**
 * Left against right for tests done on both sides at the same visit: the involved side as a
 * percentage of the other (limb symmetry index). The physio says which side is involved; until
 * then it's the weaker side on each test, or the side the condition names.
 */
export function SymmetryList({
  items,
  defaultInvolved = null,
  className,
}: {
  items: SymmetryItem[]
  /** The side the condition names */
  defaultInvolved?: Side | null
  className?: string
}) {
  const [involved, setInvolved] = useState<Involved>(defaultInvolved ?? 'auto')
  if (items.length === 0) return null
  const sideOf = (pair: SidePair): Side => (involved === 'auto' ? worseSide(pair) : involved)

  return (
    <div className={cn('space-y-3 rounded-2xl border border-pt-line p-3 sm:p-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-pt-ink">
          <ArrowLeftRight className="h-3.5 w-3.5 text-pt-muted" />
          Left vs right
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-pt-muted">Involved</span>
          <Pills options={INVOLVED_OPTIONS} value={involved} onChange={(next) => next && setInvolved(next)} label="Involved side" size="sm" />
        </div>
      </div>
      <ul className="divide-y divide-pt-line">
        {items.map(({ pair, date, first }) => {
          const side = sideOf(pair)
          const index = symmetryIndex(pair, side)
          const firstIndex = first ? symmetryIndex(first.pair, involved === 'auto' ? side : involved) : null
          return (
            <li key={pair.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
              <div className="min-w-[9rem] flex-1">
                <p className="text-sm font-medium text-pt-ink">{pair.title}</p>
                <p className="text-xs text-pt-muted">
                  {[pair.detail, `${side === 'left' ? 'Left' : 'Right'} involved`, date ? format(date, 'd MMM') : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <p className="text-xs tabular-nums text-pt-muted">
                L <span className="font-semibold text-pt-ink">{measureResult(pair.left)}</span> · R{' '}
                <span className="font-semibold text-pt-ink">{measureResult(pair.right)}</span>
              </p>
              <div className="flex items-center gap-1.5">
                {first && firstIndex !== null && (
                  <span className="text-xs tabular-nums text-pt-faint" title={`On ${format(first.date, 'd MMM yyyy')}`}>
                    {firstIndex}% →
                  </span>
                )}
                <Index value={index} />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-[11px] leading-relaxed text-pt-faint">
        The involved side as a percentage of the other. {LSI_TARGET}% or more is a common guide before a return to sport, alongside
        how the patient feels and moves.
      </p>
    </div>
  )
}
