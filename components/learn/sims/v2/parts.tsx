'use client'

/**
 * The phone player's parts, shared by the scored player (ScoredPlayer) and the reviewers' preview
 * (SimPreview): top bar, conversation, action dock, findings sheet and the swipeable debrief.
 * UX notes (owner + Gemini review 2026-11-14): older conversation folds away so the patient and the
 * latest exchange fit; actions are colour-coded by kind (never by how good they are); the monitor is
 * a tappable chip when attaching it is an option; short phones get a shorter patient stage.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  Check,
  ChevronUp,
  ClipboardList,
  Clock,
  Hand,
  MessageCircle,
  PhoneCall,
  Play,
  RotateCcw,
  Stethoscope,
  Volume2,
  VolumeX,
  X,
  XCircle,
} from '@/components/icons'
import { playSound, playSoundFile } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import type { Outcome, SimCategory, SimDebrief } from '@/lib/learn/simulation/engine'
import { celebrate } from '../../course/shared'
import { displayFont, pillInk, pillLime } from '../../shared'
import { formatClock } from '../simApi'
import { clockTick, vibrate } from '../simAudio'

// ── Conversation items ────────────────────────────────────────────────────────

export type Item =
  | { kind: 'scene'; key: string; text: string }
  | { kind: 'speech'; key: string; speaker: string; name: string; role: string; text: string; audioId: string }
  | { kind: 'action'; key: string; label: string; costSec: number; category: SimCategory }
  | { kind: 'finding'; key: string; label: string; detail: string; abnormal: boolean }
  | { kind: 'system'; key: string; text: string }
  | { kind: 'ending'; key: string; title: string; summary: string; outcome: Outcome }

let keySeq = 0
export const nextKey = (p: string) => `${p}-${++keySeq}`

export const OUTCOME_TONE: Record<Outcome, string> = {
  good: 'bg-rh-lime text-[#0b1312]',
  fair: 'bg-amber-300 text-[#2b1d00]',
  poor: 'bg-orange-400 text-[#2b1200]',
  harm: 'bg-rose-500 text-white',
}

/** Patient stage height: a third of the screen, less on short phones so the answers stay in reach. */
export const STAGE_CLASS =
  'h-[32dvh] max-h-[320px] min-h-[150px] shrink-0 [@media(max-height:740px)]:h-[26dvh] [@media(max-height:640px)]:h-[22dvh]'

// ── Action kinds ──────────────────────────────────────────────────────────────

type DockTab = Exclude<SimCategory, 'next'>

/** Neutral accents per kind of action (literal colours: the dock is white in both themes). */
export const CATEGORY_META: Record<DockTab, { label: string; icon: typeof Hand; dot: string; soft: string; ink: string }> = {
  ask: { label: 'Ask', icon: MessageCircle, dot: '#38bdf8', soft: 'rgb(56 189 248 / 0.12)', ink: '#075985' },
  examine: { label: 'Examine', icon: Stethoscope, dot: '#a78bfa', soft: 'rgb(167 139 250 / 0.14)', ink: '#5b21b6' },
  do: { label: 'Do', icon: Hand, dot: '#22c55e', soft: 'rgb(34 197 94 / 0.12)', ink: '#166534' },
  help: { label: 'Get help', icon: PhoneCall, dot: '#f59e0b', soft: 'rgb(245 158 11 / 0.14)', ink: '#92400e' },
}
const TAB_ORDER: DockTab[] = ['ask', 'examine', 'do', 'help']

export type DockChoice = { id: string; label: string; costSec: number; category: SimCategory }

// ── Top bar ───────────────────────────────────────────────────────────────────

export function CaseTopBar({
  name,
  setting,
  clock,
  voice,
  onVoice,
  onLeave,
  findings,
  onFindings,
}: {
  name: string
  setting: string
  clock: ReactNode
  voice: boolean
  onVoice: () => void
  onLeave: () => void
  findings: number
  onFindings: () => void
}) {
  return (
    <div className="learn-fixed-dark flex h-14 shrink-0 items-center gap-1 bg-[rgb(8_16_15)] px-1.5 text-white">
      <button type="button" onClick={onLeave} aria-label="Leave the case" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
        <X className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold leading-tight">{name}</p>
        <p className="truncate text-[11px] leading-tight text-white/55">{setting}</p>
      </div>
      {clock}
      <button
        type="button"
        onClick={onFindings}
        aria-label={`Findings so far: ${findings}`}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
      >
        <ClipboardList className="h-[18px] w-[18px]" />
        {findings > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rh-lime px-1 text-[10px] font-bold text-[#0b1312]">
            {findings}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onVoice}
        aria-label={voice ? 'Turn voices off' : 'Turn voices on'}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
      >
        {voice ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
      </button>
    </div>
  )
}

export function ClockPill({ seconds }: { seconds: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 font-mono text-[11px] tabular-nums">
      <Clock className="h-3 w-3" /> {formatClock(seconds)}
    </span>
  )
}

// ── Conversation ──────────────────────────────────────────────────────────────

/** How many recent lines stay open; earlier ones fold into one "Earlier" row. */
const RECENT = 6

export function Thread({
  items,
  speaking,
  pending,
  audio,
  onReplay,
  threadRef,
}: {
  items: Item[]
  speaking: string | null
  pending: boolean
  audio: boolean
  onReplay: (item: Extract<Item, { kind: 'speech' }>) => void
  threadRef: RefObject<HTMLDivElement | null>
}) {
  const reduce = useReducedMotion()
  const [showAll, setShowAll] = useState(false)
  // Fold from the latest situation's description where possible, so the current scene reads whole
  const cut = useMemo(() => {
    if (showAll || items.length <= RECENT) return 0
    let start = items.length - RECENT
    for (let i = items.length - 1; i >= Math.max(0, items.length - RECENT - 3); i--) {
      if (items[i].kind === 'scene') {
        start = Math.min(start, i)
        break
      }
    }
    return start
  }, [items, showAll])
  const shown = items.slice(cut)

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [items, pending, reduce, threadRef])

  return (
    <div ref={threadRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3" aria-live="polite">
      {cut > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mx-auto flex items-center gap-1.5 rounded-full bg-rh-ink/[0.06] px-3 py-1.5 text-xs font-semibold text-rh-ink/60"
        >
          <ChevronUp className="h-3.5 w-3.5" /> Earlier · {cut}
        </button>
      )}
      <AnimatePresence initial={false}>
        {shown.map((item) => (
          <motion.div key={item.key} layout="position" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            {item.kind === 'scene' && <p className="mx-auto max-w-[92%] rounded-2xl bg-rh-ink/[0.06] px-3.5 py-2.5 text-center text-[13.5px] leading-5 text-rh-ink/75">{item.text}</p>}
            {item.kind === 'speech' && (
              <button type="button" onClick={() => onReplay(item)} className="flex max-w-[86%] flex-col items-start text-left" aria-label={`${item.name}: ${item.text}. Tap to hear it again.`}>
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
                {audio && (
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
                  {item.category !== 'next' && (
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: CATEGORY_META[item.category].dot }} aria-hidden />
                  )}
                  {item.label}
                  {item.costSec > 0 && <span className="ml-2 font-mono text-[11px] text-white/50">+{item.costSec}s</span>}
                </span>
              </div>
            )}
            {item.kind === 'finding' && <FindingCard label={item.label} detail={item.detail} abnormal={item.abnormal} />}
            {item.kind === 'system' && <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-rh-ink/50">{item.text}</p>}
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
            <motion.span key={i} className="h-2 w-2 rounded-full bg-rh-ink/30" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
          ))}
        </div>
      )}
    </div>
  )
}

function FindingCard({ label, detail, abnormal }: { label: string; detail: string; abnormal: boolean }) {
  return (
    <div className={cn('mx-1 flex gap-2.5 rounded-2xl border px-3.5 py-2.5', abnormal ? 'border-rh-danger-line bg-rh-danger-soft' : 'border-rh-ink/10 bg-white')}>
      <Stethoscope className={cn('mt-0.5 h-4 w-4 shrink-0', abnormal ? 'text-rh-danger-ink' : 'text-rh-ink/50')} />
      <span className="min-w-0">
        <span className="block text-xs font-bold uppercase tracking-[0.08em] text-rh-ink/55">{label}</span>
        <span className="block text-[14px] leading-5 text-rh-ink">{detail}</span>
      </span>
    </div>
  )
}

// ── Findings sheet ────────────────────────────────────────────────────────────

export function FindingsSheet({
  open,
  onClose,
  findings,
}: {
  open: boolean
  onClose: () => void
  findings: { id: string; label: string; detail: string; abnormal: boolean }[]
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="absolute inset-0 z-20 flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="Close findings" onClick={onClose} className="absolute inset-0 bg-[rgb(3_8_7/0.45)]" />
          <motion.div
            role="dialog"
            aria-label="Findings so far"
            className="relative max-h-[70%] overflow-y-auto rounded-t-[24px] bg-rh-cream px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-rh-ink/55">Findings so far</p>
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-rh-ink/[0.06] text-rh-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            {findings.length === 0 ? (
              <p className="py-6 text-center text-sm text-rh-ink/55">Nothing yet. Ask and examine to build the picture.</p>
            ) : (
              <div className="space-y-2">
                {findings.map((f) => (
                  <FindingCard key={f.id} label={f.label} detail={f.detail} abnormal={f.abnormal} />
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Action dock ───────────────────────────────────────────────────────────────

export function Dock({
  choices,
  pending,
  onPick,
  over,
  onDebrief,
  nodeKey,
}: {
  choices: DockChoice[]
  pending: { id: string; ms: number } | null
  onPick: (c: DockChoice) => void
  over: boolean
  onDebrief: () => void
  nodeKey: string
}) {
  const grouped = useMemo(() => {
    const g: Record<SimCategory, DockChoice[]> = { ask: [], examine: [], do: [], help: [], next: [] }
    for (const c of choices) g[c.category].push(c)
    return g
  }, [choices])
  const tabs = TAB_ORDER.filter((t) => grouped[t].length > 0)
  const [tab, setTab] = useState<DockTab>('ask')
  // A new situation opens on its first group of actions
  useEffect(() => {
    if (tabs.length && !tabs.includes(tab)) setTab(tabs[0])
  }, [nodeKey, tabs, tab])
  const current = grouped[tab].length ? tab : tabs[0]

  return (
    <div className="shrink-0 rounded-t-[24px] bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_-18px_rgba(10,20,18,0.5)]">
      {over ? (
        <button type="button" onClick={onDebrief} className={cn(pillLime, 'h-12 w-full')}>
          See your debrief <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <>
          {tabs.length > 1 && (
            <div className="mb-2.5 flex gap-1 rounded-full bg-rh-cream p-1" role="tablist">
              {tabs.map((t) => {
                const meta = CATEGORY_META[t]
                return (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={current === t}
                    onClick={() => {
                      vibrate([5])
                      setTab(t)
                    }}
                    className={cn('relative flex-1 rounded-full py-2 text-[12.5px] font-semibold transition-colors', current === t ? 'text-rh-ink' : 'text-rh-ink/50')}
                  >
                    {current === t && <motion.span layoutId="dock-tab" className="absolute inset-0 rounded-full bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                    <span className="relative inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} aria-hidden />
                      {meta.label}
                      <span className="text-[11px] text-rh-ink/40">{grouped[t].length}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="grid max-h-[30dvh] grid-cols-2 gap-2 overflow-y-auto [@media(max-height:640px)]:max-h-[34dvh]">
            {(current ? grouped[current] : []).map((c) => {
              const isPending = pending?.id === c.id
              const meta = CATEGORY_META[c.category as DockTab] ?? CATEGORY_META.do
              const Icon = meta.icon
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onPick(c)}
                  disabled={Boolean(pending)}
                  className={cn(
                    'relative flex min-h-[60px] flex-col justify-between overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.97] disabled:opacity-60',
                    isPending ? 'border-rh-ink bg-rh-cream' : 'border-rh-ink/10 bg-white'
                  )}
                >
                  <span className="absolute inset-y-0 left-0 w-1" style={{ background: meta.dot }} aria-hidden />
                  {isPending && (
                    <motion.span className="absolute inset-y-0 left-0 bg-rh-lime/25" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: pending!.ms / 1000, ease: 'linear' }} />
                  )}
                  <span className="relative line-clamp-3 pl-1 text-[13.5px] font-medium leading-[1.3] text-rh-ink">{c.label}</span>
                  <span className="relative mt-1.5 flex items-center justify-between pl-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ background: meta.soft, color: meta.ink }} aria-hidden>
                      <Icon className="h-3 w-3" />
                    </span>
                    <span className="rounded-full bg-rh-ink/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-rh-ink/55">+{c.costSec}s</span>
                  </span>
                </button>
              )
            })}
          </div>
          {grouped.next.map((c) => (
            <button key={c.id} type="button" onClick={() => onPick(c)} disabled={Boolean(pending)} className={cn(pillInk, 'mt-2.5 h-11 w-full')}>
              {c.label} <ArrowRight className="h-4 w-4" />
            </button>
          ))}
        </>
      )}
    </div>
  )
}

// ── Debrief as swipeable cards ────────────────────────────────────────────────

export function DebriefCards({
  d,
  footer,
  extra,
}: {
  d: SimDebrief
  footer: ReactNode
  /** A last card (e.g. the Sim Pass and sharing). */
  extra?: { title: string; body: ReactNode }
}) {
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
    ...(extra ? [{ id: 'extra', title: extra.title }] : []),
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
              {card.id === 'extra' && extra && <div className="mt-3">{extra.body}</div>}
            </div>
          </section>
        ))}
      </div>
      <div className="flex gap-2 border-t border-rh-ink/[0.07] bg-white px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">{footer}</div>
    </div>
  )
}

export function AgainButton({ onClick, label = 'Play again' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn(pillInk, 'h-12 flex-1')}>
      <RotateCcw className="h-4 w-4" /> {label}
    </button>
  )
}

// ── Countdown ring (triage cases) ─────────────────────────────────────────────

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
