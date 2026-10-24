'use client'

/**
 * The "My course" tab: the next live session with its join button, course links, the weekly
 * materials timeline and every session. Links and times are live from Convex, so a link the
 * admin changes shows here straight away.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { useMutation } from 'convex/react'
import {
  ArrowRight,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileText,
  Library,
  Link2,
  PlayCircle,
  Rotate3d,
  Video,
} from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { cn } from '@/lib/utils'
import { displayFont } from '../shared'
import { downloadSessionsCalendar } from './calendar'
import {
  cardClass,
  countdown,
  EmptyNote,
  eyebrowClass,
  sessionDateTile,
  sessionDay,
  sessionPhase,
  sessionRange,
  sessionShortDay,
  type CourseOk,
  type CourseSession,
  type CourseWeek,
} from './shared'
import { ProgressCard } from './Progress'
import { youtubeIdFrom, type StudyPanel } from './StudyDrawer'

const WEEK_MS = 7 * 86_400_000

/** Re-renders every 20 seconds so "Join" lights up on time. */
export function useNow(intervalMs = 20_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** A meeting link that also records attendance (the tap is what counts as attending). */
function JoinLink({ session, className, children }: { session: CourseSession; className: string; children: ReactNode }) {
  const recordJoin = useMutation(api.learn.recordJoin)
  return (
    <a
      href={session.meetingUrl ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => void recordJoin({ sessionId: session.id }).catch(() => undefined)}
      className={className}
    >
      {children}
    </a>
  )
}

function lagosStartOfDay(date: string) {
  return Date.parse(`${date}T00:00:00+01:00`)
}

function NextSession({ course, now }: { course: CourseOk; now: number }) {
  const next = course.sessions.find((s) => sessionPhase(s, now) !== 'past') ?? null
  const upcoming = course.sessions.filter((s) => sessionPhase(s, now) !== 'past')

  if (!next) {
    const finished = course.sessions.length > 0
    return (
      <div className="relative overflow-hidden rounded-[2rem] bg-rh-ink p-6 text-white sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rh-lime">Live sessions</p>
        <h2 className={cn('mt-3 text-[26px] leading-tight sm:text-[30px]', displayFont)}>
          {finished ? 'All live sessions are done' : course.cohort.liveSessions}
        </h2>
        <p className="mt-2 max-w-md text-[15px] leading-6 text-white/70">
          {finished
            ? 'Recordings and materials stay here for you to revisit.'
            : `The ${course.cohort.cohortLabel} starts ${course.cohort.startsOn}. The joining link for each session appears here.`}
        </p>
      </div>
    )
  }

  const phase = sessionPhase(next, now)
  const canJoin = (phase === 'live' || phase === 'soon') && next.meetingUrl
  const recentlyChanged = next.linkChangedAt && now - next.linkChangedAt < 5 * 86_400_000

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-rh-ink p-6 text-white sm:p-8">
      <div className="relative flex flex-wrap items-center gap-2">
        {phase === 'live' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rh-lime px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-rh-ink">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rh-ink opacity-50 motion-reduce:hidden" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rh-ink" />
            </span>
            Live now
          </span>
        ) : (
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rh-lime">
            Next live session · {countdown(next.startsAt, now)}
          </span>
        )}
        {recentlyChanged && <span className="rounded-full bg-rh-jasmine px-2.5 py-1 text-[11px] font-semibold text-rh-ink">Link updated</span>}
      </div>
      <h2 className={cn('relative mt-3 text-[26px] leading-tight sm:text-[32px]', displayFont)}>{next.title ?? sessionDay(next.startsAt)}</h2>
      <p className="relative mt-1.5 flex flex-wrap items-center gap-x-2 text-[15px] text-white/75">
        {next.title && <span>{sessionDay(next.startsAt)} ·</span>}
        <span>{sessionRange(next)}</span>
        <span className="text-white/40">Lagos time</span>
      </p>

      <div className="relative mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        {canJoin ? (
          <JoinLink
            session={next}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink transition hover:brightness-95 active:scale-[0.98]"
          >
            <Video className="h-4 w-4" /> Join live session
          </JoinLink>
        ) : (
          <span className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white/10 px-6 text-sm font-medium text-white/80">
            <Clock3 className="h-4 w-4" />
            {next.meetingUrl ? 'Join opens 15 minutes before' : 'Joining link coming soon'}
          </span>
        )}
        <button
          type="button"
          onClick={() => downloadSessionsCalendar(upcoming, course.cohort.cohortLabel)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/20 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          <CalendarPlus className="h-4 w-4" /> Add {upcoming.length > 1 ? 'all sessions' : 'to calendar'}
        </button>
      </div>
      {!canJoin && next.meetingUrl && phase === 'upcoming' && (
        <p className="relative mt-3 text-xs text-white/50">The button turns green here when it&apos;s time. No need to save the link.</p>
      )}
    </div>
  )
}

function CourseLinks({ links }: { links: CourseOk['links'] }) {
  if (links.length === 0) return null
  return (
    <section className={cardClass}>
      <h2 className={eyebrowClass}>Course links</h2>
      <div className="mt-3 space-y-2">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-2xl bg-rh-cream p-3 transition hover:bg-rh-sand"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-rh-ink">
              <Link2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-rh-ink">{link.label}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-rh-ink/35 group-hover:text-rh-ink/70" />
          </a>
        ))}
      </div>
    </section>
  )
}

type WeekStatus = 'done' | 'now' | 'past' | 'next'

/** Ticked off by the physio, or where the week sits on the calendar. */
function weekStatus(week: CourseWeek, course: CourseOk, now: number): WeekStatus {
  if (course.progress.weeksDone.includes(week.id)) return 'done'
  const current = Math.floor((now - lagosStartOfDay(course.cohort.startDate)) / WEEK_MS) + 1
  if (week.week === current) return 'now'
  return week.week < current ? 'past' : 'next'
}

function WeekCard({ week, status, onOpen }: { week: CourseWeek; status: WeekStatus; onOpen: () => void }) {
  const parts = [
    week.recordingUrl && { icon: PlayCircle, label: 'Recording' },
    week.files.length > 0 && { icon: FileText, label: `${week.files.length} ${week.files.length === 1 ? 'handout' : 'handouts'}` },
    week.exercises.length > 0 && { icon: Rotate3d, label: `${week.exercises.length} ${week.exercises.length === 1 ? 'exercise' : 'exercises'}` },
    week.resources.length > 0 && { icon: Library, label: `${week.resources.length} ${week.resources.length === 1 ? 'resource' : 'resources'}` },
  ].filter(Boolean) as { icon: typeof Video; label: string }[]

  return (
    <li className="relative flex gap-4">
      <span
        className={cn(
          'relative z-[1] mt-5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          status === 'done' && 'bg-rh-ink text-rh-lime',
          status === 'now' && 'bg-rh-lime text-rh-ink',
          status === 'past' && 'bg-white text-rh-ink ring-1 ring-inset ring-rh-ink/25',
          status === 'next' && 'bg-white text-rh-ink/50 ring-1 ring-inset ring-rh-ink/10'
        )}
      >
        {status === 'done' ? <Check className="h-3.5 w-3.5" /> : week.week}
      </span>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'group flex-1 rounded-[1.5rem] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.995] sm:p-5',
          status === 'now' && 'ring-2 ring-rh-ink'
        )}
      >
        <span className="flex items-center gap-2">
          <span className={eyebrowClass}>Week {week.week}</span>
          {status === 'now' && <span className="rounded-full bg-rh-honeydew px-2 py-0.5 text-[10px] font-semibold text-rh-ink">This week</span>}
        </span>
        <span className={cn('mt-1 flex items-start justify-between gap-3 text-[19px] leading-snug text-rh-ink', displayFont)}>
          {week.title}
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-rh-ink/30 transition group-hover:translate-x-0.5 group-hover:text-rh-ink/70" />
        </span>
        {week.summary && <span className="mt-1 line-clamp-2 block text-sm leading-6 text-rh-ink/60">{week.summary}</span>}
        {parts.length > 0 ? (
          <span className="mt-3 flex flex-wrap gap-1.5">
            {parts.map((p) => (
              <span key={p.label} className="inline-flex items-center gap-1 rounded-full bg-rh-cream px-2.5 py-1 text-xs font-medium text-rh-ink/70">
                <p.icon className="h-3 w-3" /> {p.label}
              </span>
            ))}
          </span>
        ) : (
          <span className="mt-2 block text-xs text-rh-ink/45">Materials are added after the live session</span>
        )}
      </button>
    </li>
  )
}

function Weeks({ course, now, open }: { course: CourseOk; now: number; open: (panel: StudyPanel) => void }) {
  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <h2 className={cn('text-[24px] leading-tight text-rh-ink', displayFont)}>Weekly materials</h2>
        {course.weeks.length > 0 && <span className="text-sm text-rh-ink/50">{course.weeks.length} {course.weeks.length === 1 ? 'week' : 'weeks'}</span>}
      </div>
      {course.weeks.length === 0 ? (
        <div className="mt-4">
          <EmptyNote icon={FileText} title="Week 1 appears here after the first session">
            Slides, the recording and the exercises to study are added each week.
          </EmptyNote>
        </div>
      ) : (
        <ol className="relative mt-4 space-y-3 before:absolute before:bottom-6 before:left-[13px] before:top-6 before:w-px before:bg-rh-ink/10">
          {course.weeks.map((week) => (
            <WeekCard
              key={week.id}
              week={week}
              status={weekStatus(week, course, now)}
              onOpen={() => open({ kind: 'week', week })}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

function SessionRow({ session, now }: { session: CourseSession; now: number }) {
  const phase = sessionPhase(session, now)
  const recording = session.recordingUrl
  const youtube = youtubeIdFrom(recording)
  const tile = sessionDateTile(session.startsAt)
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none',
          phase === 'past' ? 'bg-rh-cream text-rh-ink/45' : 'bg-rh-ink text-white'
        )}
      >
        <span className="text-[10px] uppercase">{tile.weekday}</span>
        <span className="mt-0.5 text-[15px] font-semibold">{tile.day}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[15px] font-semibold', phase === 'past' ? 'text-rh-ink/60' : 'text-rh-ink')}>
          {session.title ?? 'Live session'}
        </span>
        <span className="block text-xs text-rh-ink/50">
          {sessionShortDay(session.startsAt)} · {sessionRange(session)}
        </span>
      </span>
      {phase === 'past' ? (
        recording ? (
          <a
            href={youtube ? `https://www.youtube.com/watch?v=${youtube}` : recording}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rh-cream px-3 py-1.5 text-xs font-semibold text-rh-ink hover:bg-rh-sand"
          >
            <PlayCircle className="h-3.5 w-3.5" /> Recording
          </a>
        ) : (
          <span className="shrink-0 text-xs text-rh-ink/40">Done</span>
        )
      ) : (phase === 'live' || phase === 'soon') && session.meetingUrl ? (
        <JoinLink session={session} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rh-lime px-3 py-1.5 text-xs font-semibold text-rh-ink">
          <Video className="h-3.5 w-3.5" /> Join
        </JoinLink>
      ) : (
        <span className="shrink-0 text-xs text-rh-ink/45">{countdown(session.startsAt, now)}</span>
      )}
    </li>
  )
}

function AllSessions({ course, now }: { course: CourseOk; now: number }) {
  const [expanded, setExpanded] = useState(false)
  if (course.sessions.length === 0) return null
  // Collapsed: the next three, or the last three once they're all done
  const next = course.sessions.findIndex((s) => sessionPhase(s, now) !== 'past')
  const start = next === -1 ? Math.max(0, course.sessions.length - 3) : next
  const visible = expanded ? course.sessions : course.sessions.slice(start, start + 3)
  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={eyebrowClass}>Live sessions · {course.sessions.length}</h2>
      </div>
      <ul className="mt-1 divide-y divide-rh-ink/[0.06]">
        {visible.map((s) => (
          <SessionRow key={s.id} session={s} now={now} />
        ))}
      </ul>
      {course.sessions.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-rh-ink/70 hover:text-rh-ink"
        >
          {expanded ? 'Show fewer' : 'Show all sessions'}
          <ChevronDown className={cn('h-3.5 w-3.5 transition', expanded && 'rotate-180')} />
        </button>
      )}
    </section>
  )
}

function LibraryCard({ showLibrary, accessUntil }: { showLibrary: () => void; accessUntil: string | null }) {
  return (
    <button
      type="button"
      onClick={showLibrary}
      className="group flex w-full items-center gap-4 rounded-[1.75rem] bg-rh-honeydew p-5 text-left transition hover:-translate-y-0.5 sm:p-6"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rh-ink text-rh-lime">
        <Rotate3d className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[20px] leading-tight text-rh-ink', displayFont)}>Exercise library</span>
        <span className="mt-1 block text-sm leading-6 text-rh-ink/65">
          3D exercises, videos and leaflets by body region, with red flags for each.{accessUntil ? ` Yours until ${accessUntil}.` : ''}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-rh-ink/40 transition group-hover:translate-x-0.5" />
    </button>
  )
}

export function CourseHome({
  course,
  open,
  showLibrary,
  accessUntil,
}: {
  course: CourseOk
  open: (panel: StudyPanel) => void
  showLibrary: () => void
  accessUntil: string | null
}) {
  const now = useNow()
  return (
    <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr] lg:items-start">
      <div className="space-y-5">
        <NextSession course={course} now={now} />
        {/* On phones the certificate steps sit right under the next session */}
        <div className="lg:hidden">
          <ProgressCard progress={course.progress} open={open} />
        </div>
        <Weeks course={course} now={now} open={open} />
        <LibraryCard showLibrary={showLibrary} accessUntil={accessUntil} />
      </div>
      <div className="space-y-5">
        <div className="hidden lg:block">
          <ProgressCard progress={course.progress} open={open} />
        </div>
        <CourseLinks links={course.links} />
        <AllSessions course={course} now={now} />
        {course.cohort.welcomeNote && (
          <section className="rounded-[1.75rem] bg-rh-jasmine/50 p-5 sm:p-6">
            <h2 className={eyebrowClass}>From your tutors</h2>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-7 text-rh-ink/80">{course.cohort.welcomeNote}</p>
          </section>
        )}
      </div>
    </div>
  )
}
