'use client'

/**
 * After an AI-drafted note is signed: what the session said to do next, one tap each. The
 * exercises heard are matched to the exercise library (with the sets, reps and hold that were
 * said) and open the usual "Send exercises" dialog to check and send; the follow-up opens the
 * booking drawer on the suggested date. Nothing is sent or booked without the physio confirming.
 */
import { useMemo } from 'react'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { CalendarPlus, Check, CheckCircle2, Dumbbell } from '@/components/icons'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui'
import type { LibraryData, LibraryEntry } from '@/components/exercise-programs/types'
import { cn } from '@/lib/utils'
import { matchExercises, parseDosage, withDosage, type HeardExercise } from './scribeTools'

export type ScribeNextStepsData = { exercises: HeardExercise[]; followUp?: { text: string; inDays?: number } }

const listLibraryRef = makeFunctionReference<'query', Record<string, never>, LibraryData | null>('exerciseLibrary:listLibrary')

export function ScribeNextSteps({
  steps,
  patientFirstName,
  onClose,
  onSendExercises,
  onBookFollowUp,
}: {
  steps: ScribeNextStepsData | null
  patientFirstName: string
  onClose: () => void
  onSendExercises: (entries: LibraryEntry[]) => void
  onBookFollowUp: (followUp: { text: string; inDays?: number }) => void
}) {
  const library = useQuery(listLibraryRef, steps?.exercises.length ? {} : 'skip')
  const match = useMemo(() => {
    if (!steps?.exercises.length || !library) return null
    return matchExercises(steps.exercises, library.items)
  }, [steps, library])

  const sendable = match?.matched.map((m) => withDosage(m.entry, parseDosage(m.heard.dosage))) ?? []

  return (
    <AlertDialog open={steps !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="rounded-2xl border-pt-line bg-pt-surface text-pt-ink">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-pt-ink">
            <CheckCircle2 className="h-5 w-5 text-pt-green-fg" aria-hidden /> Note signed
          </AlertDialogTitle>
          <AlertDialogDescription className="text-pt-muted">From the session, here’s what you said comes next for {patientFirstName}.</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          {steps && steps.exercises.length > 0 && (
            <div className="rounded-xl border border-pt-line p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-pt-ink">
                <Dumbbell className="h-4 w-4" aria-hidden /> Home exercises
              </p>
              {library === undefined ? (
                <p className="mt-2 text-sm text-pt-muted">Finding them in the exercise library…</p>
              ) : (
                <>
                  <ul className="mt-2 space-y-1 text-sm">
                    {match?.matched.map((m) => (
                      <li key={m.entry._id} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pt-green-fg" aria-hidden />
                        <span>
                          <span className="font-medium text-pt-ink">{m.entry.name}</span>
                          {m.heard.dosage && <span className="text-pt-muted"> · {m.heard.dosage}</span>}
                          {m.entry.name.toLowerCase() !== m.heard.name.toLowerCase() && <span className="text-pt-muted"> (heard “{m.heard.name}”)</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {match && match.unmatched.length > 0 && (
                    <p className="mt-2 text-xs text-pt-muted">
                      Not found in the library: {match.unmatched.map((e) => e.name).join(', ')}. Add them as your own exercises in the next step.
                    </p>
                  )}
                  <Button
                    className={cn(primaryButtonClass, 'mt-3 h-10 w-full')}
                    onClick={() => {
                      onSendExercises(sendable)
                      onClose()
                    }}
                  >
                    {sendable.length ? `Check and send ${sendable.length} exercise${sendable.length === 1 ? '' : 's'}` : 'Choose exercises to send'}
                  </Button>
                </>
              )}
            </div>
          )}

          {steps?.followUp && (
            <div className="rounded-xl border border-pt-line p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-pt-ink">
                <CalendarPlus className="h-4 w-4" aria-hidden /> Follow-up
              </p>
              <p className="mt-1 text-sm text-pt-muted">{steps.followUp.text}</p>
              <Button
                className={cn(steps.exercises.length ? secondaryButtonClass : primaryButtonClass, 'mt-3 h-10 w-full')}
                onClick={() => {
                  onBookFollowUp(steps.followUp!)
                  onClose()
                }}
              >
                Book the follow-up
              </Button>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <Button className={cn(secondaryButtonClass, 'h-11 sm:h-10')} onClick={onClose}>
            Done
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
