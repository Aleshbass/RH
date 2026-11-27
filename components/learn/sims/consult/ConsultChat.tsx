'use client'

/**
 * "Talk to the patient" (owner 2026-11-26): the learner takes the history, and later explains the
 * plan, in their own words, typed or spoken. The patient answers in character (learnSimConsult:say),
 * in their own voice when voices are on, lips moving; their face and a mood chip follow how the
 * conversation is going. No scores here: the AI's verdicts stay on the server until the debrief.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAction, useMutation, useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowRight, ClipboardList, Frown, Loader2, Meh, Mic, Send, Smile, Stethoscope, X } from '@/components/icons'
import { cn } from '@/lib/utils'
import type { SimScene } from '@/lib/learn/simulation/engine'
import {
  consultApi,
  errorText,
  simPath,
  simTrack,
  voiceUrl,
  type ConsultInfo,
  type ConsultTurn,
  type SimAttempt,
} from '../simApi'
import { queueVoice, setVoiceOn, stopVoice, vibrate, voiceOn } from '../simAudio'
import { registerLiveLine } from '../talkingFace'
import { PatientStage } from '../v2/PatientStage'
import { CaseTopBar, FindingsPanel, FindingsSheet, PlayerFrame, SplitPanes, STAGE_CLASS } from '../v2/parts'
import { canPushToTalk, PushToTalk } from './pushToTalk'

type Mood = ConsultInfo['mood']

const MOOD_META: Record<Mood, { label: string; icon: typeof Smile; className: string }> = {
  'at-ease': { label: 'At ease', icon: Smile, className: 'bg-rh-lime text-[#0b1312]' },
  okay: { label: 'Okay', icon: Meh, className: 'bg-white/15 text-white' },
  uneasy: { label: 'Uneasy', icon: Meh, className: 'bg-amber-300 text-[#2b1d00]' },
  upset: { label: 'Frustrated', icon: Frown, className: 'bg-rose-500 text-white' },
}

/** What the patient's face shows: their last reply's feeling, else their mood. */
function faceFor(emotion: string | null, mood: Mood): 'calm' | 'uneasy' | 'worried' | 'pain' {
  if (emotion === 'in pain') return 'pain'
  if (emotion === 'worried' || emotion === 'confused') return 'worried'
  if (emotion === 'annoyed' || emotion === 'upset' || mood === 'upset' || mood === 'uneasy') return 'uneasy'
  if (emotion === 'calm' || emotion === 'relieved' || mood === 'at-ease') return 'calm'
  return 'uneasy'
}

function moodLine(from: Mood, to: Mood, first: string, he: string): string | null {
  const rank: Record<Mood, number> = { upset: 0, uneasy: 1, okay: 2, 'at-ease': 3 }
  if (rank[to] > rank[from]) return to === 'at-ease' ? `${first} relaxes. ${he} is opening up.` : `${first} seems a little calmer.`
  if (to === 'upset') return `${first} is getting frustrated.`
  if (to === 'uneasy') return `${first} looks uneasy.`
  return null
}

export function ConsultChat({ attempt, info, onDone }: { attempt: SimAttempt; info: ConsultInfo; onDone: () => void }) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const c = attempt.case
  const first = info.patientFirstName
  const he = c.patient.sex === 'F' ? 'She' : 'He'
  const him = c.patient.sex === 'F' ? 'her' : 'him'
  const stage = info.stage === 'explain' ? 'explain' : 'history'
  const over = attempt.status !== 'active'

  const turns = useQuery(consultApi.conversation, { attemptId: attempt.attemptId })
  const say = useAction(consultApi.say)
  const speakAction = useAction(consultApi.speak)
  const transcribe = useAction(consultApi.transcribe)
  const moveOn = useMutation(consultApi.moveOn)
  const finishExplaining = useMutation(consultApi.finishExplaining)

  const [text, setText] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const [voice, setVoice] = useState(true)
  const [speaking, setSpeaking] = useState<number | null>(null)
  const [findingsOpen, setFindingsOpen] = useState(false)
  const [confirmMove, setConfirmMove] = useState(false)
  const [notes, setNotes] = useState<{ key: string; afterIndex: number; text: string }[]>([])
  const [rec, setRec] = useState<'idle' | 'starting' | 'recording' | 'sending'>('idle')
  const [level, setLevel] = useState(0)
  const thread = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const mic = useRef<PushToTalk | null>(null)
  const releaseEarly = useRef(false)
  const urls = useRef<string[]>([])

  // Full screen: the page behind doesn't scroll; voices and blob URLs are cleaned up on the way out
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setVoice(voiceOn())
    const made = urls.current
    return () => {
      document.body.style.overflow = previous
      stopVoice()
      mic.current?.cancel()
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  // ── The patient speaks: recorded opening line, else live in the case's own voice ──
  const speakTurn = useCallback(
    async (t: ConsultTurn) => {
      if (!voiceOn()) return
      if (t.index === 0 && t.stage === 'history' && info.openingAudio && c.audio) {
        queueVoice([{ url: voiceUrl(c.slug, c.version, info.openingAudio), onStart: () => setSpeaking(t.index) }], () => setSpeaking(null))
        return
      }
      if (!info.voice) return
      try {
        const audio = await speakAction({ attemptId: attempt.attemptId, index: t.index })
        const url = URL.createObjectURL(new Blob([audio], { type: 'audio/mpeg' }))
        urls.current.push(url)
        registerLiveLine(url, t.text)
        queueVoice([{ url, onStart: () => setSpeaking(t.index) }], () => setSpeaking(null))
      } catch {
        // The words are on screen; a missing voice isn't worth an error
      }
    },
    [attempt.attemptId, c.audio, c.slug, c.version, info.openingAudio, info.voice, speakAction]
  )

  // New patient replies are spoken once. Opening an attempt later doesn't replay old ones (only a
  // reply from the last few seconds, like the opening line of a case just started)
  const spokenUpTo = useRef<number | null>(null)
  useEffect(() => {
    if (!turns) return
    if (spokenUpTo.current === null) {
      const last = turns[turns.length - 1]
      spokenUpTo.current = last ? last.index : -1
      if (last && last.role === 'patient' && Date.now() - last.at < 15000) void speakTurn(last)
      return
    }
    const fresh = turns.filter((t) => t.index > (spokenUpTo.current ?? -1))
    if (!fresh.length) return
    spokenUpTo.current = fresh[fresh.length - 1].index
    for (const t of fresh) if (t.role === 'patient') void speakTurn(t)
  }, [turns, speakTurn])

  // Mood changes show as a line in the conversation ("Tunde relaxes")
  const lastMood = useRef<Mood>(info.mood)
  useEffect(() => {
    if (info.mood === lastMood.current) return
    const line = moodLine(lastMood.current, info.mood, first, he)
    lastMood.current = info.mood
    if (line && turns?.length) setNotes((n) => [...n, { key: `m${Date.now()}`, afterIndex: turns[turns.length - 1].index, text: line }])
  }, [info.mood, first, he, turns])

  // The visit ended here (the patient walked out): a moment to take it in, then the debrief
  useEffect(() => {
    if (!over) return
    const id = window.setTimeout(onDone, speaking !== null ? 9000 : 3500)
    return () => window.clearTimeout(id)
  }, [over, speaking, onDone])

  const shown = useMemo(() => (turns ?? []).filter((t) => t.stage === stage), [turns, stage])
  const lastPatient = useMemo(() => [...shown].reverse().find((t) => t.role === 'patient') ?? null, [shown])
  const echoed = sending !== null && shown.some((t) => t.role === 'physio' && t.text === sending.replace(/\s+/g, ' ').trim())

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [shown.length, sending, notes.length, reduce])

  const send = async (raw: string) => {
    const message = raw.trim()
    if (!message || sending || over) return
    stopVoice()
    setSpeaking(null)
    setConfirmMove(false)
    setSending(message)
    setText('')
    try {
      await say({ attemptId: attempt.attemptId, text: message })
      simTrack('sim_consult_say', { case: c.slug, stage })
    } catch (err) {
      toast.error(errorText(err, `${first} didn’t catch that. Try again.`))
      setText((current) => current || message)
    } finally {
      setSending(null)
    }
  }

  // ── Hold to talk ──
  const startTalking = async (e: ReactPointerEvent) => {
    e.preventDefault()
    if (rec !== 'idle' || sending || over) return
    stopVoice()
    setSpeaking(null)
    releaseEarly.current = false
    const recorder = new PushToTalk()
    mic.current = recorder
    setRec('starting')
    vibrate([10])
    try {
      await recorder.start(setLevel, () => void stopTalking())
      if (releaseEarly.current) {
        recorder.cancel()
        setRec('idle')
        toast('Hold the microphone while you speak, then let go.')
        return
      }
      setRec('recording')
    } catch {
      recorder.cancel()
      setRec('idle')
      toast.error('We couldn’t use your microphone. Check the permission, or type instead.')
    }
  }

  const stopTalking = async () => {
    if (rec === 'starting') {
      releaseEarly.current = true
      return
    }
    const recorder = mic.current
    if (!recorder || rec !== 'recording') return
    mic.current = null
    setRec('sending')
    setLevel(0)
    try {
      const wav = await recorder.stop()
      if (!wav) {
        setRec('idle')
        return
      }
      const { text: heard } = await transcribe({ attemptId: attempt.attemptId, audio: wav })
      setRec('idle')
      if (heard.trim()) void send(heard)
      else toast('We didn’t catch any words. Try again, a little closer to the microphone.')
    } catch (err) {
      setRec('idle')
      toast.error(errorText(err, 'We couldn’t hear that. Try again, or type it.'))
    }
  }

  const leave = () => {
    stopVoice()
    router.push(simPath(c.slug))
  }

  const next = async () => {
    if (!confirmMove) {
      setConfirmMove(true)
      return
    }
    stopVoice()
    try {
      if (stage === 'history') await moveOn({ attemptId: attempt.attemptId })
      else await finishExplaining({ attemptId: attempt.attemptId })
      simTrack('sim_consult_stage', { case: c.slug, from: stage })
    } catch (err) {
      toast.error(errorText(err, 'That didn’t go through. Try again.'))
    }
  }

  const left = stage === 'history' ? info.turnsLeft : info.explainTurnsLeft
  const outOfTurns = left <= 0
  const busy = sending !== null || rec === 'sending'
  const mood = MOOD_META[info.mood]
  const scene: SimScene | null = attempt.scene?.art2d
    ? { ...attempt.scene, art2d: { ...attempt.scene.art2d, mood: faceFor(lastPatient?.emotion ?? null, info.mood) } }
    : attempt.scene
  const nothingSaid = !shown.some((t) => t.role === 'physio')

  return (
    <PlayerFrame wide>
      <CaseTopBar
        name={`${c.patient.name}, ${c.patient.age}`}
        setting={stage === 'history' ? 'Taking the history' : 'Explaining your plan'}
        clock={
          <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors', mood.className)} aria-live="polite">
            <mood.icon className="h-3.5 w-3.5" /> {mood.label}
          </span>
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
      <SplitPanes
        left={
          <>
            <div className={STAGE_CLASS}>
              <PatientStage
                pain={attempt.pain}
                breathsPerMin={16}
                speaking={speaking !== null}
                talking={speaking !== null}
                lipsUrl={c.audio ? `/sims/${c.slug}/v${c.version}/lips.json` : null}
                scene={scene}
              />
            </div>
            <FindingsPanel findings={attempt.findings} />
          </>
        }
        right={
          <>
            <div ref={thread} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3" aria-live="polite">
              {nothingSaid && (
                <div className="mx-auto max-w-[94%] rounded-2xl bg-rh-ink/[0.05] px-3.5 py-3 text-[13px] leading-5 text-rh-ink/70">
                  {stage === 'history' ? (
                    <>
                      <p className="font-semibold text-rh-ink">Talk to {first} in your own words.</p>
                      <p className="mt-1">
                        Introduce yourself, ask open questions and listen for what worries {him}. Type, or hold the microphone to speak. Move on to the
                        examination when you’re ready.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-rh-ink">Explain your plan to {first}.</p>
                      <p className="mt-1">Use words {he.toLowerCase()} understands, answer {him === 'her' ? 'her' : 'his'} questions honestly, and check {he.toLowerCase()}’s understood.</p>
                    </>
                  )}
                </div>
              )}
              <AnimatePresence initial={false}>
                {shown.map((t) => (
                  <motion.div key={t.index} layout="position" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                    {t.role === 'system' && <p className="mx-auto max-w-[92%] rounded-2xl bg-rh-ink/[0.06] px-3.5 py-2.5 text-center text-[13px] leading-5 text-rh-ink/70">{t.text}</p>}
                    {t.role === 'physio' && (
                      <div className="flex justify-end">
                        <span className="max-w-[86%] whitespace-pre-wrap rounded-[20px] rounded-tr-md bg-rh-ink px-3.5 py-2.5 text-[14.5px] leading-6 text-white">{t.text}</span>
                      </div>
                    )}
                    {t.role === 'patient' && (
                      <div className="flex max-w-[88%] flex-col items-start">
                        <span className="mb-0.5 ml-3 text-[11px] font-semibold text-rh-ink/50">{first}</span>
                        <button
                          type="button"
                          onClick={() => {
                            stopVoice()
                            setSpeaking(null)
                            void speakTurn(t)
                          }}
                          className={cn(
                            'rounded-[20px] rounded-tl-md bg-white px-3.5 py-2.5 text-left text-[15px] leading-6 text-rh-ink shadow-sm',
                            speaking === t.index && 'ring-2 ring-rh-lime'
                          )}
                          aria-label={`${first}: ${t.text}. Tap to hear it again.`}
                        >
                          {t.text}
                        </button>
                        {t.found.length > 0 && (
                          <span className="ml-2 mt-1.5 flex flex-wrap gap-1.5">
                            {t.found.map((f) => (
                              <span key={f.id} className="inline-flex items-center gap-1 rounded-full bg-rh-honeydew px-2 py-0.5 text-[11px] font-semibold text-rh-ink/70">
                                <ClipboardList className="h-3 w-3" /> Noted: {f.label}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    )}
                    {notes
                      .filter((n) => n.afterIndex === t.index)
                      .map((n) => (
                        <p key={n.key} className="mt-2.5 text-center text-xs font-semibold italic text-rh-ink/50">
                          {n.text}
                        </p>
                      ))}
                  </motion.div>
                ))}
              </AnimatePresence>
              {sending !== null && !echoed && (
                <div className="flex justify-end">
                  <span className="max-w-[86%] rounded-[20px] rounded-tr-md bg-rh-ink/80 px-3.5 py-2.5 text-[14.5px] leading-6 text-white">{sending}</span>
                </div>
              )}
              {sending !== null && (
                <div className="flex items-center gap-2 pl-2 text-xs font-semibold text-rh-ink/45" aria-label={`${first} is thinking`}>
                  <span className="flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span key={i} className="h-2 w-2 rounded-full bg-rh-ink/30" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
                    ))}
                  </span>
                  {first}
                </div>
              )}
            </div>

            {/* Composer */}
            {!over && (
              <div className="shrink-0 border-t border-rh-ink/[0.08] bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
                {!outOfTurns ? (
                  <div className="flex items-end gap-2">
                    {rec === 'recording' || rec === 'starting' ? (
                      <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[22px] bg-rose-50 px-4 text-sm font-semibold text-rose-700">
                        <span className="relative flex h-3 w-3">
                          <span className="absolute inset-0 rounded-full bg-rose-500" style={{ transform: `scale(${1 + level * 1.6})`, opacity: 0.35 }} />
                          <span className="relative h-3 w-3 rounded-full bg-rose-500" />
                        </span>
                        {rec === 'starting' ? 'Starting the microphone…' : 'Listening… let go to send'}
                      </div>
                    ) : (
                      <textarea
                        ref={input}
                        value={text}
                        onChange={(e) => setText(e.target.value.slice(0, 500))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            void send(text)
                          }
                        }}
                        rows={1}
                        disabled={busy}
                        placeholder={rec === 'sending' ? 'Listening back…' : stage === 'history' ? `Say something to ${first}…` : `Explain to ${first}…`}
                        className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-[22px] border border-rh-ink/10 bg-rh-cream px-4 py-2.5 text-[15px] leading-6 text-rh-ink outline-none placeholder:text-rh-ink/40 focus:border-rh-ink/30 disabled:opacity-60 [field-sizing:content]"
                        aria-label={`Your message to ${first}`}
                      />
                    )}
                    {text.trim() && rec === 'idle' ? (
                      <button
                        type="button"
                        onClick={() => void send(text)}
                        disabled={busy}
                        aria-label="Send"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rh-lime text-[#0b1312] transition active:scale-95 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    ) : canPushToTalk() ? (
                      <button
                        type="button"
                        onPointerDown={(e) => void startTalking(e)}
                        onPointerUp={() => void stopTalking()}
                        onPointerCancel={() => void stopTalking()}
                        onContextMenu={(e) => e.preventDefault()}
                        disabled={busy}
                        aria-label="Hold to speak"
                        className={cn(
                          'flex h-11 w-11 shrink-0 touch-none select-none items-center justify-center rounded-full transition active:scale-95',
                          rec === 'recording' ? 'scale-110 bg-rose-500 text-white' : 'bg-rh-ink text-white',
                          busy && 'opacity-60'
                        )}
                      >
                        {rec === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="pb-1 text-center text-xs font-semibold text-rh-ink/55">
                    {stage === 'history' ? 'That’s all the time for questions.' : 'That’s all the time for this part.'}
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-rh-ink/40">{left <= 6 ? `${left} ${left === 1 ? 'message' : 'messages'} left` : ''}</span>
                  {(!nothingSaid || outOfTurns) && (
                    <button
                      type="button"
                      onClick={() => void next()}
                      disabled={busy}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold transition active:scale-[0.98] disabled:opacity-50',
                        confirmMove || outOfTurns ? 'bg-rh-ink text-white' : 'bg-rh-ink/[0.07] text-rh-ink'
                      )}
                    >
                      {stage === 'history' ? <Stethoscope className="h-3.5 w-3.5" /> : <ClipboardList className="h-3.5 w-3.5" />}
                      {confirmMove ? 'Tap again to move on' : stage === 'history' ? `Examine ${him}` : 'Done explaining'}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {confirmMove && (
                    <button type="button" onClick={() => setConfirmMove(false)} aria-label="Stay" className="flex h-9 w-9 items-center justify-center rounded-full text-rh-ink/50 hover:bg-rh-ink/5">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        }
      />
      <FindingsSheet open={findingsOpen} onClose={() => setFindingsOpen(false)} findings={attempt.findings} />
    </PlayerFrame>
  )
}
