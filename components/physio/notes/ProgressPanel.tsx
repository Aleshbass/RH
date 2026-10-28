'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ChevronDown, LineChart } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { measureDetail, measureResult, measureTitle, type ClinicalMeasure } from '@/convex/helpers/clinicalMeasures'
import { EmptyState, LoadingBlocks, Panel } from '@/components/physio/ui'
import { Sparkline } from '@/components/physio/workspace/shared'
import { cn } from '@/lib/utils'
import { ProgressChart } from './ProgressChart'
import { SymmetryList, sideFromText, symmetryHistory } from './Symmetry'
import { CHANGE_TONES, buildSeries, changeSince, readNotes, type ClinicalNote } from './progress'

// Untyped reference: the generated api object is at TypeScript's depth limit in this repo.
// Measures across the whole record (getClinicalNotes returns only the newest notes).
const getClinicalNoteMeasures = makeFunctionReference<'query', { patientId: Id<'users'> }, unknown>('physioCare:getClinicalNoteMeasures')
// Questionnaires the patient completed (or the physio entered), by series
const questionnaireSeries = makeFunctionReference<'query', { patientId: Id<'users'> }, unknown>('questionnaires:seriesForPatient')

/**
 * Questionnaire scores that match a catalogue measure (LEFS, SPADI, PSFS, pain), as one-measure
 * "notes", so a patient's own answers chart in the same series as scores taken in clinic.
 */
function questionnaireNotes(result: unknown): ClinicalNote[] {
  if (!Array.isArray(result)) return []
  const notes: ClinicalNote[] = []
  for (const series of result as { points?: { date: number; questionnaireId: string; measure: ClinicalMeasure | null }[] }[]) {
    for (const point of series.points ?? []) {
      if (point.measure) {
        notes.push({ _id: `q-${point.questionnaireId}`, sessionDate: point.date, noteType: 'questionnaire', measures: [point.measure] })
      }
    }
  }
  return notes
}

const PAGE = 8

/**
 * Progress from the measures in clinical notes (the whole care team's): each thing measured at
 * two or more visits, how it started, where it is now and whether that's a real change. Open a
 * row for its chart. Left and right are compared where both sides were measured at a visit.
 */
export function ProgressPanel({
  patientId,
  targets,
  condition,
}: {
  patientId: Id<'users'>
  /** Goal targets by series key (seriesKey in convex/helpers/clinicalMeasures.ts), drawn on the charts */
  targets?: Record<string, number>
  /** The care episode's condition, to start "Left vs right" on the side it names */
  condition?: string | null
}) {
  const result = useQuery(getClinicalNoteMeasures, { patientId })
  const notes = useMemo(() => readNotes(result), [result])
  const answered = useQuery(questionnaireSeries, { patientId })
  const fromQuestionnaires = useMemo(() => questionnaireNotes(answered), [answered])
  const allSeries = useMemo(() => buildSeries(notes && [...notes, ...fromQuestionnaires]), [notes, fromQuestionnaires])
  const symmetry = useMemo(() => symmetryHistory(notes ?? []), [notes])
  const [shown, setShown] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)

  if (notes === undefined) {
    return (
      <Panel title="Progress">
        <LoadingBlocks rows={2} className="px-5 pb-5 sm:px-6" />
      </Panel>
    )
  }
  const series = allSeries.slice(0, shown)
  const measuredOnce = notes.some((n) => n.measures.length > 0)

  return (
    <Panel
      title="Progress"
      info="Measures from the clinical notes (range of motion, strength, functional tests, pain, outcome measures), once something has been measured at two or more visits. A change only counts as better or worse when it's bigger than that measure's measurement error."
    >
      {series.length === 0 ? (
        <EmptyState
          icon={<LineChart />}
          title={measuredOnce ? 'Measure again at the next visit' : 'Nothing measured yet'}
          description={
            measuredOnce
              ? 'Use “Repeat last measures” in your next note and the change shows here.'
              : 'Record range of motion, a functional test or a pain score in your next note to track progress.'
          }
        />
      ) : (
        <div className="px-5 pb-4 sm:px-6">
          <ul className="divide-y divide-pt-line">
            {series.map((s) => {
              const firstPoint = s.points[0]
              const lastPoint = s.points[s.points.length - 1]
              const change = changeSince(s.latest, { value: firstPoint.value, date: firstPoint.date, measure: s.first })
              const detail = measureDetail(s.latest)
              const expanded = open === s.key
              const chartId = `progress-chart-${s.key.replace(/[^a-z0-9]+/gi, '-')}`
              return (
                <li key={s.key} className="py-1">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : s.key)}
                    aria-expanded={expanded}
                    aria-controls={chartId}
                    className="-mx-2 flex w-[calc(100%+1rem)] flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-pt-hover"
                  >
                    <div className="min-w-[10rem] flex-1">
                      <p className="text-sm font-medium text-pt-ink">{measureTitle(s.latest)}</p>
                      {detail && s.latest.kind !== 'psfs' && <p className="text-xs text-pt-muted">{detail}</p>}
                      <p className="text-xs text-pt-faint">
                        {s.points.length} visits · {format(firstPoint.date, 'd MMM')} – {format(lastPoint.date, 'd MMM')}
                      </p>
                    </div>
                    <Sparkline points={s.points.map((p) => p.value)} label={`${measureTitle(s.latest)} over ${s.points.length} visits`} className="h-8 w-24 sm:w-28" />
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-sm tabular-nums text-pt-muted">
                          {measureResult(s.first)} → <span className="font-semibold text-pt-ink">{measureResult(s.latest)}</span>
                        </p>
                        {change && (
                          <span
                            className={cn('mt-0.5 inline-flex rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums', CHANGE_TONES[change.tone])}
                            title={change.title}
                          >
                            {change.tone === 'same' ? 'No change' : change.tone === 'noise' ? `${change.text}, within error` : `${change.text} overall`}
                          </span>
                        )}
                      </div>
                      <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-pt-muted transition-transform motion-reduce:transition-none', expanded && 'rotate-180')} />
                    </div>
                  </button>
                  {expanded && (
                    <div id={chartId} className="pb-3 pt-1">
                      <ProgressChart series={s} target={targets?.[s.key]} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {allSeries.length > PAGE && (
            <button
              type="button"
              onClick={() => setShown(shown >= allSeries.length ? PAGE : allSeries.length)}
              className="mt-1 inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-medium text-pt-ink hover:underline"
            >
              <ChevronDown className={cn('h-3.5 w-3.5', shown >= allSeries.length && 'rotate-180')} />
              {shown >= allSeries.length ? 'Show fewer' : `Show all ${allSeries.length} measures`}
            </button>
          )}
        </div>
      )}
      {symmetry.length > 0 && <SymmetryList items={symmetry} defaultInvolved={sideFromText(condition)} className="mx-5 mb-5 sm:mx-6" />}
    </Panel>
  )
}
