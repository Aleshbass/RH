'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { primaryButtonClass } from '@/components/physio/ui'
import { hasSeenPhysioTour } from '@/components/physio/PhysioTour'
import { endPromptTurn, whenPromptTurn } from '@/lib/overlayTurn'
import {
  SetupChecklistRows,
  SetupProgressBar,
  setupProgress,
  type SetupStatus,
} from '@/components/physio/SetupChecklist'
import Link from 'next/link'

const SESSION_KEY = 'rehabify:physio-setup-reminder'

function shownThisSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return true // No storage: don't risk showing it on every page load
  }
}

function markShown() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1')
  } catch {
    // Nothing to do
  }
}

/**
 * Once per visit, an approved physio with unfinished setup is reminded that patients can't
 * book them yet. Never shown on the same visit as the first-time tour (which already points
 * at the checklist).
 */
export function SetupReminder({ setup }: { setup: SetupStatus | null | undefined }) {
  const [open, setOpen] = useState(false)
  const shouldRemind = Boolean(setup && setup.approvalStatus === 'approved' && !setup.isComplete)

  useEffect(() => {
    if (!shouldRemind || shownThisSession() || !hasSeenPhysioTour()) return
    // Takes turns with the other self-opening prompts (offline PIN, app setup): one at a time
    let cancel: () => void = () => undefined
    const timer = window.setTimeout(() => {
      cancel = whenPromptTurn('setup-reminder', () => {
        markShown()
        setOpen(true)
      })
    }, 800)
    return () => {
      window.clearTimeout(timer)
      cancel()
    }
  }, [shouldRemind])

  // Closed: the next waiting prompt may open
  useEffect(() => {
    if (!open) endPromptTurn('setup-reminder')
  }, [open])
  useEffect(() => () => endPromptTurn('setup-reminder'), [])

  if (!setup) return null
  const { done, total } = setupProgress(setup)
  const next = setup.items.find((item) => item.required && !item.done)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md dark:border-white/[0.07] dark:bg-rh-ink-2">
        <DialogHeader className="space-y-2 p-6 pb-4 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
            {setup.practiceMode === 'independent' ? 'Almost ready' : <>Patients can&apos;t book you yet</>}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            You&apos;re approved. Finish {setup.requiredRemaining === 1 ? 'this last step' : `these ${setup.requiredRemaining} steps`}{' '}
            {setup.practiceMode === 'independent'
              ? 'so your patients can pay your invoices and you get paid.'
              : 'to appear on the marketplace and start taking bookings.'}
          </DialogDescription>
          <div className="flex items-center gap-3 pt-2">
            <SetupProgressBar done={done} total={total} />
            <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
              {done} of {total}
            </span>
          </div>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto border-y border-neutral-100 dark:border-white/[0.07]">
          <SetupChecklistRows items={setup.items} showOptional={false} onNavigate={() => setOpen(false)} />
        </div>
        <div className="flex flex-col-reverse gap-2 p-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setOpen(false)} className="text-neutral-600 dark:text-neutral-400">
            Later
          </Button>
          {next && (
            <Button asChild className={primaryButtonClass} onClick={() => setOpen(false)}>
              <Link href={next.href}>Continue setup</Link>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
