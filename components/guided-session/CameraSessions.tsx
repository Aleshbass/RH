'use client'

import { useMemo, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Camera, Check, Copy, Loader2, RefreshCw, TrendingUp, TriangleAlert } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/physio/ui'
import type { Id } from '@/convex/_generated/dataModel'
import { draftSummaryRef, latestSummaryRef, sessionDetailRef, type CareTeamSessionRow } from '@/lib/motion/convexRefs'
import { CUES, motionExercise, type CueCode } from '@/lib/motion/exercises'
import { exerciseFlags, FLAG_RULES, jointWord, sessionStats, type Flag } from '@/lib/motion/insights'
import { summaryAsText, type SummaryTone } from '@/lib/motion/aiSummary'
import { cn } from '@/lib/utils'
import { SkeletonReplay } from './SkeletonReplay'

const DAY = 86_400_000
const GREEN = '#00cd0f'

function tip(code: string | null) {
  return code && code in CUES ? CUES[code as CueCode] : null
}

function WorstReps({ sessionId, onClose }: { sessionId: Id<'guidedSessions'> | null; onClose: () => void }) {
  const detail = useQuery(sessionDetailRef, sessionId ? { sessionId } : 'skip')
  return (
    <Dialog open={Boolean(sessionId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lowest-scoring reps</DialogTitle>
          <DialogDescription>
            Stick figures from the patient&apos;s phone (the video itself is never stored). Seen as the phone saw them; scores are form guidance, not measurements.
          </DialogDescription>
        </DialogHeader>
        {detail === undefined ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : !detail || detail.snapshots.length === 0 ? (
          <p className="text-sm text-neutral-500">No snapshots were kept for this session.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {detail.snapshots.map((s) => (
              <figure key={s.rep} className="rounded-2xl bg-rh-canvas p-3 text-rh-ink dark:bg-white/[0.04] dark:text-white">
                <SkeletonReplay frames={s.frames} className="aspect-square w-full" />
                <figcaption className="mt-2 text-xs">
                  <span className="font-semibold">Rep {s.rep} · score {s.score}</span>
                  {s.mistakes.map((m) => (
                    <span key={m} className="block text-neutral-600 dark:text-neutral-300">{tip(m) ?? m}</span>
                  ))}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {detail && (
          <p className="text-[11px] text-neutral-500">
            Tracked with the {detail.tracking.model === 'full' ? 'accurate' : 'standard'} model at about {detail.tracking.fps} frames a second.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Flags ───────────────────────────────────────────────────────────────────

const FLAG_STYLE: Record<Flag['tone'], { tone: 'red' | 'amber' | 'green'; label: string }> = {
  red: { tone: 'red', label: 'Act now' },
  amber: { tone: 'amber', label: 'Worth a look' },
  green: { tone: 'green', label: 'Good news' },
}

function FlagList({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) return null
  return (
    <ul className="space-y-1.5">
      {flags.map((f) => {
        const Icon = f.tone === 'green' ? (f.code === 'ready_to_progress' ? Check : TrendingUp) : TriangleAlert
        return (
          <li key={f.code} className="flex items-start gap-2">
            <StatusBadge tone={FLAG_STYLE[f.tone].tone} className="shrink-0">
              <Icon className="mr-1 h-3 w-3" /> {FLAG_STYLE[f.tone].label}
            </StatusBadge>
            <span className="text-neutral-700 dark:text-neutral-200">
              <span className="font-semibold text-rh-ink dark:text-white">{f.title}.</span> {f.detail}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Trend: range moved (bars) and pain after (dots), two small charts on one session axis ───

function TrendChart({ sessions }: { sessions: CareTeamSessionRow[] }) {
  const shown = sessions.slice(-12)
  const stats = shown.map((s) => sessionStats(s))
  const [active, setActive] = useState(shown.length - 1)
  const n = shown.length
  const ranges = stats.map((s) => s.rangeAvg)
  const hasRange = ranges.some((r) => r !== null)
  const top = Math.max(30, Math.ceil(Math.max(...ranges.map((r) => r ?? 0)) / 10) * 10)
  const pains = shown.map((s) => s.pain?.score ?? null)
  const hasPain = pains.some((p) => p !== null)
  const x = (i: number) => ((i + 0.5) / n) * 100
  const cur = shown[Math.min(active, n - 1)]
  const curStats = stats[Math.min(active, n - 1)]
  if (!cur) return null

  // Pain line: connect neighbours that both have a score
  const segments: string[] = []
  pains.forEach((p, i) => {
    const q = pains[i + 1]
    if (p !== null && q !== null && q !== undefined) segments.push(`M${x(i)},${10 - p} L${x(i + 1)},${10 - q}`)
  })

  return (
    <div className="rounded-lg bg-white p-2.5 dark:bg-white/[0.04]">
      {/* What the hovered (or latest) session measured: the readout is the tooltip */}
      <p className="mb-2 min-h-[1rem] text-[11px] text-neutral-600 dark:text-neutral-300" aria-live="polite">
        <span className="font-semibold text-rh-ink dark:text-white">{format(cur.createdAt, 'EEE d MMM')}</span>
        {curStats.rangeAvg !== null && ` · range ${curStats.rangeAvg}° (best rep ${curStats.rangeBest}°)`}
        {` · pain ${cur.pain?.score ?? '–'}/10`}
        {` · score ${cur.rehabifyScore}`}
        {curStats.tempoAvg !== null && ` · ${curStats.tempoAvg}s a rep`}
      </p>
      <div className="relative">
        {hasRange && (
          <>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500">Range moved, degrees · top {top}°</p>
            <div className="flex h-16 items-end gap-[2px] border-b border-neutral-200 dark:border-white/10">
              {ranges.map((r, i) => (
                <div key={shown[i]._id} className="flex h-full flex-1 items-end justify-center">
                  {r === null ? (
                    <span className="mb-0.5 h-px w-2 bg-neutral-300 dark:bg-white/20" />
                  ) : (
                    <span
                      className={cn('w-full max-w-[14px] rounded-t-[4px] transition-opacity', i === active ? 'opacity-100' : 'opacity-70')}
                      style={{ height: `${Math.max(4, (r / top) * 100)}%`, backgroundColor: GREEN }}
                    />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        {hasPain && (
          <>
            <p className="mb-1 mt-2.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
              Pain after, 0–10 · dashed line {FLAG_RULES.painHigh}
            </p>
            <div className="relative h-10 border-b border-neutral-200 dark:border-white/10">
              <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
                <line x1="0" x2="100" y1={10 - FLAG_RULES.painHigh} y2={10 - FLAG_RULES.painHigh} className="stroke-rose-300 dark:stroke-rose-400/40" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                {segments.map((d) => (
                  <path key={d} d={d} fill="none" className="stroke-rose-500" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
              {pains.map((p, i) =>
                p === null ? null : (
                  <span
                    key={shown[i]._id}
                    className={cn(
                      'absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-neutral-900',
                      i === active && 'h-3 w-3'
                    )}
                    style={{ left: `${x(i)}%`, top: `${((10 - p) / 10) * 100}%` }}
                  />
                )
              )}
            </div>
          </>
        )}
        {/* Hit targets: a full-height column per session, bigger than the marks */}
        <div className="absolute inset-0 flex">
          {shown.map((s, i) => (
            <button
              key={s._id}
              type="button"
              aria-label={`${format(s.createdAt, 'd MMM')}: range ${stats[i].rangeAvg ?? 'not measured'}${stats[i].rangeAvg !== null ? ' degrees' : ''}, pain ${s.pain?.score ?? 'not reported'}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className={cn('flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-rh-ink', i === active && 'bg-rh-ink/[0.04] dark:bg-white/[0.05]')}
            />
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
        <span>{format(shown[0].createdAt, 'd MMM')}</span>
        <span>{n} {n === 1 ? 'session' : 'sessions'}</span>
        <span>{format(shown[n - 1].createdAt, 'd MMM')}</span>
      </div>
    </div>
  )
}

// ─── One exercise ────────────────────────────────────────────────────────────

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-white px-2.5 py-1.5 dark:bg-white/[0.04]">
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{value}</p>
      {sub && <p className="truncate text-[10px] text-neutral-500">{sub}</p>}
    </div>
  )
}

function ExerciseInsights({ name, sessions, onWorstReps }: { name: string; sessions: CareTeamSessionRow[]; onWorstReps: (id: Id<'guidedSessions'>) => void }) {
  // Oldest first, as the rules and the chart read them
  const flags = useMemo(() => exerciseFlags(sessions), [sessions])
  const latest = sessions[sessions.length - 1]
  const now = sessionStats(latest)
  const firstRange = sessions.map((s) => sessionStats(s).rangeAvg).find((r) => r !== null) ?? null
  const joint = jointWord(latest.measure?.joint)
  const lastPain = [...sessions].reverse().find((s) => s.pain?.score !== null && s.pain?.score !== undefined)?.pain?.score ?? null

  return (
    <div className="space-y-2 rounded-xl border border-neutral-200/70 bg-rh-canvas p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <p className="font-semibold text-rh-ink dark:text-white">{name}</p>
        <p className="text-[11px] text-neutral-500">
          {latest.measure ? `${joint[0].toUpperCase()}${joint.slice(1)}, ` : ''}
          {latest.side === 'L' ? 'left' : 'right'} side · {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Stat
          label="Range"
          value={now.rangeAvg !== null ? `${now.rangeAvg}°` : '–'}
          sub={now.rangeAvg !== null && firstRange !== null && sessions.length > 1 ? `${now.rangeAvg - firstRange >= 0 ? '+' : ''}${now.rangeAvg - firstRange}° since first` : now.rangeAvg === null ? 'Not measured yet' : 'First session'}
        />
        <Stat label="Pain after" value={lastPain !== null ? `${lastPain}/10` : '–'} sub={latest.pain ? 'Last session' : 'Not reported'} />
        <Stat label="Rehabify Score" value={`${latest.rehabifyScore}`} sub={`Form ${latest.averageScore}`} />
        <Stat
          label="Reps"
          value={`${latest.repsCounted}/${latest.repsTarget}`}
          sub={[latest.partialReps > 0 ? `${latest.partialReps} short` : null, now.tempoAvg !== null ? `${now.tempoAvg}s each` : null].filter(Boolean).join(' · ') || undefined}
        />
      </div>
      <TrendChart sessions={sessions} />
      <FlagList flags={flags} />
      <details>
        <summary className="cursor-pointer font-medium text-rh-ink dark:text-white">Every session</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[11px]">
            <thead className="text-neutral-500">
              <tr>
                <th className="py-1 pr-2 font-medium">When</th>
                <th className="py-1 pr-2 font-medium">Reps</th>
                <th className="py-1 pr-2 font-medium">Range avg / best</th>
                <th className="py-1 pr-2 font-medium">Even</th>
                <th className="py-1 pr-2 font-medium">Tempo</th>
                <th className="py-1 pr-2 font-medium">Pain</th>
                <th className="py-1 pr-2 font-medium">Score</th>
                <th className="py-1 font-medium"><span className="sr-only">Worst reps</span></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700 dark:text-neutral-200">
              {[...sessions].reverse().slice(0, 15).map((s) => {
                const st = sessionStats(s)
                return (
                  <tr key={s._id} className="border-t border-neutral-200/70 dark:border-white/10">
                    <td className="py-1 pr-2">{format(s.createdAt, 'd MMM, h:mm a')}</td>
                    <td className="py-1 pr-2">{s.repsCounted}/{s.repsTarget}{s.partialReps > 0 && ` (+${s.partialReps} short)`}</td>
                    <td className="py-1 pr-2">{st.rangeAvg !== null ? `${st.rangeAvg}° / ${st.rangeBest}°` : '–'}</td>
                    <td className="py-1 pr-2" title="How much the range varied rep to rep">{st.rangeSpread !== null ? `±${st.rangeSpread}°` : '–'}</td>
                    <td className="py-1 pr-2">{st.tempoAvg !== null ? `${st.tempoAvg}s` : '–'}</td>
                    <td className="py-1 pr-2">{s.pain?.score !== null && s.pain?.score !== undefined ? `${s.pain.score}/10` : '–'}</td>
                    <td className="py-1 pr-2">{s.rehabifyScore}{tip(s.topMistake) && <span className="block italic text-neutral-500">{tip(s.topMistake)}</span>}</td>
                    <td className="py-1">
                      {s.snapshotCount > 0 && (
                        <button type="button" onClick={() => onWorstReps(s._id)} className="font-medium text-rh-ink underline underline-offset-2 dark:text-rh-lime">
                          Worst reps
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

// ─── AI weekly summary (a draft for the physio) ──────────────────────────────

const SUMMARY_DOT: Record<SummaryTone, string> = { good: 'bg-[#00cd0f]', watch: 'bg-amber-400', concern: 'bg-rose-500' }

function WeeklySummary({ programId, hasWeek }: { programId: Id<'exercisePrograms'>; hasWeek: boolean }) {
  const latest = useQuery(latestSummaryRef, { programId })
  const draft = useAction(draftSummaryRef)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!latest || (!latest.enabled && !latest.summary)) return null
  const s = latest.summary

  const run = async () => {
    setBusy(true)
    try {
      await draft({ programId })
    } catch (e) {
      const message = (e as { data?: unknown }).data
      toast.error(typeof message === 'string' ? message : "Couldn't draft the summary. Try again.")
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    if (!s) return
    await navigator.clipboard.writeText(summaryAsText(s))
    setCopied(true)
    toast.success('Copied. Paste it into your note and edit it there.')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-neutral-200/70 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-rh-ink dark:text-white">Weekly summary</p>
        <StatusBadge tone="violet">AI draft</StatusBadge>
        <div className="ml-auto flex gap-1.5">
          {s && (
            <Button size="sm" variant="outline" className="h-7 rounded-lg px-2 text-xs" onClick={copy}>
              {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />} Copy for note
            </Button>
          )}
          {latest.enabled && (
            <Button size="sm" className="h-7 rounded-lg px-2 text-xs" onClick={run} disabled={busy || !hasWeek} title={hasWeek ? undefined : 'No camera sessions in the last 7 days'}>
              {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              {s ? 'Redo' : "Draft this week's summary"}
            </Button>
          )}
        </div>
      </div>
      {s ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-rh-ink dark:text-white">{s.headline}</p>
          {s.points.length > 0 && (
            <ul className="space-y-1">
              {s.points.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', SUMMARY_DOT[p.tone])} aria-hidden />
                  <span className="text-neutral-700 dark:text-neutral-200">
                    <span className="sr-only">{p.tone}: </span>
                    {p.text}
                    {p.basis && <span className="block text-[11px] text-neutral-500">{p.basis}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {s.suggestions.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">For you to decide</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-neutral-700 dark:text-neutral-200">
                {s.suggestions.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
          <p className="text-[10px] text-neutral-500">
            Drafted {formatDistanceToNow(s.createdAt, { addSuffix: true })} from {s.weekSessions} {s.weekSessions === 1 ? 'session' : 'sessions'} this week (numbers only, no names). Check it against the charts before you use it; it never changes the plan.
          </p>
        </div>
      ) : (
        <p className="mt-1.5 text-neutral-600 dark:text-neutral-300">
          A short read of this week&apos;s sessions, with the numbers behind every point, ready to paste into your note.
        </p>
      )}
    </div>
  )
}

// ─── The panel ───────────────────────────────────────────────────────────────

/**
 * Camera-coach sessions of one programme, for its care team: per exercise, the range the joint
 * moved (measured on every rep) next to the pain reported after, plain flags with the numbers
 * behind them (lib/motion/insights.ts), an optional AI weekly summary, every session as a table
 * and stick-figure replays of the worst reps.
 */
export function CameraSessions({
  sessions,
  itemName,
  programId,
}: {
  sessions: CareTeamSessionRow[]
  itemName: (itemIndex: number) => string
  programId: Id<'exercisePrograms'>
}) {
  const [open, setOpen] = useState<Id<'guidedSessions'> | null>(null)
  const groups = useMemo(() => {
    const byItem = new Map<number, CareTeamSessionRow[]>()
    // sessions arrive newest first
    for (const s of [...sessions].reverse()) byItem.set(s.itemIndex, [...(byItem.get(s.itemIndex) ?? []), s])
    return [...byItem.entries()]
      .map(([itemIndex, rows]) => ({ itemIndex, rows }))
      .sort((a, b) => b.rows[b.rows.length - 1].createdAt - a.rows[a.rows.length - 1].createdAt)
  }, [sessions])
  if (sessions.length === 0) return null
  const recent = sessions.filter((s) => s.createdAt > Date.now() - 14 * DAY)
  const hasWeek = sessions.some((s) => s.createdAt > Date.now() - 7 * DAY)
  const latest = sessions[0]
  const previous = sessions[1]
  const trend = previous ? latest.rehabifyScore - previous.rehabifyScore : 0

  return (
    <div className="space-y-2.5 rounded-xl bg-rh-canvas px-3 py-2.5 text-xs dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 font-semibold text-rh-ink dark:text-white">
          <Camera className="h-3.5 w-3.5" /> Camera coach
        </span>
        <StatusBadge tone={recent.length >= 4 ? 'green' : recent.length > 0 ? 'teal' : 'neutral'}>
          {recent.length} {recent.length === 1 ? 'session' : 'sessions'} in 14 days
        </StatusBadge>
        <StatusBadge tone={latest.rehabifyScore >= 75 ? 'green' : latest.rehabifyScore >= 50 ? 'teal' : 'rose'}>
          Rehabify Score {latest.rehabifyScore}
          {previous ? ` (${trend >= 0 ? '+' : ''}${trend})` : ''}
        </StatusBadge>
        <span className="text-neutral-500">Last {formatDistanceToNow(latest.createdAt, { addSuffix: true })}</span>
      </div>

      <WeeklySummary programId={programId} hasWeek={hasWeek} />

      {groups.map((g) => (
        <ExerciseInsights
          key={g.itemIndex}
          name={itemName(g.itemIndex) || motionExercise(g.rows[0].exerciseKey)?.name || 'Exercise'}
          sessions={g.rows}
          onWorstReps={setOpen}
        />
      ))}

      <p className="text-[10px] leading-relaxed text-neutral-500">
        Ranges are measured from the patient&apos;s own start position by their phone camera: about ±5–10°, and seated knees read straighter than they are. Compare
        this patient over time, not against norms. Flags are fixed rules (range ±{FLAG_RULES.rangeChange}°, pain {FLAG_RULES.painHigh}+ or up {FLAG_RULES.painRise}, form down{' '}
        {FLAG_RULES.fatigue} in the last set); they point you to look, the decision is yours.
      </p>
      <WorstReps sessionId={open} onClose={() => setOpen(null)} />
    </div>
  )
}
