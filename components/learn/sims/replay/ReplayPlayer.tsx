'use client'

/**
 * The public replay of a shared run (no sign-in): the same phone screen as the case, playing back
 * what the learner saw and did, with the voices and moving lips, then their score and "try this
 * case free". `?video=1` opens the video maker (from the debrief's "Make a video").
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowRight, Download, Loader2, Pause, Play, RotateCcw, Share2, Video, Volume2, VolumeX, X } from '@/components/icons'
import type { Outcome, SimCategory, SimScene } from '@/lib/learn/simulation/engine'
import { cn } from '@/lib/utils'
import { displayFont, pillInk, pillLime } from '../../shared'
import { formatClock, simApi, simPath, SIMULATIONS_PATH, simTrack, voiceUrl, type SimShare, type SimShareBeat } from '../simApi'
import { queueVoice, setVoiceOn, stopVoice, unlockSimAudio, voiceOn } from '../simAudio'
import { PatientStage } from '../v2/PatientStage'
import { FindingsPanel, PlayerFrame, SplitPanes, STAGE_CLASS, Thread, type Item } from '../v2/parts'
import { canRecordVideo, estimateSeconds, recordReplay, type RecordResult } from './recordReplay'
import { ShareRow } from './ShareReplay'

const CATEGORIES: SimCategory[] = ['ask', 'examine', 'do', 'help', 'next']
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

function toItem(b: SimShareBeat, key: string): Item {
  switch (b.kind) {
    case 'scene':
      return { kind: 'scene', key, text: b.text }
    case 'speech':
      return { kind: 'speech', key, speaker: b.speaker, name: b.name, role: b.role, text: b.text, audioId: b.audioId }
    case 'action':
      return { kind: 'action', key, label: b.label, costSec: 0, category: CATEGORIES.includes(b.category as SimCategory) ? (b.category as SimCategory) : 'do' }
    case 'finding':
      return { kind: 'finding', key, label: b.label, detail: b.detail, abnormal: b.abnormal }
    default:
      return { kind: 'ending', key, title: b.title, summary: b.summary, outcome: b.outcome as Outcome }
  }
}

/** How long a beat stays before the next (when there's no voice to wait for). */
function readMs(b: SimShareBeat) {
  if (b.kind === 'scene') return Math.min(5500, 1400 + words(b.text) * 230)
  if (b.kind === 'speech') return Math.min(6000, 1300 + words(b.text) * 280)
  if (b.kind === 'action') return 1300
  if (b.kind === 'finding') return Math.min(4000, 1800 + words(b.detail) * 150)
  return 2600
}

export function ReplayPage({ code }: { code: string }) {
  const data = useQuery(simApi.share, { code })
  if (data === undefined) {
    return (
      <Frame>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-rh-ink/40" />
        </div>
      </Frame>
    )
  }
  if (data === null) {
    return (
      <Frame>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-rh-ink/60">This replay isn’t available any more.</p>
          <Link href={SIMULATIONS_PATH} className={cn(pillInk, 'h-11 px-5')}>
            See the simulations
          </Link>
        </div>
      </Frame>
    )
  }
  return <Replay share={data} />
}

const Frame = PlayerFrame

function Replay({ share }: { share: SimShare }) {
  const c = share.case
  const beats = share.beats
  const params = useSearchParams()
  const [phase, setPhase] = useState<'ready' | 'playing' | 'paused' | 'done'>('ready')
  const [at, setAt] = useState(0)
  const [speaking, setSpeaking] = useState<string | null>(null)
  const [voice, setVoice] = useState(true)
  const [videoOpen, setVideoOpen] = useState(false)
  const thread = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setVoice(voiceOn())
    simTrack('sim_replay', { case: c.slug })
    return () => {
      document.body.style.overflow = previous
      stopVoice()
    }
  }, [c.slug])

  useEffect(() => {
    if (params.get('video') === '1') setVideoOpen(true)
  }, [params])

  // Step through the run: each beat waits for its voice (or a moment to read), then the next
  useEffect(() => {
    if (phase !== 'playing') return
    if (at === 0) {
      setAt(1)
      return
    }
    const beat = beats[at - 1]
    let live = true
    let timer: number | undefined
    const advance = (ms: number) => {
      timer = window.setTimeout(() => {
        if (!live) return
        if (at >= beats.length) setPhase('done')
        else setAt(at + 1)
      }, ms)
    }
    if (beat.kind === 'speech' && c.audio && voice) {
      const started = performance.now()
      queueVoice([{ url: voiceUrl(c.slug, c.version, beat.audioId), onStart: () => live && setSpeaking(`b${at - 1}`) }], () => {
        if (!live) return
        setSpeaking(null)
        // No sound came out (sound off on this device): give time to read instead
        advance(performance.now() - started < 300 ? readMs(beat) : 450)
      })
    } else advance(readMs(beat))
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [phase, at, beats, c.audio, c.slug, c.version, voice])

  const items = useMemo(() => beats.slice(0, at).map((b, i) => toItem(b, `b${i}`)), [beats, at])
  // The scene as of the latest beat shown (before playing: the opening scene)
  const sceneId = useMemo(() => {
    let first: string | null = null
    let current: string | null = null
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i]
      const s = b.kind === 'scene' || b.kind === 'action' ? b.scene : null
      if (!s) continue
      if (first === null) first = s
      if (i < at) current = s
    }
    return current ?? first
  }, [beats, at])
  const scene = sceneId ? ((share.scenes as Record<string, SimScene>)[sceneId] ?? null) : null
  const talker = speaking ? beats[Number(speaking.slice(1))] : undefined
  const talking = talker?.kind === 'speech' && talker.speaker === 'patient'
  const lastClock = useMemo(() => {
    let s = 0
    for (let i = 0; i < at; i++) {
      const b = beats[i]
      if (b.kind === 'action') s = b.clockSec
    }
    return s
  }, [beats, at])

  const play = () => {
    unlockSimAudio()
    if (phase === 'done') {
      stopVoice()
      setAt(0)
    }
    setPhase('playing')
  }
  const pause = () => {
    stopVoice()
    setSpeaking(null)
    setPhase('paused')
  }
  const skip = () => {
    stopVoice()
    setSpeaking(null)
    setAt(beats.length)
    setPhase('done')
  }
  const replayLine = useCallback(
    (item: Extract<Item, { kind: 'speech' }>) => {
      if (!c.audio || phase === 'playing') return
      unlockSimAudio()
      stopVoice()
      queueVoice([{ url: voiceUrl(c.slug, c.version, item.audioId), onStart: () => setSpeaking(item.key) }], () => setSpeaking(null))
    },
    [c.audio, c.slug, c.version, phase]
  )

  const findings = useMemo(
    () => beats.slice(0, at).flatMap((b) => (b.kind === 'finding' ? [{ label: b.label, detail: b.detail, abnormal: b.abnormal }] : [])),
    [beats, at]
  )
  const tryHref = c.live ? simPath(c.slug) : SIMULATIONS_PATH
  const shareText = `${share.firstName} scored ${share.result.pct}% on “${c.title}”, a clinical simulation on Rehabify Learn. Watch the run, then try it yourself:`
  const pageUrl = typeof window !== 'undefined' ? window.location.href.split('?')[0] : ''

  return (
    <Frame wide>
      <div className="learn-fixed-dark flex h-14 shrink-0 items-center gap-1 bg-[rgb(8_16_15)] px-1.5 text-white">
        <Link href={SIMULATIONS_PATH} aria-label="All simulations" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
          <X className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold leading-tight">{share.firstName}’s run · {c.title}</p>
          <p className="truncate text-[11px] leading-tight text-white/55">
            {c.patient.name}, {c.patient.age} · {c.setting}
          </p>
        </div>
        {at > 0 && <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 font-mono text-[11px] text-white/80">{formatClock(lastClock)}</span>}
        {c.audio && (
          <button
            type="button"
            onClick={() => {
              setVoiceOn(!voice)
              setVoice(!voice)
              if (voice) stopVoice()
            }}
            aria-label={voice ? 'Turn voices off' : 'Turn voices on'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
          >
            {voice ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
          </button>
        )}
      </div>
      <SplitPanes
        left={
          <>
            <div className={STAGE_CLASS}>
              <PatientStage
                pain={3}
                breathsPerMin={16}
                speaking={Boolean(speaking)}
                talking={talking}
                lipsUrl={c.audio ? `/sims/${c.slug}/v${c.version}/lips.json` : null}
                scene={scene}
              />
            </div>
            <FindingsPanel findings={findings} />
          </>
        }
        right={
      phase === 'ready' ? (
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-4 overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rh-ink/50">Clinical simulation · replay</p>
            <h1 className={cn('mt-2 text-[30px] leading-[1.1] tracking-tight text-rh-ink', displayFont)}>{c.title}</h1>
            <p className="mt-3 text-[15px] leading-6 text-rh-ink/65">
              {share.firstName} took on this case and scored <span className="font-semibold text-rh-ink">{share.result.pct}%</span>. Watch what they asked, checked and did, with
              the patient’s voice.
            </p>
          </div>
          <button type="button" onClick={play} className={cn(pillLime, 'h-12 w-full text-[15px]')}>
            <Play className="h-4 w-4" /> Watch the replay
          </button>
          <Link href={tryHref} className="flex h-11 items-center justify-center gap-1.5 text-sm font-semibold text-rh-ink/70 hover:text-rh-ink">
            {c.live ? 'Skip it and try the case yourself' : 'See the simulations'} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <>
          <Thread items={items} speaking={speaking} pending={false} audio={Boolean(c.audio)} onReplay={replayLine} threadRef={thread} />
          <AnimatePresence initial={false} mode="wait">
            {phase === 'done' ? (
              <motion.div
                key="done"
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="learn-fixed-dark shrink-0 rounded-t-[26px] bg-rh-ink px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-5 text-white"
              >
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">{share.firstName} scored</p>
                    <p className={cn('mt-1 text-[48px] leading-none tracking-tight', displayFont, share.result.passed ? 'text-rh-lime' : 'text-white')}>{share.result.pct}%</p>
                  </div>
                  <p className="pb-1 text-right text-sm font-semibold text-white/70">{share.result.title}</p>
                </div>
                <Link href={tryHref} className={cn(pillLime, 'mt-4 h-12 w-full text-[15px]')}>
                  {c.live ? 'Can you do better? Try it free' : 'See the simulations'} <ArrowRight className="h-4 w-4" />
                </Link>
                <div className="mt-3">
                  <ShareRow url={pageUrl} text={shareText} slug={c.slug} dark />
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={play} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold text-white/75 hover:bg-white/10">
                    <RotateCcw className="h-4 w-4" /> Watch again
                  </button>
                  <button type="button" onClick={() => setVideoOpen(true)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold text-white/75 hover:bg-white/10">
                    <Video className="h-4 w-4" /> Make a video
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="controls" className="flex shrink-0 items-center gap-2 border-t border-rh-ink/10 bg-white px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5">
                <button
                  type="button"
                  onClick={phase === 'playing' ? pause : play}
                  aria-label={phase === 'playing' ? 'Pause' : 'Play'}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rh-ink text-white"
                >
                  {phase === 'playing' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-rh-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={beats.length} aria-valuenow={at}>
                  <div className="h-full rounded-full bg-rh-lime transition-[width] duration-500" style={{ width: `${(at / beats.length) * 100}%` }} />
                </div>
                <button type="button" onClick={skip} className="h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-rh-ink/65 hover:bg-rh-ink/[0.05]">
                  See the score
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )
        }
      />

      <VideoSheet
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        share={share}
        beforeRecord={() => {
          if (phase === 'playing') pause()
        }}
      />
    </Frame>
  )
}

// ── Video maker ───────────────────────────────────────────────────────────────

function VideoSheet({ open, onClose, share, beforeRecord }: { open: boolean; onClose: () => void; share: SimShare; beforeRecord: () => void }) {
  const [state, setState] = useState<'idle' | 'loading' | 'recording' | 'done'>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<(RecordResult & { url: string }) | null>(null)
  const [supported, setSupported] = useState(true)
  const abort = useRef<AbortController | null>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const seconds = useMemo(() => estimateSeconds(share), [share])

  useEffect(() => {
    setSupported(canRecordVideo())
    // Leaving the page stops a recording in progress
    return () => abort.current?.abort()
  }, [])
  useEffect(() => {
    if (!result) return
    return () => URL.revokeObjectURL(result.url)
  }, [result])

  const start = async () => {
    beforeRecord()
    stopVoice()
    const ctrl = new AbortController()
    abort.current = ctrl
    setResult(null)
    setProgress({ done: 0, total: seconds })
    try {
      const res = await recordReplay(share, {
        signal: ctrl.signal,
        preview: preview.current,
        onStage: (s) => setState(s),
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResult({ ...res, url: URL.createObjectURL(res.blob) })
      setState('done')
      simTrack('sim_video', { case: share.case.slug, seconds: res.seconds, format: res.ext })
    } catch (err) {
      setState('idle')
      if ((err as { name?: string })?.name !== 'AbortError') toast.error((err as Error)?.message || 'Couldn’t make the video. Try again.')
    }
  }

  const cancel = () => {
    abort.current?.abort()
    setState('idle')
  }
  const close = () => {
    if (state === 'loading' || state === 'recording') cancel()
    onClose()
  }

  const fileName = `rehabify-${share.case.slug}-${share.code}.${result?.ext ?? 'mp4'}`
  const file = result ? new File([result.blob], fileName, { type: result.mime }) : null
  const canShareFile = Boolean(file && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] }))
  const shareFile = async () => {
    if (!file) return
    try {
      await navigator.share({ files: [file], title: share.case.title, text: 'Try this case free on Rehabify Learn' })
      simTrack('sim_share', { case: share.case.slug, via: 'video' })
    } catch {
      // closed the share sheet
    }
  }

  const busy = state === 'loading' || state === 'recording'
  const pct = progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="absolute inset-0 z-30 flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-[rgb(3_8_7/0.55)]" />
          <motion.div
            role="dialog"
            aria-label="Make a video"
            className="relative max-h-[92%] overflow-y-auto rounded-t-[26px] bg-rh-cream px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-5 lg:mx-auto lg:mb-6 lg:w-full lg:max-w-[560px] lg:rounded-[26px]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[18px] font-semibold text-rh-ink">Make a video</p>
                <p className="mt-1 text-sm leading-6 text-rh-ink/60">
                  A vertical video of this run with the voices, for TikTok, Instagram Reels and WhatsApp Status. About {formatClock(seconds)}.
                </p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rh-ink/[0.06] text-rh-ink">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!supported ? (
              <p className="mt-4 rounded-2xl bg-white p-4 text-sm leading-6 text-rh-ink/70">This browser can’t make videos. Open this page in Chrome or Safari and try again.</p>
            ) : (
              <div className="mt-4 flex gap-4">
                <div className="relative aspect-[9/16] w-[34%] shrink-0 overflow-hidden rounded-2xl bg-rh-ink">
                  <canvas ref={preview} width={216} height={384} className={cn('h-full w-full', state === 'recording' ? 'opacity-100' : 'opacity-0')} aria-hidden />
                  {result && state === 'done' && <video src={result.url} controls playsInline className="absolute inset-0 h-full w-full object-cover" />}
                  {state === 'idle' && !result && (
                    <span className="absolute inset-0 flex items-center justify-center text-white/40">
                      <Video className="h-8 w-8" />
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
                  {state === 'idle' && (
                    <>
                      <p className="text-sm leading-6 text-rh-ink/65">It records in real time, so keep this screen open until it’s done.</p>
                      <button type="button" onClick={() => void start()} className={cn(pillInk, 'h-11 w-full px-4 text-sm')}>
                        <Video className="h-4 w-4" /> Make my video
                      </button>
                    </>
                  )}
                  {busy && (
                    <>
                      <p className="text-sm font-semibold text-rh-ink">{state === 'loading' ? 'Getting the patient ready…' : `Recording · ${formatClock(progress.done)} of ${formatClock(progress.total)}`}</p>
                      <div className="h-2 overflow-hidden rounded-full bg-rh-ink/10">
                        <div className="h-full rounded-full bg-rh-lime transition-[width] duration-300" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs leading-5 text-rh-ink/50">Keep this screen open.</p>
                      <button type="button" onClick={cancel} className="h-10 rounded-full text-sm font-semibold text-rh-ink/60 hover:bg-rh-ink/[0.05]">
                        Stop
                      </button>
                    </>
                  )}
                  {state === 'done' && result && (
                    <>
                      <p className="text-sm font-semibold text-rh-ink">Your video is ready.</p>
                      {canShareFile && (
                        <button type="button" onClick={() => void shareFile()} className={cn(pillLime, 'h-11 w-full px-4 text-sm')}>
                          <Share2 className="h-4 w-4" /> Share video
                        </button>
                      )}
                      <a href={result.url} download={fileName} className={cn(canShareFile ? 'flex h-11 items-center justify-center gap-2 rounded-full border border-rh-ink/15 text-sm font-semibold text-rh-ink' : cn(pillInk, 'h-11 w-full px-4 text-sm'))}>
                        <Download className="h-4 w-4" /> Save video
                      </a>
                      {result.ext === 'webm' && <p className="text-xs leading-5 text-rh-ink/50">Saved as WebM. If an app won’t take it, make the video in Chrome or Safari on your phone.</p>}
                      <button type="button" onClick={() => void start()} className="h-10 rounded-full text-sm font-semibold text-rh-ink/60 hover:bg-rh-ink/[0.05]">
                        Make it again
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
