'use client'

/**
 * The new mobile player, as a preview for the Rehabify Learn team (owner 2026-11-13: "think of a
 * better improved UX for mobile"). One full screen, no page scrolling during a case: the patient on
 * top, the conversation in the middle (your actions on the right, the patient on the left, findings
 * as cards), and the actions in the thumb zone, grouped Ask · Examine · Do · Get help. Every tap
 * answers with a voice, a sound or a card. It runs the real cases and voices on the device and
 * isn't scored; the server-scored player gets this layout once it's approved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, Clock, HeartPulse, Loader2, Lock, Play, RotateCcw, Stethoscope, Volume2, VolumeX, X, XCircle } from '@/components/icons'
import { playSound, playSoundFile } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import {
  applyChoice,
  availableChoices,
  buildDebrief,
  expire,
  MONITOR_FLAG,
  startState,
  timeLimit,
  vitalsAt,
  vitalsTimeline,
  type Outcome,
  type SimCase,
  type SimChoice,
  type SimLine,
  type SimState,
} from '@/lib/learn/simulation/engine'
import { celebrate } from '../../course/shared'
import { displayFont, pillInk, pillLime } from '../../shared'
import { DISCLAIMER, formatClock, modeLabel, simApi, SPECIALTY_LABEL, voiceUrl } from '../simApi'
import { heartBeep, queueVoice, setVoiceOn, stopVoice, unlockSimAudio, vibrate, voiceOn } from '../simAudio'
import { Countdown } from '../SimPlayer'
import { MonitorRow, PatientStage } from './PatientStage'

type Item =
  | { kind: 'scene'; key: string; text: string }
  | { kind: 'speech'; key: string; speaker: string; name: string; role: string; text: string; audioId: string }
  | { kind: 'action'; key: string; label: string; costSec: number }
  | { kind: 'finding'; key: string; label: string; detail: string; abnormal: boolean }
  | { kind: 'system'; key: string; text: string }
  | { kind: 'ending'; key: string; title: string; summary: string; outcome: Outcome }

type Category = 'ask' | 'examine' | 'do' | 'help'
const TABS: { id: Category; label: string }[] = [
  { id: 'ask', label: 'Ask' },
  { id: 'examine', label: 'Examine' },
  { id: 'do', label: 'Do' },
  { id: 'help', label: 'Get help' },
]

/** Until cases carry a category, sort actions by how they read. */
function categoryOf(choice: SimChoice): Category | 'next' {
  const l = choice.label.toLowerCase().trim()
  if (choice.costSec === 0 && choice.tag === 'neutral') return 'next'
  if (l.startsWith('“') || /^(call|escalate)|referral|refer |emergency department|doctor on call|phone ahead/.test(l)) return 'help'
  if (l.endsWith('?') || /^(ask|how |what |where |any |have you|could you|tell me|did you)/.test(l)) return 'ask'
  if (/^(check|look|test|press|measure|palpate|gentle|squeeze|straight leg|full lower|lumbar|observe|do a |feel)/.test(l)) return 'examine'
  return 'do'
}

let keySeq = 0
const nextKey = (p: string) => `${p}-${++keySeq}`

function speechOf(def: SimCase, line: SimLine, audioId: string): Item {
  const s = def.speakers[line.speaker]
  return { kind: 'speech', key: nextKey('s'), speaker: line.speaker, name: s?.name ?? line.speaker, role: s?.role ?? '', text: line.text, audioId }
}

const OUTCOME_TONE: Record<Outcome, string> = {
  good: 'bg-rh-lime text-[#0b1312]',
  fair: 'bg-amber-300 text-[#2b1d00]',
  poor: 'bg-orange-400 text-[#2b1200]',
  harm: 'bg-rose-500 text-white',
}

// ── Debrief as swipeable cards ────────────────────────────────────────────────

function DebriefCards({ def, state, onAgain, onExit }: { def: SimCase; state: SimState; onAgain: () => void; onExit: () => void }) {
  const d = useMemo(() => buildDebrief(def, state), [def, state])
  const scroller = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  useEffect(() => {
    if (d.score.passed) {
      playSoundFile('certificate')
      celebrate()
    } else playSound(d.score.outcome === 'harm' ? 'error' : 'reject')
  }, [d])
  const cards = [
    { id: 'score', title: 'How it went' },
    { id: 'critical', title: 'Critical actions' },
    { id: 'decisions', title: 'Your decisions' },
    { id: 'expert', title: 'What an expert would do' },
    { id: 'learn', title: 'Take-home points' },
  ]
  const go = (i: number) => scroller.current?.scrollTo({ left: i * (scroller.current?.clientWidth ?? 0), behavior: 'smooth' })
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-rh-cream">
      <div className="flex justify-center gap-1.5 pt-3">
        {cards.map((c, i) => (
          <button key={c.id} type="button" onClick={() => go(i)} aria-label={c.title} className={cn('h-1.5 rounded-full transition-all', i === page ? 'w-6 bg-rh-ink' : 'w-1.5 bg-rh-ink/25')} />
        ))}
      </div>
      <div
        ref={scroller}
        onScroll={(e) => setPage(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card) => (
          <section key={card.id} className="w-full shrink-0 snap-center overflow-y-auto px-4 pb-4 pt-3">
            <div className="rounded-[24px] bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rh-ink/45">{card.title}</p>
              {card.id === 'score' && (
                <div className="mt-3">
                  <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-bold', OUTCOME_TONE[d.ending.outcome])}>{d.ending.title}</span>
                  <p className="mt-3 text-[15px] leading-6 text-rh-ink/75">{d.ending.summary}</p>
                  <div className="mt-5 flex items-end gap-4">
                    <p className={cn('text-[56px] leading-none tracking-tight text-rh-ink', displayFont)}>{d.score.pct}%</p>
                    <p className={cn('pb-2 text-sm font-semibold', d.score.passed ? 'text-rh-success-ink' : 'text-orange-600')}>{d.score.passed ? 'Passed' : 'Not passed'}</p>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-rh-ink/55">
                    <Clock className="h-3.5 w-3.5" /> {formatClock(d.timeSec)}
                    {d.score.reason === 'timeout' && ' · time ran out'}
                  </p>
                  <p className="mt-6 text-xs text-rh-ink/45">Swipe for the details →</p>
                </div>
              )}
              {card.id === 'critical' && (
                <ul className="mt-3 space-y-2">
                  {d.critical.map((c) => (
                    <li key={c.choiceId} className={cn('flex gap-2.5 rounded-2xl p-3', c.done ? 'bg-rh-honeydew' : 'bg-rh-danger-soft')}>
                      {c.done ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-rh-success-ink" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rh-danger-ink" />}
                      <span className="text-sm leading-6 text-rh-ink">{c.label}</span>
                    </li>
                  ))}
                </ul>
              )}
              {card.id === 'decisions' && (
                <ol className="mt-3 space-y-3">
                  {d.timeline.map((t, i) => (
                    <li key={`${t.choiceId}-${i}`} className="border-l-2 border-rh-ink/10 pl-3">
                      <p className="text-xs font-semibold text-rh-ink/50">
                        {formatClock(t.clockSec)} · {t.points > 0 ? `+${t.points}` : t.points}
                      </p>
                      <p className="text-sm font-medium leading-6 text-rh-ink">{t.label}</p>
                      <p className="text-sm leading-6 text-rh-ink/65">{t.feedback}</p>
                    </li>
                  ))}
                </ol>
              )}
              {card.id === 'expert' && (
                <ol className="mt-3 space-y-2">
                  {d.expertPath.map((s, i) => (
                    <li key={s.choiceId} className="flex gap-2.5 text-sm leading-6 text-rh-ink">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rh-ink text-[11px] font-semibold text-white">{i + 1}</span>
                      {s.label}
                    </li>
                  ))}
                </ol>
              )}
              {card.id === 'learn' && (
                <div className="mt-3 space-y-3">
                  {d.learningPoints.map((p) => (
                    <p key={p} className="text-sm leading-6 text-rh-ink/80">
                      • {p}
                    </p>
                  ))}
                  <div className="border-t border-rh-ink/10 pt-3">
                    {d.references.map((r) => (
                      <p key={r.label} className="text-xs leading-5 text-rh-ink/55">
                        {r.url ? (
                          <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                            {r.label}
                          </a>
                        ) : (
                          r.label
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
      <div className="flex gap-2 border-t border-rh-ink/[0.07] bg-white px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={onAgain} className={cn(pillInk, 'h-12 flex-1')}>
          <RotateCcw className="h-4 w-4" /> Play again
        </button>
        <button type="button" onClick={onExit} className="h-12 flex-1 rounded-full border border-rh-ink/15 text-sm font-semibold text-rh-ink">
          Other cases
        </button>
      </div>
    </div>
  )
}

// ── The case ──────────────────────────────────────────────────────────────────

function PreviewPlayer({ def, onExit }: { def: SimCase; onExit: () => void }) {
  const reduce = useReducedMotion()
  const [sim, setSim] = useState<SimState>(() => startState(def, Date.now()))
  const simRef = useRef(sim)
  simRef.current = sim
  const [items, setItems] = useState<Item[]>([])
  const [pending, setPending] = useState<{ id: string; ms: number } | null>(null)
  const [speaking, setSpeaking] = useState<string | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [tab, setTab] = useState<Category>('ask')
  const [stage, setStage] = useState<'playing' | 'debrief'>('playing')
  const [voice, setVoice] = useState(true)
  const thread = useRef<HTMLDivElement>(null)
  const limit = timeLimit(def)

  // Full screen: the page behind doesn't scroll
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const getClock = useCallback(() => {
    const s = simRef.current
    if (s.finish) return s.finish.clockSec
    return def.mode === 'triage' ? Math.max(0, (Date.now() - s.startedAt) / 1000) + s.virtualSec : s.virtualSec
  }, [def.mode])

  const say = useCallback(
    (speech: Item[]) => {
      if (!def.audio) return
      const lines = speech.filter((i): i is Extract<Item, { kind: 'speech' }> => i.kind === 'speech')
      if (!lines.length) return
      setVoiceBusy(true)
      queueVoice(
        lines.map((l) => ({ url: voiceUrl(def.slug, def.version, l.audioId), onStart: () => setSpeaking(l.key) })),
        () => {
          setSpeaking(null)
          setVoiceBusy(false)
        }
      )
    },
    [def]
  )

  const push = useCallback((add: Item[]) => setItems((list) => [...list, ...add]), [])

  // Opening: the situation, then whoever speaks
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    setVoice(voiceOn())
    const node = def.nodes[def.startNode]
    const lines = (node.lines ?? []).map((l, i) => speechOf(def, l, `${node.id}-${i}`))
    push([{ kind: 'scene', key: nextKey('n'), text: node.prompt }, ...lines])
    say(lines)
    return () => stopVoice()
  }, [def, push, say])

  // Keep the newest line in view
  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [items, pending, reduce])

  const finish = useCallback(
    (next: SimState) => {
      const d = buildDebrief(def, next)
      push([{ kind: 'ending', key: nextKey('e'), title: d.ending.title, summary: d.ending.summary, outcome: d.ending.outcome }])
    },
    [def, push]
  )

  const choices = sim.status === 'active' ? availableChoices(def, sim) : []
  const grouped = useMemo(() => {
    const g: Record<Category | 'next', SimChoice[]> = { ask: [], examine: [], do: [], help: [], next: [] }
    for (const c of choices) g[categoryOf(c)].push(c)
    return g
  }, [choices])
  const tabs = TABS.filter((t) => grouped[t.id].length > 0)
  // A new situation opens on its first group of actions
  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.id === tab)) setTab(tabs[0].id)
  }, [sim.nodeId, tabs, tab])

  const pick = async (choice: SimChoice) => {
    if (pending || sim.status !== 'active') return
    stopVoice()
    setSpeaking(null)
    setVoiceBusy(false)
    vibrate([8])
    const ms = reduce ? 150 : Math.min(1300, 300 + choice.costSec * 35)
    push([{ kind: 'action', key: nextKey('a'), label: choice.label, costSec: choice.costSec }])
    setPending({ id: choice.id, ms })
    await new Promise((r) => window.setTimeout(r, ms))
    const prev = simRef.current
    let next: SimState
    try {
      next = applyChoice(def, prev, choice.id, Date.now())
    } catch {
      setPending(null)
      return
    }
    const add: Item[] = []
    if (next.steps.length === prev.steps.length) {
      add.push({ kind: 'system', key: nextKey('y'), text: 'Time ran out before that.' })
    } else {
      if (choice.reply) add.push(speechOf(def, choice.reply, choice.id))
      for (const id of next.findings.filter((f) => !prev.findings.includes(f))) {
        const f = def.findings[id]
        if (f) add.push({ kind: 'finding', key: nextKey('f'), label: f.label, detail: f.detail, abnormal: Boolean(f.abnormal) })
      }
      if (def.monitor && next.flags.includes(MONITOR_FLAG) && !prev.flags.includes(MONITOR_FLAG)) {
        add.push({ kind: 'system', key: nextKey('y'), text: 'Monitor connected' })
        heartBeep(vitalsAt(def, next, getClock()).spo2)
      }
      if (next.flags.includes('escalated') && !prev.flags.includes('escalated')) add.push({ kind: 'system', key: nextKey('y'), text: 'Help is on the way' })
      if (next.status === 'active' && next.nodeId !== prev.nodeId) {
        const node = def.nodes[next.nodeId]
        add.push({ kind: 'scene', key: nextKey('n'), text: node.prompt }, ...(node.lines ?? []).map((l, i) => speechOf(def, l, `${node.id}-${i}`)))
      }
    }
    setSim(next)
    push(add)
    say(add)
    if (next.status === 'finished') finish(next)
    setPending(null)
  }

  const onExpire = useCallback(() => {
    const next = expire(def, simRef.current, Date.now() + 4000)
    if (next.status === 'finished' && simRef.current.status === 'active') {
      setSim(next)
      push([{ kind: 'system', key: nextKey('y'), text: 'Time’s up' }])
      finish(next)
    }
  }, [def, finish, push])

  // The case is over: once the last line has played, open the debrief
  const over = sim.status === 'finished'
  useEffect(() => {
    if (!over || stage === 'debrief') return
    const id = window.setTimeout(() => setStage('debrief'), voiceBusy ? 15000 : 2200)
    return () => window.clearTimeout(id)
  }, [over, voiceBusy, stage])

  const replay = (item: Extract<Item, { kind: 'speech' }>) => {
    if (!def.audio) return
    stopVoice()
    setVoiceBusy(true)
    queueVoice([{ url: voiceUrl(def.slug, def.version, item.audioId), onStart: () => setSpeaking(item.key) }], () => {
      setSpeaking(null)
      setVoiceBusy(false)
    })
  }

  const leave = () => {
    if (sim.status === 'active' && !window.confirm('Leave this case? Your progress will be lost.')) return
    stopVoice()
    onExit()
  }

  const timeline = useMemo(() => (def.monitor && sim.flags.includes(MONITOR_FLAG) ? vitalsTimeline(def, sim) : null), [def, sim])
  const breaths = vitalsAt(def, sim, getClock()).rr

  return (
    <div className="fixed inset-0 z-[80] flex justify-center bg-[rgb(3_8_7/0.6)]">
      <div className="flex h-[100dvh] w-full max-w-[460px] flex-col overflow-hidden bg-rh-cream sm:border-x sm:border-[rgb(255_255_255/0.1)]">
        {/* Top bar */}
        <div className="learn-fixed-dark flex h-14 shrink-0 items-center gap-1.5 bg-[rgb(8_16_15)] px-1.5 text-white">
          <button type="button" onClick={leave} aria-label="Leave the case" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold leading-tight">
              {def.patient.name}, {def.patient.age}
            </p>
            <p className="truncate text-[11px] leading-tight text-white/55">{def.setting}</p>
          </div>
          {stage !== 'debrief' &&
            (limit ? (
              <div className="-my-1 shrink-0 scale-[0.8]">
                <Countdown getClock={getClock} limit={limit} onExpire={onExpire} />
              </div>
            ) : (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 font-mono text-[11px] tabular-nums">
                <Clock className="h-3 w-3" /> {formatClock(sim.virtualSec)}
              </span>
            ))}
          <button
            type="button"
            onClick={() => {
              setVoiceOn(!voice)
              setVoice(!voice)
            }}
            aria-label={voice ? 'Turn voices off' : 'Turn voices on'}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
          >
            {voice ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
          </button>
        </div>

        {stage === 'debrief' ? (
          <DebriefCards
            def={def}
            state={sim}
            onAgain={() => {
              stopVoice()
              const fresh = startState(def, Date.now())
              setSim(fresh)
              setItems([])
              setStage('playing')
              const node = def.nodes[def.startNode]
              const lines = (node.lines ?? []).map((l, i) => speechOf(def, l, `${node.id}-${i}`))
              push([{ kind: 'scene', key: nextKey('n'), text: node.prompt }, ...lines])
              say(lines)
            }}
            onExit={onExit}
          />
        ) : (
          <>
            {/* Patient */}
            <div className="h-[34dvh] max-h-[320px] min-h-[190px] shrink-0">
              <PatientStage
                pain={sim.pain}
                breathsPerMin={breaths}
                speaking={Boolean(speaking)}
                scene={sim.scene && def.scenes?.[sim.scene] ? def.scenes[sim.scene] : null}
              />
            </div>
            {def.monitor && <MonitorRow timeline={timeline} on={Boolean(timeline)} getClock={getClock} live={sim.status === 'active'} />}

            {/* Conversation */}
            <div ref={thread} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3" aria-live="polite">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.div key={item.key} layout="position" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                    {item.kind === 'scene' && <p className="mx-auto max-w-[92%] rounded-2xl bg-rh-ink/[0.06] px-3.5 py-2.5 text-center text-[13.5px] leading-5 text-rh-ink/75">{item.text}</p>}
                    {item.kind === 'speech' && (
                      <button type="button" onClick={() => replay(item)} className="flex max-w-[86%] flex-col items-start text-left">
                        <span className="mb-0.5 ml-3 flex items-center gap-1.5 text-[11px] font-semibold text-rh-ink/50">
                          {item.name}
                          {item.speaker !== 'patient' && item.role && <span className="font-normal">· {item.role}</span>}
                        </span>
                        <span
                          className={cn(
                            'rounded-[20px] rounded-tl-md px-3.5 py-2.5 text-[15px] leading-6 text-rh-ink shadow-sm',
                            item.speaker === 'patient' ? 'bg-white' : 'bg-rh-honeydew',
                            speaking === item.key && 'ring-2 ring-rh-lime'
                          )}
                        >
                          {item.text}
                        </span>
                        {def.audio && (
                          <span className="ml-3 mt-1 flex items-center gap-1 text-[10px] font-semibold text-rh-ink/40">
                            {speaking === item.key ? (
                              <span className="space-eq space-live-eq h-2.5 text-rh-ink/60" aria-hidden>
                                <span />
                                <span />
                                <span />
                                <span />
                              </span>
                            ) : (
                              <Play className="h-2.5 w-2.5" />
                            )}
                            {speaking === item.key ? 'Speaking' : ''}
                          </span>
                        )}
                      </button>
                    )}
                    {item.kind === 'action' && (
                      <div className="flex justify-end">
                        <span className="max-w-[86%] rounded-[20px] rounded-tr-md bg-rh-ink px-3.5 py-2.5 text-[14.5px] leading-6 text-white">
                          {item.label}
                          {item.costSec > 0 && <span className="ml-2 font-mono text-[11px] text-white/50">+{item.costSec}s</span>}
                        </span>
                      </div>
                    )}
                    {item.kind === 'finding' && (
                      <div className={cn('mx-1 flex gap-2.5 rounded-2xl border px-3.5 py-2.5', item.abnormal ? 'border-rh-danger-line bg-rh-danger-soft' : 'border-rh-ink/10 bg-white')}>
                        <Stethoscope className={cn('mt-0.5 h-4 w-4 shrink-0', item.abnormal ? 'text-rh-danger-ink' : 'text-rh-ink/50')} />
                        <span className="min-w-0">
                          <span className="block text-xs font-bold uppercase tracking-[0.08em] text-rh-ink/55">{item.label}</span>
                          <span className="block text-[14px] leading-5 text-rh-ink">{item.detail}</span>
                        </span>
                      </div>
                    )}
                    {item.kind === 'system' && (
                      <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-rh-ink/50">
                        <HeartPulse className="h-3.5 w-3.5" /> {item.text}
                      </p>
                    )}
                    {item.kind === 'ending' && (
                      <div className="mt-2 overflow-hidden rounded-[20px] bg-white shadow-sm">
                        <p className={cn('px-4 py-2 text-xs font-bold', OUTCOME_TONE[item.outcome])}>{item.title}</p>
                        <p className="px-4 py-3 text-[14px] leading-6 text-rh-ink/75">{item.summary}</p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {pending && (
                <div className="flex items-center gap-1 pl-2" aria-label="Working">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-2 w-2 rounded-full bg-rh-ink/30"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Actions in the thumb zone */}
            <div className="shrink-0 rounded-t-[24px] bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_-18px_rgba(10,20,18,0.5)]">
              {over ? (
                <button type="button" onClick={() => setStage('debrief')} className={cn(pillLime, 'h-12 w-full')}>
                  See your debrief <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <>
                  {tabs.length > 1 && (
                    <div className="mb-2.5 flex gap-1 rounded-full bg-rh-cream p-1" role="tablist">
                      {tabs.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          role="tab"
                          aria-selected={tab === t.id}
                          onClick={() => {
                            vibrate([5])
                            setTab(t.id)
                          }}
                          className={cn('relative flex-1 rounded-full py-2 text-[13px] font-semibold transition-colors', tab === t.id ? 'text-rh-ink' : 'text-rh-ink/50')}
                        >
                          {tab === t.id && <motion.span layoutId="dock-tab" className="absolute inset-0 rounded-full bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                          <span className="relative">
                            {t.label}
                            <span className="ml-1 text-[11px] text-rh-ink/40">{grouped[t.id].length}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="grid max-h-[34dvh] grid-cols-2 gap-2 overflow-y-auto">
                    {(grouped[tab].length ? grouped[tab] : tabs[0] ? grouped[tabs[0].id] : []).map((c) => {
                      const isPending = pending?.id === c.id
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => void pick(c)}
                          disabled={Boolean(pending)}
                          className={cn(
                            'relative flex min-h-[64px] flex-col justify-between overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.97] disabled:opacity-60',
                            isPending ? 'border-rh-ink bg-rh-cream' : 'border-rh-ink/10 bg-white'
                          )}
                        >
                          {isPending && (
                            <motion.span className="absolute inset-y-0 left-0 bg-rh-lime/25" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: pending.ms / 1000, ease: 'linear' }} />
                          )}
                          <span className="relative line-clamp-3 text-[13.5px] font-medium leading-[1.3] text-rh-ink">{c.label}</span>
                          <span className="relative mt-1.5 self-end rounded-full bg-rh-ink/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-rh-ink/55">+{c.costSec}s</span>
                        </button>
                      )
                    })}
                  </div>
                  {grouped.next.map((c) => (
                    <button key={c.id} type="button" onClick={() => void pick(c)} disabled={Boolean(pending)} className={cn(pillInk, 'mt-2.5 h-11 w-full')}>
                      {c.label} <ArrowRight className="h-4 w-4" />
                    </button>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Case picker ───────────────────────────────────────────────────────────────

export function SimPreview() {
  const cases = useQuery(simApi.reviewerCases, {})
  const [active, setActive] = useState<SimCase | null>(null)
  const [round, setRound] = useState(0)

  if (cases === undefined) {
    return (
      <main className="flex justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-rh-ink/40" />
      </main>
    )
  }
  if (cases === null) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <Lock className="mx-auto h-6 w-6 text-rh-ink/50" />
        <p className={cn('mt-4 text-[24px] tracking-tight text-rh-ink', displayFont)}>For the Rehabify Learn team</p>
        <p className="mt-2 text-sm text-rh-ink/60">Sign in with an admin or Learn instructor account to try the new player.</p>
      </main>
    )
  }
  return (
    <main className="mx-auto w-full max-w-md px-4 pb-20 pt-8">
      <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold text-[#3b2a00]">Preview · not scored</span>
      <h1 className={cn('mt-4 text-[32px] leading-tight tracking-tight text-rh-ink', displayFont)}>New mobile player</h1>
      <p className="mt-2 text-[15px] leading-6 text-rh-ink/60">
        One screen: the patient on top, the conversation in the middle, the actions under your thumb. Tap a line to hear it again.
      </p>
      <ul className="mt-6 space-y-3">
        {cases.map((c) => (
          <li key={c.slug}>
            <button
              type="button"
              onClick={() => {
                unlockSimAudio()
                setRound((r) => r + 1)
                setActive(c)
              }}
              className="flex w-full items-center gap-4 rounded-[22px] border border-rh-ink/[0.08] bg-white p-4 text-left transition active:scale-[0.99]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rh-ink text-rh-lime">
                <HeartPulse className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug text-rh-ink">{c.title}</span>
                <span className="mt-0.5 block text-xs text-rh-ink/55">
                  {modeLabel({ mode: c.mode, timeLimitSec: timeLimit(c), estimatedMinutes: c.estimatedMinutes })} · {SPECIALTY_LABEL[c.specialty] ?? c.specialty}
                </span>
              </span>
              <Play className="h-4 w-4 shrink-0 text-rh-ink/50" />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-xs leading-5 text-rh-ink/45">{DISCLAIMER}</p>
      {active && <PreviewPlayer key={`${active.slug}-${round}`} def={active} onExit={() => setActive(null)} />}
    </main>
  )
}
