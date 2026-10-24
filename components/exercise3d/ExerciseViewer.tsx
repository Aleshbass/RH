'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import type { AnimationClip } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Eye, Loader2, Pause, Play, RotateCcw, Rotate3d, Turtle, Volume2, VolumeX, WifiOff } from '@/components/icons'
import { programError } from '@/components/exercise-programs/errors'
import { EXERCISE_CATALOG, findClip, posterUrl } from '@/convex/exerciseLibraryCatalog'
import type { ViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import { VoiceGuide } from '@/lib/exercise3d/voice'
import { cn } from '@/lib/utils'
import type { ViewName } from './ExerciseStage'

const ExerciseStage = dynamic(() => import('./ExerciseStage'), { ssr: false })

type Phase = 'checking' | 'lite' | 'loading' | 'ready' | 'denied' | 'error'

const clips = new Map<string, Promise<AnimationClip>>()

function liteReason(): string | null {
  if (typeof window === 'undefined') return null
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number }
  if (nav.connection?.saveData) return 'Data Saver is on'
  if (nav.connection?.effectiveType && /(^|-)2g$/.test(nav.connection.effectiveType)) return 'Your connection is slow'
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return 'Saving your phone’s memory'
  try {
    const c = document.createElement('canvas')
    if (!(c.getContext('webgl2') || c.getContext('webgl'))) return '3D isn’t supported on this device'
  } catch {
    return '3D isn’t supported on this device'
  }
  return null
}

const totalKb = Math.round((EXERCISE_CATALOG.character.bytes + 12_000) / 1024)

// Remembers whether the patient turned the voice guide off (on by default once they tap it).
const VOICE_PREF = 'rh-exercise-voice'
function voicePreferenceOff() {
  try {
    return localStorage.getItem(VOICE_PREF) === 'off'
  } catch {
    return false
  }
}
function saveVoicePreference(on: boolean) {
  try {
    localStorage.setItem(VOICE_PREF, on ? 'on' : 'off')
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

export type ExerciseViewerProps = {
  clipId: string
  requestGrant: (clipIds: string[]) => Promise<ViewerGrant>
  className?: string
  /** Start loading straight away (otherwise waits for a tap in low-data mode only). */
  autoPlay?: boolean
  onRep?: (count: number) => void
  /** Told whether the 3D demonstration is playing (false for the poster, low-data mode, review or errors). */
  onReadyChange?: (ready: boolean) => void
  /** Hide the small control bar (e.g. thumbnails). */
  bare?: boolean
  /** Colour of the active controls: teal in the care dashboards, ink on Rehabify Learn. */
  accent?: 'teal' | 'ink'
}

const ACCENTS = {
  teal: {
    stage: 'bg-rh-honeydew dark:bg-rh-ink-2',
    on: 'bg-rh-lime text-rh-ink hover:bg-rh-lime-deep dark:bg-rh-lime dark:text-rh-ink',
    text: 'text-rh-ink dark:text-rh-lime',
    ring: 'ring-rh-lime/40',
  },
  ink: {
    stage: 'bg-rh-sand dark:bg-rh-ink-2',
    on: 'bg-rh-ink text-white hover:bg-black dark:bg-rh-lime dark:text-rh-ink',
    text: 'text-rh-ink dark:text-rh-lime',
    ring: 'ring-rh-ink/40',
  },
}

/** One exercise in 3D, with a poster first and graceful fallbacks. */
export function ExerciseViewer({ clipId, requestGrant, className, autoPlay = true, onRep, onReadyChange, bare, accent = 'teal' }: ExerciseViewerProps) {
  const tone = ACCENTS[accent]
  const clipInfo = findClip(clipId)
  const [phase, setPhase] = useState<Phase>('checking')

  useEffect(() => {
    onReadyChange?.(phase === 'ready')
  }, [phase, onReadyChange])
  const [lite, setLite] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [assets, setAssets] = useState<{ gltf: GLTF; clip: AnimationClip; watermark: string } | null>(null)
  const [playing, setPlaying] = useState(true)
  const [slow, setSlow] = useState(false)
  const [view, setView] = useState<ViewName>('front')
  const [viewNonce, setViewNonce] = useState(0)
  const [reps, setReps] = useState(0)
  const repsRef = useRef(0)
  const loadId = useRef(0)

  // Voice guide: created per clip, started by a tap, synced to the animation clock.
  const guideRef = useRef<VoiceGuide | null>(null)
  const clipSeconds = useRef(0)
  const [voice, setVoice] = useState<'idle' | 'on' | 'off'>('idle')
  const audio = clipInfo?.audio ?? null

  useEffect(() => {
    guideRef.current = audio ? new VoiceGuide(audio) : null
    setVoice('idle')
    return () => {
      guideRef.current?.dispose()
      guideRef.current = null
    }
  }, [audio])

  const toggleVoice = useCallback(async () => {
    const guide = guideRef.current
    if (!guide) return
    if (voice === 'on') {
      guide.setMuted(true)
      setVoice('off')
      saveVoicePreference(false)
      return
    }
    setVoice('on')
    saveVoicePreference(true)
    if (guide.started) guide.setMuted(false)
    else await guide.start({ intro: true })
  }, [voice])

  const handleFrame = useCallback((progress: number) => {
    guideRef.current?.tick(progress * clipSeconds.current)
  }, [])

  const load = useCallback(async () => {
    const id = ++loadId.current
    setPhase('loading')
    setError(null)
    try {
      const grant = await requestGrant([clipId])
      if (grant.denied.includes(clipId) || !grant.clips[clipId] || !grant.character) {
        if (id === loadId.current) setPhase('denied')
        return
      }
      const base = EXERCISE_CATALOG.basePath
      // three.js only downloads once a demonstration is actually played.
      const [{ loadEncrypted, parseMotion, pruneOldVersions }, { parseCharacter }] = await Promise.all([
        import('@/lib/exercise3d/assets'),
        import('./ExerciseStage'),
      ])
      void pruneOldVersions(grant.version)
      const characterKey = grant.character
      const gltf = await parseCharacter(grant.version, () => loadEncrypted(`${base}/${EXERCISE_CATALOG.character.file}`, characterKey))
      let clipPromise = clips.get(clipId)
      if (!clipPromise) {
        clipPromise = loadEncrypted(`${base}/m/${clipId}.rhx`, grant.clips[clipId]).then((buf) => parseMotion(buf, clipId))
        clipPromise.catch(() => clips.delete(clipId))
        clips.set(clipId, clipPromise)
      }
      const clip = await clipPromise
      if (id !== loadId.current) return
      clipSeconds.current = clip.duration
      setAssets({ gltf, clip, watermark: grant.watermark })
      setPhase('ready')
    } catch (err) {
      if (id !== loadId.current) return
      setError(programError(err, 'Couldn’t load the demonstration. Check your connection and try again.'))
      setPhase('error')
    }
  }, [clipId, requestGrant])

  useEffect(() => {
    repsRef.current = 0
    setReps(0)
    setAssets(null)
    setView('front')
    const reason = liteReason()
    setLite(reason)
    if (reason || !autoPlay) setPhase('lite')
    else void load()
  }, [clipId, autoPlay, load])

  const handleRep = useCallback(() => {
    repsRef.current += 1
    setReps(repsRef.current)
    onRep?.(repsRef.current)
  }, [onRep])

  const chip =
    'inline-flex h-9 items-center gap-1.5 rounded-full bg-white/90 px-3 text-xs font-medium text-rh-ink shadow-sm backdrop-blur transition hover:bg-white active:scale-95 dark:bg-rh-ink-2/90 dark:text-white'

  return (
    <div
      className={cn(
        'relative isolate aspect-square w-full select-none overflow-hidden rounded-3xl',
        tone.stage,
        className
      )}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Poster until the 3D scene is ready. Not secret: it's a still. */}
      <Image
        src={posterUrl(clipId)}
        alt={clipInfo ? `${clipInfo.name}: starting position` : 'Exercise'}
        fill
        sizes="(max-width: 1024px) 100vw, 640px"
        draggable={false}
        className={cn('object-contain p-4 transition-opacity duration-500', phase === 'ready' ? 'opacity-0' : 'opacity-100')}
      />

      {phase === 'ready' && assets && (
        <ExerciseStage
          className="absolute inset-0 animate-in fade-in duration-500"
          gltf={assets.gltf}
          clip={assets.clip}
          props={clipInfo?.props ?? []}
          playing={playing}
          speed={slow ? 0.5 : 1}
          view={view}
          viewNonce={viewNonce}
          watermark={assets.watermark}
          onRep={handleRep}
          onFrame={audio ? handleFrame : undefined}
          onContextLost={() => {
            setLite('3D was paused to save memory')
            setPhase('lite')
          }}
        />
      )}

      {phase === 'loading' && (
        <div className="absolute inset-x-0 bottom-4 flex justify-center">
          <span className={chip}>
            <Loader2 className={cn('h-3.5 w-3.5 animate-spin', tone.text)} /> Loading 3D demonstration…
          </span>
        </div>
      )}

      {phase === 'lite' && (
        <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-1.5 px-4 text-center">
          <button type="button" onClick={() => void load()} className={cn(chip, 'h-10 px-4', tone.on)}>
            <Rotate3d className="h-4 w-4" /> Watch in 3D ({totalKb} KB)
          </button>
          {lite && (
            <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
              <WifiOff className="h-3 w-3" /> {lite}. Showing the picture and steps.
            </span>
          )}
        </div>
      )}

      {phase === 'denied' && (
        <div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
          <span className={cn(chip, 'h-auto py-2 text-center')}>The 3D demonstration is waiting for clinical review. Follow the picture and steps.</span>
        </div>
      )}

      {phase === 'error' && (
        <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 px-4 text-center">
          <span className="text-xs text-rose-600">{error}</span>
          <button type="button" onClick={() => void load()} className={chip}>
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      )}

      {phase === 'ready' && !bare && (
        <>
          <div className={cn('pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium backdrop-blur dark:bg-rh-ink-2/80', tone.text)}>
            <Rotate3d className="h-3.5 w-3.5" /> Drag to turn
          </div>
          <div className={cn('pointer-events-none absolute right-3 top-3 rounded-2xl px-3 py-1.5 text-center shadow-sm', tone.on)}>
            <p className="text-lg font-semibold leading-none tabular-nums">{reps}</p>
            <p className="text-[10px] uppercase tracking-wider opacity-80">reps</p>
          </div>
          <div className="absolute inset-x-0 bottom-3 flex flex-wrap items-center justify-center gap-1.5 px-3">
            {audio && (
              <button
                type="button"
                onClick={() => void toggleVoice()}
                aria-pressed={voice === 'on'}
                title={voice === 'idle' ? 'Hear spoken instructions' : voice === 'on' ? 'Mute the voice guide' : 'Turn the voice guide back on'}
                className={cn(
                  chip,
                  voice === 'on' && tone.on,
                  voice === 'idle' && !voicePreferenceOff() && cn('animate-pulse', tone.on)
                )}
              >
                {voice === 'on' ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                {voice === 'idle' ? 'Voice guide' : voice === 'on' ? 'Voice on' : 'Voice off'}
              </button>
            )}
            <button type="button" className={chip} onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" className={cn(chip, slow && tone.on)} onClick={() => setSlow((s) => !s)} aria-pressed={slow}>
              <Turtle className="h-3.5 w-3.5" /> {slow ? '0.5×' : '1×'}
            </button>
            {(['front', 'side', 'top'] as ViewName[]).map((v) => (
              <button
                key={v}
                type="button"
                className={cn(chip, view === v && cn('ring-2', tone.ring))}
                onClick={() => {
                  setView(v)
                  setViewNonce((n) => n + 1)
                }}
              >
                {v === 'front' && <Eye className="h-3.5 w-3.5" />}
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
