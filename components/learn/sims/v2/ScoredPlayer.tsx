'use client'

/**
 * The scored case player in the phone layout (owner 2026-11-14: "simulations working perfectly with
 * the UI improvements"). Same screen as the reviewers' preview: the patient on video (a silent loop
 * per scene), the monitor, the conversation and the thumb dock. The server is the referee: every
 * tap goes through learnSims.choose and the screen follows the attempt it returns.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from 'convex/react'
import { useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { vitalsFromTimeline } from '@/lib/learn/simulation/engine'
import { errorText, noteServerTime, serverNowMs, simApi, simPath, simTrack, voiceUrl, type SimAttempt, type SimLineView } from '../simApi'
import { heartBeep, queueVoice, setVoiceOn, stopVoice, vibrate, voiceOn } from '../simAudio'
import { MonitorRow, PatientStage } from './PatientStage'
import { CaseTopBar, ClockPill, Countdown, Dock, FindingsSheet, nextKey, STAGE_CLASS, Thread, type DockChoice, type Item } from './parts'

const speech = (l: SimLineView): Extract<Item, { kind: 'speech' }> => ({
  kind: 'speech',
  key: nextKey('s'),
  speaker: l.speaker,
  name: l.name,
  role: l.role,
  text: l.text,
  audioId: l.audioId,
})

export function ScoredPlayer({ attempt, onDone }: { attempt: SimAttempt; onDone: () => void }) {
  const router = useRouter()
  const choose = useMutation(simApi.choose)
  const finishIfExpired = useMutation(simApi.finishIfExpired)
  const reduce = useReducedMotion()
  const c = attempt.case
  const [items, setItems] = useState<Item[]>([])
  const [pending, setPending] = useState<{ id: string; ms: number } | null>(null)
  const [speaking, setSpeaking] = useState<string | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voice, setVoice] = useState(true)
  const [findingsOpen, setFindingsOpen] = useState(false)
  const thread = useRef<HTMLDivElement>(null)

  // Full screen: the page behind doesn't scroll
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setVoice(voiceOn())
    return () => {
      document.body.style.overflow = previous
      stopVoice()
    }
  }, [])

  // The clock, read fresh each time (a cached query result can't hold "now")
  const attemptRef = useRef(attempt)
  attemptRef.current = attempt
  const getClock = useCallback(() => {
    const a = attemptRef.current
    if (a.finishedClockSec !== null) return a.finishedClockSec
    if (a.case.mode !== 'triage') return a.virtualSec
    return Math.max(0, (serverNowMs() - a.startedAt) / 1000) + a.virtualSec
  }, [])

  const say = useCallback(
    (add: Item[]) => {
      if (!c.audio) return
      const lines = add.filter((i): i is Extract<Item, { kind: 'speech' }> => i.kind === 'speech')
      if (!lines.length) return
      setVoiceBusy(true)
      queueVoice(
        lines.map((l) => ({ url: voiceUrl(c.slug, c.version, l.audioId), onStart: () => setSpeaking(l.key) })),
        () => {
          setSpeaking(null)
          setVoiceBusy(false)
        }
      )
    },
    [c.audio, c.slug, c.version]
  )

  // Follow the attempt: each change adds the reply, new findings, the monitor, and a new situation
  const seen = useRef<{ steps: number; nodeId: string | null; findings: Set<string>; monitor: boolean; escalated: boolean; status: string } | null>(null)
  useEffect(() => {
    const add: Item[] = []
    const prev = seen.current
    if (!prev) {
      // Opening (or coming back to) the case: where things stand
      for (const f of attempt.findings) add.push({ kind: 'finding', key: nextKey('f'), label: f.label, detail: f.detail, abnormal: f.abnormal })
      if (attempt.node) add.push({ kind: 'scene', key: nextKey('n'), text: attempt.node.prompt }, ...attempt.node.lines.map(speech))
    } else {
      if (attempt.stepCount > prev.steps && attempt.lastChoice?.reply) add.push(speech(attempt.lastChoice.reply))
      for (const f of attempt.findings) {
        if (!prev.findings.has(f.id)) add.push({ kind: 'finding', key: nextKey('f'), label: f.label, detail: f.detail, abnormal: f.abnormal })
      }
      if (attempt.monitorOn && !prev.monitor) {
        add.push({ kind: 'system', key: nextKey('y'), text: 'Monitor connected' })
        if (attempt.vitals) heartBeep(vitalsFromTimeline(attempt.vitals, getClock()).spo2)
      }
      if (attempt.escalated && !prev.escalated) add.push({ kind: 'system', key: nextKey('y'), text: 'Help is on the way' })
      if (attempt.node && attempt.node.id !== prev.nodeId) {
        add.push({ kind: 'scene', key: nextKey('n'), text: attempt.node.prompt }, ...attempt.node.lines.map(speech))
      }
    }
    if (attempt.status === 'finished' && prev?.status !== 'finished' && attempt.ending) {
      if (prev && attempt.stepCount === prev.steps) add.push({ kind: 'system', key: nextKey('y'), text: 'Time’s up' })
      add.push({ kind: 'ending', key: nextKey('e'), title: attempt.ending.title, summary: attempt.ending.summary, outcome: attempt.ending.outcome })
      simTrack('sim_finish', { case: c.slug, steps: attempt.stepCount })
    }
    seen.current = {
      steps: attempt.stepCount,
      nodeId: attempt.node?.id ?? null,
      findings: new Set(attempt.findings.map((f) => f.id)),
      monitor: attempt.monitorOn,
      escalated: attempt.escalated,
      status: attempt.status,
    }
    if (!add.length) return
    setItems((list) => [...list, ...add])
    say(add)
  }, [attempt, c.slug, getClock, say])

  const over = attempt.status !== 'active'
  // After the last line has played (or straight away without voices), a pause to read, then the debrief
  useEffect(() => {
    if (!over) return
    const id = window.setTimeout(onDone, voiceBusy ? 15000 : 2400)
    return () => window.clearTimeout(id)
  }, [over, voiceBusy, onDone])

  const onExpire = useCallback(() => {
    void finishIfExpired({ attemptId: attemptRef.current.attemptId })
      .then((r) => noteServerTime(r.serverNow))
      .catch(() => undefined)
  }, [finishIfExpired])

  const pick = async (choice: DockChoice) => {
    if (pending || over) return
    stopVoice()
    setSpeaking(null)
    setVoiceBusy(false)
    vibrate([8])
    const ms = reduce ? 200 : Math.min(1300, 320 + choice.costSec * 35)
    setItems((list) => [...list, { kind: 'action', key: nextKey('a'), label: choice.label, costSec: choice.costSec, category: choice.category }])
    setPending({ id: choice.id, ms })
    try {
      const [res] = await Promise.all([choose({ attemptId: attempt.attemptId, choiceId: choice.id }), new Promise((r) => window.setTimeout(r, ms))])
      noteServerTime(res.serverNow)
      simTrack('sim_choice', { case: c.slug, choice: choice.id, step: attempt.stepCount + 1 })
      if (!res.applied) setItems((list) => [...list, { kind: 'system', key: nextKey('y'), text: 'Time ran out before that.' }])
    } catch (err) {
      toast.error(errorText(err, 'That didn’t go through. Try again.'))
    } finally {
      setPending(null)
    }
  }

  const replay = (item: Extract<Item, { kind: 'speech' }>) => {
    if (!c.audio) return
    stopVoice()
    setVoiceBusy(true)
    queueVoice([{ url: voiceUrl(c.slug, c.version, item.audioId), onStart: () => setSpeaking(item.key) }], () => {
      setSpeaking(null)
      setVoiceBusy(false)
    })
  }

  const leave = () => {
    stopVoice()
    // An unfinished attempt stays: the case page offers to resume it
    router.push(simPath(c.slug))
  }

  // The patient's own voice moves their mouth (a relative's line doesn't)
  const talker = speaking ? items.find((i) => i.key === speaking) : undefined
  const talking = talker?.kind === 'speech' && talker.speaker === 'patient'
  const choices: DockChoice[] = useMemo(() => attempt.choices.map((x) => ({ id: x.id, label: x.label, costSec: x.costSec, category: x.category })), [attempt.choices])
  const attach = attempt.choices.find((x) => x.attachesMonitor)
  const breaths = attempt.vitals ? vitalsFromTimeline(attempt.vitals, getClock()).rr : 16
  const limit = c.mode === 'triage' ? (c.timeLimitSec ?? 60) : null

  return (
    <div className="fixed inset-0 z-[80] flex justify-center bg-[rgb(3_8_7/0.6)]">
      <div className="relative flex h-[100dvh] w-full max-w-[460px] flex-col overflow-hidden bg-rh-cream sm:border-x sm:border-[rgb(255_255_255/0.1)]">
        <CaseTopBar
          name={`${c.patient.name}, ${c.patient.age}`}
          setting={c.setting}
          clock={
            over ? null : limit ? (
              <div className="-my-1 shrink-0 scale-[0.8]">
                <Countdown getClock={getClock} limit={limit} onExpire={onExpire} />
              </div>
            ) : (
              <ClockPill seconds={attempt.virtualSec} />
            )
          }
          voice={voice}
          onVoice={() => {
            setVoiceOn(!voice)
            setVoice(!voice)
          }}
          onLeave={leave}
          findings={attempt.findings.length}
          onFindings={() => setFindingsOpen(true)}
        />
        <div className={STAGE_CLASS}>
          <PatientStage
            pain={attempt.pain}
            breathsPerMin={breaths}
            speaking={Boolean(speaking)}
            talking={talking}
            lipsUrl={c.audio ? `/sims/${c.slug}/v${c.version}/lips.json` : null}
            scene={attempt.scene}
          />
        </div>
        {c.monitor && (
          <MonitorRow
            timeline={attempt.vitals}
            on={attempt.monitorOn}
            getClock={getClock}
            live={!over}
            attach={
              !attempt.monitorOn && attach && !over
                ? {
                    label: attach.label,
                    costSec: attach.costSec,
                    disabled: Boolean(pending),
                    onTap: () => void pick({ id: attach.id, label: attach.label, costSec: attach.costSec, category: attach.category }),
                  }
                : null
            }
          />
        )}
        <Thread items={items} speaking={speaking} pending={Boolean(pending)} audio={Boolean(c.audio)} onReplay={replay} threadRef={thread} />
        <Dock choices={choices} pending={pending} onPick={(x) => void pick(x)} over={over} onDebrief={onDone} nodeKey={attempt.node?.id ?? 'end'} />
        <FindingsSheet open={findingsOpen} onClose={() => setFindingsOpen(false)} findings={attempt.findings} />
      </div>
    </div>
  )
}
