'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  Award,
  BadgeCheck,
  Brain,
  CalendarDays,
  ChevronDown,
  Clock3,
  Dumbbell,
  HeartHandshake,
  Lock,
  MonitorPlay,
  PlayCircle,
  Video,
} from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { cn } from '@/lib/utils'
import {
  CheckItem,
  CLOSED_COPY,
  DEFAULT_DURATION,
  displayFont,
  Fact,
  InterestForm,
  naira,
  PairingShapes,
  pillLime,
  pillOutline,
  pillTeal,
  PROGRAM,
  titleCase,
  TRACKS,
  usePublicCohort,
  type PublicCohort,
  type Track,
} from './shared'

type RegistrationContext = {
  signedIn: boolean
  isRehabifyPhysio: boolean
  registration: { status: string; track: Track } | null
}

const SKILLS = [
  {
    icon: Activity,
    title: 'MSK assessment',
    body: 'A structured exam for common MSK problems.',
    tone: 'bg-rh-jasmine',
  },
  {
    icon: Brain,
    title: 'Clinical reasoning',
    body: 'From findings to a clear diagnosis and plan.',
    tone: 'bg-rh-rose',
  },
  {
    icon: HeartHandshake,
    title: 'Patient management',
    body: 'Set expectations and keep patients engaged.',
    tone: 'bg-rh-mint',
  },
  {
    icon: Dumbbell,
    title: 'Rehabilitation',
    body: 'Prescribe and progress exercise that works.',
    tone: 'bg-rh-honeydew',
  },
]

function SectionHeading({
  eyebrow,
  title,
  description,
  center = false,
}: {
  eyebrow: string
  title: string
  description?: string
  center?: boolean
}) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rh-teal">{eyebrow}</p>
      <h2 className="mt-3 text-[32px] leading-[1.1] tracking-tight text-rh-night sm:text-[44px]">{title}</h2>
      {description && <p className="mt-4 text-lg leading-relaxed text-rh-night/65">{description}</p>}
    </div>
  )
}

function FadeUp({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  )
}

function StatusPill({ cohort }: { cohort: PublicCohort | null | undefined }) {
  if (cohort === undefined) return <span className="block h-7 w-32 animate-pulse rounded-full bg-rh-night/[0.07]" />
  if (cohort === null) {
    return <span className="rounded-full bg-rh-jasmine px-3 py-1 text-xs font-semibold text-rh-night">Dates coming soon</span>
  }
  if (cohort.isOpen) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rh-mint px-3 py-1 text-xs font-semibold text-rh-teal">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rh-lime opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rh-lime" />
        </span>
        Registration open
      </span>
    )
  }
  return <span className="rounded-full bg-rh-bone px-3 py-1 text-xs font-semibold text-rh-night">Registration closed</span>
}

/** `compact` lays the facts out 2×2 so the card can sit over the cohort photo. */
function CohortCard({ cohort, compact = false }: { cohort: PublicCohort | null | undefined; compact?: boolean }) {
  const loading = cohort === undefined
  return (
    <div
      className={cn(
        'relative rounded-[1.75rem] bg-white text-rh-night shadow-soft',
        compact ? 'p-5 sm:p-6' : 'p-6 sm:p-8'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl leading-tight text-rh-night">{cohort?.cohortLabel ?? 'Next cohort'}</h2>
        <StatusPill cohort={cohort} />
      </div>

      <div className={cn(compact ? 'mt-5 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2' : 'mt-7 space-y-5')}>
        <Fact icon={CalendarDays} label="Next cohort" value={cohort?.dateRange ?? 'To be announced'} loading={loading} />
        <Fact icon={Video} label="Live sessions" value={cohort?.liveSessions ?? 'Weekly, online'} loading={loading} />
        <Fact icon={Clock3} label="Duration" value={cohort?.duration ?? DEFAULT_DURATION} loading={loading} />
        <Fact
          icon={MonitorPlay}
          label="Format"
          value={cohort?.format ?? 'Online + live clinical demonstrations'}
          loading={loading}
        />
      </div>

      <div className={cn('border-t border-rh-night/[0.07]', compact ? 'mt-5 pt-5' : 'mt-8 pt-6')}>
        {loading ? (
          <div className="h-12 animate-pulse rounded-full bg-rh-night/[0.06]" />
        ) : cohort?.isOpen ? (
          <>
            <a href="#register" className={cn(pillTeal, 'h-12 w-full text-[15px]')}>
              Register now <ArrowRight className="h-4 w-4" />
            </a>
            <p className="mt-3 text-center text-xs text-rh-night/55">
              {cohort.seatsLeft !== null && cohort.seatsLeft <= 20
                ? `Only ${cohort.seatsLeft} ${cohort.seatsLeft === 1 ? 'seat' : 'seats'} left`
                : `From ${naira(Math.min(cohort.prices.rehabify, cohort.prices.external))}`}
              {cohort.deadlineLabel ? ` · Register by ${cohort.deadlineLabel}` : ''}
            </p>
          </>
        ) : (
          <p className="text-sm leading-6 text-rh-night/65">
            {cohort ? CLOSED_COPY[cohort.closedReason ?? 'closed'] : 'The next cohort will be announced here.'}{' '}
            <a href="#register" className="font-semibold text-rh-teal underline-offset-4 hover:underline">
              Get notified
            </a>
          </p>
        )}
      </div>
    </div>
  )
}

function Hero({ cohort }: { cohort: PublicCohort | null | undefined }) {
  const reduce = useReducedMotion()
  const duration = cohort?.duration || DEFAULT_DURATION
  return (
    <section className="bg-rh-cream px-4 pb-16 pt-24 sm:px-6 sm:pt-28 lg:pb-24">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-14 py-4 sm:py-8 lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:gap-16">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold tracking-wide text-rh-teal ring-1 ring-inset ring-rh-night/10">
              <span className="h-1.5 w-1.5 rounded-full bg-rh-lime" />
              Rehabify Learn · MSK Specialist Program
            </span>
            <h1 className="mt-6 text-[40px] leading-[1.04] tracking-tight text-rh-night sm:text-[56px] lg:text-[62px]">
              Become a Rehabify Certified{' '}
              <span className="relative inline-block">
                MSK Specialist
                <span aria-hidden className="absolute -bottom-1 left-0 h-[0.12em] w-full rounded-full bg-rh-lime" />
              </span>{' '}
              in {titleCase(duration)}
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-rh-night/70">{PROGRAM.summary}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="#register" className={cn(pillTeal, 'h-12 px-7 text-[15px]')}>
                Register now <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#how-it-works" className={cn(pillOutline, 'h-12 px-7 text-[15px]')}>
                How it works
              </a>
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-rh-night/70">
              <li className="inline-flex items-center gap-2">
                <Award className="h-4 w-4 text-rh-teal" /> Certificate on completion
              </li>
              <li className="inline-flex items-center gap-2">
                <PlayCircle className="h-4 w-4 text-rh-teal" /> Every session recorded
              </li>
              <li className="inline-flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-rh-teal" /> Case-based learning
              </li>
            </ul>
          </motion.div>

          <motion.div
            className="relative mx-auto w-full max-w-md lg:max-w-none"
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          >
            {/* Colour pairing from the brand guide: night + lime squares behind the card */}
            <div aria-hidden className="absolute -left-4 -top-5 h-32 w-32 rounded-[2rem] bg-rh-night/55 sm:-left-8 sm:-top-8 sm:h-40 sm:w-40" />
            <div aria-hidden className="absolute -bottom-5 -right-3 h-28 w-28 rounded-[1.75rem] bg-rh-lime sm:-bottom-8 sm:-right-8 sm:h-36 sm:w-36" />
            {cohort?.imageUrl ? (
              <>
                <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-rh-night/40 ring-1 ring-rh-night/10">
                  <Image
                    src={cohort.imageUrl}
                    alt={cohort.imageAlt || PROGRAM.title}
                    fill
                    priority
                    sizes="(min-width: 1024px) 460px, (min-width: 640px) 448px, 100vw"
                    quality={90}
                    className="object-cover"
                  />
                </div>
                <div className="relative -mt-16 px-3 sm:-mt-20 sm:px-5">
                  <CohortCard cohort={cohort} compact />
                </div>
              </>
            ) : (
              <CohortCard cohort={cohort} />
            )}
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function Skills() {
  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeUp>
          <SectionHeading eyebrow="What you'll build" title="Practical skills for your next patient" />
        </FadeUp>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SKILLS.map((skill, i) => (
            <FadeUp key={skill.title} delay={i * 0.06}>
              <article className={cn('flex h-full min-h-[250px] flex-col rounded-[1.75rem] p-6 sm:p-7', skill.tone)}>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70 text-rh-night">
                  <skill.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-auto pt-10 text-[22px] leading-tight text-rh-night">{skill.title}</h3>
                <p className="mt-2 text-[15px] leading-6 text-rh-night/70">{skill.body}</p>
              </article>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks({ cohort }: { cohort: PublicCohort | null | undefined }) {
  const steps = [
    { title: 'Learn online', body: 'Structured lessons at your own pace.' },
    { title: 'Join live', body: `${cohort?.liveSessions ?? 'Weekly'}. Recorded if you miss one.` },
    { title: 'Work real cases', body: 'Case discussions. Live patient demos for Rehabify PTs.' },
    { title: 'Get certified', body: 'Pass the final assessment.' },
  ]
  return (
    <section id="how-it-works" className="scroll-mt-24 bg-rh-cream px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeUp>
          <SectionHeading eyebrow="How it works" title={`${titleCase(cohort?.duration || DEFAULT_DURATION)}, start to certificate`} />
        </FadeUp>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <FadeUp key={step.title} delay={i * 0.07}>
              <article className="h-full rounded-[1.75rem] bg-white p-6 shadow-soft sm:p-7">
                <span
                  aria-label={`Step ${i + 1}`}
                  className={cn('flex h-11 w-11 items-center justify-center rounded-full bg-rh-teal text-lg text-white', displayFont)}
                >
                  {i + 1}
                </span>
                <h3 className="mt-6 text-xl leading-tight text-rh-night">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-6 text-rh-night/70">{step.body}</p>
              </article>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

function PriceCard({
  track,
  cohort,
  context,
}: {
  track: Track
  cohort: PublicCohort | null | undefined
  context: RegistrationContext | undefined
}) {
  const details = TRACKS[track]
  const featured = track === 'rehabify'
  const price = cohort ? cohort.prices[track] : null
  const registered = context?.registration?.status === 'paid'
  const registeredHere = registered && context?.registration?.track === track

  let action: ReactNode
  if (cohort === undefined) {
    action = <div className={cn('h-12 animate-pulse rounded-full', featured ? 'bg-white/15' : 'bg-rh-night/[0.06]')} />
  } else if (registered) {
    action = (
      <div
        className={cn(
          'flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold',
          featured ? 'bg-white/10 text-white' : 'bg-rh-mint text-rh-teal'
        )}
      >
        <BadgeCheck className="h-4 w-4" />
        {registeredHere ? "You're registered" : 'Already registered'}
      </div>
    )
  } else if (cohort?.isOpen) {
    action = (
      <Link
        href={`/learn/register?track=${track}`}
        className={cn(featured ? pillLime : pillTeal, 'h-12 w-full text-[15px]')}
      >
        {details.cta} <ArrowRight className="h-4 w-4" />
      </Link>
    )
  } else {
    action = (
      <div
        className={cn(
          'flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold',
          featured ? 'bg-white/10 text-white/80' : 'bg-rh-canvas text-rh-night/55'
        )}
      >
        <Lock className="h-4 w-4" />
        {cohort ? 'Registration closed' : 'Opens with the next cohort'}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-[2rem] p-7 sm:p-9',
        featured ? 'bg-rh-teal text-white shadow-lift' : 'bg-white text-rh-night ring-1 ring-inset ring-rh-night/10'
      )}
    >
      {featured && <PairingShapes tone="night" className="-right-10 -top-10 h-36 w-36 opacity-60" />}
      <div className="relative flex flex-wrap items-center gap-2">
        <h3 className={cn('text-xl leading-tight', featured ? 'text-white' : 'text-rh-night')}>{details.label}</h3>
        {featured && (
          <span className="rounded-full bg-rh-lime px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rh-night">
            Best rate
          </span>
        )}
      </div>
      <div className="relative mt-6 flex items-end gap-2">
        {cohort === undefined ? (
          <span className={cn('h-12 w-36 animate-pulse rounded-2xl', featured ? 'bg-white/15' : 'bg-rh-night/[0.06]')} />
        ) : price !== null ? (
          <>
            <span className={cn('text-[52px] leading-none tracking-tight', displayFont)}>{naira(price)}</span>
            <span className={cn('pb-1.5 text-sm', featured ? 'text-white/65' : 'text-rh-night/50')}>one-off</span>
          </>
        ) : (
          <span className={cn('text-3xl leading-none', displayFont)}>Price coming soon</span>
        )}
      </div>
      <p className={cn('relative mt-4 text-[15px] leading-6', featured ? 'text-white/80' : 'text-rh-night/65')}>{details.audience}</p>

      <div className={cn('relative my-7 h-px', featured ? 'bg-white/15' : 'bg-rh-night/[0.08]')} />

      <p className={cn('relative text-xs font-semibold uppercase tracking-[0.14em]', featured ? 'text-rh-mint' : 'text-rh-night/45')}>
        Includes
      </p>
      <ul className="relative mt-4 space-y-3">
        {details.includes.map((item) => (
          <CheckItem key={item} onDark={featured}>
            {item}
          </CheckItem>
        ))}
      </ul>

      <div className="relative mt-auto pt-9">
        {action}
        {featured && cohort?.isOpen && !registered && (
          <p className="mt-3 text-center text-xs text-white/65">
            {context?.isRehabifyPhysio ? 'Your Rehabify account qualifies for this rate.' : 'Sign in with your Rehabify physiotherapist account to use this rate.'}
          </p>
        )}
      </div>
    </div>
  )
}

function Pricing({ cohort }: { cohort: PublicCohort | null | undefined }) {
  const context = useQuery(api.learn.getMyRegistrationContext, cohort ? { cohortId: cohort.id } : {}) as
    | RegistrationContext
    | undefined
  const registered = context?.registration?.status === 'paid'
  const description =
    cohort === undefined
      ? ' '
      : cohort?.isOpen
        ? `Next cohort: ${cohort.dateRange}`
        : cohort
          ? CLOSED_COPY[cohort.closedReason ?? 'closed']
          : 'Next cohort dates coming soon.'

  return (
    <section id="register" className="scroll-mt-24 bg-white px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeUp>
          <SectionHeading center eyebrow="Registration" title="Choose your registration" description={description} />
        </FadeUp>

        {registered && cohort && (
          <FadeUp className="mx-auto mt-8 max-w-5xl">
            <div className="flex items-center gap-3 rounded-2xl bg-rh-mint px-5 py-4 text-rh-night">
              <BadgeCheck className="h-5 w-5 shrink-0 text-rh-teal" />
              <p className="text-sm">
                <span className="font-semibold">You&apos;re registered for the {cohort.cohortLabel}.</span> Your confirmation email has the
                details. See you on {cohort.startsOn}!
              </p>
            </div>
          </FadeUp>
        )}

        <div className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-2">
          <FadeUp>
            <PriceCard track="rehabify" cohort={cohort} context={context} />
          </FadeUp>
          <FadeUp delay={0.08}>
            <PriceCard track="external" cohort={cohort} context={context} />
          </FadeUp>
        </div>

        {cohort !== undefined && !cohort?.isOpen && (
          <FadeUp className="mx-auto mt-6 max-w-5xl">
            <div className="flex flex-col gap-5 rounded-[1.75rem] bg-rh-honeydew p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="max-w-sm">
                <h3 className="text-xl leading-tight text-rh-night">Get notified about the next cohort</h3>
                <p className="mt-1 text-sm text-rh-night/65">One email when registration opens. Nothing else.</p>
              </div>
              <InterestForm className="sm:max-w-md" />
            </div>
          </FadeUp>
        )}

        <FadeUp className="mx-auto mt-6 max-w-5xl">
          <div className="flex gap-4 rounded-[1.75rem] bg-rh-cream p-6 sm:p-7">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-rh-teal">
              <Award className="h-5 w-5" />
            </span>
            <p className="text-sm leading-6 text-rh-night/70">
              <span className="font-semibold text-rh-night">About the certificate. </span>
              {PROGRAM.certificationNote}
            </p>
          </div>
        </FadeUp>
      </div>
    </section>
  )
}

function Faq({ cohort }: { cohort: PublicCohort | null | undefined }) {
  const items = [
    { q: 'What if I miss a live session?', a: 'Every session is recorded. Watch it later.' },
    {
      q: 'Who gets the Rehabify rate?',
      a: `Physiotherapists practising with Rehabify. Sign in with your Rehabify account when you register${cohort ? ` to pay ${naira(cohort.prices.rehabify)}` : ''}.`,
    },
    { q: "I'm not on Rehabify. Can I join?", a: "Yes, if you're a licensed physiotherapist." },
    { q: 'How do I pay?', a: 'Card, bank transfer or USSD through Paystack. Your confirmation comes by email.' },
    { q: 'How do I get the joining details?', a: 'By email, to the address you register with.' },
  ]
  return (
    <section className="bg-rh-cream px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <FadeUp>
          <SectionHeading eyebrow="Questions" title="Good to know" />
          <a
            href={`mailto:${PROGRAM.supportEmail}?subject=${encodeURIComponent(PROGRAM.title)}`}
            className="mt-6 inline-flex text-sm font-semibold text-rh-teal underline-offset-4 hover:underline"
          >
            {PROGRAM.supportEmail}
          </a>
        </FadeUp>
        <FadeUp className="space-y-3">
          {items.map((item) => (
            <details key={item.q} className="group rounded-[1.5rem] bg-white px-6 py-5 shadow-soft open:shadow-lift">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[17px] font-semibold text-rh-night [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rh-honeydew text-rh-teal transition group-open:rotate-180">
                  <ChevronDown className="h-4 w-4" />
                </span>
              </summary>
              <p className="mt-3 pr-10 text-[15px] leading-7 text-rh-night/70">{item.a}</p>
            </details>
          ))}
        </FadeUp>
      </div>
    </section>
  )
}

function FinalCta({ cohort }: { cohort: PublicCohort | null | undefined }) {
  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:py-24">
      <FadeUp className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[2rem] bg-rh-night px-6 py-12 text-white sm:rounded-[2.5rem] sm:px-12 sm:py-16 lg:px-16">
          <PairingShapes tone="teal" className="-bottom-16 -right-12 hidden h-64 w-64 sm:block" />
          <div className="relative max-w-2xl">
            <h2 className="text-[32px] leading-[1.1] tracking-tight text-white sm:text-[44px]">Ready to sharpen your MSK practice?</h2>
            {cohort?.isOpen ? (
              <>
                <p className="mt-4 text-lg leading-relaxed text-white/75">
                  The {cohort.cohortLabel} starts {cohort.startsOn}. Live sessions run {cohort.liveSessions}.
                </p>
                <a href="#register" className={cn(pillLime, 'mt-8 h-12 px-7 text-[15px]')}>
                  Save your place <ArrowRight className="h-4 w-4" />
                </a>
                <p className="mt-4 text-sm text-white/55">One payment · Every session recorded · Certificate on completion</p>
              </>
            ) : (
              <>
                <p className="mt-4 text-lg leading-relaxed text-white/75">
                  Be the first to know when registration for the next cohort opens.
                </p>
                <InterestForm onDark className="mt-8 max-w-lg" />
              </>
            )}
          </div>
        </div>
      </FadeUp>
    </section>
  )
}

export function MskProgramPage({ initialCohort }: { initialCohort?: PublicCohort | null }) {
  const cohort = usePublicCohort(initialCohort)
  return (
    <div className="bg-white">
      <Hero cohort={cohort} />
      <Skills />
      <HowItWorks cohort={cohort} />
      <Pricing cohort={cohort} />
      <Faq cohort={cohort} />
      <FinalCta cohort={cohort} />
    </div>
  )
}
