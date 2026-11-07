'use client'

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { Camera, Loader2 } from '@/components/icons'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/physio/ui'
import type { Id } from '@/convex/_generated/dataModel'
import { sessionDetailRef, type CareTeamSessionRow } from '@/lib/motion/convexRefs'
import { CUES, motionExercise, type CueCode } from '@/lib/motion/exercises'
import { cn } from '@/lib/utils'
import { SkeletonReplay } from './SkeletonReplay'

const DAY = 86_400_000

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
            Stick figures from the patient&apos;s phone (the video itself is never stored). Seen side-on; scores are form guidance, not measurements.
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

/**
 * Camera-coach sessions of one programme, for its care team: how often, how well (Rehabify Score
 * trend) and the tip that came up most, with stick-figure replays of the worst reps.
 */
export function CameraSessions({ sessions, itemName }: { sessions: CareTeamSessionRow[]; itemName: (itemIndex: number) => string }) {
  const [open, setOpen] = useState<Id<'guidedSessions'> | null>(null)
  if (sessions.length === 0) return null
  const recent = sessions.filter((s) => s.createdAt > Date.now() - 14 * DAY)
  const latest = sessions[0]
  const previous = sessions[1]
  const trend = previous ? latest.rehabifyScore - previous.rehabifyScore : 0
  const counts = new Map<string, number>()
  for (const s of recent) for (const m of s.mistakes) counts.set(m.code, (counts.get(m.code) ?? 0) + m.count)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  const scores = sessions.slice(0, 12).reverse()

  return (
    <div className="space-y-2 rounded-xl bg-rh-canvas px-3 py-2.5 text-xs dark:bg-white/[0.03]">
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
        {top && tip(top[0]) && <StatusBadge>Most common tip: {tip(top[0])}</StatusBadge>}
        <span className="ml-auto flex h-6 items-end gap-0.5" aria-label="Rehabify Score of recent sessions">
          {scores.map((s) => (
            <span
              key={s._id}
              title={`${format(s.createdAt, 'd MMM')}: ${s.rehabifyScore}`}
              className={cn('w-1.5 rounded-sm', s.rehabifyScore >= 75 ? 'bg-[#00cd0f]' : s.rehabifyScore >= 50 ? 'bg-amber-400' : 'bg-rose-400')}
              style={{ height: `${Math.max(10, s.rehabifyScore)}%` }}
            />
          ))}
        </span>
      </div>
      <details>
        <summary className="cursor-pointer font-medium text-rh-ink dark:text-white">Sessions</summary>
        <ul className="mt-2 space-y-1.5">
          {sessions.slice(0, 15).map((s) => (
            <li key={s._id} className="flex flex-wrap items-center gap-x-2 text-neutral-600 dark:text-neutral-300">
              <span>{formatDistanceToNow(s.createdAt, { addSuffix: true })}</span>
              <span>·</span>
              <span className="font-medium text-rh-ink dark:text-white">{itemName(s.itemIndex) || motionExercise(s.exerciseKey)?.name}</span>
              <span>· {s.repsCounted}/{s.repsTarget} reps</span>
              <span>· form {s.averageScore}</span>
              <span>· score {s.rehabifyScore}</span>
              {s.partialReps > 0 && <span>· {s.partialReps} short</span>}
              {tip(s.topMistake) && <span className="italic">· {tip(s.topMistake)}</span>}
              {s.snapshotCount > 0 && (
                <button type="button" onClick={() => setOpen(s._id)} className="font-medium text-rh-ink underline underline-offset-2 dark:text-rh-lime">
                  Worst reps
                </button>
              )}
            </li>
          ))}
        </ul>
      </details>
      <WorstReps sessionId={open} onClose={() => setOpen(null)} />
    </div>
  )
}
