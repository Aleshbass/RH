'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, CalendarDays, Clock3, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  displayFont,
  isPromoted,
  naira,
  pillGhostOnDark,
  pillLime,
  PROGRAM,
  QuietBoundary,
  titleCase,
  TRACKS,
  usePublicCohort,
  type PublicCohort,
} from '@/components/learn/shared'

/**
 * Landing-page promotion for the MSK Specialist Program. Renders nothing unless an admin has
 * made a cohort live with "Show on landing page" on and registration is still open. With a
 * cohort photo it becomes a text-and-image split; without one, the right side shows prices.
 */
export function MskProgramSection() {
  return (
    <QuietBoundary>
      <Section />
    </QuietBoundary>
  )
}

function PriceTiles({ cohort }: { cohort: PublicCohort }) {
  return (
    <div className="grid gap-3">
      <Link
        href="/learn/register?track=rehabify"
        className="flex items-center justify-between gap-4 rounded-[1.5rem] bg-white p-5 text-rh-night transition hover:-translate-y-0.5 sm:p-6"
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">{TRACKS.rehabify.label}</span>
          <span className="mt-0.5 block text-sm text-rh-night/60">Practising with Rehabify</span>
        </span>
        <span className={cn('shrink-0 text-[32px] leading-none tracking-tight', displayFont)}>{naira(cohort.prices.rehabify)}</span>
      </Link>
      <Link
        href="/learn/register?track=external"
        className="flex items-center justify-between gap-4 rounded-[1.5rem] bg-rh-mint p-5 text-rh-night transition hover:-translate-y-0.5 sm:p-6"
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">{TRACKS.external.label}</span>
          <span className="mt-0.5 block text-sm text-rh-night/60">Licensed physiotherapists</span>
        </span>
        <span className={cn('shrink-0 text-[32px] leading-none tracking-tight', displayFont)}>{naira(cohort.prices.external)}</span>
      </Link>
      <p className="px-1 text-sm text-white/65">
        {cohort.seatsLeft !== null && cohort.seatsLeft <= 20
          ? `Only ${cohort.seatsLeft} ${cohort.seatsLeft === 1 ? 'seat' : 'seats'} left in the ${cohort.cohortLabel}.`
          : 'Certificate on completion. Every live session is recorded.'}
      </p>
    </div>
  )
}

/** Compact prices under the text, used when the photo takes the right side. */
function PriceChips({ cohort }: { cohort: PublicCohort }) {
  const chips = [
    { label: 'Rehabify physios', price: cohort.prices.rehabify, href: '/learn/register?track=rehabify' },
    { label: 'Other physios', price: cohort.prices.external, href: '/learn/register?track=external' },
  ]
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={chip.href}
          className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-inset ring-white/10 transition hover:bg-white/15"
        >
          <span className="block text-xs text-white/65">{chip.label}</span>
          <span className={cn('block text-2xl leading-tight text-white', displayFont)}>{naira(chip.price)}</span>
        </Link>
      ))}
    </div>
  )
}

function Photo({ cohort, imageUrl }: { cohort: PublicCohort; imageUrl: string }) {
  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
      <div aria-hidden className="absolute -right-3 -top-3 h-24 w-24 rounded-[1.5rem] bg-rh-lime sm:-right-5 sm:-top-5 sm:h-28 sm:w-28" />
      <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-rh-night/40 ring-1 ring-white/10">
        <Image
          src={imageUrl}
          alt={cohort.imageAlt || PROGRAM.title}
          fill
          sizes="(min-width: 1024px) 480px, (min-width: 640px) 512px, 100vw"
          quality={90}
          className="object-cover"
        />
      </div>
      <div className="absolute -bottom-5 left-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-rh-night shadow-lift sm:left-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rh-honeydew text-rh-teal">
          <CalendarDays className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-rh-night/45">Next cohort</span>
          <span className="block text-sm font-semibold">{cohort.dateRange}</span>
        </span>
      </div>
    </div>
  )
}

function Section() {
  const cohort = usePublicCohort()
  const reduce = useReducedMotion()
  if (!cohort || !isPromoted(cohort, 'landing')) return null

  const imageUrl = cohort.imageUrl
  const facts = [
    // With a photo, the dates sit on the floating card instead
    ...(imageUrl ? [] : [{ icon: CalendarDays, text: cohort.dateRange }]),
    { icon: Video, text: cohort.liveSessions },
    { icon: Clock3, text: cohort.duration },
  ]

  return (
    <section aria-labelledby="msk-program-heading" className="bg-white px-4 py-14 sm:px-6 sm:py-20">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[linear-gradient(115deg,#002e2c_0%,#004a46_42%,#005b57_100%)] text-white sm:rounded-[2.5rem]"
      >
        {!imageUrl && (
          <>
            <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-[2.25rem] bg-rh-night/50" />
            <div aria-hidden className="pointer-events-none absolute right-10 top-16 hidden h-14 w-14 rounded-2xl bg-rh-lime lg:block" />
          </>
        )}

        <div
          className={cn(
            'relative grid gap-10 px-6 py-10 sm:px-10 sm:py-14 lg:items-center lg:gap-14 lg:px-14 lg:py-16',
            imageUrl ? 'pb-14 lg:grid-cols-[1.05fr_1fr]' : 'lg:grid-cols-[1.3fr_1fr]'
          )}
        >
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-rh-mint">
              <span className="rounded-full bg-rh-lime px-2 py-0.5 text-[10px] tracking-wide text-rh-night">New</span>
              Rehabify Learn · For physiotherapists
            </p>
            <h2 id="msk-program-heading" className="mt-4 text-[32px] leading-[1.08] tracking-tight text-white sm:text-[44px]">
              Become a Rehabify Certified MSK Specialist in {titleCase(cohort.duration)}
            </h2>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-white/75">{PROGRAM.summary}</p>

            <ul className="mt-7 flex flex-wrap gap-2">
              {facts.map(({ icon: Icon, text }) => (
                <li
                  key={text}
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/10"
                >
                  <Icon className="h-4 w-4 text-rh-lime" />
                  {text}
                </li>
              ))}
            </ul>

            {imageUrl && <PriceChips cohort={cohort} />}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/learn#register" className={cn(pillLime, 'h-12 px-7 text-[15px] focus-visible:ring-offset-rh-night')}>
                Register now <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/learn" className={cn(pillGhostOnDark, 'h-12 px-7 text-[15px] focus-visible:ring-offset-rh-night')}>
                See the program
              </Link>
            </div>
          </div>

          {imageUrl ? <Photo cohort={cohort} imageUrl={imageUrl} /> : <PriceTiles cohort={cohort} />}
        </div>
      </motion.div>
    </section>
  )
}
