'use client'

/**
 * Over Free's patients a month (Individual Pro spec, 17 Nov 2026): never a locked screen. When an
 * independent physio on Free sends a programme to one more patient than Free covers, they choose:
 * the patient pays for Flex, or they upgrade to Pro. (convex/exercisePrograms.ts createProgram
 * answers with ConvexError {code: "plan_limit"}.)
 */

import { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Crown, Loader2, UserRound, X } from '@/components/icons'
import { cn } from '@/lib/utils'
import { PLAN_PAGE } from './planApi'

export type PlanLimit = { used: number; limit: number; flexAvailable: boolean }

/** The plan_limit details from a failed createProgram, or null for any other error. */
export function planLimitOf(error: unknown): PlanLimit | null {
  const data = (error as { data?: unknown } | null)?.data
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.code !== 'plan_limit') return null
  return { used: Number(d.used) || 0, limit: Number(d.limit) || 0, flexAvailable: Boolean(d.flexAvailable) }
}

export function PlanLimitDialog({
  limit,
  patientName,
  onPatientPays,
  onClose,
}: {
  limit: PlanLimit | null
  patientName: string
  /** Sends the same programme with the patient paying for Flex */
  onPatientPays: () => Promise<void>
  onClose: () => void
}) {
  const reduce = useReducedMotion()
  const [busy, setBusy] = useState(false)
  const first = patientName.split(' ')[0] || 'Your patient'
  return (
    <AnimatePresence>
      {limit && (
        <motion.div className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="Close" className="absolute inset-0 bg-[rgb(3_8_7/0.55)] backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-limit-title"
            className="relative w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl dark:bg-rh-ink-2 sm:p-7"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-black/[0.05] dark:hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
            <h2 id="plan-limit-title" className="pr-8 text-xl font-semibold tracking-tight text-rh-ink dark:text-white">
              You&apos;ve covered {limit.used} of {limit.limit} patients this month
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
              Free covers home programmes for {limit.limit} different patients a month. Choose how {first}&apos;s programme is paid for. Nothing you&apos;ve already sent changes.
            </p>
            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                disabled={!limit.flexAvailable || busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await onPatientPays()
                  } finally {
                    setBusy(false)
                  }
                }}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border border-black/[0.08] p-4 text-left transition dark:border-white/10',
                  limit.flexAvailable ? 'hover:border-rh-ink/40 hover:bg-rh-canvas dark:hover:bg-white/[0.04]' : 'opacity-60'
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rh-canvas text-rh-ink dark:bg-white/[0.06] dark:text-white">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-rh-ink dark:text-white">{first} pays for Flex</span>
                  <span className="mt-0.5 block text-sm text-neutral-600 dark:text-neutral-300">
                    {limit.flexAvailable
                      ? `Send it now. ${first} unlocks the videos and tracking with Flex in their app.`
                      : 'Patients can’t pay for Flex yet. Upgrade to keep sending this month.'}
                  </span>
                </span>
              </button>
              <Link
                href={PLAN_PAGE}
                onClick={onClose}
                className="flex w-full items-start gap-3 rounded-2xl bg-rh-ink p-4 text-left text-white transition hover:bg-[rgb(3_8_7)]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rh-lime text-rh-ink">
                  <Crown className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Upgrade to Individual Pro</span>
                  <span className="mt-0.5 block text-sm text-white/70">Programmes for every patient you see, more Scribe, and Joy included.</span>
                </span>
                <ArrowRight className="mt-3 h-4 w-4 shrink-0 text-rh-lime" />
              </Link>
            </div>
            <button type="button" onClick={onClose} className="mt-4 w-full text-center text-sm font-semibold text-neutral-500 hover:text-rh-ink dark:hover:text-white">
              Not now
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
