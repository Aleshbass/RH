'use client'

/**
 * Free vs Individual Pro on the public physiotherapist page (Paul 17 Nov: "they can also see this
 * plan on the physiotherapist page"). Prices and limits come from Admin › Physio plans, so this
 * always matches what physios see in Settings › Plan & billing.
 */

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, Crown } from '@/components/icons'
import { signUpHrefFor } from '@/lib/auth/signupIntent'
import { DEFAULT_PHYSIO_PLAN_SETTINGS, dayLabel, naira, planFeatures, type PhysioPlanSettings } from '@/lib/physioPlans'
import { cn } from '@/lib/utils'

const publicPlansRef = makeFunctionReference<'query', Record<string, never>, { settings: PhysioPlanSettings; launched: boolean; foundingOpen: boolean }>(
  'physioPlans:publicPlans'
)

export function PhysioPricing() {
  const data = useQuery(publicPlansRef, {})
  const reduce = useReducedMotion()
  const s = data?.settings ?? DEFAULT_PHYSIO_PLAN_SETTINGS
  const features = planFeatures(s)
  const foundingOpen = data?.foundingOpen ?? true
  const signUp = signUpHrefFor('physiotherapist')
  const card = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const, delay },
  })
  return (
    <section id="plans" className="scroll-mt-24 px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="mx-auto max-w-6xl">
        <motion.div {...card(0)}>
          <h2 className="max-w-2xl text-[36px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-5xl">Free to start. Pro when you grow.</h2>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-rh-ink/70">
            Every tool is in Free. Pro is for busy practices that send home programmes to every patient and use Scribe every day.
          </p>
        </motion.div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <motion.article {...card(0.04)} className="flex flex-col rounded-[2rem] bg-white p-6 ring-1 ring-inset ring-rh-ink/[0.06] sm:p-8">
            <p className="text-sm font-semibold text-rh-ink/55">Free</p>
            <p className="mt-2 text-4xl font-bold tracking-tight">₦0</p>
            <p className="mt-1 text-sm text-rh-ink/55">Always free</p>
            <ul className="mt-6 flex-1 space-y-3 text-[15px]">
              {features.free.map((f) => (
                <li key={f} className="flex gap-3">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-rh-ink" />
                  <span className="text-rh-ink/75">{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href={signUp}
              className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full border border-rh-ink/15 px-6 text-[15px] font-semibold text-rh-ink transition hover:border-rh-ink/40"
            >
              Start free
            </Link>
          </motion.article>

          <motion.article {...card(0.1)} className="relative flex flex-col overflow-hidden rounded-[2rem] bg-rh-ink p-6 text-white sm:p-8">
            <p className="flex items-center gap-2 text-sm font-semibold text-rh-lime">
              <Crown className="h-4 w-4" /> Individual Pro
            </p>
            <p className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl font-bold tracking-tight">{naira(s.proPriceKobo)}</span>
              <span className="text-sm text-white/60">a month</span>
            </p>
            {foundingOpen ? (
              <p className="mt-2 inline-flex w-fit rounded-full bg-rh-lime px-3 py-1 text-xs font-bold text-rh-ink">
                Join by {dayLabel(s.foundingCutoff, false)}: {naira(s.foundingPriceKobo)} a month for your first {s.foundingMonths} months
              </p>
            ) : (
              <p className="mt-1 text-sm text-white/60">Cancel any time</p>
            )}
            <ul className="mt-6 flex-1 space-y-3 text-[15px]">
              {features.pro.map((f) => (
                <li key={f} className="flex gap-3">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-rh-lime" />
                  <span className="text-white/85">{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href={signUp}
              className={cn(
                'group mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-rh-lime px-6 text-[15px] font-semibold text-rh-ink transition hover:brightness-95'
              )}
            >
              {foundingOpen ? 'Join now and keep the founding price' : 'Start free, upgrade any time'}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.article>
        </div>
        <p className="mt-5 text-sm text-rh-ink/55">
          Working in a clinic on Rehabify? Your clinic&apos;s plan covers you. Pro opens {dayLabel(s.launchDate)}; Free limits apply from {dayLabel(s.limitsDate)}.
        </p>
      </div>
    </section>
  )
}
