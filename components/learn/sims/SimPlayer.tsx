'use client'

/**
 * Learn › Simulations › a case: the intro, the live case and (once it ends) the debrief.
 * The server holds the case: this screen shows the situation, the options on offer and what has
 * been found, plays the voices, runs the clock and the monitor, and sends each choice to Convex.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Clock,
  ClipboardList,
  Loader2,
  MapPin,
  Play,
  RotateCcw,
  Stethoscope,
  Volume2,
  VolumeX,
} from '@/components/icons'
import { cn } from '@/lib/utils'
import { displayFont, pillInk, pillLime, pillOutline } from '../shared'
import { JoinPrompt } from '../social/ui'
import {
  attemptPath,
  DISCLAIMER,
  errorText,
  formatClock,
  modeLabel,
  simApi,
  simPath,
  SIMULATIONS_PATH,
  simTrack,
  SPECIALTY_LABEL,
  voiceUrl,
  type SimAttempt,
  type SimCaseCard,
  type SimLineView,
} from './simApi'
import { clockTick, queueVoice, setVoiceOn, stopVoice, unlockSimAudio, voiceOn } from './simAudio'
import { VitalsMonitor } from './VitalsMonitor'
import { SimDebrief } from './SimDebrief'

/** Server clock minus this device's clock, from the last mutation reply. */
let serverOffsetMs = 0
const noteServerTime = (serverNow?: number) => {
  if (typeof serverNow === 'number') serverOffsetMs = serverNow - Date.now()
}

const initials = (name: string) =>
  name
    .replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

export function Difficulty({ level, className }: { level: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-label={`Difficulty ${level} of 3`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={cn('h-1.5 w-4 rounded-full', n <= level ? 'bg-current' : 'bg-current opacity-20')} />
      ))}
    </span>
  )
}

/** Scene art for a case: the rendered still when there is one, otherwise a calm placeholder. */
export function SceneArt({
  scene,
  patientName,
  setting,
  className,
  sizes = '(min-width: 768px) 720px, 100vw',
}: {
  scene: { src: string; alt: string } | null
  patientName: string
  setting: string
  className?: string
  sizes?: string
}) {
  if (scene) {
    return (
      <div className={cn('relative overflow-hidden', className)}>
        <Image src={scene.src} alt={scene.alt} fill sizes={sizes} className="object-cover" />
      </div>
    )
  }
  return (
    <div
      className={cn('relative flex items-center justify-center overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,rgb(30_52_48)_0%,rgb(9_17_16)_70%)]', className)}
      aria-hidden
    >
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgb(255_255_255)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="relative flex flex-col items-center text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[rgb(255_255_255/0.08)] text-2xl font-semibold text-[rgb(255_255_255/0.85)] ring-1 ring-[rgb(255_255_255/0.12)]">
          {initials(patientName)}
        </span>
        <span className="mt-3 text-xs font-medium text-[rgb(255_255_255/0.45)]">{setting}</span>
      </div>
    </div>
  )
}

// ── Intro ─────────────────────────────────────────────────────────────────────

function VoiceToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(true)
  useEffect(() => setOn(voiceOn()), [])
  return (
    <button
      type="button"
      onClick={() => {
        setVoiceOn(!on)
        setOn(!on)
      }}
      aria-pressed={on}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition', className)}
    >
      {on ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      {on ? 'Voices on' : 'Voices off'}
    </button>
  )
}

function CaseIntro({ slug, card, signedIn, member, forcePreview }: { slug: string; card: SimCaseCard; signedIn: boolean; member: boolean; forcePreview: boolean }) {
  // Reviewers play the newest draft (it may be ahead of the live version)
  const preview = forcePreview || !card.live
  const router = useRouter()
  const start = useMutation(simApi.start)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    simTrack('sim_open', { case: slug, mode: card.mode })
  }, [slug, card.mode])

  const begin = async () => {
    unlockSimAudio()
    stopVoice()
    setBusy(true)
    try {
      const res = await start({ slug, preview: preview || undefined })
      noteServerTime(res.serverNow)
      simTrack('sim_start', { case: slug, mode: card.mode, preview })
      router.replace(attemptPath(slug, res.attemptId))
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t start the case. Try again.'))
      setBusy(false)
    }
  }

  const resume = () => {
    unlockSimAudio()
    if (card.mine?.activeAttemptId) router.replace(attemptPath(slug, card.mine.activeAttemptId))
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <Link href={SIMULATIONS_PATH} className="inline-flex items-center gap-1.5 text-sm font-semibold text-rh-ink/60 transition hover:text-rh-ink">
        <ArrowLeft className="h-4 w-4" /> Simulations
      </Link>
      <div className="mt-5 overflow-hidden rounded-[28px] bg-rh-ink text-white">
        <SceneArt scene={card.cover} patientName={card.patient.name} setting={card.setting} className="aspect-[16/9] w-full" />
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full bg-rh-lime px-2.5 py-1 text-rh-ink">{modeLabel(card)}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1">{SPECIALTY_LABEL[card.specialty] ?? card.specialty}</span>
            <Difficulty level={card.difficulty} className="ml-1 text-white/80" />
            {preview && <span className="rounded-full bg-amber-300 px-2.5 py-1 text-[#3b2a00]">{card.live ? 'Play-testing the latest draft' : 'Draft · reviewers only'}</span>}
          </div>
          <h1 className={cn('mt-4 text-[28px] leading-tight tracking-tight sm:text-[36px]', displayFont)}>{card.title}</h1>
          <p className="mt-3 text-[15px] leading-6 text-white/70">{card.summary}</p>
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl bg-white/[0.06] p-3.5">
              <dt className="text-xs text-white/50">Patient</dt>
              <dd className="mt-0.5 font-semibold">
                {card.patient.name}, {card.patient.age}
              </dd>
              <dd className="mt-0.5 text-white/60">{card.patient.presentingComplaint}</dd>
            </div>
            <div className="rounded-2xl bg-white/[0.06] p-3.5">
              <dt className="text-xs text-white/50">Setting</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-semibold">
                <MapPin className="h-3.5 w-3.5 text-rh-lime" /> {card.setting}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Clock, text: card.mode === 'triage' ? 'The clock runs in real time, and every action takes time.' : 'Each question and test uses consultation time.' },
          { icon: Activity, text: 'The patient reacts to what you do. Some choices are unsafe.' },
          { icon: ClipboardList, text: 'At the end, see your score, what you missed and what an expert would do.' },
        ].map((item) => (
          <li key={item.text} className="flex gap-3 rounded-2xl border border-rh-ink/[0.08] p-4 text-sm leading-6 text-rh-ink/70">
            <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-rh-ink" />
            {item.text}
          </li>
        ))}
      </ul>

      <div className="mt-8">
        {!member ? (
          <JoinPrompt signedIn={signedIn} returnTo={simPath(slug)}>
            Join Rehabify Learn for free to play the simulations and see your debrief.
          </JoinPrompt>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {card.mine?.activeAttemptId && (
              <button type="button" onClick={resume} className={cn(pillOutline, 'h-12 px-6')}>
                <Play className="h-4 w-4" /> Resume
              </button>
            )}
            <button type="button" onClick={() => void begin()} disabled={busy} className={cn(pillInk, 'h-12 px-8 text-base')}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {card.mine?.activeAttemptId ? 'Start again' : card.mine?.tries ? 'Play again' : 'Start the case'}
            </button>
            <VoiceToggle className="self-start bg-rh-cream text-rh-ink sm:ml-auto sm:self-auto" />
          </div>
        )}
        {card.mine?.best !== null && card.mine?.best !== undefined && (
          <p className="mt-3 text-sm text-rh-ink/55">
            Your best: {card.mine.best}%{card.mine.passed ? ' · passed' : ''}
          </p>
        )}
      </div>
      <p className="mt-10 text-xs leading-5 text-rh-ink/45">{DISCLAIMER}</p>
    </main>
  )
}

// ── Live case ─────────────────────────────────────────────────────────────────

type TranscriptLine = SimLineView & { key: string }

export function Countdown({ getClock, limit, onExpire }: { getClock: () => number; limit: number; onExpire: () => void }) {
  const [left, setLeft] = useState(limit)
  const fired = useRef(false)
  const lastWhole = useRef<number | null>(null)
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, limit - getClock())
      setLeft(remaining)
      const whole = Math.ceil(remaining)
      if (remaining > 0 && remaining <= 10 && whole !== lastWhole.current) {
        lastWhole.current = whole
        clockTick(remaining <= 5)
      }
      if (remaining <= 0 && !fired.current) {
        fired.current = true
        onExpire()
      }
    }
    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [getClock, limit, onExpire])
  const fraction = left / limit
  const tone = left <= 10 ? '#f87171' : left <= 30 ? '#fbbf24' : '#00cd0f'
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <div className={cn('relative flex h-14 w-14 shrink-0 items-center justify-center', left <= 10 && 'animate-pulse')} role="timer" aria-label={`${Math.ceil(left)} seconds left`}>
      <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="4" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 0.2s linear, stroke 0.3s' }}
        />
      </svg>
      <span className="font-mono text-sm font-semibold tabular-nums text-white">{Math.ceil(left)}</span>
    </div>
  )
}

function PhaseBar({ phases, current }: { phases: SimAttempt['phases']; current: string | null }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` }}>
      {phases.map((p) => {
        const over = p.usedSec > p.budgetSec
        const active = p.id === current
        return (
          <div key={p.id} className={cn('rounded-2xl border px-3 py-2', active ? 'border-rh-ink bg-rh-cream' : 'border-rh-ink/[0.08]')}>
            <p className={cn('text-xs font-semibold', active ? 'text-rh-ink' : 'text-rh-ink/50')}>{p.label}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rh-ink/[0.08]">
              <div
                className={cn('h-full rounded-full transition-all duration-500', over ? 'bg-rose-500' : 'bg-rh-ink')}
                style={{ width: `${Math.min(100, (p.usedSec / p.budgetSec) * 100)}%` }}
              />
            </div>
            <p className={cn('mt-1 font-mono text-[11px] tabular-nums', over ? 'text-rose-600' : 'text-rh-ink/50')}>
              {formatClock(p.usedSec)} / {formatClock(p.budgetSec)}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function PainMeter({ pain }: { pain: number }) {
  return (
    <div className="rounded-[24px] border border-rh-ink/[0.08] p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-rh-ink">Pain</span>
        <span className="font-mono font-semibold tabular-nums text-rh-ink">{pain}/10</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-rh-ink/[0.08]">
        <motion.div
          className="h-full rounded-full"
          animate={{ width: `${pain * 10}%`, backgroundColor: pain >= 7 ? '#ef4444' : pain >= 4 ? '#f59e0b' : '#00cd0f' }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  )
}

function Player({ attempt, onDone }: { attempt: SimAttempt; onDone: () => void }) {
  const choose = useMutation(simApi.choose)
  const finishIfExpired = useMutation(simApi.finishIfExpired)
  const reduce = useReducedMotion()
  const [pending, setPending] = useState<{ id: string; ms: number } | null>(null)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [speaking, setSpeaking] = useState<string | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [findingsOpen, setFindingsOpen] = useState(true)
  const c = attempt.case

  // The clock, read fresh each time (a cached query result can't hold "now")
  const attemptRef = useRef(attempt)
  attemptRef.current = attempt
  const getClock = useCallback(() => {
    const a = attemptRef.current
    if (a.finishedClockSec !== null) return a.finishedClockSec
    if (a.case.mode !== 'triage') return a.virtualSec
    return Math.max(0, (Date.now() + serverOffsetMs - a.startedAt) / 1000) + a.virtualSec
  }, [])

  // New lines (a reply, then the new situation's lines) join the transcript and are voiced
  const seen = useRef<{ steps: number; nodeId: string | null }>({ steps: -1, nodeId: null })
  useEffect(() => {
    const lines: TranscriptLine[] = []
    const stepsChanged = attempt.stepCount !== seen.current.steps
    if (stepsChanged && attempt.stepCount > 0 && attempt.lastChoice?.reply) {
      lines.push({ ...attempt.lastChoice.reply, key: `r-${attempt.stepCount}` })
    }
    if (attempt.node && attempt.node.id !== seen.current.nodeId) {
      attempt.node.lines.forEach((l, i) => lines.push({ ...l, key: `n-${attempt.node!.id}-${attempt.stepCount}-${i}` }))
    }
    seen.current = { steps: attempt.stepCount, nodeId: attempt.node?.id ?? null }
    if (lines.length === 0) return
    setTranscript((t) => [...t, ...lines].slice(-6))
    if (c.audio) {
      setVoiceBusy(true)
      queueVoice(
        lines.map((l) => ({ url: voiceUrl(c.slug, c.version, l.audioId), onStart: () => setSpeaking(l.key) })),
        () => {
          setSpeaking(null)
          setVoiceBusy(false)
        }
      )
    }
  }, [attempt.stepCount, attempt.node, attempt.lastChoice, c.audio, c.slug, c.version])

  useEffect(() => () => stopVoice(), [])

  const over = attempt.status !== 'active'
  useEffect(() => {
    if (!over) return
    // After the last voice line (or straight away without one), a short pause to read, then the debrief
    const id = window.setTimeout(onDone, voiceBusy ? 15000 : 1800)
    return () => window.clearTimeout(id)
  }, [over, voiceBusy, onDone])

  const expire = useCallback(() => {
    void finishIfExpired({ attemptId: attemptRef.current.attemptId }).catch(() => undefined)
  }, [finishIfExpired])

  const pick = async (choiceId: string, costSec: number) => {
    if (pending) return
    stopVoice()
    setSpeaking(null)
    setVoiceBusy(false)
    const ms = reduce ? 200 : Math.min(1400, 350 + costSec * 40)
    setPending({ id: choiceId, ms })
    try {
      const [res] = await Promise.all([
        choose({ attemptId: attempt.attemptId, choiceId }),
        new Promise((resolve) => window.setTimeout(resolve, ms)),
      ])
      noteServerTime(res.serverNow)
      simTrack('sim_choice', { case: c.slug, choice: choiceId, step: attempt.stepCount + 1 })
      if (!res.applied) toast('Time ran out before that.')
    } catch (err) {
      toast.error(errorText(err, 'That didn’t go through. Try again.'))
    } finally {
      setPending(null)
    }
  }

  const node = attempt.node
  const recent = transcript.slice(-3)

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:px-6 sm:pt-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href={simPath(c.slug)} className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-rh-ink/60 transition hover:text-rh-ink">
          <ArrowLeft className="h-4 w-4 shrink-0" /> <span className="truncate">{c.title}</span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {attempt.preview && <span className="rounded-full bg-amber-200 px-2.5 py-1 text-[11px] font-semibold text-[#3b2a00]">Draft play-test</span>}
          <VoiceToggle className="bg-rh-cream text-rh-ink" />
        </div>
      </div>

      {/* Scene and what's being said */}
      <section className="overflow-hidden rounded-[28px] bg-rh-ink text-white">
        <div className="relative">
          <SceneArt scene={attempt.scene} patientName={c.patient.name} setting={c.setting} className="aspect-[16/10] w-full sm:aspect-[16/8]" />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
            <div className="rounded-2xl bg-[rgb(3_8_7/0.55)] px-3 py-2 backdrop-blur-sm">
              <p className="text-sm font-semibold">
                {c.patient.name}, {c.patient.age}
              </p>
              <p className="flex items-center gap-1 text-xs text-white/60">
                <MapPin className="h-3 w-3" /> {c.setting}
              </p>
            </div>
            {c.mode === 'triage' && c.timeLimitSec ? (
              <div className="rounded-full bg-[rgb(3_8_7/0.55)] p-1 backdrop-blur-sm">
                <Countdown getClock={getClock} limit={c.timeLimitSec} onExpire={expire} />
              </div>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-[rgb(3_8_7/0.55)] px-3 py-1.5 font-mono text-xs tabular-nums backdrop-blur-sm">
                <Clock className="h-3.5 w-3.5" /> {formatClock(attempt.virtualSec)}
              </span>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-[rgb(5_10_9/0.92)] via-[rgb(5_10_9/0.7)] to-transparent p-4 pt-16">
            <AnimatePresence initial={false}>
              {recent.map((line, i) => (
                <motion.div
                  key={line.key}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: i === recent.length - 1 ? 1 : 0.55, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="max-w-[92%] rounded-2xl bg-[rgb(255_255_255/0.1)] px-3.5 py-2.5 backdrop-blur-sm"
                >
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-rh-lime">
                    {line.name}
                    {speaking === line.key && (
                      <span className="space-eq space-live-eq text-rh-lime" aria-hidden>
                        <span />
                        <span />
                        <span />
                        <span />
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[15px] leading-6">{line.text}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </section>

      <div className="mt-4 space-y-4">
        {c.monitor ? <VitalsMonitor timeline={attempt.vitals} on={attempt.monitorOn} getClock={getClock} live={attempt.status === 'active'} /> : <PainMeter pain={attempt.pain} />}
        {c.mode === 'full' && <PhaseBar phases={attempt.phases} current={node?.phase ?? null} />}
      </div>

      {/* The decision */}
      {node && (
        <section className="mt-6" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={node.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="text-[17px] font-semibold leading-7 text-rh-ink"
            >
              {node.prompt}
            </motion.p>
          </AnimatePresence>
          <ul className="mt-4 space-y-2.5">
            <AnimatePresence initial={false}>
              {attempt.choices.map((choice, i) => {
                const isPending = pending?.id === choice.id
                return (
                  <motion.li
                    key={choice.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: pending && !isPending ? 0.45 : 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i, 6) * 0.03 }}
                  >
                    <button
                      type="button"
                      onClick={() => void pick(choice.id, choice.costSec)}
                      disabled={Boolean(pending)}
                      className={cn(
                        'relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3.5 text-left transition active:scale-[0.99]',
                        isPending ? 'border-rh-ink bg-rh-cream' : 'border-rh-ink/10 bg-white hover:border-rh-ink/30'
                      )}
                    >
                      {isPending && (
                        <motion.span
                          className="absolute inset-y-0 left-0 bg-rh-lime/25"
                          initial={{ width: '0%' }}
                          animate={{ width: '100%' }}
                          transition={{ duration: pending.ms / 1000, ease: 'linear' }}
                        />
                      )}
                      <span className="relative min-w-0 flex-1 text-[15px] leading-6 text-rh-ink">{choice.label}</span>
                      <span className="relative shrink-0 rounded-full bg-rh-ink/[0.06] px-2 py-1 font-mono text-[11px] font-semibold tabular-nums text-rh-ink/60">
                        {choice.costSec > 0 ? `+${choice.costSec}s` : 'next'}
                      </span>
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        </section>
      )}

      {/* What's been found */}
      {attempt.findings.length > 0 && (
        <section className="mt-6 rounded-[24px] border border-rh-ink/[0.08]">
          <button
            type="button"
            onClick={() => setFindingsOpen((o) => !o)}
            aria-expanded={findingsOpen}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-rh-ink">
              <Stethoscope className="h-4 w-4" /> What you’ve found ({attempt.findings.length})
            </span>
            <ChevronDown className={cn('h-4 w-4 text-rh-ink/50 transition-transform', findingsOpen && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {findingsOpen && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden px-5 pb-4"
              >
                {attempt.findings.map((f) => (
                  <motion.li
                    key={f.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex gap-3 border-t border-rh-ink/[0.06] py-3 first:border-t-0"
                  >
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', f.abnormal ? 'bg-rose-500' : 'bg-rh-ink/25')} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-rh-ink">{f.label}</span>
                      <span className="block text-sm leading-6 text-rh-ink/70">{f.detail}</span>
                    </span>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </section>
      )}

      {over && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky bottom-4 z-10 mt-8 rounded-[24px] bg-rh-ink p-5 text-white shadow-2xl"
        >
          {attempt.lastChoice?.reply && (
            <p className="text-[15px] leading-6 text-white/85">
              <span className="font-semibold text-rh-lime">{attempt.lastChoice.reply.name}: </span>
              {attempt.lastChoice.reply.text}
            </p>
          )}
          <div className={cn('flex items-center justify-between gap-3', attempt.lastChoice?.reply && 'mt-4')}>
            <p className="text-sm font-semibold">{attempt.ending?.title ?? 'The case is over'}</p>
            <button type="button" onClick={onDone} className={cn(pillLime, 'h-10 shrink-0 px-4')}>
              See your debrief <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
      <p className="mt-10 text-xs leading-5 text-rh-ink/45">{DISCLAIMER}</p>
    </main>
  )
}

// ── Routing between intro, live case and debrief ──────────────────────────────

function AttemptScreen({ slug, attemptId }: { slug: string; attemptId: string }) {
  const attempt = useQuery(simApi.attempt, { attemptId })
  const router = useRouter()
  // A case that ends while you play stays on screen until its last line is heard (Player calls
  // onDone); one that was already over when the page opened goes straight to the debrief
  const sawActive = useRef(false)
  const [showDebrief, setShowDebrief] = useState(false)
  const showDebriefNow = useCallback(() => setShowDebrief(true), [])
  const status = attempt?.status
  useEffect(() => {
    if (status === 'active') sawActive.current = true
    if (status === 'finished' && !sawActive.current) setShowDebrief(true)
  }, [status])
  if (attempt === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-3xl items-center justify-center px-4 py-32">
        <Loader2 className="h-6 w-6 animate-spin text-rh-ink/40" />
      </main>
    )
  }
  if (attempt === null || attempt.status === 'abandoned') {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-20 text-center sm:px-6">
        <p className={cn('text-[26px] tracking-tight text-rh-ink', displayFont)}>
          {attempt?.status === 'abandoned' ? 'You started this case again' : 'This attempt isn’t available'}
        </p>
        <p className="mt-2 text-sm text-rh-ink/60">Start the case to play it from the beginning.</p>
        <button type="button" onClick={() => router.replace(simPath(slug))} className={cn(pillInk, 'mt-6 h-11 px-6')}>
          <RotateCcw className="h-4 w-4" /> Back to the case
        </button>
      </main>
    )
  }
  if (attempt.status === 'finished' && showDebrief) return <SimDebrief attemptId={attempt.attemptId} slug={slug} />
  return <Player attempt={attempt} onDone={showDebriefNow} />
}

export function SimCasePage({ slug }: { slug: string }) {
  const params = useSearchParams()
  const attemptId = params.get('attempt')
  const forcePreview = params.get('preview') === '1'
  const list = useQuery(simApi.list, attemptId ? 'skip' : {})
  const card = useMemo(() => list?.cases.find((c) => c.slug === slug), [list, slug])

  if (attemptId) return <AttemptScreen key={attemptId} slug={slug} attemptId={attemptId} />
  if (list === undefined) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:px-6">
        <div className="aspect-[16/9] w-full animate-pulse rounded-[28px] bg-rh-ink/[0.06]" />
      </main>
    )
  }
  if (!card) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-20 text-center sm:px-6">
        <p className={cn('text-[26px] tracking-tight text-rh-ink', displayFont)}>This case isn’t available</p>
        <p className="mt-2 text-sm text-rh-ink/60">It may still be in clinical review.</p>
        <Link href={SIMULATIONS_PATH} className={cn(pillLime, 'mt-6 h-11 px-6')}>
          All simulations <ArrowRight className="h-4 w-4" />
        </Link>
      </main>
    )
  }
  return <CaseIntro slug={slug} card={card} signedIn={list.signedIn} member={list.member} forcePreview={forcePreview && list.reviewer} />
}

