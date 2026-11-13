'use client'

/** The end of a case: how it went, what mattered, what an expert would do, and what to read. */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowRight,
  BellRing,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lightbulb,
  Loader2,
  RotateCcw,
  WhatsApp,
  XCircle,
} from '@/components/icons'
import { playSound, playSoundFile } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { celebrate } from '../course/shared'
import { displayFont, pillInk, pillLime, pillOutline } from '../shared'
import { DISCLAIMER, errorText, formatClock, simApi, simPath, SIMULATIONS_PATH, simTrack, type SimDebriefView } from './simApi'

type Debrief = SimDebriefView['debrief']
type Tag = Debrief['timeline'][number]['tag']

const OUTCOME_STYLE: Record<Debrief['ending']['outcome'], { band: string; label: string }> = {
  good: { band: 'bg-rh-lime text-[#0b1312]', label: 'Good outcome' },
  fair: { band: 'bg-amber-300 text-[#2b1d00]', label: 'Fair outcome' },
  poor: { band: 'bg-orange-400 text-[#2b1200]', label: 'Poor outcome' },
  harm: { band: 'bg-rose-500 text-white', label: 'The patient came to harm' },
}

const TAG_STYLE: Record<Tag, { label: string; className: string }> = {
  critical: { label: 'Essential', className: 'bg-rh-ink text-white' },
  'high-yield': { label: 'Useful', className: 'bg-rh-honeydew text-rh-ink' },
  neutral: { label: 'Neutral', className: 'bg-rh-cream text-rh-ink/70' },
  wasteful: { label: 'Wasted time', className: 'bg-amber-100 text-amber-900' },
  harmful: { label: 'Unsafe', className: 'bg-rose-100 text-rose-800' },
}

function ScoreRing({ pct, passed }: { pct: number; passed: boolean }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="relative flex h-36 w-36 items-center justify-center">
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="10" />
        <motion.circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={passed ? '#00cd0f' : '#f97316'}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        />
      </svg>
      <div className="text-center">
        <p className={cn('text-[40px] leading-none tracking-tight', displayFont)}>{pct}%</p>
        <p className={cn('mt-1 text-xs font-semibold', passed ? 'text-[#0f7a1b]' : 'text-orange-600')}>{passed ? 'Passed' : 'Not passed'}</p>
      </div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-rh-ink/50">
        {icon}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function InterestCard({ slug, interested }: { slug: string; interested: boolean }) {
  const register = useMutation(simApi.registerInterest)
  const [done, setDone] = useState(interested)
  const [busy, setBusy] = useState(false)
  const join = async () => {
    setBusy(true)
    try {
      await register({ caseSlug: slug })
      setDone(true)
      playSound('success')
      simTrack('sim_interest', { case: slug })
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t save that. Try again.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-10 overflow-hidden rounded-[28px] bg-rh-ink p-6 text-white sm:p-8">
      <p className={cn('text-[24px] leading-tight tracking-tight', displayFont)}>Want more cases like this?</p>
      <p className="mt-2 max-w-lg text-[15px] leading-6 text-white/70">
        Sim Pass is coming: new cases every month across MSK, neuro, cardio-respiratory and sports, with scored certificates you can share.
      </p>
      {done ? (
        <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold">
          <Check className="h-4 w-4 text-rh-lime" /> You’re on the list. We’ll let you know.
        </p>
      ) : (
        <button type="button" onClick={() => void join()} disabled={busy} className={cn(pillLime, 'mt-5 h-12 px-6')}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Get notified
        </button>
      )}
    </div>
  )
}

export function SimDebrief({ attemptId, slug }: { attemptId: string; slug: string }) {
  const data = useQuery(simApi.debrief, { attemptId })
  const start = useMutation(simApi.start)
  const router = useRouter()
  const [restarting, setRestarting] = useState(false)
  const announced = useRef(false)

  useEffect(() => {
    if (!data || announced.current) return
    announced.current = true
    const s = data.debrief.score
    simTrack('sim_finish', { case: slug, pct: s.pct, passed: s.passed, outcome: s.outcome, reason: s.reason ?? 'none', preview: data.preview })
    if (s.passed) {
      playSoundFile('certificate')
      celebrate()
    } else {
      playSound(s.outcome === 'harm' ? 'error' : 'reject')
    }
  }, [data, slug])

  if (data === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-3xl items-center justify-center px-4 py-32">
        <Loader2 className="h-6 w-6 animate-spin text-rh-ink/40" />
      </main>
    )
  }
  if (data === null) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-20 text-center">
        <p className="text-rh-ink/60">This debrief isn’t available.</p>
      </main>
    )
  }

  const { debrief: d, case: c } = data
  const s = d.score
  const outcome = OUTCOME_STYLE[d.ending.outcome]
  const shareText = `I scored ${s.pct}% on “${c.title}”, a clinical simulation on Rehabify Learn. Can you beat it?`
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}${simPath(c.slug)}` : simPath(c.slug)

  const again = async () => {
    setRestarting(true)
    try {
      const res = await start({ slug: c.slug, preview: data.preview || undefined })
      router.replace(`${simPath(c.slug)}?attempt=${res.attemptId}`)
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t start again.'))
      setRestarting(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <Link href={SIMULATIONS_PATH} className="text-sm font-semibold text-rh-ink/60 transition hover:text-rh-ink">
        ← Simulations
      </Link>

      {/* How it ended */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="mt-5 overflow-hidden rounded-[28px] border border-rh-ink/[0.08]"
      >
        <div className={cn('px-6 py-3 text-sm font-semibold sm:px-8', outcome.band)}>{outcome.label}</div>
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rh-ink/45">{c.title}</p>
            <h1 className={cn('mt-2 text-[28px] leading-tight tracking-tight text-rh-ink sm:text-[34px]', displayFont)}>{d.ending.title}</h1>
            <p className="mt-3 text-[15px] leading-7 text-rh-ink/70">{d.ending.summary}</p>
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-rh-ink/55">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> {formatClock(d.timeSec)}
              </span>
              <span>Your best: {data.best}%</span>
              {data.average !== null && <span>Average: {data.average}%</span>}
            </p>
          </div>
          <div className="self-center text-rh-ink">
            <ScoreRing pct={s.pct} passed={s.passed} />
          </div>
        </div>
        {s.reason === 'timeout' && <p className="border-t border-rh-ink/[0.06] px-6 py-3 text-sm text-orange-700 sm:px-8">Time ran out before you finished.</p>}
        {s.overBudget.length > 0 && (
          <p className="border-t border-rh-ink/[0.06] px-6 py-3 text-sm text-rh-ink/60 sm:px-8">
            You went over the time budget in {s.overBudget.length === 1 ? 'one phase' : `${s.overBudget.length} phases`} (−5 points each).
          </p>
        )}
      </motion.section>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={() => void again()} disabled={restarting} className={cn(pillInk, 'h-11 px-5')}>
          {restarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Try again
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(pillOutline, 'h-11 px-5')}
          onClick={() => playSound('share')}
        >
          <WhatsApp className="h-4 w-4" /> Share
        </a>
        <Link href={SIMULATIONS_PATH} className={cn(pillOutline, 'h-11 px-5')}>
          More cases <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <Section title="Critical actions" icon={<CheckCircle2 className="h-4 w-4" />}>
        <ul className="space-y-2">
          {d.critical.map((item) => (
            <li key={item.choiceId} className={cn('flex gap-3 rounded-2xl p-4', item.done ? 'bg-rh-honeydew' : 'bg-rose-50')}>
              {item.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0f7a1b]" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />}
              <span className="min-w-0">
                <span className={cn('block text-[15px] font-semibold', item.done ? 'text-rh-ink' : 'text-rose-900')}>{item.label}</span>
                <span className={cn('mt-0.5 block text-sm leading-6', item.done ? 'text-rh-ink/65' : 'text-rose-800/80')}>{item.feedback}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Your decisions" icon={<Clock className="h-4 w-4" />}>
        <ol className="relative space-y-3 border-l-2 border-rh-ink/[0.08] pl-5">
          {d.timeline.map((step, i) => {
            const tag = TAG_STYLE[step.tag]
            return (
              <motion.li
                key={`${step.choiceId}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.3 }}
                className="relative"
              >
                <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-rh-ink" />
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={cn('rounded-full px-2 py-0.5 font-semibold', tag.className)}>{tag.label}</span>
                  <span className="font-mono tabular-nums text-rh-ink/45">{formatClock(step.clockSec)}</span>
                  <span className={cn('font-semibold tabular-nums', step.points >= 0 ? 'text-rh-ink/55' : 'text-rose-600')}>
                    {step.points > 0 ? `+${step.points}` : step.points}
                  </span>
                </div>
                <p className="mt-1.5 text-[15px] font-medium leading-6 text-rh-ink">{step.label}</p>
                <p className="mt-0.5 text-sm leading-6 text-rh-ink/65">{step.feedback}</p>
              </motion.li>
            )
          })}
        </ol>
      </Section>

      <Section title="What an expert would do" icon={<Lightbulb className="h-4 w-4" />}>
        <ol className="space-y-2">
          {d.expertPath.map((step, i) => (
            <li key={step.choiceId} className="flex gap-3 rounded-2xl border border-rh-ink/[0.08] p-4">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rh-ink text-xs font-semibold text-white">{i + 1}</span>
              <span className="min-w-0 text-[15px] leading-6 text-rh-ink">{step.label}</span>
            </li>
          ))}
        </ol>
      </Section>

      {d.missedFindings.length > 0 && (
        <Section title="Findings you missed" icon={<XCircle className="h-4 w-4" />}>
          <ul className="space-y-2">
            {d.missedFindings.map((f) => (
              <li key={f.id} className="rounded-2xl bg-rh-cream p-4">
                <p className="text-sm font-semibold text-rh-ink">{f.label}</p>
                <p className="mt-0.5 text-sm leading-6 text-rh-ink/70">{f.detail}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Take-home points" icon={<Lightbulb className="h-4 w-4" />}>
        <ul className="space-y-3">
          {d.learningPoints.map((point) => (
            <li key={point} className="flex gap-3 text-[15px] leading-7 text-rh-ink/80">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rh-ink" />
              {point}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="References" icon={<BookOpen className="h-4 w-4" />}>
        <ul className="space-y-2">
          {d.references.map((ref) => (
            <li key={ref.label} className="text-sm leading-6 text-rh-ink/70">
              {ref.url ? (
                <a href={ref.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 hover:text-rh-ink hover:underline">
                  {ref.label}
                  <ExternalLink className="mt-1 h-3 w-3 shrink-0" />
                </a>
              ) : (
                ref.label
              )}
            </li>
          ))}
        </ul>
      </Section>

      {!data.preview && <InterestCard slug={c.slug} interested={data.interested} />}

      <p className="mt-10 text-xs leading-5 text-rh-ink/45">{DISCLAIMER}</p>
    </main>
  )
}
