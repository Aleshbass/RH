'use client'

/**
 * Rehabify Learn home (learn.physioaroundme.com): a course platform, not one program's page.
 * The MSK Specialist Program is one entry in the catalogue (and the featured live program).
 * Photos come from the blog media library (./media.ts).
 */

import { useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  Award,
  Baby,
  BadgeCheck,
  Bone,
  Brain,
  CalendarDays,
  Dumbbell,
  Footprints,
  GraduationCap,
  HeartPulse,
  Laptop,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Users,
  Building2,
  HeartHandshake,
} from '@/components/icons'
import { COURSE_CATEGORIES, type CourseCategory } from '@/lib/learn/catalog'
import { cn } from '@/lib/utils'
import { displayFont, naira, pillInk, pillLime, pillOutline, usePublicCohort, PROGRAM, type PublicCohort } from '../shared'
import { CourseCard, CourseCardSkeleton, CoverImage, programItem, useCatalog, type CatalogItem } from './catalog'
import { TagBadge, useLearnerIdentity } from './identity'
import { learnPath, learnSignUpHref, mainSiteUrl, MSK_PROGRAM_PATH, MY_LEARNING_PATH, WELCOME_PATH } from './learnApi'
import { imagekitPhotoLoader, LEARN_PHOTOS, type LearnPhoto } from './media'

const CATEGORY_ICON: Record<CourseCategory, ComponentType<{ className?: string }>> = {
  msk: Bone,
  spine: Activity,
  sports: Dumbbell,
  neuro: Brain,
  cardio: HeartPulse,
  paeds: Baby,
  womens: HeartHandshake,
  older: Footprints,
  practice: Laptop,
  students: GraduationCap,
}

const POPULAR: CourseCategory[] = ['msk', 'spine', 'sports', 'neuro', 'students']

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

function Photo({ photo, sizes, priority, className }: { photo: LearnPhoto; sizes: string; priority?: boolean; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden bg-rh-ink/[0.06]', className)}>
      <Image src={photo.src} alt={photo.alt} fill sizes={sizes} priority={priority} loader={imagekitPhotoLoader} className="object-cover" />
    </div>
  )
}

function SectionTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h2 className={cn('text-[30px] leading-[1.1] tracking-tight text-rh-ink sm:text-[40px]', displayFont)}>{title}</h2>
        {sub && <p className="mt-3 text-[16px] leading-relaxed text-rh-ink/60">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────────────────────

function HeroSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const term = q.trim()
    router.push(term ? `${learnPath('/courses')}?q=${encodeURIComponent(term)}` : learnPath('/courses'))
  }
  return (
    <form role="search" onSubmit={submit} className="relative mt-8 max-w-xl">
      <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-rh-ink/40" />
      <label htmlFor="learn-hero-search" className="sr-only">
        Search courses
      </label>
      <input
        id="learn-hero-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Try “low back pain” or “ACL rehab”"
        className="h-14 w-full rounded-full border border-rh-ink/10 bg-white pl-14 pr-32 text-[15px] text-rh-ink shadow-soft placeholder:text-rh-ink/40 focus:border-rh-ink focus:outline-none focus:ring-4 focus:ring-rh-ink/[0.07]"
      />
      <button type="submit" className={cn(pillInk, 'absolute right-1.5 top-1.5 h-11 px-5')}>
        Search
      </button>
    </form>
  )
}

function HeroGreeting() {
  const identity = useLearnerIdentity()
  if (identity === undefined) return <div className="mt-8 h-12 w-72 animate-pulse rounded-full bg-rh-ink/[0.06]" />
  if (!identity.signedIn) {
    return (
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href={learnSignUpHref()} className={cn(pillInk, 'h-12 px-7 text-[15px]')}>
          Join for free <ArrowRight className="h-4 w-4" />
        </Link>
        <Link href={learnPath('/courses')} className={cn(pillOutline, 'h-12 px-7 text-[15px]')}>
          Browse courses
        </Link>
      </div>
    )
  }
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <Link href={MY_LEARNING_PATH} className={cn(pillInk, 'h-12 px-7 text-[15px]')}>
        Continue learning <ArrowRight className="h-4 w-4" />
      </Link>
      <span className="inline-flex items-center gap-2 text-sm text-rh-ink/65">
        Signed in{identity.firstName ? ` as ${identity.firstName}` : ''} <TagBadge tag={identity.tag} size="xs" />
      </span>
    </div>
  )
}

function Hero({ cohort }: { cohort: PublicCohort | null | undefined }) {
  const reduce = useReducedMotion()
  return (
    <section className="relative overflow-hidden bg-white px-4 pb-14 pt-10 sm:px-6 sm:pt-14 lg:pb-20">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className={cn('text-[42px] leading-[1.02] tracking-tight text-rh-ink sm:text-[58px] lg:text-[66px]', displayFont)}>
            Become the physio patients{' '}
            <span className="relative inline-block">
              ask for
              <span aria-hidden className="absolute -bottom-1 left-0 h-[0.12em] w-full rounded-full bg-rh-lime" />
            </span>
            .
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-rh-ink/65">
            Video courses, live programs and certificates from Rehabify clinicians. For physio students, new graduates and experienced
            physiotherapists.
          </p>
          <HeroSearch />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-rh-ink/45">Popular:</span>
            {POPULAR.map((id) => {
              const c = COURSE_CATEGORIES.find((x) => x.id === id)!
              return (
                <Link
                  key={id}
                  href={`${learnPath('/courses')}?category=${id}`}
                  className="rounded-full border border-rh-ink/10 px-3 py-1.5 text-xs font-semibold text-rh-ink transition hover:border-rh-ink/30 hover:bg-rh-cream"
                >
                  {c.short}
                </Link>
              )
            })}
          </div>
          <HeroGreeting />
        </motion.div>

        <motion.div
          className="relative"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        >
          <div aria-hidden className="absolute -right-6 -top-6 hidden h-40 w-40 rounded-[2.25rem] bg-rh-lime sm:block" />
          <div aria-hidden className="absolute -bottom-6 -left-6 hidden h-32 w-32 rounded-[2rem] bg-rh-ink sm:block" />
          <div className="relative grid grid-cols-5 grid-rows-[auto_auto] gap-3 sm:gap-4">
            <Photo
              photo={LEARN_PHOTOS.consult}
              priority
              sizes="(min-width: 1024px) 560px, 100vw"
              className="col-span-5 aspect-[16/10] rounded-[1.75rem]"
            />
            <Photo
              photo={LEARN_PHOTOS.backPain}
              sizes="(min-width: 1024px) 220px, 40vw"
              className="col-span-2 aspect-[4/5] rounded-[1.5rem]"
            />
            <div className="col-span-3 flex flex-col gap-3 sm:gap-4">
              <Photo photo={LEARN_PHOTOS.stretch} sizes="(min-width: 1024px) 330px, 60vw" className="aspect-[4/3] rounded-[1.5rem]" />
              <div className="flex flex-1 items-center gap-3 rounded-[1.5rem] bg-rh-ink p-4 text-white">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rh-lime text-rh-ink">
                  <Radio className="h-5 w-5" />
                </span>
                <span className="min-w-0 text-sm leading-snug">
                  <span className="block font-semibold">Live clinical sessions</span>
                  <span className="block truncate text-white/65">{cohort?.liveSessions ? cohort.liveSessions : 'Weekly, online'}</span>
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Signed-in nudge, topics, courses
// ─────────────────────────────────────────────────────────────────────────────

function WelcomeNudge() {
  const identity = useLearnerIdentity()
  if (!identity?.signedIn || !identity.needsWelcome) return null
  return (
    <section className="px-4 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 rounded-[1.75rem] bg-rh-jasmine/60 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-rh-ink">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-rh-ink">Are you a physio student or a physiotherapist?</p>
            <p className="mt-0.5 text-sm text-rh-ink/65">Tell us once and we&apos;ll show the right courses and prices, with your tag on your account.</p>
          </div>
        </div>
        <Link href={WELCOME_PATH} className={cn(pillInk, 'h-11 shrink-0')}>
          Tell us about you
        </Link>
      </div>
    </section>
  )
}

function Topics({ items }: { items: CatalogItem[] | undefined }) {
  return (
    <section className="bg-white px-4 py-14 sm:px-6 lg:py-16">
      <div className="mx-auto max-w-7xl">
        <FadeUp>
          <SectionTitle title="Browse by topic" />
        </FadeUp>
        <FadeUp delay={0.05}>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {COURSE_CATEGORIES.map((c) => {
              const Icon = CATEGORY_ICON[c.id]
              const count = items?.filter((i) => i.category === c.id).length
              return (
                <Link
                  key={c.id}
                  href={`${learnPath('/courses')}?category=${c.id}`}
                  className="group flex items-center gap-3 rounded-2xl border border-rh-ink/[0.08] bg-white p-3.5 transition hover:border-rh-ink/25 hover:bg-rh-cream/60 sm:p-4"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rh-cream text-rh-ink transition group-hover:bg-rh-ink group-hover:text-rh-lime">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-rh-ink">{c.label}</span>
                    <span className="block text-xs text-rh-ink/50">
                      {count === undefined ? ' ' : count === 0 ? 'Coming soon' : `${count} ${count === 1 ? 'course' : 'courses'}`}
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>
        </FadeUp>
      </div>
    </section>
  )
}

function MoreComingTile() {
  const identity = useLearnerIdentity()
  return (
    <div className="flex aspect-auto flex-col justify-between rounded-[1.25rem] bg-rh-cream p-6 sm:min-h-[16rem]">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-rh-ink">
        <Plus className="h-5 w-5" />
      </span>
      <div className="mt-8">
        <p className={cn('text-xl leading-snug tracking-tight text-rh-ink', displayFont)}>More courses are on the way</p>
        <p className="mt-1.5 text-sm text-rh-ink/60">
          {identity?.signedIn ? 'New courses show up here first.' : 'Join free and new courses show up in your account first.'}
        </p>
        {identity && !identity.signedIn && (
          <Link href={learnSignUpHref()} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-rh-ink hover:underline">
            Join for free <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  )
}

function CourseRow({ items }: { items: CatalogItem[] | undefined }) {
  const shown = items?.slice(0, 8)
  return (
    <section className="bg-white px-4 pb-16 sm:px-6 lg:pb-24">
      <div className="mx-auto max-w-7xl">
        <FadeUp>
          <SectionTitle
            title="Start learning"
            sub="Live programs with a cohort, and video courses you can watch at your own pace."
            action={
              <Link href={learnPath('/courses')} className={cn(pillOutline, 'self-start sm:self-auto')}>
                All courses <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
        </FadeUp>
        <div className="mt-9 grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          {shown === undefined
            ? [0, 1, 2, 3].map((i) => <CourseCardSkeleton key={i} />)
            : shown.map((item, i) => (
                <FadeUp key={item.key} delay={Math.min(i, 4) * 0.05}>
                  <CourseCard item={item} priority={i < 2} />
                </FadeUp>
              ))}
          {shown !== undefined && shown.length < 4 && (
            <FadeUp delay={0.1}>
              <MoreComingTile />
            </FadeUp>
          )}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Featured live program
// ─────────────────────────────────────────────────────────────────────────────

function FeaturedProgram({ cohort }: { cohort: PublicCohort | null | undefined }) {
  if (cohort === undefined) return null
  const item = programItem(cohort)
  const open = Boolean(cohort?.isOpen)
  const facts: { icon: ComponentType<{ className?: string }>; label: string }[] = [
    { icon: CalendarDays, label: cohort?.dateRange ?? 'Next cohort dates coming soon' },
    { icon: Radio, label: cohort?.liveSessions ? `Live ${cohort.liveSessions}` : 'Weekly live sessions' },
    { icon: Award, label: 'Final assessment and certificate' },
  ]
  return (
    <section className="bg-rh-ink px-4 py-16 text-white sm:px-6 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16">
        <FadeUp>
          <Link href={MSK_PROGRAM_PATH} className="group relative block aspect-[16/11] overflow-hidden rounded-[2rem]">
            <CoverImage
              cover={item.cover}
              sizes="(min-width: 1024px) 640px, 100vw"
              className="transition duration-700 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
            <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-rh-lime px-3 py-1.5 text-xs font-bold text-rh-ink">
              <Radio className="h-3.5 w-3.5" /> Live program
            </span>
          </Link>
        </FadeUp>
        <FadeUp delay={0.08}>
          <p className="text-sm font-semibold text-rh-lime">{open ? `${cohort?.cohortLabel} · registration open` : 'Featured program'}</p>
          <h2 className={cn('mt-3 text-[34px] leading-[1.05] tracking-tight sm:text-[48px]', displayFont)}>{PROGRAM.shortTitle}</h2>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-white/70">{PROGRAM.summary}</p>
          <ul className="mt-7 space-y-3">
            {facts.map((f) => (
              <li key={f.label} className="flex items-center gap-3 text-[15px] text-white/85">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-rh-lime">
                  <f.icon className="h-4 w-4" />
                </span>
                {f.label}
              </li>
            ))}
          </ul>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={MSK_PROGRAM_PATH} className={cn(pillLime, 'h-12 px-7 text-[15px]')}>
              {open ? 'View program and register' : 'View program'} <ArrowRight className="h-4 w-4" />
            </Link>
            {open && cohort && (
              <span className="text-sm text-white/60">
                From {naira(Math.min(cohort.prices.rehabify, cohort.prices.external))}
                {cohort.deadlineLabel ? ` · register by ${cohort.deadlineLabel}` : ''}
              </span>
            )}
          </div>
        </FadeUp>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Audiences
// ─────────────────────────────────────────────────────────────────────────────

function Audiences() {
  const cards: {
    id?: string
    photo: LearnPhoto
    icon: ComponentType<{ className?: string }>
    title: string
    body: string
    link: { href: string; label: string }
  }[] = [
    {
      id: 'students',
      photo: LEARN_PHOTOS.phone,
      icon: GraduationCap,
      title: 'Physio students',
      body: "Learn beyond the lecture hall, on your phone. Tell us you're a student when you join. When you qualify, join Rehabify as a physio with the same login.",
      link: { href: learnSignUpHref(), label: 'Join as a student' },
    },
    {
      photo: LEARN_PHOTOS.explain,
      icon: Stethoscope,
      title: 'Physiotherapists',
      body: 'Sharpen your assessment, reasoning and rehab. Physios practising with Rehabify get member prices automatically when they sign in.',
      link: { href: learnPath('/courses'), label: 'Browse courses' },
    },
    {
      photo: LEARN_PHOTOS.deskIllustration,
      icon: Building2,
      title: 'Clinic owners and teams',
      body: 'Sign in with your Rehabify clinic account and learn alongside your team. Your clinic shows on your account.',
      link: { href: mainSiteUrl('/platform/clinics'), label: 'Rehabify for clinics' },
    },
  ]
  return (
    <section className="bg-rh-cream px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <FadeUp>
          <SectionTitle title="For every stage of your career" sub="One Rehabify login. Your account shows who you are, so prices and courses fit you." />
        </FadeUp>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {cards.map((card, i) => (
            <FadeUp key={card.title} delay={i * 0.06}>
              <article id={card.id} className="flex h-full scroll-mt-24 flex-col overflow-hidden rounded-[1.75rem] bg-white">
                <Photo photo={card.photo} sizes="(min-width: 768px) 33vw, 100vw" className="aspect-[4/3]" />
                <div className="flex flex-1 flex-col p-6 sm:p-7">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rh-ink text-rh-lime">
                    <card.icon className="h-5 w-5" />
                  </span>
                  <h3 className={cn('mt-5 text-2xl tracking-tight text-rh-ink', displayFont)}>{card.title}</h3>
                  <p className="mt-2 flex-1 text-[15px] leading-6 text-rh-ink/65">{card.body}</p>
                  <Link href={card.link.href} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-rh-ink hover:underline">
                    {card.link.label} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// How it works, team, certificates, questions
// ─────────────────────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps: { icon: ComponentType<{ className?: string }>; title: string; body: string }[] = [
    { icon: Users, title: 'Join free', body: 'One Rehabify login for every course.' },
    { icon: Search, title: 'Pick a course', body: 'A live program with a cohort, or a video course.' },
    { icon: Smartphone, title: 'Learn anywhere', body: 'Phone or computer. Your place in each lesson is saved.' },
    { icon: BadgeCheck, title: 'Get certified', body: 'Certificates anyone can check online.' },
  ]
  return (
    <section className="bg-white px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <FadeUp>
          <SectionTitle title="How it works" />
        </FadeUp>
        <ol className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <FadeUp key={s.title} delay={i * 0.06}>
              <li className="border-t-2 border-rh-ink pt-5">
                <div className="flex items-center justify-between">
                  <s.icon className="h-6 w-6 text-rh-ink" />
                  <span className="text-sm tabular-nums text-rh-ink/35">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h3 className={cn('mt-5 text-xl tracking-tight text-rh-ink', displayFont)}>{s.title}</h3>
                <p className="mt-1.5 text-[15px] leading-6 text-rh-ink/60">{s.body}</p>
              </li>
            </FadeUp>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Team() {
  return (
    <section className="bg-white px-4 pb-16 sm:px-6 lg:pb-24">
      <div className="mx-auto grid max-w-7xl gap-8 overflow-hidden rounded-[2rem] bg-rh-honeydew lg:grid-cols-[0.8fr_1.2fr]">
        <Photo photo={LEARN_PHOTOS.mary} sizes="(min-width: 1024px) 480px, 100vw" className="aspect-[5/4] lg:aspect-auto lg:min-h-[26rem]" />
        <FadeUp className="flex flex-col justify-center p-6 pb-10 sm:p-10 lg:py-14 lg:pl-4 lg:pr-14">
          <h2 className={cn('text-[30px] leading-[1.1] tracking-tight text-rh-ink sm:text-[40px]', displayFont)}>Built by clinicians who treat patients</h2>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-rh-ink/65">
            Rehabify Learn courses come from the Rehabify clinical team: practical, case-based and made for the patients you see every week.
          </p>
          <div className="mt-7 flex items-center gap-3">
            <span className="h-10 w-1 rounded-full bg-rh-lime" />
            <div>
              <p className="font-semibold text-rh-ink">Mary Akinwola</p>
              <p className="text-sm text-rh-ink/60">BPT, MSc (Oxford) · Rehabify</p>
            </div>
          </div>
          <p className="mt-8 text-sm text-rh-ink/65">
            Want to teach on Rehabify Learn?{' '}
            <a href="mailto:support@physioaroundme.com?subject=Teaching%20on%20Rehabify%20Learn" className="font-semibold text-rh-ink underline-offset-4 hover:underline">
              Tell us about your course
            </a>
          </p>
        </FadeUp>
      </div>
    </section>
  )
}

function VerifyBand() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const clean = code.trim().toUpperCase()
    if (clean) router.push(learnPath(`/verify/${encodeURIComponent(clean)}`))
  }
  return (
    <section className="bg-rh-cream px-4 py-16 sm:px-6 lg:py-20">
      <FadeUp className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-xl items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rh-ink text-rh-lime">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <h2 className={cn('text-[26px] leading-tight tracking-tight text-rh-ink sm:text-[32px]', displayFont)}>Every certificate can be checked</h2>
            <p className="mt-2 text-[15px] leading-6 text-rh-ink/60">Employers and clinics can confirm a Rehabify Learn certificate with the code printed on it.</p>
          </div>
        </div>
        <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
          <label htmlFor="learn-verify-code" className="sr-only">
            Certificate code
          </label>
          <input
            id="learn-verify-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="RHL-XXXX-XXXX"
            autoCapitalize="characters"
            className="h-12 w-full rounded-full border border-rh-ink/10 bg-white px-5 text-[15px] uppercase tracking-wide text-rh-ink placeholder:normal-case placeholder:tracking-normal placeholder:text-rh-ink/35 focus:border-rh-ink focus:outline-none focus:ring-4 focus:ring-rh-ink/[0.07]"
          />
          <button type="submit" className={cn(pillInk, 'h-12 shrink-0')}>
            Check
          </button>
        </form>
      </FadeUp>
    </section>
  )
}

const FAQ = [
  {
    q: 'Who is Rehabify Learn for?',
    a: 'Physiotherapists and physiotherapy students. Courses are practical and built around the patients you see in clinic.',
  },
  {
    q: 'Do I need a Rehabify account?',
    a: 'Joining is free and one login covers every course. If you already use Rehabify as a physio or clinic, sign in with that account and your tag and member prices come with it.',
  },
  {
    q: "I'm a physio student. Can I join?",
    a: "Yes. Tell us you're a student when you join. When you qualify, you can join Rehabify as a physiotherapist with the same login.",
  },
  { q: 'How do I pay?', a: 'Card, bank transfer or USSD through Paystack. Free courses need no payment.' },
  { q: 'Can I learn on my phone?', a: 'Yes. Every course works on phones and computers, and your place in each lesson is saved.' },
  { q: 'Are the certificates accredited?', a: PROGRAM.certificationNote },
]

function Questions() {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <FadeUp>
          <SectionTitle title="Questions" />
          <a href="mailto:support@physioaroundme.com?subject=Rehabify%20Learn" className="mt-5 inline-flex text-sm font-semibold text-rh-ink underline-offset-4 hover:underline">
            support@physioaroundme.com
          </a>
        </FadeUp>
        <FadeUp className="divide-y divide-rh-ink/[0.08] border-y border-rh-ink/[0.08]">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[17px] font-semibold text-rh-ink [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus className="h-4 w-4 shrink-0 transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none" />
              </summary>
              <p className="mt-3 pr-10 text-[15px] leading-7 text-rh-ink/65">{item.a}</p>
            </details>
          ))}
        </FadeUp>
      </div>
    </section>
  )
}

function FinalCta() {
  const identity = useLearnerIdentity()
  const signedIn = Boolean(identity?.signedIn)
  return (
    <section className="bg-white px-4 pb-20 sm:px-6 lg:pb-24">
      <FadeUp className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[2rem] bg-rh-ink px-6 py-12 text-white sm:rounded-[2.5rem] sm:px-12 sm:py-16 lg:px-16">
          <div aria-hidden className="absolute -bottom-14 -right-10 hidden h-56 w-56 rounded-[3rem] bg-rh-lime sm:block" />
          <div aria-hidden className="absolute -bottom-24 right-40 hidden h-40 w-40 rounded-[2.5rem] bg-white/[0.06] sm:block" />
          <div className="relative max-w-2xl">
            <h2 className={cn('text-[32px] leading-[1.08] tracking-tight sm:text-[48px]', displayFont)}>Your next patient will notice.</h2>
            <p className="mt-4 text-lg leading-relaxed text-white/70">Start with a free account, then pick the course that fits where you are.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={signedIn ? learnPath('/courses') : learnSignUpHref()} className={cn(pillLime, 'h-12 px-7 text-[15px]')}>
                {signedIn ? 'Browse courses' : 'Join for free'} <ArrowRight className="h-4 w-4" />
              </Link>
              {!signedIn && (
                <Link href={learnPath('/courses')} className="inline-flex h-12 items-center justify-center rounded-full border border-white/25 px-7 text-[15px] font-semibold text-white transition hover:bg-white/10">
                  Browse courses
                </Link>
              )}
            </div>
          </div>
        </div>
      </FadeUp>
    </section>
  )
}

export function LearnHome({ initialCohort }: { initialCohort?: PublicCohort | null }) {
  const cohort = usePublicCohort(initialCohort)
  const items = useCatalog(initialCohort)
  return (
    <>
      <Hero cohort={cohort} />
      <WelcomeNudge />
      <Topics items={items} />
      <CourseRow items={items} />
      <FeaturedProgram cohort={cohort} />
      <Audiences />
      <HowItWorks />
      <Team />
      <VerifyBand />
      <Questions />
      <FinalCta />
    </>
  )
}
