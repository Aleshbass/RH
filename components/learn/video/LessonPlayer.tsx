'use client'

/**
 * The lesson player: a signed, expiring video link (or YouTube's privacy-enhanced player for
 * YouTube lessons), resume where you left off, progress saved as you watch, and the next lesson
 * queued at the end.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import Image from 'next/image'
import { useAction, useMutation } from 'convex/react'
import { useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Loader2, Play, RotateCcw } from '@/components/icons'
import { errorMessage } from '@/components/partners/portal/shared'
import type { Id } from '@/convex/_generated/dataModel'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { displayFont, pillLime, pillOutline } from '../shared'
import { ProtectedStream, type HlsStream } from './ProtectedStream'
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

// ─────────────────────────────────────────────────────────────────────────────
// YouTube lessons: YouTube's IFrame API, so position, pause and end report like a <video>
// ─────────────────────────────────────────────────────────────────────────────

type YouTubePlayer = {
  getCurrentTime: () => number
  getDuration: () => number
  getPlayerState: () => number
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  playVideo: () => void
  destroy: () => void
}

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string
      host?: string
      playerVars?: Record<string, number | string>
      events?: { onReady?: () => void; onStateChange?: (event: { data: number }) => void; onError?: () => void }
    }
  ) => YouTubePlayer
}

const YT_PLAYING = 1
const YT_PAUSED = 2
const YT_ENDED = 0

let youtubeApi: Promise<YouTubeApi> | null = null

/** Loads YouTube's player script once per page. */
function loadYoutubeApi(): Promise<YouTubeApi> {
  const w = window as unknown as { YT?: YouTubeApi & { loaded?: number }; onYouTubeIframeAPIReady?: () => void }
  if (w.YT?.Player) return Promise.resolve(w.YT)
  youtubeApi ??= new Promise((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (w.YT) resolve(w.YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      youtubeApi = null
      reject(new Error('YouTube didn’t load. Check your connection and try again.'))
    }
    document.head.appendChild(script)
  })
  return youtubeApi
}

/** A YouTube video in the lesson frame. Reports what a <video> element would, through callbacks. */
function YoutubeFrame({
  videoId,
  playerRef,
  onReady,
  onTick,
  onPlay,
  onPause,
  onEnded,
  onError,
}: {
  videoId: string
  playerRef: RefObject<YouTubePlayer | null>
  onReady: () => void
  onTick: () => void
  onPlay: () => void
  onPause: () => void
  onEnded: () => void
  onError: (message: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  // Latest callbacks without recreating the player
  const handlers = useRef({ onReady, onTick, onPlay, onPause, onEnded, onError })
  useEffect(() => {
    handlers.current = { onReady, onTick, onPlay, onPause, onEnded, onError }
  })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null
    const stopTicking = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    loadYoutubeApi()
      .then((YT) => {
        if (cancelled || !host.current) return
        const target = document.createElement('div')
        host.current.appendChild(target)
        playerRef.current = new YT.Player(target, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: () => handlers.current.onReady(),
            onStateChange: ({ data }) => {
              if (data === YT_PLAYING) {
                handlers.current.onPlay()
                stopTicking()
                timer = setInterval(() => handlers.current.onTick(), 1000)
              } else {
                stopTicking()
                if (data === YT_PAUSED) handlers.current.onPause()
                if (data === YT_ENDED) handlers.current.onEnded()
              }
            },
            onError: () => handlers.current.onError('This YouTube video can’t be played here right now.'),
          },
        })
      })
      .catch((err: Error) => !cancelled && handlers.current.onError(err.message))
    return () => {
      cancelled = true
      stopTicking()
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [videoId, playerRef])

  return <div ref={host} className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full" />
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
  const youtubeId = lesson?.youtubeId ?? null

  // Read once when the lesson opens: the live query updates as progress saves
  const [resumeAt] = useState(() =>
    course.progress.resume?.lessonId === lessonId && !lesson?.done ? course.progress.resume.positionSec : 0
  )
  const [source, setSource] = useState<string | null>(null)
  // Protected lessons: an encrypted stream with a short-lived token (ProtectedStream)
  const [stream, setStream] = useState<HlsStream | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [resumedChip, setResumedChip] = useState(false)
  const [finishedCourse, setFinishedCourse] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const ytRef = useRef<YouTubePlayer | null>(null)
  const [ytAttempt, setYtAttempt] = useState(0)
  const lastSaved = useRef(0)
  const markedDone = useRef(Boolean(lesson?.done))
  const retried = useRef(false)
  const played = useRef(false)
  const restoreAt = useRef(resumeAt)

  // The same questions of either player: where it is, how long the video is, whether it's playing
  const position = () => ytRef.current?.getCurrentTime() ?? videoRef.current?.currentTime ?? 0
  const length = () => ytRef.current?.getDuration() ?? videoRef.current?.duration ?? 0
  const seek = (seconds: number) => {
    if (ytRef.current) ytRef.current.seekTo(seconds, true)
    else if (videoRef.current) videoRef.current.currentTime = seconds
  }

  const load = useCallback(async () => {
    setError(null)
    // YouTube lessons need no link: YouTube's own player loads them
    if (youtubeId) return
    try {
      const playback = await getPlayback({ lessonId })
      if (playback.hls) setStream(playback.hls)
      else setSource(playback.url ?? null)
    } catch (err) {
      setError(errorMessage(err, 'We couldn’t load this lesson. Please try again.'))
    }
  }, [getPlayback, lessonId, youtubeId])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(
    (completed: boolean) => {
      if (!videoRef.current && !ytRef.current) return
      lastSaved.current = Date.now()
      const at = ytRef.current?.getCurrentTime() ?? videoRef.current?.currentTime ?? 0
      saveProgress({ lessonId, positionSec: at || 0, completed })
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
      const playing = ytRef.current
        ? ytRef.current.getPlayerState() === YT_PLAYING
        : Boolean(videoRef.current && !videoRef.current.paused)
      if (document.visibilityState === 'hidden' && playing) save(false)
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

  // Ready to play: pick up where the learner left off
  const restore = () => {
    const duration = length()
    const at = restoreAt.current
    if (at > 5 && (!duration || at < duration - 10)) {
      seek(at)
      if (at === resumeAt && !retried.current) setResumedChip(true)
    }
  }

  const tick = () => {
    const duration = length()
    if (!duration) return
    const now = position()
    restoreAt.current = now
    // Counts as watched near the end, so skipping the last seconds still completes it
    if (!markedDone.current && now >= duration - Math.min(15, duration * 0.05)) {
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
  // Protected streams: a fresh token (Convex re-checks access each time)
  const refreshStream = async () => (await getPlayback({ lessonId })).hls ?? null

  const onVideoError = () => {
    // hls.js reports its own errors (ProtectedStream); this is for the older file links
    if (stream) return
    if (retried.current) {
      setError('This lesson stopped playing. Check your connection and try again.')
      return
    }
    retried.current = true
    void load()
  }

  const startOver = () => {
    seek(0)
    if (ytRef.current) ytRef.current.playVideo()
    else void videoRef.current?.play().catch(() => {})
    setResumedChip(false)
  }

  const onPlay = () => {
    played.current = true
    setEnded(false)
    setCountdown(null)
  }

  const replay = () => {
    setEnded(false)
    setCountdown(null)
    startOver()
  }

  return (
    <div className="min-w-0">
      <div
        ref={frameRef}
        className="relative aspect-video overflow-hidden rounded-[1.5rem] bg-rh-ink shadow-soft sm:rounded-[1.75rem] [&:fullscreen]:rounded-none [&:fullscreen_video]:h-full"
      >
        {youtubeId && !error ? (
          <YoutubeFrame
            key={ytAttempt}
            videoId={youtubeId}
            playerRef={ytRef}
            onReady={restore}
            onTick={tick}
            onPlay={onPlay}
            onPause={() => !markedDone.current && save(false)}
            onEnded={onEnded}
            onError={setError}
          />
        ) : (source || stream) && !error ? (
          <video
            ref={videoRef}
            src={source ?? undefined}
            disablePictureInPicture
            poster={lesson.posterUrl ?? undefined}
            controls
            autoPlay
            playsInline
            preload="metadata"
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
            onLoadedMetadata={restore}
            onTimeUpdate={tick}
            onPause={() => !markedDone.current && save(false)}
            onPlay={onPlay}
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

        {stream && !error && (
          <ProtectedStream
            stream={stream}
            videoRef={videoRef}
            frameRef={frameRef}
            refresh={refreshStream}
            onFatal={setError}
            onTamper={() => setError('Playback paused: the name on the video was hidden. Reload the lesson to keep watching.')}
          />
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
                if (youtubeId) {
                  setError(null)
                  setYtAttempt((n) => n + 1)
                } else void load()
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

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <Stage key={lessonId} course={course} lessonId={lessonId} onSelectLesson={onSelectLesson} />

        <aside className="min-w-0 rounded-[1.75rem] bg-white p-4 shadow-soft lg:sticky lg:top-28">
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
