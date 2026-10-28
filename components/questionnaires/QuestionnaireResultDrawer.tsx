'use client'

import { useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { useMutation, useQuery } from 'convex/react'
import { LoadingBlocks, PhysioDrawer, StatusBadge } from '@/components/physio/ui'
import type { Id } from '@/convex/_generated/dataModel'
import { answerLabel, instrumentDef } from '@/lib/questionnaires/instruments'
import { compareScores, directionText, isAnswered, scoreText } from '@/lib/questionnaires/scoring'
import { cn } from '@/lib/utils'
import { changeLabel, changeTone } from './display'
import { questionnaireRefs, type QuestionnaireSummary } from './refs'

/**
 * One completed questionnaire: the score and how it moved since the time before, the subscales,
 * and every answer as the patient gave it. Opening it marks it as seen for the physio who asked.
 */
export function QuestionnaireResultDrawer({
  id,
  onOpenChange,
  history,
  onSelect,
}: {
  id: Id<'patientQuestionnaires'> | null
  onOpenChange: (open: boolean) => void
  /** Completed ones of the same questionnaire, newest first, to step between */
  history: QuestionnaireSummary[]
  onSelect: (id: Id<'patientQuestionnaires'>) => void
}) {
  const result = useQuery(questionnaireRefs.getResult, id ? { id } : 'skip')
  const markReviewed = useMutation(questionnaireRefs.markReviewed)
  const marked = useRef<string | null>(null)

  useEffect(() => {
    if (result?.canMarkReviewed && marked.current !== result._id) {
      marked.current = result._id
      void markReviewed({ id: result._id }).catch(() => undefined)
    }
  }, [result, markReviewed])

  const def = result ? instrumentDef(result.instrument) : undefined
  const change = def && result?.previous ? compareScores(def, result.previous.total, result.total) : null

  return (
    <PhysioDrawer
      open={id !== null}
      onOpenChange={onOpenChange}
      title={def ? `${def.short}${result?.completedAt ? ` · ${format(result.completedAt, 'd MMM yyyy')}` : ''}` : 'Questionnaire'}
      description={def?.name}
      className="sm:max-w-lg"
    >
      {result === undefined ? (
        <LoadingBlocks rows={3} />
      ) : result === null || !def ? (
        <p className="text-sm text-pt-muted">This questionnaire isn’t available.</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl bg-pt-sunken p-4">
            <p className="text-xs font-medium text-pt-muted">{def.totalLabel}</p>
            <p className="mt-0.5 text-3xl font-semibold tabular-nums tracking-tight text-pt-ink">{scoreText(def, result.total)}</p>
            <p className="mt-1 text-xs text-pt-muted">{directionText(def)}</p>
            {change && result.previous && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-pt-muted">
                <StatusBadge tone={changeTone(change)}>
                  <span title={change.title}>{changeLabel(def, change)}</span>
                </StatusBadge>
                <span>
                  since {format(result.previous.completedAt, 'd MMM')} ({scoreText(def, result.previous.total)})
                </span>
              </div>
            )}
            {change && <p className="mt-2 text-xs text-pt-muted">{change.title}</p>}
          </section>

          {result.subscales.length > 0 && def.key !== 'nprs' && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-pt-ink">Scales</h3>
              <ul className="divide-y divide-pt-line rounded-2xl border border-pt-line">
                {result.subscales.map((s) => {
                  const before = result.previous?.subscales.find((p) => p.key === s.key)?.value
                  const delta = before !== undefined && before !== null && s.value !== null ? Math.round((s.value - before) * 10) / 10 : null
                  return (
                    <li key={s.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="text-pt-ink">{s.label}</span>
                      <span className="tabular-nums text-pt-ink">
                        <span className="font-semibold">{scoreText(def, s.value)}</span>
                        {delta !== null && delta !== 0 && (
                          <span className="ml-2 text-xs text-pt-muted">
                            {delta > 0 ? '+' : '−'}
                            {Math.abs(delta)}
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {def.kind === 'psfs' ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-pt-ink">Activities (0 unable, 10 as before the problem)</h3>
              <ul className="divide-y divide-pt-line rounded-2xl border border-pt-line">
                {result.psfs.map((a) => {
                  const before = result.previous?.psfs.find((p) => p.activity.toLowerCase() === a.activity.toLowerCase())?.score
                  return (
                    <li key={a.activity} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 text-pt-ink">{a.activity}</span>
                      <span className="shrink-0 tabular-nums text-pt-ink">
                        {before !== undefined && before !== null && <span className="mr-1.5 text-xs text-pt-muted">{before} →</span>}
                        <span className="font-semibold">{a.score ?? '—'}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-pt-ink">Answers</h3>
              {def.sections.map((section) => {
                const items = def.items.map((item, i) => ({ item, i })).filter(({ item }) => item.section === section.id)
                if (items.length === 0) return null
                return (
                  <div key={section.id} className="mb-4">
                    {def.sections.length > 1 && <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-pt-faint">{section.title}</p>}
                    <ol className="divide-y divide-pt-line rounded-2xl border border-pt-line">
                      {items.map(({ item, i }) => {
                        const value = result.answers[i]
                        return (
                          <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                            <span className="min-w-0 text-pt-ink">
                              <span className="mr-1.5 tabular-nums text-pt-faint">{i + 1}.</span>
                              {item.text}
                            </span>
                            <span className={cn('shrink-0 text-right', isAnswered(value) ? 'font-medium text-pt-ink' : 'italic text-pt-faint')}>
                              {answerLabel(def, i, value)}
                            </span>
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                )
              })}
            </section>
          )}

          <p className="text-xs text-pt-muted">
            {result.completedBy === 'physio'
              ? `Entered by ${result.enteredByName ?? 'the physio'} from a paper form or at the visit.`
              : `Filled in by the patient${result.completedAt ? ` on ${format(result.completedAt, 'EEE d MMM, h:mm a')}` : ''}.`}{' '}
            {result.missing > 0 && `${result.missing} question${result.missing === 1 ? '' : 's'} not answered or not applicable. `}
            {def.scoringNote}
          </p>

          {history.length > 1 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-pt-ink">Every time</h3>
              <ul className="space-y-1">
                {history.map((h) => (
                  <li key={h._id}>
                    <button
                      type="button"
                      onClick={() => onSelect(h._id)}
                      aria-current={h._id === result._id}
                      className={cn(
                        'flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-sm transition-colors',
                        h._id === result._id ? 'bg-pt-sunken font-semibold text-pt-ink' : 'text-pt-muted hover:bg-pt-hover hover:text-pt-ink'
                      )}
                    >
                      <span>{h.completedAt ? format(h.completedAt, 'd MMM yyyy') : '—'}</span>
                      <span className="tabular-nums">{scoreText(def, h.total)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-[11px] text-pt-faint">{def.source}</p>
        </div>
      )}
    </PhysioDrawer>
  )
}
