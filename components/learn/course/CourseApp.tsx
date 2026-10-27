'use client'

/**
 * Rehabify Learn "My course" (/learn/course): everything a paid physio needs in one place.
 * Signed-out visitors get a one-tap link by email instead of a password form.
 */

import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { UserButton, useClerk } from '@clerk/nextjs'
import { useAction, useConvexAuth, useQuery } from 'convex/react'
import { ArrowRight, BookOpen, Check, GraduationCap, Library, Loader2, LogIn, Mail, PlayCircle, SearchX } from '@/components/icons'
import { errorMessage } from '@/components/partners/portal/shared'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { displayFont, fieldClass, pillInk, pillOutline, PROGRAM } from '../shared'
import { CourseHome } from './CourseHome'
import { dateOnly, type CourseOk, type MyCourse } from './shared'
import { StudyDrawer, type StudyPanel } from './StudyDrawer'
import { StudyLibrary } from './StudyLibrary'
import { VideoCourses } from '../video/VideoCourses'

type Tab = 'course' | 'courses' | 'library'
const SIGN_IN_HREF = `/sign-in?redirect=${encodeURIComponent('/learn/course')}`

function TopBar({ tab, setTab, showTabs }: { tab?: Tab; setTab?: (tab: Tab) => void; showTabs: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-rh-ink/[0.06] bg-rh-cream/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/learn" className="flex shrink-0 items-center gap-2" aria-label="Rehabify Learn">
          <Image src="/logos/Ink%20MainRehabify.svg" alt="Rehabify" width={96} height={30} className="h-6 w-auto sm:h-7" />
          <span className="hidden rounded-full bg-rh-ink px-2 py-0.5 text-[11px] font-semibold text-rh-lime sm:inline">Learn</span>
        </Link>
        {showTabs && tab && setTab && (
          <nav className="mx-auto flex rounded-full bg-white p-1 shadow-sm ring-1 ring-inset ring-rh-ink/[0.06]" aria-label="Course sections">
            {(
              [
                { key: 'course', label: 'My course', icon: BookOpen },
                { key: 'courses', label: 'Courses', icon: PlayCircle },
                { key: 'library', label: 'Library', icon: Library },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition sm:px-4',
                  tab === t.key ? 'bg-rh-ink text-white' : 'text-rh-ink/60 hover:text-rh-ink'
                )}
              >
                <t.icon className="hidden h-3.5 w-3.5 sm:block" />
                {t.label}
              </button>
            ))}
          </nav>
        )}
        <div className={cn('flex shrink-0 items-center', !showTabs && 'ml-auto')}>
          <UserButton afterSignOutUrl="/learn/course" />
        </div>
      </div>
    </header>
  )
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-rh-cream">
      <TopBar showTabs={false} />
      <div className="mx-auto max-w-lg px-4 pb-20 pt-10 sm:pt-16">{children}</div>
    </div>
  )
}

function StateCard({ icon: Icon, title, children }: { icon: typeof Mail; title: string; children: ReactNode }) {
  return (
    <div className="rounded-[2rem] bg-white p-6 shadow-soft sm:p-9">
      <span className="flex h-14 w-14 items-center justify-center rounded-[1.1rem] bg-rh-ink text-rh-lime">
        <Icon className="h-6 w-6" />
      </span>
      <h1 className="mt-6 text-[28px] leading-tight tracking-tight text-rh-ink sm:text-[32px]">{title}</h1>
      <div className="mt-3 text-[15px] leading-7 text-rh-ink/65">{children}</div>
    </div>
  )
}

/** "Email me my course link": always answers the same way, so it never reveals who registered. */
function EmailLinkForm({ initialEmail = '', cta = 'Email me my course link' }: { initialEmail?: string; cta?: string }) {
  const request = useAction(api.learn.requestCourseLink)
  const [email, setEmail] = useState(initialEmail)
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  if (state === 'sent') {
    return (
      <div className="mt-6 rounded-2xl bg-rh-honeydew p-4 text-sm leading-6 text-rh-ink/80">
        <p className="flex items-center gap-2 font-semibold text-rh-ink">
          <Check className="h-4 w-4" /> Check your inbox
        </p>
        <p className="mt-1">
          If <span className="font-medium text-rh-ink">{email}</span> is registered, your link is on its way. It can take a minute, so check
          spam too.
        </p>
        <button type="button" onClick={() => setState('idle')} className="mt-2 font-semibold text-rh-ink underline underline-offset-4">
          Use another email
        </button>
      </div>
    )
  }

  return (
    <form
      className="mt-6"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        setState('busy')
        try {
          await request({ email })
          setState('sent')
          playSound('send')
        } catch (err) {
          setError(errorMessage(err, 'Something went wrong. Please try again.'))
          playSound('error')
          setState('idle')
        }
      }}
    >
      <label htmlFor="course-email" className="text-sm font-semibold text-rh-ink">
        The email you registered with
      </label>
      <input
        id="course-email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={cn(fieldClass, 'mt-2')}
      />
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <button type="submit" disabled={state === 'busy'} className={cn(pillInk, 'mt-3 h-12 w-full text-[15px]')}>
        {state === 'busy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {cta}
      </button>
    </form>
  )
}

function SignedOut() {
  return (
    <Screen>
      <StateCard icon={GraduationCap} title="Open your course">
        <p>We&apos;ll email you a link that signs you straight in. No password needed.</p>
        <EmailLinkForm />
        <div className="mt-6 flex flex-col gap-2 border-t border-rh-ink/[0.07] pt-5 text-sm sm:flex-row sm:items-center sm:justify-between">
          <Link href={SIGN_IN_HREF} className="inline-flex items-center gap-1.5 font-semibold text-rh-ink hover:underline">
            <LogIn className="h-4 w-4" /> Sign in with a password
          </Link>
          <Link href="/learn" className="text-rh-ink/55 hover:text-rh-ink">
            Not registered yet?
          </Link>
        </div>
      </StateCard>
    </Screen>
  )
}

function NotRegistered({ email }: { email: string | null }) {
  const { signOut } = useClerk()
  return (
    <Screen>
      <StateCard icon={SearchX} title="We couldn't find your course">
        <p>
          There&apos;s no paid registration for {email ? <span className="font-medium text-rh-ink">{email}</span> : 'this account'}. If you
          paid with a different email, we&apos;ll send the link there.
        </p>
        <EmailLinkForm cta="Email a link to that address" />
        <div className="mt-6 flex flex-col gap-2 border-t border-rh-ink/[0.07] pt-5 sm:flex-row">
          <Link href="/learn#register" className={cn(pillOutline, 'h-11 flex-1')}>
            Register for the next cohort
          </Link>
          <button type="button" onClick={() => void signOut({ redirectUrl: '/learn/course' })} className="h-11 flex-1 text-sm font-semibold text-rh-ink/60 hover:text-rh-ink">
            Use another account
          </button>
        </div>
      </StateCard>
    </Screen>
  )
}

function Ended({ course }: { course: Extract<MyCourse, { state: 'ended' }> }) {
  return (
    <Screen>
      <StateCard icon={GraduationCap} title={`The ${course.cohort.cohortLabel} has finished`}>
        <p>
          Thank you for learning with us, {course.learner.firstName}.
          {course.accessUntil ? ` Course materials and the library closed on ${dateOnly(course.accessUntil)}.` : ''} Join the next cohort to
          keep going.
        </p>
        <Link href="/learn" className={cn(pillInk, 'mt-6 h-12 w-full text-[15px]')}>
          See the next cohort <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-4 text-sm">
          Questions?{' '}
          <a href={`mailto:${PROGRAM.supportEmail}`} className="font-semibold text-rh-ink underline-offset-4 hover:underline">
            {PROGRAM.supportEmail}
          </a>
        </p>
      </StateCard>
    </Screen>
  )
}

function Skeleton() {
  return (
    <div className="min-h-screen bg-rh-cream">
      <TopBar showTabs={false} />
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <div className="h-9 w-64 animate-pulse rounded-full bg-rh-ink/[0.06]" />
        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded-full bg-rh-ink/[0.05]" />
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <div className="h-56 animate-pulse rounded-[2rem] bg-rh-ink/[0.08]" />
          <div className="h-56 animate-pulse rounded-[1.75rem] bg-white" />
        </div>
      </div>
    </div>
  )
}

function CourseView({
  course,
  cohortId,
  setCohortId,
}: {
  course: CourseOk
  cohortId: Id<'learnCohorts'> | undefined
  setCohortId: (id: Id<'learnCohorts'>) => void
}) {
  const [tab, setTabState] = useState<Tab>('course')
  const [stack, setStack] = useState<StudyPanel[]>([])
  const accessUntil = course.accessUntil ? dateOnly(course.accessUntil) : null

  // /learn/course#library and #courses (with a course or lesson after it) open those tabs straight away
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash
      if (hash === '#library') setTabState('library')
      else if (hash.startsWith('#courses')) setTabState('courses')
    }
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  const setTab = (next: Tab) => {
    setTabState(next)
    const path = window.location.pathname + window.location.search
    window.history.replaceState(null, '', next === 'course' ? path : `${path}#${next}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const open = (panel: StudyPanel) => setStack([panel])

  return (
    <div className="min-h-screen bg-rh-cream">
      <TopBar tab={tab} setTab={setTab} showTabs />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
        {/* The Courses tab has its own headings (catalogue, course, lesson) */}
        <div className={cn('mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', tab === 'courses' && 'hidden')}>
          <div>
            <h1 className={cn('text-[30px] leading-tight tracking-tight text-rh-ink sm:text-[38px]', displayFont)}>
              {tab === 'course' ? `Welcome, ${course.learner.firstName}` : 'Exercise library'}
            </h1>
            <p className="mt-1 text-[15px] text-rh-ink/60">
              {tab === 'course'
                ? `${course.cohort.cohortLabel} · ${course.cohort.dateRange}`
                : 'Study the exercises you’ll prescribe, and the materials you can share with patients.'}
            </p>
          </div>
          {course.otherCohorts.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-rh-ink/60">
              <span className="shrink-0">Cohort</span>
              <select
                value={cohortId ?? course.cohort.id}
                onChange={(e) => setCohortId(e.target.value as Id<'learnCohorts'>)}
                className="h-10 rounded-full border border-rh-ink/10 bg-white px-3 text-sm font-medium text-rh-ink focus:outline-none focus:ring-4 focus:ring-rh-ink/[0.07]"
              >
                <option value={course.cohort.id}>{course.cohort.cohortLabel}</option>
                {course.otherCohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cohortLabel}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div key={tab} className="animate-in fade-in duration-300">
          {tab === 'course' ? (
            <CourseHome course={course} open={open} showLibrary={() => setTab('library')} accessUntil={accessUntil} />
          ) : tab === 'courses' ? (
            <VideoCourses />
          ) : (
            <StudyLibrary open={open} accessUntil={accessUntil} />
          )}
        </div>
      </main>
      <StudyDrawer course={course} stack={stack} setStack={setStack} />
    </div>
  )
}

export function CourseApp() {
  const { isLoading } = useConvexAuth()
  const [cohortId, setCohortId] = useState<Id<'learnCohorts'> | undefined>(undefined)
  const course = useQuery(api.learn.getMyCourse, isLoading ? 'skip' : cohortId ? { cohortId } : {}) as MyCourse | undefined

  if (isLoading || course === undefined) return <Skeleton />
  if (course.state === 'signed_out') return <SignedOut />
  if (course.state === 'not_registered') return <NotRegistered email={course.email} />
  if (course.state === 'ended') return <Ended course={course} />
  return <CourseView course={course} cohortId={cohortId} setCohortId={setCohortId} />
}
