'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { Camera, Loader2 } from '@/components/icons'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Panel, StatusBadge, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { OwnMediaView } from '@/components/exercise-programs/OwnMediaView'
import { formatDuration, useExerciseMediaLinks } from '@/components/exercise-programs/ownMedia'
import type { LibraryEntry } from '@/components/exercise-programs/types'
import type { Id } from '@/convex/_generated/dataModel'
import { OWN_MEDIA_CONSENT } from '@/lib/ownExerciseMedia'

type Offered = LibraryEntry & { consent: 'no_patient' | 'patient_consented' | null; requestedAt: number; creatorName: string }

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const offeredRef = makeFunctionReference<'query', Record<string, never>, Offered[]>('exerciseLibrary:adminOwnExerciseShares')
const reviewRef = makeFunctionReference<'mutation', { exerciseId: Id<'exercises'>; approve: boolean; note?: string }, { success: boolean }>(
  'exerciseLibrary:adminReviewOwnExercise'
)

/**
 * Exercises physios have offered to the shared library. Approving adds one for every physio, so
 * check the demonstration is safe, clear, and that no patient appears without consent.
 */
export function OwnExerciseReviews() {
  const offered = useQuery(offeredRef, {})
  const review = useMutation(reviewRef)
  const requestLinks = useExerciseMediaLinks({ kind: 'staff' })
  const [open, setOpen] = useState<Offered | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  if (!offered?.length) return null

  const decide = async (entry: Offered, approve: boolean) => {
    setBusy(`${entry._id}:${approve}`)
    try {
      await review({ exerciseId: entry._id, approve })
      toast.success(approve ? `“${entry.name}” is in the library` : 'Declined')
      setOpen(null)
    } catch (error) {
      toast.error(error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Something went wrong. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const actions = (entry: Offered) => (
    <div className="flex gap-2">
      <button type="button" disabled={busy !== null} onClick={() => decide(entry, true)} className={`${primaryButtonClass} inline-flex h-9 items-center gap-1.5 px-3.5 text-sm font-semibold`}>
        {busy === `${entry._id}:true` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Add to library
      </button>
      <button type="button" disabled={busy !== null} onClick={() => decide(entry, false)} className={`${softButtonClass} h-9 px-3.5 text-sm font-semibold`}>
        Decline
      </button>
    </div>
  )

  return (
    <Panel title="Offered by physiotherapists" description="Check each one is safe and clear before every physio can use it.">
      <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        {offered.map((entry) => (
          <li key={entry._id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => setOpen(entry)} className="flex min-w-0 items-center gap-3 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rh-canvas text-rh-ink dark:bg-white/[0.06] dark:text-white">
                <Camera className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-rh-ink dark:text-white">{entry.name}</span>
                <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {entry.creatorName} ·{' '}
                  {entry.ownMedia?.kind === 'video'
                    ? `Video ${entry.ownMedia.durationSec ? formatDuration(entry.ownMedia.durationSec) : ''}`
                    : entry.ownMedia
                      ? `${entry.ownMedia.photoCount} photos`
                      : 'Steps only'}{' '}
                  · {entry.instructions.length} steps
                </span>
              </span>
            </button>
            <div className="flex items-center gap-2">
              {entry.consent === 'patient_consented' && <StatusBadge tone="amber">Patient appears</StatusBadge>}
              {actions(entry)}
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-2xl dark:bg-rh-ink-2">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.name}</DialogTitle>
                <DialogDescription>Offered by {open.creatorName}</DialogDescription>
              </DialogHeader>
              {open.ownMedia && <OwnMediaView exerciseId={open._id} name={open.name} requestLinks={requestLinks} />}
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-rh-ink dark:text-white">
                {open.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              {open.consent && (
                <p className="rounded-2xl bg-rh-canvas px-4 py-3 text-sm text-rh-ink dark:bg-white/[0.04] dark:text-white">
                  They confirmed: {OWN_MEDIA_CONSENT[open.consent]}
                </p>
              )}
              {actions(open)}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  )
}
