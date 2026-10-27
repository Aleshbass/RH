'use client'

/**
 * The lesson player: a signed, expiring video link, resume where you left off, progress saved
 * as you watch, and the next lesson queued at the end.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useAction, useMutation } from 'convex/react'
import { useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Loader2, Play, RotateCcw } from '@/components/icons'
import { errorMessage } from '@/components/partners/portal/shared'
import type { Id } from '@/convex/_generated/dataModel'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { displayFont, pillLime, pillOutline } from '../shared'
import { formatClock, formatLength, imagekitLoader, videoApi, type VideoCourse } from './videoApi'

type LessonId = Id<'learnVideoLessons'>

const SAVE_EVERY_MS = 15_000
const NEXT_COUNTDOWN = 6

export function ProgressBar({ value, className, tone = 'ink' }: { value: number; className?: string; tone?: 'ink' | 'light' }) {
  return (
    <div
      className={cn('h-1.5 overflow-hidden rounded-full', tone === 'ink' ? 'bg-rh-ink/[0.08]' : 'bg-white/15', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div className="h-full rounded-full bg-rh-lime transition-[width] duration-500" style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  )
}

export function LessonList({
  course,
  currentId,
  onSelect,
}: {
  course: VideoCourse
  currentId?: LessonId | null
  onSelect: (id: LessonId) => void
}) {
  return (
    <ol className="space-y-1">
      {course.lessons.map((lesson, i) => {
        const current = lesson.id === currentId
        return (
          <li key={lesson.id}>
            <button
              type="button"
              onClick={() => onSelect(lesson.id)}
              aria-current={current ? 'true' : undefined}
              className={cn(
                'group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition',
                current ? 'bg-rh-ink text-white' : 'hover:bg-rh-cream'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                  lesson.done ? 'bg-rh-lime text-rh-ink' : current ? 'bg-white/10 text-white' : 'bg-rh-ink/[0.06] text-rh-ink/70'
                )}
              >
                {lesson.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm font-semibold', current ? 'text-white' : 'text-rh-ink')}>{lesson.title}</span>
                <span className={cn('block text-xs', current ? 'text-white/60' : 'text-rh-ink/50')}>{formatLength(lesson.durationSec)}</span>
              </span>
              {current ? (
                <Play className="h-3.5 w-3.5 shrink-0 text-rh-lime" />
              ) : (
                <Play className="h-3.5 w-3.5 shrink-0 text-rh-ink/30 opacity-0 transition group-hover:opacity-100" />
              )}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Everything that belongs to one lesson; keyed by lesson so it starts fresh on every switch. */
function Stage({
  course,
  lessonId,
  onSelectLesson,
}: {
  course: VideoCourse
  lessonId: LessonId
  onSelectLesson: (id: LessonId) => void
}) {
  const reduce = useReducedMotion()
  const getPlayback = useAction(videoApi.playback)
  const saveProgress = useMutation(videoApi.saveProgress)

  const index = course.lessons.findIndex((l) => l.id === lessonId)
  const lesson = course.lessons[index]
  const next = course.lessons[index + 1] ?? null

  // Read once when the lesson opens: the live query updates as progress saves
  const [resumeAt] = useState(() =>
    course.progress.resume?.lessonId === lessonId && !lesson?.done ? course.progress.resume.positionSec : 0
  )
  const [source, setSource] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [resumedChip, setResumedChip] = useState(false)
  const [finishedCourse, setFinishedCourse] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const lastSaved = useRef(0)
  const markedDone = useRef(Boolean(lesson?.done))
  const retried = useRef(false)
  const played = useRef(false)
  const restoreAt = useRef(resumeAt)

  const load = useCallback(async () => {
    setError(null)
    try {
      const { url } = await getPlayback({ lessonId })
      setSource(url)
    } catch (err) {
      setError(errorMessage(err, 'We couldn’t load this lesson. Please try again.'))
    }
  }, [getPlayback, lessonId])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(
    (completed: boolean) => {
      const video = videoRef.current
      if (!video) return
      lastSaved.current = Date.now()
      saveProgress({ lessonId, positionSec: video.currentTime || 0, completed })
        .then((result) => {
          if (result?.completedCourse) {
            setFinishedCourse(true)
            playSound('success')
          }
        })
        .catch(() => {
          // Progress is best-effort; the next save catches up
        })
    },
    [lessonId, saveProgress]
  )

  // Save when the tab is hidden or the lesson closes, so a resume point is never lost
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && videoRef.current && !videoRef.current.paused) save(false)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      // The video element is gone by now, so use the last position it reported
      if (played.current && !markedDone.current) {
        saveProgress({ lessonId, positionSec: restoreAt.current, completed: false }).catch(() => {})
      }
    }
  }, [save, saveProgress, lessonId])

  // Up-next countdown (skipped for reduced motion: the learner chooses)
  useEffect(() => {
    if (countdown === null || !next) return
    if (countdown <= 0) {
      onSelectLesson(next.id)
      return
    }
    const timer = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(timer)
  }, [countdown, next, onSelectLesson])

  useEffect(() => {
    if (!resumedChip) return
    const timer = setTimeout(() => setResumedChip(false), 6000)
    return () => clearTimeout(timer)
  }, [resumedChip])

  if (!lesson) return null

  const onLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return
    const at = restoreAt.current
    if (at > 5 && at < video.duration - 10) {
      video.currentTime = at
      if (at === resumeAt && !retried.current) setResumedChip(true)
    }
  }

  const onTimeUpdate = () => {
    const video = videoRef.current
    if (!video || !video.duration) return
    restoreAt.current = video.currentTime
    // Counts as watched near the end, so skipping the last seconds still completes it
    if (!markedDone.current && video.currentTime >= video.duration - Math.min(15, video.duration * 0.05)) {
      markedDone.current = true
      save(true)
    } else if (Date.now() - lastSaved.current > SAVE_EVERY_MS) {
      save(false)
    }
  }

  const onEnded = () => {
    if (!markedDone.current) {
      markedDone.current = true
      save(true)
    }
    setEnded(true)
    if (next && !reduce) setCountdown(NEXT_COUNTDOWN)
  }

  // A link that expired mid-lesson (or a dropped connection): fetch a fresh one once and carry on
  const onVideoError = () => {
    if (retried.current) {
      setError('This lesson stopped playing. Check your connection and try again.')
      return
    }
    retried.current = true
    void load()
  }

  const startOver = () => {
    const video = videoRef.current
    if (video) {
      video.currentTime = 0
      void video.play().catch(() => {})
    }
    setResumedChip(false)
  }

  const replay = () => {
    setEnded(false)
    setCountdown(null)
    startOver()
  }

  return (
    <div className="min-w-0">
      <div className="relative aspect-video overflow-hidden rounded-[1.5rem] bg-rh-ink shadow-soft sm:rounded-[1.75rem]">
        {source ? (
          <video
            ref={videoRef}
            src={source}
            poster={lesson.posterUrl ?? undefined}
            controls
            autoPlay
            playsInline
            preload="metadata"
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            onPause={() => !markedDone.current && save(false)}
            onPlay={() => {
              played.current = true
              setEnded(false)
              setCountdown(null)
            }}
            onEnded={onEnded}
            onError={onVideoError}
            className="h-full w-full bg-rh-ink object-contain"
          />
        ) : (
          <>
            {lesson.posterUrl && (
              <Image
                src={lesson.posterUrl}
                loader={imagekitLoader}
                alt=""
                fill
                sizes="(min-width: 1024px) 66vw, 100vw"
                className="object-cover opacity-50"
              />
            )}
            {!error && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
          </>
        )}

        {resumedChip && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-rh-ink/85 py-1.5 pl-3.5 pr-1.5 text-xs font-medium text-white backdrop-blur">
            Picked up at {formatClock(resumeAt)}
            <button type="button" onClick={startOver} className="rounded-full bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25">
              Start over
            </button>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-rh-ink/90 p-6 text-center">
            <p className="max-w-sm text-sm text-white/80">{error}</p>
            <button
              type="button"
              onClick={() => {
                retried.current = false
                setSource(null)
                void load()
              }}
              className={cn(pillLime, 'h-11')}
            >
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
          </div>
        )}

        {ended && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-rh-ink/90 p-6 text-center text-white">
            {next ? (
              <>
                <p className="text-sm text-white/60">Up next</p>
                <p className={cn('mt-1 max-w-md text-xl leading-snug sm:text-2xl', displayFont)}>{next.title}</p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <button type="button" onClick={() => onSelectLesson(next.id)} className={cn(pillLime, 'h-11')}>
                    <Play className="h-3.5 w-3.5" />
                    {countdown !== null ? `Playing in ${countdown}` : 'Play next lesson'}
                  </button>
                  <button
                    type="button"
                    onClick={countdown !== null ? () => setCountdown(null) : replay}
                    className="h-11 rounded-full px-5 text-sm font-semibold text-white/75 hover:text-white"
                  >
                    {countdown !== null ? 'Stay here' : 'Watch again'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rh-lime text-rh-ink">
                  <Check className="h-5 w-5" />
                </span>
                <p className={cn('mt-4 max-w-md text-xl leading-snug sm:text-2xl', displayFont)}>
                  {finishedCourse || course.progress.isComplete ? `You’ve finished ${course.title}` : 'That’s the last lesson'}
                </p>
                <button type="button" onClick={replay} className="mt-5 h-11 rounded-full px-5 text-sm font-semibold text-white/75 hover:text-white">
                  Watch again
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-6">
        <p className="text-sm text-rh-ink/55">
          Lesson {index + 1} of {course.lessons.length} · {formatLength(lesson.durationSec)}
        </p>
        <h1 className={cn('mt-1 text-[26px] leading-tight tracking-tight text-rh-ink sm:text-[32px]', displayFont)}>{lesson.title}</h1>
        {lesson.description && <p className="mt-3 max-w-2xl whitespace-pre-line text-[15px] leading-7 text-rh-ink/70">{lesson.description}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          {index > 0 && (
            <button type="button" onClick={() => onSelectLesson(course.lessons[index - 1].id)} className={cn(pillOutline, 'h-11')}>
              <ArrowLeft className="h-4 w-4" /> Previous
            </button>
          )}
          {next && (
            <button type="button" onClick={() => onSelectLesson(next.id)} className={cn(pillOutline, 'h-11')}>
              Next lesson <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function LessonPlayer({
  course,
  lessonId,
  onSelectLesson,
  onBack,
}: {
  course: VideoCourse
  lessonId: LessonId
  onSelectLesson: (id: LessonId) => void
  onBack: () => void
}) {
  const fraction = course.progress.total ? course.progress.completed / course.progress.total : 0
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex max-w-full items-center gap-2 text-sm font-semibold text-rh-ink/60 transition hover:text-rh-ink"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" />
        <span className="truncate">{course.title}</span>
      </button>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <Stage key={lessonId} course={course} lessonId={lessonId} onSelectLesson={onSelectLesson} />

        <aside className="rounded-[1.75rem] bg-white p-4 shadow-soft lg:sticky lg:top-24">
          <div className="px-2 pb-3 pt-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold text-rh-ink">Lessons</span>
              <span className="tabular-nums text-rh-ink/55">
                {course.progress.completed} of {course.progress.total} done
              </span>
            </div>
            <ProgressBar value={fraction} className="mt-2.5" />
          </div>
          <div className="max-h-[60vh] overflow-y-auto lg:max-h-[calc(100vh-14rem)]">
            <LessonList course={course} currentId={lessonId} onSelect={onSelectLesson} />
          </div>
        </aside>
      </div>
    </div>
  )
}
