'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { useQuery } from 'convex/react'
import { ArrowRight, ClipboardList } from '@/components/icons'
import { EmptyState, IconChip, LoadingBlocks, PageContainer, PageHeader, Panel, StatusBadge, listRowClass } from '@/components/patient/ui'
import { PATIENT_QUESTIONNAIRES } from '@/components/questionnaires/PatientQuestionnaireBanner'
import { whenText } from '@/components/questionnaires/display'
import { questionnaireRefs, type MyQuestionnaires } from '@/components/questionnaires/refs'
import { instrumentDef } from '@/lib/questionnaires/instruments'
import { compareScores, scoreText } from '@/lib/questionnaires/scoring'

type Completed = NonNullable<MyQuestionnaires>['completed'][number]

/** The questionnaires the patient's physio sent: what's waiting, and their scores over time. */
export default function PatientQuestionnairesPage() {
  const data = useQuery(questionnaireRefs.myQuestionnaires, {})

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="Questionnaires"
        description="Short questionnaires from your physio about how your problem affects you. Your answers help them see how you’re progressing."
        back={{ href: '/dashboard/patient', label: 'Home' }}
      />

      {data === undefined ? (
        <LoadingBlocks rows={3} />
      ) : data === null ? (
        <EmptyState icon={ClipboardList} title="Nothing to show" description="Sign in with your patient account to see your questionnaires." />
      ) : (
        <>
          <Panel title="To fill in" bodyClassName="px-2 pb-3 pt-1 sm:px-3">
            {data.pending.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Nothing to fill in"
                description="When your physio sends you a questionnaire, it shows here and on your home screen."
                className="py-8"
              />
            ) : (
              <ul>
                {data.pending.map((q) => (
                  <li key={q._id}>
                    <Link href={`${PATIENT_QUESTIONNAIRES}/${q._id}`} className={listRowClass}>
                      <IconChip icon={ClipboardList} tone="blue" />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 font-medium text-pt-ink">
                          {q.name}
                          {q.hasDraft && <StatusBadge tone="amber">Started</StatusBadge>}
                        </p>
                        <p className="text-sm text-pt-muted">
                          From {q.physioName} · about {q.minutes} min
                          {q.dueAt ? ` · ${q.forVisit ? 'before your visit' : 'by'} ${whenText(q.dueAt)}` : ''}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-pt-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {data.completed.length > 0 && (
            <Panel
              title="Your results"
              info="Your physio uses these scores to track your recovery. Compare a questionnaire with itself over time, not with a different one."
            >
              <ul className="divide-y divide-pt-line">
                {groupByInstrument(data.completed).map(({ instrument, rows }) => {
                  const def = instrumentDef(instrument)
                  if (!def) return null
                  const latest = rows[0]
                  const first = rows[rows.length - 1]
                  const change = rows.length > 1 ? compareScores(def, first.total, latest.total) : null
                  return (
                    <li key={instrument} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className="font-medium text-pt-ink">{def.name}</p>
                        <p className="text-lg font-semibold tabular-nums text-pt-ink">{scoreText(def, latest.total)}</p>
                      </div>
                      <p className="text-sm text-pt-muted">
                        {def.better === 'higher' ? 'Higher is better' : 'Lower is better'} · last filled in{' '}
                        {latest.completedAt ? format(latest.completedAt, 'd MMM yyyy') : ''}
                      </p>
                      {change && first.completedAt && (
                        <p className="mt-1 text-sm text-pt-ink">
                          {change.tone === 'same'
                            ? `The same as on ${format(first.completedAt, 'd MMM')}.`
                            : `${Math.abs(change.delta)} point${Math.abs(change.delta) === 1 ? '' : 's'} ${change.tone} than on ${format(first.completedAt, 'd MMM')}.`}
                        </p>
                      )}
                      {rows.length > 1 && (
                        <p className="mt-1 text-xs text-pt-faint">
                          {rows
                            .slice()
                            .reverse()
                            .map((r) => `${r.completedAt ? format(r.completedAt, 'd MMM') : ''}: ${scoreText(def, r.total)}`)
                            .join(' · ')}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Panel>
          )}
        </>
      )}
    </PageContainer>
  )
}

function groupByInstrument(rows: Completed[]) {
  const map = new Map<string, Completed[]>()
  for (const row of rows) map.set(row.instrument, [...(map.get(row.instrument) ?? []), row])
  return [...map.entries()].map(([instrument, list]) => ({ instrument, rows: list }))
}
