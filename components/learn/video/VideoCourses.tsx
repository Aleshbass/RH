'use client'

/**
 * The learner's video courses (/learn/course#courses): a catalogue with "continue watching",
 * a page for each course, and the player. Each step has its own URL hash, so the browser's
 * back button and shared links behave.
 */

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { useReducedMotion } from 'framer-motion'
import { ArrowLeft, Check, Play, PlayCircle } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import { displayFont, pillInk, pillLime } from '../shared'
import { LessonList, LessonPlayer, ProgressBar } from './LessonPlayer'
import {
  formatLength,
  imagekitLoader,
  learnersLabel,
  videoApi,
  type VideoCourse,
  type VideoCourseCard,
  type VideoLibrary,
} from './videoApi'

type CourseId = Id<'learnVideoCourses'>
type LessonId = Id<'learnVideoLessons'>
type Route = { courseId: CourseId | null; lessonId: LessonId | null }

function readRoute(): Route {
  const match = window.location.hash.match(/^#courses(?:\/([a-z0-9]+))?(?:\/([a-z0-9]+))?/i)
  return { courseId: (match?.[1] as CourseId) ?? null, lessonId: (match?.[2] as LessonId) ?? null }
}

function hashFor(route: Route) {
  return ['#courses', route.courseId, route.courseId && route.lessonId].filter(Boolean).join('/')
}

// ─────────────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────────────

function Cover({
  url,
  title,
  sizes,
  className,
  priority,
}: {
  url: string | null
  title: string
  sizes: string
  className?: string
  priority?: boolean
}) {
  if (url) {
    return <Image src={url} loader={imagekitLoader} alt="" fill sizes={sizes} priority={priority} className={cn('object-cover', className)} />
  }
  // No cover yet: the title, set large on ink
  return (
    <div className="absolute inset-0 flex items-end bg-rh-ink p-5 sm:p-6">
      <span className={cn('line-clamp-3 text-2xl leading-tight text-white/90 sm:text-[28px]', displayFont)}>{title}</span>
      <span aria-hidden className="absolute right-5 top-5 h-3 w-3 rounded-full bg-rh-lime" />
    </div>
  )
}

function PlayDisc({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-full bg-rh-lime text-rh-ink shadow-lg transition duration-300 group-hover:scale-110 motion-reduce:group-hover:scale-100',
        size === 'lg' ? 'h-16 w-16 sm:h-20 sm:w-20' : 'h-14 w-14'
      )}
    >
      <Play className={cn('translate-x-[2px]', size === 'lg' ? 'h-6 w-6 sm:h-7 sm:w-7' : 'h-5 w-5')} />
    </span>
  )
}

function ctaLabel(course: Pick<VideoCourseCard, 'progress'>) {
  const { progress } = course
  if (progress.isComplete) return 'Watch again'
  if (!progress.started) return 'Start course'
  return progress.resume ? `Continue lesson ${progress.resume.number}` : 'Continue'
}

function CourseCard({ course, onOpen }: { course: VideoCourseCard; onOpen: () => void }) {
  const { progress } = course
  const learners = learnersLabel(course.learnerCount)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-white text-left shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-rh-ink">
        <Cover
          url={course.coverUrl}
          title={course.title}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="transition duration-500 group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
        />
        {progress.isComplete ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-rh-lime px-2.5 py-1 text-xs font-semibold text-rh-ink">
            <Check className="h-3 w-3" /> Completed
          </span>
        ) : progress.started ? (
          <span className="absolute left-3 top-3 rounded-full bg-rh-ink/85 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            {progress.completed} of {progress.total} lessons
          </span>
        ) : course.learnerCount === 0 ? (
          <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-rh-ink">New</span>
        ) : null}
        <span className="absolute bottom-3 right-3 rounded-full bg-rh-ink/85 px-2.5 py-1 text-xs font-medium tabular-nums text-white backdrop-blur">
          {formatLength(course.durationSec)}
        </span>
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
          <PlayDisc />
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className={cn('text-xl leading-snug tracking-tight text-rh-ink', displayFont)}>{course.title}</h3>
        <p className="mt-2 line-clamp-2 text-[15px] leading-6 text-rh-ink/65">{course.summary}</p>
        <div className="min-h-4 flex-1" />
        <p className="text-sm text-rh-ink/55">
          {course.lessonCount} {course.lessonCount === 1 ? 'lesson' : 'lessons'}
          {learners ? ` · ${learners}` : ''}
        </p>
        {progress.started && !progress.isComplete && <ProgressBar value={progress.completed / progress.total} className="mt-3" />}
      </div>
    </button>
  )
}

function ResumeCard({ course, onResume }: { course: VideoCourseCard; onResume: () => void }) {
  const resume = course.progress.resume
  if (!resume) return null
  const left = Math.max(0, resume.durationSec - resume.positionSec)
  return (
    <section className="grid overflow-hidden rounded-[2rem] bg-rh-ink text-white shadow-soft md:grid-cols-[1.15fr_1fr]">
      <button
        type="button"
        onClick={onResume}
        aria-label={`Resume ${course.title}`}
        className="group relative aspect-video overflow-hidden md:aspect-auto md:min-h-[280px]"
      >
        <Cover url={course.coverUrl} title={course.title} sizes="(min-width: 768px) 55vw, 100vw" priority className="opacity-80" />
        <span className="absolute inset-0 flex items-center justify-center">
          <PlayDisc size="lg" />
        </span>
        {resume.positionSec > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <span className="block h-full bg-rh-lime" style={{ width: `${(resume.positionSec / Math.max(1, resume.durationSec)) * 100}%` }} />
          </span>
        )}
      </button>
      <div className="flex flex-col justify-center p-6 sm:p-9">
        <p className="text-sm text-white/55">Continue watching</p>
        <h2 className={cn('mt-1 text-[26px] leading-tight tracking-tight sm:text-[32px]', displayFont)}>{course.title}</h2>
        <p className="mt-3 text-[15px] text-white/75">
          Lesson {resume.number}: {resume.title}
        </p>
        <p className="mt-0.5 text-sm text-white/50">{resume.positionSec > 0 ? `${formatLength(left)} left` : formatLength(resume.durationSec)}</p>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-4">
          <button type="button" onClick={onResume} className={cn(pillLime, 'h-12 px-7')}>
            <Play className="h-3.5 w-3.5" /> Resume
          </button>
          <div className="min-w-[160px] flex-1">
            <ProgressBar value={course.progress.completed / course.progress.total} tone="light" />
            <p className="mt-1.5 text-xs text-white/55">
              {course.progress.completed} of {course.progress.total} lessons done
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Catalog({
  library,
  onOpen,
  onPlay,
}: {
  library: Extract<VideoLibrary, { state: 'ok' }>
  onOpen: (id: CourseId) => void
  onPlay: (id: CourseId, lessonId: LessonId) => void
}) {
  const resume = library.courses.find((c) => c.id === library.resumeCourseId) ?? null
  return (
    <div>
      <div className="mb-6">
        <h1 className={cn('text-[30px] leading-tight tracking-tight text-rh-ink sm:text-[38px]', displayFont)}>Courses</h1>
        <p className="mt-1 text-[15px] text-rh-ink/60">Watch at your own pace. We’ll keep your place in every lesson.</p>
      </div>

      {library.courses.length === 0 ? (
        <div className="rounded-[2rem] bg-white px-6 py-16 text-center shadow-soft">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[1.1rem] bg-rh-ink text-rh-lime">
            <PlayCircle className="h-6 w-6" />
          </span>
          <h2 className={cn('mt-5 text-2xl tracking-tight text-rh-ink', displayFont)}>Courses are on the way</h2>
          <p className="mx-auto mt-2 max-w-sm text-[15px] text-rh-ink/60">New video courses will appear here as soon as they’re published.</p>
        </div>
      ) : (
        <>
          {resume?.progress.resume && (
            <div className="mb-8">
              <ResumeCard course={resume} onResume={() => onPlay(resume.id, resume.progress.resume!.lessonId)} />
            </div>
          )}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {library.courses.map((course) => (
              <CourseCard key={course.id} course={course} onOpen={() => onOpen(course.id)} />
            ))}
          </div>
        </>
      )}

      {library.available.length > 0 && (
        <section className="mt-10">
          <h2 className={cn('text-xl tracking-tight text-rh-ink', displayFont)}>More courses</h2>
          <p className="mt-1 text-sm text-rh-ink/60">Enrol to add them here.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {library.available.map((course) => (
              <li key={course.id}>
                <Link
                  href={`/learn/courses/${course.id}`}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-rh-ink shadow-soft hover:shadow-lift"
                >
                  {course.title}
                  <span className="rounded-full bg-rh-ink/[0.06] px-2 py-0.5 text-[11px] font-semibold text-rh-ink/70">
                    {course.access === 'free' ? 'Free' : 'Paid'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function CourseDetail({
  course,
  onBack,
  onPlay,
}: {
  course: VideoCourse
  onBack: () => void
  onPlay: (lessonId: LessonId) => void
}) {
  const { progress } = course
  const first = course.lessons[0]
  const target = progress.isComplete ? first?.id : progress.resume?.lessonId ?? first?.id
  return (
    <div>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-rh-ink/60 transition hover:text-rh-ink">
        <ArrowLeft className="h-4 w-4" /> All courses
      </button>

      <section className="mt-5 grid items-center gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div className="order-2 lg:order-1">
          <h1 className={cn('text-[34px] leading-[1.05] tracking-tight text-rh-ink sm:text-[46px]', displayFont)}>{course.title}</h1>
          <p className="mt-4 max-w-xl whitespace-pre-line text-base leading-7 text-rh-ink/70">{course.summary}</p>

          <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <dt className="text-xs text-rh-ink/50">Lessons</dt>
              <dd className="text-lg font-semibold tabular-nums text-rh-ink">{course.lessonCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-rh-ink/50">Length</dt>
              <dd className="text-lg font-semibold text-rh-ink">{formatLength(course.durationSec)}</dd>
            </div>
            <div>
              <dt className="text-xs text-rh-ink/50">Taken by</dt>
              <dd className="text-lg font-semibold tabular-nums text-rh-ink">
                {course.learnerCount > 0 ? `${course.learnerCount.toLocaleString('en-NG')} ${course.learnerCount === 1 ? 'physio' : 'physios'}` : 'New course'}
              </dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            {target && (
              <button type="button" onClick={() => onPlay(target)} className={cn(pillInk, 'h-12 px-7 text-[15px]')}>
                <Play className="h-3.5 w-3.5" /> {ctaLabel(course)}
              </button>
            )}
            {progress.started && (
              <div className="min-w-[180px] max-w-xs flex-1">
                <ProgressBar value={progress.completed / Math.max(1, progress.total)} />
                <p className="mt-1.5 text-xs text-rh-ink/55">
                  {progress.isComplete ? 'All lessons done' : `${progress.completed} of ${progress.total} lessons done`}
                </p>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => target && onPlay(target)}
          aria-label={`${ctaLabel(course)}: ${course.title}`}
          className="group relative order-1 aspect-video overflow-hidden rounded-[2rem] bg-rh-ink shadow-soft lg:order-2"
        >
          <Cover
            url={course.coverUrl}
            title={course.title}
            sizes="(min-width: 1024px) 45vw, 100vw"
            priority
            className="transition duration-500 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-rh-ink/10">
            <PlayDisc size="lg" />
          </span>
        </button>
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-[1fr_1.25fr] lg:items-start">
        <div className="rounded-[1.75rem] bg-white p-6 shadow-soft sm:p-8">
          <h2 className={cn('text-2xl tracking-tight text-rh-ink', displayFont)}>What you’ll learn</h2>
          <ul className="mt-5 space-y-3.5">
            {course.benefits.map((benefit) => (
              <li key={benefit} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rh-lime text-rh-ink">
                  <Check className="h-3 w-3" />
                </span>
                <span className="text-[15px] leading-6 text-rh-ink/80">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-[1.75rem] bg-white p-4 shadow-soft sm:p-5">
          <div className="flex items-baseline justify-between gap-3 px-2 pb-3 pt-2">
            <h2 className={cn('text-2xl tracking-tight text-rh-ink', displayFont)}>Lessons</h2>
            <span className="text-sm text-rh-ink/55">
              {course.lessonCount} · {formatLength(course.durationSec)}
            </span>
          </div>
          <LessonList course={course} currentId={progress.started && !progress.isComplete ? progress.resume?.lessonId : null} onSelect={onPlay} />
        </div>
      </section>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr]">
      <div className="space-y-4 pt-8">
        <div className="h-10 w-3/4 animate-pulse rounded-full bg-rh-ink/[0.07]" />
        <div className="h-4 w-full animate-pulse rounded-full bg-rh-ink/[0.05]" />
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-rh-ink/[0.05]" />
      </div>
      <div className="aspect-video animate-pulse rounded-[2rem] bg-rh-ink/[0.08]" />
    </div>
  )
}

function CatalogSkeleton() {
  return (
    <div>
      <div className="h-9 w-40 animate-pulse rounded-full bg-rh-ink/[0.07]" />
      <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded-full bg-rh-ink/[0.05]" />
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-[1.75rem] bg-white shadow-soft">
            <div className="aspect-[16/10] animate-pulse bg-rh-ink/[0.07]" />
            <div className="space-y-2 p-6">
              <div className="h-5 w-2/3 animate-pulse rounded-full bg-rh-ink/[0.07]" />
              <div className="h-3.5 w-full animate-pulse rounded-full bg-rh-ink/[0.05]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The tab
// ─────────────────────────────────────────────────────────────────────────────

export function VideoCourses() {
  const reduce = useReducedMotion()
  const [route, setRoute] = useState<Route>({ courseId: null, lessonId: null })

  useEffect(() => {
    const sync = () => setRoute(readRoute())
    sync()
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  const go = useCallback(
    (next: Route, mode: 'push' | 'replace' = 'push') => {
      const url = window.location.pathname + window.location.search + hashFor(next)
      if (mode === 'push') window.history.pushState(null, '', url)
      else window.history.replaceState(null, '', url)
      setRoute(next)
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    },
    [reduce]
  )

  const library = useQuery(videoApi.library, {})
  // Only ask for a course the learner can see; a stale or mistyped link falls back to the catalogue
  const known = library?.state === 'ok' ? library.courses.some((c) => c.id === route.courseId) : false
  const course = useQuery(videoApi.course, route.courseId && known ? { courseId: route.courseId } : 'skip')

  if (library === undefined) return <CatalogSkeleton />
  if (library.state !== 'ok') return null

  if (!route.courseId || !known) {
    return (
      <Catalog
        library={library}
        onOpen={(courseId) => go({ courseId, lessonId: null })}
        onPlay={(courseId, lessonId) => go({ courseId, lessonId })}
      />
    )
  }

  if (course === undefined) return <DetailSkeleton />
  if (course === null) return null

  const lessonId = route.lessonId && course.lessons.some((l) => l.id === route.lessonId) ? route.lessonId : null
  if (lessonId) {
    return (
      <LessonPlayer
        course={course}
        lessonId={lessonId}
        // Moving between lessons replaces the entry, so Back returns to the course page
        onSelectLesson={(id) => go({ courseId: course.id, lessonId: id }, 'replace')}
        onBack={() => go({ courseId: course.id, lessonId: null })}
      />
    )
  }

  return (
    <CourseDetail
      course={course}
      onBack={() => go({ courseId: null, lessonId: null })}
      onPlay={(id) => go({ courseId: course.id, lessonId: id })}
    />
  )
}
