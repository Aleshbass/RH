'use client'

/**
 * The plans pop-up (owner 17 Nov 2026): when an admin switches it on in Admin › Physio plans,
 * each physio on Free sees it once. Founding physios get the founding offer ("lock in ₦15,000
 * now, first charge when Pro opens"); everyone else sees Pro. "See my plan" or "Not now" close it
 * for good.
 */

import { usePathname, useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Crown, X } from '@/components/icons'
import { dayLabel, naira } from '@/lib/physioPlans'
import { planApi, PLAN_PAGE } from './planApi'

export function PlanAnnouncement() {
  const data = useQuery(planApi.mine, {})
  const dismiss = useMutation(planApi.dismissAnnouncement)
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const reduce = useReducedMotion()
  const open = Boolean(data?.announce) && !pathname.startsWith(PLAN_PAGE)
  if (!data) return null
  const s = data.settings
  const founding = data.offer.founding
  const launched = data.offer.launched
  const close = () => void dismiss({})
  const go = () => {
    void dismiss({})
    router.push(PLAN_PAGE)
  }
  const points = founding
    ? [
        `${naira(s.foundingPriceKobo)} a month for your first ${s.foundingMonths} months, instead of ${naira(s.proPriceKobo)}`,
        launched ? 'Start today by card or bank transfer' : `A ${naira(data.offer.cardCheckKobo)} card check, refunded straight away. Your first charge is on ${dayLabel(s.launchDate, false)}`,
        'Cancel any time before then, or later',
      ]
    : [`${naira(s.proPriceKobo)} a month`, 'Home programmes for every patient, more Scribe, Joy included', 'Cancel any time']
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="Close" className="absolute inset-0 bg-[rgb(3_8_7/0.55)] backdrop-blur-[2px]" onClick={close} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="plans-announce-title"
            className="relative w-full max-w-md overflow-hidden rounded-[2rem] bg-rh-ink p-6 text-white shadow-2xl sm:p-8"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <button type="button" onClick={close} aria-label="Not now" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
            <motion.span
              initial={reduce ? false : { scale: 0.6, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.1 }}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rh-lime text-rh-ink"
            >
              <Crown className="h-6 w-6" />
            </motion.span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-rh-lime">{founding ? 'For our founding physios' : 'New'}</p>
            <h2 id="plans-announce-title" className="mt-2 text-[26px] font-semibold leading-tight tracking-tight">
              {founding ? `Lock in ${naira(s.foundingPriceKobo)} a month for Pro` : 'Meet Individual Pro'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              Free stays free. Pro is for busy practices: home programmes for every patient you see, {s.proScribeSessions} Scribe sessions a month and Joy for
              up to {s.proJoyPatients} patients.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm">
              {points.map((p) => (
                <li key={p} className="flex gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-rh-lime" />
                  <span className="text-white/85">{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={go} className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-rh-lime px-6 text-sm font-semibold text-rh-ink transition hover:brightness-95 active:scale-[0.98]">
                {founding && !launched ? 'Lock in my price' : 'See my plan'}
              </button>
              <button type="button" onClick={close} className="inline-flex h-12 items-center justify-center rounded-full px-5 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white">
                Not now
              </button>
            </div>
            <p className="mt-4 text-xs text-white/45">Free limits start {dayLabel(s.limitsDate)}. You can see your plan any time in Settings › Plan &amp; billing.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
