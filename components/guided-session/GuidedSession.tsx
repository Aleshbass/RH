'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import {
  Camera,
  Check,
  Loader2,
  RotateCcw,
  ShieldAlert,
  SwitchCamera,
  Timer,
  Volume2,
  VolumeX,
  X,
} from '@/components/icons'
import { findClip, posterUrl } from '@/convex/exerciseLibraryCatalog'
import type { ViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import { VoiceGuide } from '@/lib/exercise3d/voice'
import { CorrectionVoice, saveCueMode, savedCueMode, VoiceoverTimeline, type CueMode } from '@/lib/motion/audioManager'
import type { GuidedResult } from '@/lib/motion/convexRefs'
import { brightness, drawSkeleton } from '@/lib/motion/draw'
import { CUES, type CueCode, type MotionExercise } from '@/lib/motion/exercises'
import { frontalness, nearSide, point, visible, type Frame, type Joint, type Side } from '@/lib/motion/pose'
import { downloadMegabytes, isDownloaded, PoseTracker, type LoadProgress, type PoseModel } from '@/lib/motion/poseTracker'
import { SessionTracker, type SessionSummary } from '@/lib/motion/session'
import { FrameSmoother } from '@/lib/motion/smoothing'
import { cn } from '@/lib/utils'
import { useCoachAssets } from './useCoachAssets'
import { RehabifyLoader } from '@/components/brand/RehabifyLoader'

const ExerciseStage = dynamic(() => import('@/components/exercise3d/ExerciseStage'), { ssr: false })

const REST_SECONDS = 20
const PRAISE_SCORE = 85 // a clean rep (no form mistakes) scoring at least this earns a "Good job!"
const READY_HOLD_MS = 1500
const COUNTDOWN = 3
const DARK = 45 // average brightness out of 255
const MODEL_KEY = 'rh-motion-model'
const VOICE_PREF = 'rh-exercise-voice' // the demonstration's voice guide setting (ExerciseViewer)

type Phase = 'intro' | 'starting' | 'setup' | 'countdown' | 'active' | 'rest' | 'summary' | 'error'
type Check = { ok: boolean; label: string }
type Cue = { text: string; tone: 'good' | 'fix' | 'info'; until: number }

const JOINT_WORDS: Record<Joint, string> = {
  ear: 'head',
  shoulder: 'shoulders',
  elbow: 'elbows',
  wrist: 'hands',
  hip: 'hips',
  knee: 'knees',
  ankle: 'feet',
  heel: 'feet',
  toe: 'feet',
}

function savedModel(): PoseModel {
  try {
    return localStorage.getItem(MODEL_KEY) === 'full' ? 'full' : 'lite'
  } catch {
    return 'lite'
  }
}

function voiceGuideWanted() {
  try {
    return localStorage.getItem(VOICE_PREF) !== 'off'
  } catch {
    return true
  }
}

function cameraError(error: unknown) {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.'
  if (name === 'NotReadableError') return 'Another app is using the camera. Close it and try again.'
  return error instanceof Error && error.message ? error.message : 'The camera coach couldn’t start. Try again.'
}

function median(values: number[]) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export type GuidedSessionProps = {
  clipId: string
  exercise: MotionExercise
  name: string
  itemIndex: number
  plan: { sets: number; reps: number }
  requestGrant: (clipIds: string[]) => Promise<ViewerGrant>
  /** Earlier sessions of this exercise, newest first (signed-in patients only) */
  history?: { rehabifyScore: number }[] | null
  /** Saves the session; the player then asks how it felt (pain), as for any logged exercise */
  onSave: (result: GuidedResult) => Promise<void>
  onClose: () => void
}

/**
 * Camera coach: the patient exercises in front of their phone next to the 3D demonstration. The
 * camera follows their movement on the phone itself (lib/motion), counts reps, shows tips and
 * scores each rep. Feedback is guidance on form, not a diagnosis.
 */
export default function GuidedSession({ clipId, exercise, name, itemIndex, plan: planProp, requestGrant, history, onSave, onClose }: GuidedSessionProps) {
  // The player re-renders often (a new object each time); the session keeps one
  const { sets, reps } = planProp
  const plan = useMemo(() => ({ sets, reps }), [sets, reps])
  const clipInfo = findClip(clipId)
  const clipSide: Side = clipInfo?.side === 'R' ? 'R' : 'L'
  const coach = useCoachAssets(clipId, requestGrant, exercise, clipSide)

  const [phase, setPhase] = useState<Phase>('intro')
  const [error, setError] = useState<string | null>(null)
  const [model, setModel] = useState<PoseModel>('lite')
  const [cueMode, setCueMode] = useState<CueMode>('visual')
  const [voiceOn, setVoiceOn] = useState(true)
  const [downloaded, setDownloaded] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [checks, setChecks] = useState<Check[]>([])
  const [count, setCount] = useState(COUNTDOWN)
  const [restLeft, setRestLeft] = useState(REST_SECONDS)
  const [hud, setHud] = useState({ set: 1, rep: 0, progress: 0, lastScore: null as number | null, missing: null as string | null, dark: false })
  const [cue, setCue] = useState<Cue | null>(null)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scratchRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const trackerRef = useRef<PoseTracker | null>(null)
  const smootherRef = useRef(new FrameSmoother())
  const sessionRef = useRef<SessionTracker | null>(null)
  const phaseRef = useRef<Phase>('intro')
  const sideRef = useRef<Side>(clipSide)
  const sideVotes = useRef<Side[]>([])
  const readySince = useRef(0)
  const restAngles = useRef<number[]>([])
  const missingSince = useRef(0)
  // A limb kept turning towards the camera (engine.outOfPlane): frames are skipped until they turn back
  const outOfPlaneSince = useRef(0)
  const flagged = useRef<{ joints: Joint[]; until: number }>({ joints: [], until: 0 })
  const lightAt = useRef(0)
  const darkRef = useRef(false)
  const startedAt = useRef(0)
  const fps = useRef({ frames: 0, since: 0, value: 0, detectMs: 12, target: 24 })
  const hudAt = useRef(0)
  const loopTime = useRef(0)
  const guideRef = useRef<VoiceGuide | null>(null)
  const timelineRef = useRef<VoiceoverTimeline | null>(null)
  const correctionRef = useRef<CorrectionVoice | null>(null)
  const wakeLock = useRef<{ release(): Promise<void> } | null>(null)

  const codes = useMemo(() => [exercise.partialCue, ...exercise.rules.map((r) => r.code), 'good_set', 'all_done'] as CueCode[], [exercise])

  const go = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  useEffect(() => {
    setModel(savedModel())
    setCueMode(savedCueMode())
    setVoiceOn(voiceGuideWanted())
    void isDownloaded(savedModel()).then(setDownloaded)
  }, [])

  useEffect(() => {
    void isDownloaded(model).then(setDownloaded)
  }, [model])

  // Voiceover of the demonstration (unchanged player) and spoken corrections, which wait for it
  useEffect(() => {
    const audio = clipInfo?.audio ?? null
    guideRef.current = audio ? new VoiceGuide(audio) : null
    timelineRef.current = new VoiceoverTimeline(audio)
    correctionRef.current = new CorrectionVoice(codes, savedCueMode())
    correctionRef.current.setPraise(savedCueMode() === 'voice' || voiceGuideWanted())
    return () => {
      guideRef.current?.dispose()
      correctionRef.current?.dispose()
      guideRef.current = null
      correctionRef.current = null
    }
  }, [clipInfo?.audio, codes])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    trackerRef.current?.close()
    trackerRef.current = null
    void wakeLock.current?.release().catch(() => undefined)
    wakeLock.current = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  // Full screen: the page behind doesn't scroll
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const showCue = useCallback((text: string, tone: Cue['tone'], ms = 2600) => {
    setCue({ text, tone, until: performance.now() + ms })
  }, [])

  const finish = useCallback(() => {
    const session = sessionRef.current
    stopCamera()
    if (!session || session.repsCounted === 0) {
      onClose()
      return
    }
    setSummary(session.summary())
    go('summary')
  }, [go, onClose, stopCamera])

  /** One processed camera frame: what it means depends on where the session is. */
  const handleFrame = useCallback(
    (frame: Frame | null, now: number) => {
      const current = phaseRef.current
      const video = videoRef.current
      if (video && now - lightAt.current > 1000) {
        lightAt.current = now
        scratchRef.current ??= document.createElement('canvas')
        const b = brightness(video, scratchRef.current)
        darkRef.current = b !== null && b < DARK
      }

      if (current === 'setup' || current === 'countdown') {
        if (frame && exercise.side === 'auto') {
          const near = nearSide(frame)
          if (near) {
            sideVotes.current = [...sideVotes.current.slice(-14), near]
            const left = sideVotes.current.filter((s) => s === 'L').length
            sideRef.current = left >= sideVotes.current.length / 2 ? 'L' : 'R'
          }
        }
        const side = sideRef.current
        const missing = frame ? exercise.needed.filter((j) => !visible(point(frame, j, side))) : exercise.needed
        const near = frame ? nearSide(frame) : null
        const front = frame ? frontalness(frame) : null
        const primary = frame ? exercise.primary(frame, side) : null
        const startProblem = primary !== null ? exercise.startCheck(primary) : null
        const sideWord = side === 'L' ? 'left' : 'right'
        const list: Check[] = [
          { ok: !darkRef.current, label: darkRef.current ? 'It’s quite dark: turn on a light or face a window' : 'Light is good' },
          {
            ok: Boolean(frame) && missing.length === 0,
            label: !frame
              ? 'Step into view'
              : missing.length
                ? `Step back so we can see your ${[...new Set(missing.map((j) => JOINT_WORDS[j]))].join(' and ')}`
                : 'Whole body in view',
          },
          exercise.view === 'front'
            ? {
                ok: front !== null && front >= 0.45,
                label: front !== null && front < 0.45 ? 'Turn to face the phone' : 'Facing the phone',
              }
            : {
                ok: front !== null && front < 0.45 && (exercise.side === 'auto' || near === null || near === side),
                label:
                  front !== null && front >= 0.45
                    ? 'Turn side-on to the phone'
                    : exercise.side === 'clip' && near && near !== side
                      ? `Turn round so your ${sideWord} ${exercise.limb} is nearest the phone`
                      : 'Side-on to the phone',
              },
          { ok: primary !== null && !startProblem, label: startProblem ?? 'In the start position' },
        ]
        if (current === 'setup') {
          if (now - hudAt.current > 150) {
            hudAt.current = now
            setChecks(list)
          }
          if (list.every((c) => c.ok)) {
            if (!readySince.current) readySince.current = now
            if (now - readySince.current > READY_HOLD_MS) {
              restAngles.current = []
              setCount(COUNTDOWN)
              go('countdown')
            }
          } else readySince.current = 0
        } else {
          if (!list[1].ok) {
            // Walked out of view during the countdown: back to the checks
            readySince.current = 0
            go('setup')
          } else if (primary !== null) restAngles.current.push(primary)
        }
        return
      }

      if (current === 'active' && sessionRef.current) {
        const session = sessionRef.current
        const missing = frame ? session.engine.missing(frame) : exercise.needed
        if (missing.length) {
          if (!missingSince.current) missingSince.current = now
        } else missingSince.current = 0
        const frameEvents = frame ? session.onFrame(frame) : []
        if (session.engine.outOfPlane) {
          if (!outOfPlaneSince.current) outOfPlaneSince.current = now
        } else outOfPlaneSince.current = 0
        for (const event of frameEvents) {
          if (event.type === 'rep') {
            const fix = event.rep.mistakes[0]
            if (fix) {
              showCue(CUES[fix], 'fix')
              flagged.current = { joints: exercise.rules.find((r) => r.code === fix)?.joints ?? [], until: now + 2600 }
              correctionRef.current?.request(fix, now)
            } else {
              showCue(`Good rep · ${event.rep.score}`, 'good', 1800)
              if (event.rep.score >= PRAISE_SCORE) correctionRef.current?.praise(now)
            }
            setHud((h) => ({ ...h, rep: event.repInSet, lastScore: event.rep.score }))
          } else if (event.type === 'partial') {
            showCue(CUES[event.cue], 'fix')
            flagged.current = { joints: [exercise.primaryJoint], until: now + 2600 }
            correctionRef.current?.request(event.cue, now)
          } else if (event.type === 'set-done') {
            correctionRef.current?.request(event.topMistake ?? 'good_set', now)
            if (session.plan.sets > event.set) {
              setRestLeft(REST_SECONDS)
              go('rest')
            }
          } else if (event.type === 'all-done') {
            correctionRef.current?.request('all_done', now)
            finish()
            return
          }
        }
      }

      // Spoken correction or praise: between reps or resting, and never over the voiceover
      const correction = correctionRef.current
      const session = sessionRef.current
      if (correction?.enabled || correction?.praiseOn) {
        const voiceTalking = guideRef.current?.started && voiceOn
        void correction.pump((seconds) => {
          const p = phaseRef.current
          if (p === 'rest') return true
          if (p !== 'active' || !session?.engine.betweenReps) return false
          if (!voiceTalking) return true
          const clipSeconds = coach.status === 'ready' ? coach.clip.duration : 0
          return timelineRef.current?.quiet(loopTime.current, clipSeconds, 1, seconds, now) ?? true
        }, now)
      }

      if (now - hudAt.current > 120) {
        hudAt.current = now
        setHud((h) => ({
          ...h,
          set: session?.set ?? 1,
          progress: session?.engine.progress ?? 0,
          dark: darkRef.current,
          missing:
            missingSince.current && now - missingSince.current > 700 && session
              ? `Step back so we can see your ${[...new Set(session.engine.missing(frame ?? { t: 0, points: [] }).map((j) => JOINT_WORDS[j]))].join(' and ') || 'whole body'}`
              : outOfPlaneSince.current && now - outOfPlaneSince.current > 700 && session
                ? exercise.view === 'front'
                  ? 'Keep facing the phone: your arm or leg is moving towards the camera'
                  : 'Stay side-on to the phone: your arm or leg is turning towards the camera'
                : null,
        }))
      }
    },
    [coach, exercise, finish, go, showCue, voiceOn]
  )

  // The tracking loop: detection capped at 24 frames a second (15 on slow phones), paused when hidden
  useEffect(() => {
    if (!['setup', 'countdown', 'active', 'rest'].includes(phase)) return
    let raf = 0
    let last = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const video = videoRef.current
      const tracker = trackerRef.current
      if (!video || !tracker || document.hidden) return
      const now = performance.now()
      const f = fps.current
      if (now - last < 1000 / f.target) return
      last = now
      const t0 = performance.now()
      let raw: Frame | null = null
      try {
        raw = tracker.detect(video, now)
      } catch {
        raw = null
      }
      f.detectMs = f.detectMs * 0.9 + (performance.now() - t0) * 0.1
      f.target = f.detectMs > 45 ? 15 : 24
      f.frames += 1
      if (now - f.since > 2000) {
        f.value = Math.round((f.frames * 1000) / (now - f.since))
        f.frames = 0
        f.since = now
      }
      const frame = raw ? smootherRef.current.smooth(raw) : null
      handleFrame(frame, now)
      const canvas = canvasRef.current
      if (canvas) {
        const flags = flagged.current.until > now ? flagged.current.joints : []
        drawSkeleton(canvas, video, frame, { side: sideRef.current, flagged: flags, aspect: tracker.imageAspect })
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase, handleFrame])

  // Countdown, then the session starts with the patient's own resting angle
  useEffect(() => {
    if (phase !== 'countdown') return
    if (count <= 0) {
      const reference = coach.status === 'ready' ? coach.reference : null
      sessionRef.current ??= new SessionTracker(exercise, sideRef.current, plan, reference, median(restAngles.current))
      startedAt.current ||= Date.now()
      showCue('Go! Follow the coach.', 'info', 2000)
      go('active')
      return
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, count, coach, exercise, plan, go, showCue])

  // Rest between sets
  useEffect(() => {
    if (phase !== 'rest') return
    if (restLeft <= 0) {
      sessionRef.current?.nextSet()
      setHud((h) => ({ ...h, rep: 0 }))
      showCue(`Set ${sessionRef.current?.set ?? ''}: go`, 'info', 2000)
      go('active')
      return
    }
    const t = setTimeout(() => setRestLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, restLeft, go, showCue])

  // Cues fade out on their own
  useEffect(() => {
    if (!cue) return
    const t = setTimeout(() => setCue((c) => (c && c.until <= performance.now() + 50 ? null : c)), Math.max(0, cue.until - performance.now()))
    return () => clearTimeout(t)
  }, [cue])

  const openCamera = useCallback(async (mode: 'user' | 'environment') => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser can’t use the camera here. Open Rehabify in Chrome or Safari.')
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: mode, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
    })
    streamRef.current = stream
    const video = videoRef.current
    if (video) {
      video.srcObject = stream
      await video.play().catch(() => undefined)
    }
  }, [])

  /** Start: from the patient's tap, so sound and the camera are allowed. */
  const start = useCallback(async () => {
    saveCueMode(cueMode)
    try {
      localStorage.setItem(MODEL_KEY, model)
    } catch {
      // Not remembered in private mode
    }
    setError(null)
    setProgress(null)
    go('starting')
    const correction = correctionRef.current
    correction?.setEnabled(cueMode === 'voice')
    correction?.setPraise(cueMode === 'voice' || voiceOn)
    try {
      await correction?.start()
      const guide = guideRef.current
      if (guide && voiceOn) {
        void guide.start({ intro: true })
        if (correction?.context) {
          const ctx = correction.context
          void timelineRef.current?.introStarted(ctx, performance.now())
          void timelineRef.current?.measure(ctx)
        }
      }
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }
      wakeLock.current = (await nav.wakeLock?.request('screen').catch(() => null)) ?? null
      const [tracker] = await Promise.all([PoseTracker.create(model, setProgress), openCamera(facingMode)])
      trackerRef.current = tracker
      smootherRef.current.reset()
      fps.current = { frames: 0, since: performance.now(), value: 0, detectMs: 12, target: 24 }
      readySince.current = 0
      go('setup')
    } catch (e) {
      stopCamera()
      setError(cameraError(e))
      go('error')
    }
  }, [cueMode, facingMode, go, model, openCamera, stopCamera, voiceOn])

  const switchCamera = useCallback(async () => {
    const next = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(next)
    smootherRef.current.reset()
    try {
      await openCamera(next)
    } catch (e) {
      setError(cameraError(e))
    }
  }, [facingMode, openCamera])

  const toggleVoice = useCallback(async () => {
    const guide = guideRef.current
    const next = !voiceOn
    setVoiceOn(next)
    correctionRef.current?.setPraise(cueMode === 'voice' || next)
    try {
      localStorage.setItem(VOICE_PREF, next ? 'on' : 'off')
    } catch {
      // Not remembered in private mode
    }
    if (!guide) return
    if (!next) guide.setMuted(true)
    else if (guide.started) guide.setMuted(false)
    else await guide.start({ intro: false })
  }, [cueMode, voiceOn])

  const toggleCues = useCallback(() => {
    const next: CueMode = cueMode === 'voice' ? 'visual' : 'voice'
    setCueMode(next)
    saveCueMode(next)
    correctionRef.current?.setEnabled(next === 'voice')
    correctionRef.current?.setPraise(next === 'voice' || voiceOn)
  }, [cueMode, voiceOn])

  const save = useCallback(async () => {
    if (!summary) return
    setSaving(true)
    setSaveError(null)
    try {
      await onSave({
        ...summary,
        itemIndex,
        clipId,
        exerciseKey: exercise.key,
        side: sideRef.current,
        startedAt: startedAt.current || Date.now(),
        durationSeconds: Math.round((Date.now() - (startedAt.current || Date.now())) / 1000),
        tracking: { model, delegate: trackerRef.current?.delegate ?? 'CPU', fps: fps.current.value },
      })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message.replace(/^.*ConvexError: /, '') : 'Couldn’t save. Check your connection and try again.')
      setSaving(false)
    }
  }, [clipId, exercise.key, itemIndex, model, onSave, summary])

  const coachPlaying = ['intro', 'starting', 'setup', 'countdown', 'active'].includes(phase)
  const mirrored = facingMode === 'user'
  const sideWord = sideRef.current === 'L' ? 'left' : 'right'

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-rh-ink text-white" role="dialog" aria-modal="true" aria-label={`Camera coach: ${name}`}>
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">
          <Camera className="h-3.5 w-3.5 text-rh-lime" /> Camera coach
        </span>
        <span className="rounded-full bg-rh-lime px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rh-ink">Beta</span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{name}</p>
        {['setup', 'countdown', 'active', 'rest'].includes(phase) && (
          <>
            <button
              type="button"
              onClick={() => void toggleVoice()}
              className="rounded-full p-2 text-white/80 hover:bg-white/10"
              aria-pressed={voiceOn}
              title={voiceOn ? 'Mute the coach’s voice' : 'Turn the coach’s voice on'}
            >
              {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => void switchCamera()} className="rounded-full p-2 text-white/80 hover:bg-white/10" title="Switch camera">
              <SwitchCamera className="h-4 w-4" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => (['active', 'rest'].includes(phase) ? finish() : (stopCamera(), onClose()))}
          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
        >
          <X className="h-3.5 w-3.5" /> {['active', 'rest'].includes(phase) ? 'Stop' : 'Close'}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2 lg:flex-row">
        {/* The 3D coach */}
        <div className="relative h-[34vh] shrink-0 overflow-hidden rounded-3xl bg-rh-honeydew lg:h-auto lg:w-[40%]">
          {coach.status === 'ready' ? (
            <ExerciseStage
              className="absolute inset-0"
              gltf={coach.gltf}
              clip={coach.clip}
              props={clipInfo?.props ?? []}
              playing={coachPlaying}
              speed={1}
              view="side"
              viewNonce={0}
              watermark={coach.watermark}
              onFrame={(p) => {
                loopTime.current = p * coach.clip.duration
                if (voiceOn) guideRef.current?.tick(loopTime.current)
              }}
            />
          ) : (
            <Image src={posterUrl(clipId)} alt={`${name}: starting position`} fill sizes="40vw" unoptimized className="object-contain p-4" draggable={false} />
          )}
          {coach.status === 'loading' && (
            <span className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-rh-ink">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the coach…
            </span>
          )}
          {phase === 'rest' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-rh-ink/70 text-center">
              <Timer className="h-6 w-6 text-rh-lime" />
              <p className="mt-1 text-3xl font-semibold tabular-nums">{restLeft}s</p>
              <p className="text-sm text-white/80">Rest, then set {(sessionRef.current?.set ?? 1) + 1} of {plan.sets}</p>
              <button type="button" onClick={() => setRestLeft(0)} className="mt-3 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold hover:bg-white/25">
                Skip rest
              </button>
            </div>
          )}
        </div>

        {/* The patient's camera */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className={cn('absolute inset-0 h-full w-full object-contain', mirrored && '-scale-x-100', !['setup', 'countdown', 'active', 'rest'].includes(phase) && 'invisible')}
          />
          <canvas ref={canvasRef} className={cn('pointer-events-none absolute inset-0 h-full w-full', mirrored && '-scale-x-100')} />

          {phase === 'intro' && (
            <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6">
              <div className="mx-auto max-w-lg space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">Exercise with your camera</h2>
                  <p className="mt-1 text-sm text-white/75">
                    Your phone follows your movement, counts your reps and gives you tips, next to the 3D coach. {plan.sets} {plan.sets === 1 ? 'set' : 'sets'} of {plan.reps}.
                  </p>
                </div>
                <ol className="space-y-2">
                  {exercise.setup.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rh-lime text-xs font-semibold text-rh-ink">{i + 1}</span>
                      <span className="pt-0.5 text-white/90">{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="grid gap-2 sm:grid-cols-2">
                  <fieldset className="rounded-2xl bg-white/[0.06] p-3">
                    <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-white/60">Tips</legend>
                    {(['visual', 'voice'] as CueMode[]).map((mode) => (
                      <label key={mode} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                        <input type="radio" name="cue-mode" checked={cueMode === mode} onChange={() => setCueMode(mode)} className="accent-[#00cd0f]" />
                        {mode === 'visual' ? 'On screen only' : 'On screen and spoken'}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="rounded-2xl bg-white/[0.06] p-3">
                    <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-white/60">Tracking</legend>
                    {(['lite', 'full'] as PoseModel[]).map((m) => (
                      <label key={m} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                        <input type="radio" name="model" checked={model === m} onChange={() => setModel(m)} className="accent-[#00cd0f]" />
                        {m === 'lite' ? 'Standard (most phones)' : 'More accurate (newer phones)'}
                      </label>
                    ))}
                  </fieldset>
                </div>
                <p className="rounded-2xl bg-white/[0.06] p-3 text-xs text-white/75">
                  The video stays on your phone and is never uploaded. Only your rep count, scores and a simple stick figure of a few reps are
                  saved for your physio.
                  {downloaded === false && ` The first time, the camera coach downloads about ${downloadMegabytes(model)} MB of data, once: Wi-Fi is best.`}
                </p>
                <div className="flex gap-3 rounded-2xl bg-rose-500/15 p-3 text-xs text-rose-100">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                  <p>
                    This is guidance on form, not a diagnosis. Stop straight away if you feel sharp pain, dizziness or anything worrying, and tell your
                    physio.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void start()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rh-lime px-4 py-3 text-base font-semibold text-rh-ink transition hover:bg-rh-lime-deep active:scale-[0.99]"
                >
                  <Camera className="h-5 w-5" /> Start the camera
                </button>
              </div>
            </div>
          )}

          {phase === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <RehabifyLoader size={64} label="Getting the camera coach ready" />
              <p className="text-sm">
                {progress && progress.loaded < progress.total * 0.98
                  ? `Getting the camera coach ready… ${Math.round((progress.loaded / progress.total) * 100)}%`
                  : 'Starting the camera…'}
              </p>
              {progress && (
                <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-rh-lime transition-all" style={{ width: `${(progress.loaded / progress.total) * 100}%` }} />
                </div>
              )}
            </div>
          )}

          {phase === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="max-w-sm text-sm text-rose-200">{error}</p>
              <button type="button" onClick={() => void start()} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25">
                <RotateCcw className="h-4 w-4" /> Try again
              </button>
            </div>
          )}

          {phase === 'setup' && (
            <div className="absolute inset-x-2 bottom-2 rounded-2xl bg-rh-ink/85 p-3 backdrop-blur sm:inset-x-auto sm:left-3 sm:max-w-xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Getting ready</p>
              <ul className="mt-1.5 space-y-1">
                {checks.map((c, i) => (
                  <li key={i} className={cn('flex items-center gap-2 text-sm', c.ok ? 'text-white' : 'text-amber-200')}>
                    {c.ok ? <Check className="h-4 w-4 text-rh-lime" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300" />}
                    {c.label}
                  </li>
                ))}
              </ul>
              {exercise.side === 'clip' && <p className="mt-1.5 text-xs text-white/60">Exercising your {sideWord} {exercise.limb}</p>}
            </div>
          )}

          {phase === 'countdown' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-8xl font-bold tabular-nums text-rh-lime drop-shadow-lg">{Math.max(count, 1)}</span>
            </div>
          )}

          {(phase === 'active' || phase === 'rest') && (
            <>
              <div className="absolute left-3 top-3 rounded-2xl bg-rh-ink/80 px-3 py-2 backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
                  Set {hud.set} of {plan.sets}
                </p>
                <p className="text-2xl font-semibold leading-tight tabular-nums">
                  {hud.rep} <span className="text-base text-white/50">/ {plan.reps}</span>
                </p>
              </div>
              {/* How far into the movement, live */}
              <div className="absolute bottom-16 right-3 top-3 w-2.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className={cn('absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-100', hud.progress >= exercise.countAt ? 'bg-rh-lime' : 'bg-white/70')}
                  style={{ height: `${Math.round(hud.progress * 100)}%` }}
                />
                <div className="absolute inset-x-0 h-0.5 bg-rh-lime" style={{ bottom: `${exercise.countAt * 100}%` }} />
              </div>
              {(hud.missing || hud.dark) && (
                <p className="absolute inset-x-6 top-20 rounded-xl bg-amber-400/90 px-3 py-2 text-center text-sm font-semibold text-rh-ink">
                  {hud.missing ?? 'It’s quite dark: turn on a light'}
                </p>
              )}
              {cue && (
                <p
                  className={cn(
                    'absolute inset-x-4 bottom-16 mx-auto max-w-md rounded-2xl px-4 py-2.5 text-center text-base font-semibold shadow-lg',
                    cue.tone === 'good' ? 'bg-rh-lime text-rh-ink' : cue.tone === 'fix' ? 'bg-amber-300 text-rh-ink' : 'bg-white text-rh-ink'
                  )}
                >
                  {cue.text}
                </p>
              )}
              <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleCues}
                  className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', cueMode === 'voice' ? 'bg-rh-lime text-rh-ink' : 'bg-white/15 text-white')}
                  aria-pressed={cueMode === 'voice'}
                >
                  {cueMode === 'voice' ? 'Spoken tips on' : 'Spoken tips off'}
                </button>
                <p className="min-w-0 flex-1 truncate text-right text-[11px] text-white/60">Form guidance, not a diagnosis. Stop if it hurts.</p>
              </div>
            </>
          )}

          {phase === 'summary' && summary && (
            <Summary
              summary={summary}
              lastScore={history?.[0]?.rehabifyScore ?? null}
              saving={saving}
              error={saveError}
              onSave={() => void save()}
              onDiscard={onClose}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Summary({
  summary,
  lastScore,
  saving,
  error,
  onSave,
  onDiscard,
}: {
  summary: SessionSummary
  lastScore: number | null
  saving: boolean
  error: string | null
  onSave: () => void
  onDiscard: () => void
}) {
  const top = summary.mistakes[0]
  return (
    <div className="absolute inset-0 overflow-y-auto bg-rh-ink p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-4">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Rehabify Score</p>
          <p className="text-6xl font-bold tabular-nums text-rh-lime">{summary.rehabifyScore}</p>
          {lastScore !== null && (
            <p className="text-sm text-white/70">
              Last time {lastScore}
              {summary.rehabifyScore > lastScore ? ' · better than last time!' : ''}
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white/[0.07] p-3">
            <p className="text-2xl font-semibold tabular-nums">
              {summary.repsCounted}
              <span className="text-sm text-white/50">/{summary.repsTarget}</span>
            </p>
            <p className="text-[11px] text-white/60">reps</p>
          </div>
          <div className="rounded-2xl bg-white/[0.07] p-3">
            <p className="text-2xl font-semibold tabular-nums">{summary.averageScore}</p>
            <p className="text-[11px] text-white/60">form score</p>
          </div>
          <div className="rounded-2xl bg-white/[0.07] p-3">
            <p className="text-2xl font-semibold tabular-nums">
              {summary.setsDone}
              <span className="text-sm text-white/50">/{summary.setsPlanned}</span>
            </p>
            <p className="text-[11px] text-white/60">sets</p>
          </div>
        </div>
        {summary.repScores.length > 1 && (
          <div className="flex h-14 items-end gap-0.5 rounded-2xl bg-white/[0.05] p-2" aria-label="Score of each rep">
            {summary.repScores.map((s, i) => (
              <span key={i} className={cn('flex-1 rounded-sm', s >= 80 ? 'bg-rh-lime' : s >= 60 ? 'bg-amber-300' : 'bg-rose-400')} style={{ height: `${Math.max(8, s)}%` }} />
            ))}
          </div>
        )}
        <div className="rounded-2xl bg-white/[0.07] p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Tip for next time</p>
          <p className="mt-0.5">{top ? `${CUES[top.code]} (${top.count}×)` : 'Your form looked steady. Keep it up.'}</p>
          {summary.partialReps > 0 && <p className="mt-1 text-xs text-white/60">{summary.partialReps} attempts didn’t reach the full movement and weren’t counted.</p>}
        </div>
        {error && <p className="text-center text-sm text-rose-200">{error}</p>}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rh-lime px-4 py-3 text-base font-semibold text-rh-ink transition hover:bg-rh-lime-deep disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Save and say how it felt
        </button>
        <button type="button" onClick={onDiscard} className="w-full rounded-2xl px-4 py-2 text-sm text-white/70 hover:bg-white/10">
          Close without saving
        </button>
        <p className="text-center text-xs text-white/50">Your physio sees your reps, scores and tips. The video was never saved.</p>
      </div>
    </div>
  )
}
