'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert } from '@/components/icons'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ExerciseViewer } from '@/components/exercise3d/ExerciseViewer'
import { StatusBadge } from '@/components/physio/ui'
import { useViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import { cn } from '@/lib/utils'
import { sideLabel, type LibraryEntry } from './types'

/** Staff preview of one library exercise: 3D demo, steps, safety notes and default dose. */
export function ExercisePreviewDialog({
  entry,
  onOpenChange,
  action,
}: {
  entry: LibraryEntry | null
  onOpenChange: (open: boolean) => void
  action?: React.ReactNode
}) {
  const requestGrant = useViewerGrant({ kind: 'staff' })
  const [side, setSide] = useState<'L' | 'R' | null>(null)
  useEffect(() => setSide(entry?.sided ? 'L' : null), [entry])
  const clip = entry?.animation?.clips.find((c) => c.side === side) ?? entry?.animation?.clips[0] ?? null

  return (
    <Dialog open={Boolean(entry)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-4xl">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {entry.name}
                {entry.animation?.status === 'draft' && <StatusBadge tone="blue">Awaiting clinical sign-off</StatusBadge>}
              </DialogTitle>
              <DialogDescription>{entry.description}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
              <div className="space-y-3">
                {clip ? (
                  <ExerciseViewer key={clip.id} clipId={clip.id} requestGrant={requestGrant} />
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded-3xl bg-rh-honeydew text-sm text-neutral-500">No 3D demonstration</div>
                )}
                {entry.sided && (
                  <div className="flex gap-2">
                    {(['L', 'R'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSide(s)}
                        className={cn(
                          'flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition active:scale-95',
                          side === s ? 'border-rh-lime bg-rh-lime text-rh-ink dark:border-rh-lime dark:bg-rh-lime dark:text-rh-ink' : 'border-black/[0.08] hover:bg-rh-honeydew dark:border-white/10'
                        )}
                      >
                        {sideLabel(entry.animation?.slug, s)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge tone="teal">
                    Default {entry.defaults.sets} × {entry.defaults.reps}
                    {entry.defaults.holdSeconds ? ` · hold ${entry.defaults.holdSeconds}s` : ''}
                  </StatusBadge>
                  <StatusBadge>{entry.defaults.frequency}</StatusBadge>
                  {entry.position && <StatusBadge>{entry.position}</StatusBadge>}
                  <StatusBadge>{entry.difficulty}</StatusBadge>
                </div>
                <ol className="space-y-2">
                  {entry.instructions.map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-neutral-700 dark:text-neutral-200">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rh-lime text-[11px] font-semibold text-rh-ink">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                {entry.precautions.length > 0 && (
                  <div className="flex gap-2.5 rounded-2xl bg-pt-rose-bg p-3 text-pt-rose-fg">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <ul className="space-y-1">{entry.precautions.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </div>
                )}
                <p className="text-xs text-neutral-500">
                  Targets: {entry.targetMuscles.join(', ')}. Equipment: {entry.equipment.join(', ')}.
                </p>
                {action}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
