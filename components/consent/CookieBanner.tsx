'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * First-visit cookie choice. Accepting and declining are the same size and one tap each;
 * nothing optional runs until one is chosen. It never takes focus or blocks the page.
 */
export function CookieBanner({
  onAccept,
  onReject,
  onCustomise,
}: {
  onAccept: () => void
  onReject: () => void
  onCustomise: () => void
}) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      role="region"
      aria-label="Cookie choices"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.6 }}
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[60] sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-[400px]"
    >
      <div className="rounded-[1.75rem] bg-white p-5 text-rh-ink shadow-[0_20px_60px_-15px_rgba(11,19,18,0.35)] ring-1 ring-rh-ink/[0.07] sm:p-6">
        <h2 className="text-[17px] font-semibold tracking-tight">Cookies on Rehabify</h2>
        <p className="mt-2 text-sm leading-6 text-rh-ink/70">
          We use essential cookies to keep you signed in and your payments secure. With your OK, we&apos;ll also count visits
          anonymously to improve Rehabify.{' '}
          <Link href="/cookie-policy" className="font-medium text-rh-ink underline underline-offset-4 hover:no-underline">
            Cookie policy
          </Link>
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onReject}
            className="h-11 rounded-full border border-rh-ink/15 bg-white px-4 text-sm font-semibold transition hover:border-rh-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="h-11 rounded-full bg-rh-lime px-4 text-sm font-semibold text-rh-ink transition hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2"
          >
            Accept all
          </button>
        </div>
        <button
          type="button"
          onClick={onCustomise}
          className="mt-3 w-full rounded-sm text-center text-sm font-medium text-rh-ink/65 underline-offset-4 transition hover:text-rh-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
        >
          Choose what to allow
        </button>
      </div>
    </motion.section>
  )
}
