'use client'

/**
 * The phone player as a preview for the Rehabify Learn team: it runs the repo's cases on the device
 * (not scored, drafts included) on the same screen as the scored player (ScoredPlayer): the patient
 * on video, the monitor, the conversation that folds away, and the colour-coded thumb dock.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'convex/react'
import { useReducedMotion } from 'framer-motion'
import { HeartPulse, Loader2, Lock, Play } from '@/components/icons'
import { cn } from '@/lib/utils'
import {
  applyChoice,
  availableChoices,
  buildDebrief,
  choiceCategory,
  attachesMonitor,
  expire,
  MONITOR_FLAG,
  startState,
  timeLimit,
  vitalsAt,
  vitalsTimeline,
  type SimCase,
  type SimLine,
  type SimState,
} from '@/lib/learn/simulation/engine'
import { displayFont } from '../../shared'
import { DISCLAIMER, modeLabel, simApi, SPECIALTY_LABEL, voiceUrl } from '../simApi'
import { heartBeep, queueVoice, setVoiceOn, stopVoice, unlockSimAudio, vibrate, voiceOn } from '../simAudio'
import { MonitorRow, PatientStage } from './PatientStage'
import {
  AgainButton,
  CaseTopBar,
  ClockPill,
  Countdown,
  DebriefCards,
  Dock,
  FindingsSheet,
  nextKey,
  STAGE_CLASS,
  Thread,
  type DockChoice,
  type Item,
} from './parts'

function speechOf(def: SimCase, line: SimLine, audioId: string): Extract<Item, { kind: 'speech' }> {
  const s = def.speakers[line.speaker]
  return { kind: 'speech', key: nextKey('s'), speaker: line.speaker, name: s?.name ?? line.speaker, role: s?.role ?? '', text: line.text, audioId }
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
  const [stage, setStage] = useState<'playing' | 'debrief'>('playing')
  const [voice, setVoice] = useState(true)
  const [findingsOpen, setFindingsOpen] = useState(false)
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
    (add: Item[]) => {
      if (!def.audio) return
      const lines = add.filter((i): i is Extract<Item, { kind: 'speech' }> => i.kind === 'speech')
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

  const open = useCallback(() => {
    const node = def.nodes[def.startNode]
    const lines = (node.lines ?? []).map((l, i) => speechOf(def, l, `${node.id}-${i}`))
    push([{ kind: 'scene', key: nextKey('n'), text: node.prompt }, ...lines])
    say(lines)
  }, [def, push, say])

  // Opening: the situation, then whoever speaks
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    setVoice(voiceOn())
    open()
    return () => stopVoice()
  }, [open])

  const finish = useCallback(
    (next: SimState) => {
      const d = buildDebrief(def, next)
      push([{ kind: 'ending', key: nextKey('e'), title: d.ending.title, summary: d.ending.summary, outcome: d.ending.outcome }])
    },
    [def, push]
  )

  const live = sim.status === 'active' ? availableChoices(def, sim) : []
  const choices: DockChoice[] = useMemo(() => live.map((c) => ({ id: c.id, label: c.label, costSec: c.costSec, category: choiceCategory(c) })), [live])

  const pick = async (choice: DockChoice) => {
    if (pending || sim.status !== 'active') return
    stopVoice()
    setSpeaking(null)
    setVoiceBusy(false)
    vibrate([8])
    const ms = reduce ? 150 : Math.min(1300, 300 + choice.costSec * 35)
    push([{ kind: 'action', key: nextKey('a'), label: choice.label, costSec: choice.costSec, category: choice.category }])
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
      const full = live.find((c) => c.id === choice.id)
      if (full?.reply) add.push(speechOf(def, full.reply, full.id))
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
  const findings = sim.findings
    .map((id) => def.findings[id])
    .filter(Boolean)
    .map((f) => ({ id: f.id, label: f.label, detail: f.detail, abnormal: Boolean(f.abnormal) }))
  const attach = live.find((c) => attachesMonitor(c))

  return (
    <div className="fixed inset-0 z-[80] flex justify-center bg-[rgb(3_8_7/0.6)]">
      <div className="relative flex h-[100dvh] w-full max-w-[460px] flex-col overflow-hidden bg-rh-cream sm:border-x sm:border-[rgb(255_255_255/0.1)]">
        <CaseTopBar
          name={`${def.patient.name}, ${def.patient.age}`}
          setting={def.setting}
          clock={
            stage === 'debrief' ? null : limit ? (
              <div className="-my-1 shrink-0 scale-[0.8]">
                <Countdown getClock={getClock} limit={limit} onExpire={onExpire} />
              </div>
            ) : (
              <ClockPill seconds={sim.virtualSec} />
            )
          }
          voice={voice}
          onVoice={() => {
            setVoiceOn(!voice)
            setVoice(!voice)
          }}
          onLeave={leave}
          findings={findings.length}
          onFindings={() => setFindingsOpen(true)}
        />

        {stage === 'debrief' ? (
          <DebriefCards
            d={buildDebrief(def, sim)}
            footer={
              <>
                <AgainButton
                  onClick={() => {
                    stopVoice()
                    setSim(startState(def, Date.now()))
                    setItems([])
                    setStage('playing')
                    open()
                  }}
                />
                <button type="button" onClick={onExit} className="h-12 flex-1 rounded-full border border-rh-ink/15 text-sm font-semibold text-rh-ink">
                  Other cases
                </button>
              </>
            }
          />
        ) : (
          <>
            <div className={STAGE_CLASS}>
              <PatientStage pain={sim.pain} breathsPerMin={breaths} speaking={Boolean(speaking)} scene={sim.scene && def.scenes?.[sim.scene] ? def.scenes[sim.scene] : null} />
            </div>
            {def.monitor && (
              <MonitorRow
                timeline={timeline}
                on={Boolean(timeline)}
                getClock={getClock}
                live={sim.status === 'active'}
                attach={
                  !timeline && attach && !over
                    ? { label: attach.label, costSec: attach.costSec, disabled: Boolean(pending), onTap: () => void pick({ id: attach.id, label: attach.label, costSec: attach.costSec, category: choiceCategory(attach) }) }
                    : null
                }
              />
            )}
            <Thread items={items} speaking={speaking} pending={Boolean(pending)} audio={Boolean(def.audio)} onReplay={replay} threadRef={thread} />
            <Dock choices={choices} pending={pending} onPick={(c) => void pick(c)} over={over} onDebrief={() => setStage('debrief')} nodeKey={sim.nodeId} />
          </>
        )}
        <FindingsSheet open={findingsOpen} onClose={() => setFindingsOpen(false)} findings={findings} />
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
      <h1 className={cn('mt-4 text-[32px] leading-tight tracking-tight text-rh-ink', displayFont)}>Case preview</h1>
      <p className="mt-2 text-[15px] leading-6 text-rh-ink/60">
        The repo&apos;s latest cases on the learners&apos; screen, drafts included. Nothing is scored or saved. Tap a line to hear it again.
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
