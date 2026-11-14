'use client'

/**
 * Learn › Simulations › a case: the intro, the live case and (once it ends) the debrief.
 * The server holds the case: this screen shows the situation, the options on offer and what has
 * been found, plays the voices, runs the clock and the monitor, and sends each choice to Convex.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Clock,
  ClipboardList,
  Loader2,
  MapPin,
  Play,
  RotateCcw,
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
  modeLabel,
  noteServerTime,
  simApi,
  simPath,
  SIMULATIONS_PATH,
  simTrack,
  SPECIALTY_LABEL,
  type SimCaseCard,
} from './simApi'
import { setVoiceOn, stopVoice, unlockSimAudio, voiceOn } from './simAudio'
import { SimDebrief } from './SimDebrief'
import { ScoredPlayer } from './v2/ScoredPlayer'
import { SceneCredit } from './v2/PatientStage'

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
  scene: { src: string; alt: string; credit?: string } | null
  patientName: string
  setting: string
  className?: string
  sizes?: string
}) {
  if (scene) {
    return (
      <div className={cn('relative overflow-hidden', className)}>
        <Image src={scene.src} alt={scene.alt} fill sizes={sizes} className="object-cover" />
        {scene.credit && <SceneCredit text={scene.credit} />}
      </div>
    )
  }
  return (
    <div
      className={cn('learn-fixed-dark relative flex items-center justify-center overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,rgb(30_52_48)_0%,rgb(9_17_16)_70%)]', className)}
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
  return <ScoredPlayer attempt={attempt} onDone={showDebriefNow} />
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

