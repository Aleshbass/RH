'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useMutation, useQuery } from 'convex/react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { BellRing, ChevronRight, ClipboardList, Pencil, Send, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState, IconChip, LoadingBlocks, Panel, StatusBadge } from '@/components/physio/ui'
import { Sparkline } from '@/components/physio/workspace/shared'
import { programError } from '@/components/exercise-programs/errors'
import type { Id } from '@/convex/_generated/dataModel'
import { instrumentDef } from '@/lib/questionnaires/instruments'
import { compareScores, scoreText, suggestInstruments } from '@/lib/questionnaires/scoring'
import { changeLabel, changeTone, sentText, waitingState } from './display'
import { EnterQuestionnaireDrawer, type EnterTarget } from './EnterQuestionnaireDrawer'
import { QuestionnaireResultDrawer } from './QuestionnaireResultDrawer'
import { SendQuestionnaireDrawer } from './SendQuestionnaireDrawer'
import { questionnaireRefs, type QuestionnaireSummary } from './refs'

const REMIND_GAP = 20 * 3_600_000

/**
 * Outcome questionnaires on the patient workspace: what's waiting for the patient, and each
 * questionnaire's scores over time with the change since the first one. Send new ones, remind,
 * type in a paper form, or open a result to see every answer.
 */
export function QuestionnairesPanel({ patientId, patientFirstName }: { patientId: Id<'users'>; patientFirstName?: string }) {
  const data = useQuery(questionnaireRefs.forPatient, { patientId })
  const remind = useMutation(questionnaireRefs.remind)
  const cancel = useMutation(questionnaireRefs.cancel)
  const searchParams = useSearchParams()
  const [sending, setSending] = useState(false)
  const [entering, setEntering] = useState<EnterTarget | null>(null)
  const [openId, setOpenId] = useState<Id<'patientQuestionnaires'> | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const linked = useRef(false)
  const name = patientFirstName || 'the patient'

  // A notification links here with ?questionnaire=<id>: open that result once
  useEffect(() => {
    const id = searchParams.get('questionnaire')
    if (!id || linked.current || !data) return
    linked.current = true
    if (data.items.some((i) => i._id === id && i.status === 'completed')) setOpenId(id as Id<'patientQuestionnaires'>)
  }, [searchParams, data])

  const waiting = useMemo(() => (data?.items ?? []).filter((i) => i.status === 'pending'), [data])
  const groups = useMemo(() => groupCompleted(data?.items ?? []), [data])
  const openHistory = useMemo(() => {
    const row = data?.items.find((i) => i._id === openId)
    return row ? (groups.find((g) => g.instrument === row.instrument)?.rows ?? []) : []
  }, [data, groups, openId])
  const lastPsfs = groups.find((g) => g.instrument === 'psfs')?.rows[0]?.psfsActivities ?? []

  if (data === undefined) {
    return (
      <Panel title="Questionnaires">
        <LoadingBlocks rows={2} className="px-5 pb-5 sm:px-6" />
      </Panel>
    )
  }
  if (data === null) return null

  const act = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id)
    try {
      await fn()
      toast.success(done)
    } catch (error) {
      toast.error(programError(error, 'Something went wrong. Please try again.'))
    } finally {
      setBusy(null)
    }
  }

  const suggestion = suggestInstruments(data.condition)
    .slice(0, 2)
    .map((k) => instrumentDef(k)?.short)
    .join(' and ')

  return (
    <Panel
      title="Questionnaires"
      info="Outcome questionnaires (LEFS, KOOS-12, HOOS-12, SPADI, PSFS, NPRS) the patient fills in on their phone, usually before a visit. Rehabify scores them. A change is only marked better or worse when it’s at least the smallest change that matters to patients (MCID)."
      actions={
        data.canSend && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 rounded-lg text-pt-muted" onClick={() => setEntering({})}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Enter
            </Button>
            <Button variant="ghost" size="sm" className="h-8 rounded-lg text-rh-ink dark:text-rh-lime" onClick={() => setSending(true)}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Send
            </Button>
          </div>
        )
      }
    >
      {waiting.length === 0 && groups.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title="No questionnaires yet"
          description={
            data.canSend
              ? `Send ${suggestion} for ${name} to fill in before ${data.nextVisit ? 'the next visit' : 'you next see them'}. The scores are worked out for you and tracked here.`
              : 'Questionnaires sent during care show here.'
          }
          action={
            data.canSend && (
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setSending(true)}>
                Send a questionnaire
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-5 px-5 pb-5 pt-2 sm:px-6">
          {waiting.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-pt-faint">Waiting for {name}</h3>
              <ul className="divide-y divide-pt-line">
                {waiting.map((row) => {
                  const state = waitingState(row)
                  const mine = row.physiotherapistId === data.viewerId
                  const canRemind = data.canSend && mine && !row.expired && Date.now() - Math.max(row.remindedAt ?? 0, row.sentAt) >= REMIND_GAP
                  return (
                    <li key={row._id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                      <IconChip icon={ClipboardList} tone="neutral" className="h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4" />
                      <div className="min-w-[10rem] flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-pt-ink">
                          {row.short}
                          <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                        </p>
                        <p className="text-xs text-pt-muted">
                          {sentText(row)}
                          {!mine && ` · by ${row.physioName}`}
                          {row.remindedAt ? ` · reminded ${format(row.remindedAt, 'd MMM')}` : ''}
                        </p>
                      </div>
                      {data.canSend && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-lg text-pt-ink"
                            onClick={() => setEntering({ instrument: row.instrument, requestId: row._id })}
                          >
                            Fill in now
                          </Button>
                          {canRemind && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-lg text-pt-muted"
                              disabled={busy === row._id}
                              onClick={() => void act(row._id, () => remind({ id: row._id }), `Reminded ${name}.`)}
                            >
                              <BellRing className="mr-1 h-3.5 w-3.5" />
                              Remind
                            </Button>
                          )}
                          {mine && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 rounded-lg p-0 text-pt-muted"
                              aria-label={`Withdraw ${row.short}`}
                              title="Withdraw"
                              disabled={busy === row._id}
                              onClick={() => void act(row._id, () => cancel({ id: row._id }), `${row.short} withdrawn.`)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {groups.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-pt-faint">Results</h3>
              <ul className="divide-y divide-pt-line">
                {groups.map((g) => {
                  const def = instrumentDef(g.instrument)
                  if (!def) return null
                  const latest = g.rows[0]
                  const first = g.rows[g.rows.length - 1]
                  const change = g.rows.length > 1 ? compareScores(def, first.total, latest.total) : null
                  const points = g.rows
                    .map((r) => r.total)
                    .filter((t): t is number => t !== null)
                    .reverse()
                  const unseen = latest.physiotherapistId === data.viewerId && !latest.reviewedAt
                  return (
                    <li key={g.instrument}>
                      <button
                        type="button"
                        onClick={() => setOpenId(latest._id)}
                        className="-mx-2 flex w-[calc(100%+1rem)] flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-pt-hover"
                      >
                        <div className="min-w-[10rem] flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-pt-ink">
                            {def.short}
                            {unseen && <StatusBadge tone="blue">New</StatusBadge>}
                          </p>
                          <p className="text-xs text-pt-faint">
                            {g.rows.length === 1 ? 'Once' : `${g.rows.length} times`}
                            {latest.completedAt ? ` · last ${format(latest.completedAt, 'd MMM')}` : ''}
                            {latest.completedBy === 'physio' ? ' · entered by physio' : ''}
                          </p>
                        </div>
                        <Sparkline
                          points={points}
                          min={def.range.min}
                          max={def.range.max}
                          label={`${def.short} over ${points.length} completions`}
                          className="h-8 w-24 sm:w-28"
                        />
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-sm tabular-nums text-pt-muted">
                              {g.rows.length > 1 && <>{scoreText(def, first.total)} → </>}
                              <span className="font-semibold text-pt-ink">{scoreText(def, latest.total)}</span>
                            </p>
                            {change && (
                              <span className="mt-0.5 inline-flex" title={change.title}>
                                <StatusBadge tone={changeTone(change)}>{changeLabel(def, change)}</StatusBadge>
                              </span>
                            )}
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-pt-muted" />
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-2 text-xs text-pt-muted">
                {groups.some((g) => instrumentDef(g.instrument)?.better === 'lower')
                  ? 'Higher is better, except SPADI and NPRS where lower is better. '
                  : 'Higher is better. '}
                Green or red only when the change is at least the MCID.
              </p>
            </section>
          )}
        </div>
      )}

      {data.canSend && (
        <>
          <SendQuestionnaireDrawer open={sending} onOpenChange={setSending} patientId={patientId} patientName={name} data={data} />
          <EnterQuestionnaireDrawer
            target={entering}
            onOpenChange={(open) => !open && setEntering(null)}
            patientId={patientId}
            patientName={name}
            lastPsfs={lastPsfs}
          />
        </>
      )}
      <QuestionnaireResultDrawer id={openId} onOpenChange={(open) => !open && setOpenId(null)} history={openHistory} onSelect={setOpenId} />
    </Panel>
  )
}

/** Completed questionnaires by instrument, newest first within each, groups by latest activity. */
function groupCompleted(items: QuestionnaireSummary[]) {
  const map = new Map<string, QuestionnaireSummary[]>()
  for (const row of items) {
    if (row.status !== 'completed') continue
    map.set(row.instrument, [...(map.get(row.instrument) ?? []), row])
  }
  return [...map.entries()]
    .map(([instrument, rows]) => ({ instrument, rows: rows.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)) }))
    .sort((a, b) => (b.rows[0].completedAt ?? 0) - (a.rows[0].completedAt ?? 0))
}
