'use client'

/**
 * The AI scribe, at the top of a new clinical note (NoteDrawer). The physio ticks that the patient
 * agreed, records the session (or dictates), watches the words appear, stops, and the AI drafts
 * the note into the editor below. Here they see what to check: red flags heard, what the
 * recording didn't cover, the measures the AI picked up (added one tap at a time), and the
 * transcript (which they can correct and draft again). Signing happens with the drawer's button.
 *
 * An unfinished recording or unsigned draft for this patient comes back here for 7 days.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Loader2,
  Mic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  WifiOff,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { InfoTip, primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui'
import { newMeasureId } from '@/components/physio/notes/progress'
import { measureDetail, measureResult, measureTitle, type ClinicalMeasure } from '@/convex/helpers/clinicalMeasures'
import type { ScribeDraft } from '@/convex/helpers/scribeDraft'
import type { Id } from '@/convex/_generated/dataModel'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { SCRIBE_NAME, SCRIBE_PILOT, scribeApi, scribeError, type ScribeSession, type ScribeSessionId } from './scribeApi'
import { openMicrophone, useScribeRecorder, type ScribeLine, type ScribeRecorder } from './useScribeRecorder'

export const formatClock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`
}

const minutesLabel = (seconds: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

/** A small live loudness meter, so the physio can see the mic hears them. */
export function LevelMeter({ stream, active, tone = "app" }: { stream: MediaStream | null; active: boolean; tone?: "app" | "call" }) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!stream || !active || !stream.getAudioTracks().length) {
      setLevel(0)
      return
    }
    let context: AudioContext | null = null
    let frame = 0
    try {
      context = new AudioContext()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      let last = 0
      const loop = (time: number) => {
        frame = requestAnimationFrame(loop)
        if (time - last < 80) return
        last = time
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (const value of data) sum += ((value - 128) / 128) ** 2
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 5))
      }
      frame = requestAnimationFrame(loop)
    } catch {
      setLevel(0)
    }
    return () => {
      cancelAnimationFrame(frame)
      void context?.close().catch(() => undefined)
    }
  }, [stream, active])
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden>
      {[0.15, 0.35, 0.55, 0.75, 0.9].map((step) => (
        <span key={step} className={cn('w-1 rounded-full transition-all duration-75', level >= step ? (tone === 'call' ? 'bg-emerald-600' : 'bg-pt-green-fg') : tone === 'call' ? 'bg-neutral-300' : 'bg-pt-line-strong')} style={{ height: `${30 + step * 70}%` }} />
      ))}
    </span>
  )
}

/** The transcript as it builds: saved earlier parts, then the live lines (still-changing words greyed). */
export function ScribeTranscript({
  earlier,
  lines,
  speaking,
  className,
  emptyText = 'Start talking. The words appear here a moment after each pause.',
  tone = 'app',
}: {
  earlier?: string
  lines: ScribeLine[]
  speaking: boolean
  className?: string
  emptyText?: string
  /** "call": the always-light video call screen, which doesn't follow dark mode */
  tone?: 'app' | 'call'
}) {
  const muted = tone === 'call' ? 'text-neutral-500' : 'text-pt-muted'
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  useEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [lines, speaking, earlier])
  const visible = lines.filter((l) => l.text.trim() || !l.final)
  const earlierLines = (earlier ?? '').split('\n').filter((l) => l.trim())
  return (
    <div
      ref={box}
      onScroll={(event) => {
        const el = event.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
      className={cn(
        'max-h-64 min-h-[7rem] overflow-y-auto rounded-xl px-3 py-2.5 text-sm leading-relaxed',
        tone === 'call' ? 'bg-neutral-100 text-neutral-900' : 'bg-pt-sunken text-pt-ink',
        className
      )}
      aria-live="polite"
    >
      {earlierLines.length === 0 && visible.length === 0 && !speaking && <p className={muted}>{emptyText}</p>}
      {earlierLines.map((line, i) => (
        <TranscriptLine key={`e${i}`} text={line} muted />
      ))}
      {visible.map((line) => (
        <p key={line.id} className={cn('mb-1.5', !line.final && muted)}>
          {line.speaker && <span className="mr-1 font-semibold">{line.speaker === 'physio' ? 'Physio:' : 'Patient:'}</span>}
          {line.text || <span className="italic">…</span>}
        </p>
      ))}
      {speaking && (
        <p className={cn('flex items-center gap-1', muted)} aria-label="Listening">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pt-muted [animation-delay:-0.2s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pt-muted [animation-delay:-0.1s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pt-muted" />
        </p>
      )}
    </div>
  )
}

function TranscriptLine({ text, muted }: { text: string; muted?: boolean }) {
  const match = text.match(/^(Physio|Patient):\s*(.*)$/)
  return (
    <p className={cn('mb-1.5', muted && 'text-pt-ink/80')}>
      {match ? (
        <>
          <span className="mr-1 font-semibold">{match[1]}:</span>
          {match[2]}
        </>
      ) : (
        text
      )}
    </p>
  )
}

/** Recording, paused or finishing: the clock, connection, meter, transcript and controls. */
export function RecordingView({
  recorder,
  stream,
  earlier,
  onStop,
  stopLabel = 'Stop and draft the note',
  compact,
}: {
  recorder: ScribeRecorder
  stream: MediaStream | null
  earlier?: string
  onStop: () => void
  stopLabel?: string
  compact?: boolean
}) {
  const { state, mode, elapsed, notice, saveError, fatal } = recorder
  const live = state === 'recording'
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-pt-ink">
          <span className={cn('h-2.5 w-2.5 rounded-full', live ? 'animate-pulse bg-pt-rose-fg' : 'bg-pt-faint')} aria-hidden />
          {state === 'starting' ? 'Starting…' : state === 'paused' ? 'Paused' : state === 'stopping' ? 'Finishing…' : 'Recording'}
          <span className="tabular-nums text-pt-muted">{formatClock(elapsed)}</span>
        </span>
        {mode === 'live' && <span className="rounded-full bg-pt-green-bg px-2 py-0.5 text-xs font-medium text-pt-green-fg">Live</span>}
        {mode === 'connecting' && <span className="rounded-full bg-pt-neutral-bg px-2 py-0.5 text-xs font-medium text-pt-muted">Connecting…</span>}
        {mode === 'backup' && (
          <span className="flex items-center gap-1 rounded-full bg-pt-amber-bg px-2 py-0.5 text-xs font-medium text-pt-amber-fg">
            <WifiOff className="h-3 w-3" aria-hidden /> Backup mode
          </span>
        )}
        <LevelMeter stream={stream} active={live} />
      </div>
      <ScribeTranscript earlier={earlier} lines={recorder.lines} speaking={recorder.speaking && live} className={compact ? 'max-h-48' : undefined} />
      {(fatal || notice || saveError) && (
        <p className={cn('text-xs', fatal || saveError ? 'text-pt-rose-fg' : 'text-pt-muted')}>{fatal ?? saveError ?? notice}</p>
      )}
      <div className="flex gap-2">
        {state === 'paused' ? (
          <Button className={cn(secondaryButtonClass, 'h-11 flex-1 sm:flex-none')} onClick={recorder.resume}>
            <Play className="mr-1.5 h-4 w-4" /> Resume
          </Button>
        ) : (
          <Button className={cn(secondaryButtonClass, 'h-11 flex-1 sm:flex-none')} disabled={state !== 'recording'} onClick={recorder.pause}>
            <Pause className="mr-1.5 h-4 w-4" /> Pause
          </Button>
        )}
        <Button className={cn(primaryButtonClass, 'h-11 flex-[2] sm:flex-none')} disabled={state === 'starting' || state === 'stopping'} onClick={onStop}>
          {state === 'stopping' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Square className="mr-1.5 h-4 w-4" />}
          {stopLabel}
        </Button>
      </div>
    </div>
  )
}

/** The consent line the physio ticks before recording a patient. */
export function ConsentCheck({ checked, onChange, patientFirstName, id }: { checked: boolean; onChange: (checked: boolean) => void; patientFirstName: string; id: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-pt-sunken p-3 text-sm text-pt-ink">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} className="mt-0.5" />
      <span>
        {patientFirstName} agreed to this session being recorded so an AI can draft the note. The audio isn’t kept; only the words are saved, for
        their care team.
      </span>
    </label>
  )
}

export type ScribePanelProps = {
  patientId: Id<'users'>
  patientFirstName: string
  appointmentId?: Id<'appointments'>
  /** The measures already in the note, to show which suggestions are in */
  noteMeasures: ClinicalMeasure[]
  /** A new or regenerated draft for the editor */
  onDraft: (draft: ScribeDraft) => void
  onAddMeasures: (measures: ClinicalMeasure[]) => void
  /** The recording this note is being drafted from (null when there isn't one) */
  onSessionChange: (session: ScribeSession | null) => void
  /** True while recording or drafting: the drawer shouldn't close or save */
  onBusyChange: (busy: boolean) => void
}

export function ScribePanel({ patientId, patientFirstName, appointmentId, noteMeasures, onDraft, onAddMeasures, onSessionChange, onBusyChange }: ScribePanelProps) {
  const access = useQuery(scribeApi.access, {})
  const openSession = useQuery(scribeApi.open, { patientId })
  const start = useMutation(scribeApi.start)
  const discard = useMutation(scribeApi.discard)
  const updateTranscript = useMutation(scribeApi.updateTranscript)
  const generate = useAction(scribeApi.generate)
  const recorder = useScribeRecorder()

  const [sessionId, setSessionId] = useState<ScribeSessionId | null>(null)
  const session = useQuery(scribeApi.session, sessionId ? { scribeSessionId: sessionId } : 'skip')
  const [source, setSource] = useState<'in_person' | 'dictation'>('in_person')
  const [consent, setConsent] = useState(false)
  const [starting, setStarting] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [editText, setEditText] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [mic, setMic] = useState<MediaStream | null>(null)
  const earlierAtStart = useRef('')
  const resumed = useRef(false)
  const appliedDraftAt = useRef<number | null>(null)

  // An unfinished recording or unsigned draft for this patient comes back
  useEffect(() => {
    if (resumed.current || openSession === undefined) return
    resumed.current = true
    if (openSession) setSessionId(openSession._id)
  }, [openSession])

  const current = session ?? null
  useEffect(() => onSessionChange(current), [current, onSessionChange])

  // Each new draft goes into the editor once
  useEffect(() => {
    if (!current?.draft || !current.draftAt || appliedDraftAt.current === current.draftAt) return
    appliedDraftAt.current = current.draftAt
    setAdded(new Set())
    onDraft(current.draft)
  }, [current?.draft, current?.draftAt, onDraft])

  const recording = recorder.state === 'starting' || recorder.state === 'recording' || recorder.state === 'paused' || recorder.state === 'stopping'
  useEffect(() => onBusyChange(recording || drafting || starting), [recording, drafting, starting, onBusyChange])

  // The mic is let go when recording ends
  useEffect(() => {
    if (recorder.state === 'stopped' || recorder.state === 'idle') {
      mic?.getTracks().forEach((t) => t.stop())
      if (mic) setMic(null)
    }
  }, [recorder.state, mic])
  useEffect(() => () => mic?.getTracks().forEach((t) => t.stop()), [mic])

  if (access === undefined || !access.enabled) return null

  const open = current && (current.status === 'recording' || current.status === 'draft') ? current : null
  const sourceOf = open?.source ?? source

  const begin = async () => {
    setStarting(true)
    let stream: MediaStream | null = null
    try {
      stream = await openMicrophone()
      let id = open?._id ?? null
      if (!id) {
        id = (await start({ patientId, source, consentRecorded: source === 'in_person' && consent, appointmentId })).scribeSessionId
        setSessionId(id)
      }
      earlierAtStart.current = open?.transcript ?? ''
      setMic(stream)
      await recorder.start(id, [{ channel: 'room', stream }], open?.audioSeconds ?? 0)
    } catch (error) {
      stream?.getTracks().forEach((t) => t.stop())
      playSound('error')
      toast.error(error instanceof Error && !('data' in error) ? error.message : scribeError(error, 'The scribe couldn’t start. Try again.'))
    } finally {
      setStarting(false)
    }
  }

  const draftNow = async (id = open?._id) => {
    if (!id) return
    setDrafting(true)
    try {
      await generate({ scribeSessionId: id })
      playSound('success')
    } catch (error) {
      playSound('error')
      toast.error(scribeError(error, 'The draft couldn’t be written. Try again.'))
    } finally {
      setDrafting(false)
    }
  }

  const finish = async () => {
    const id = open?._id ?? sessionId
    await recorder.stop()
    recorder.reset()
    await draftNow(id ?? undefined)
  }

  const saveTranscriptAndRedraft = async () => {
    if (!open || editText === null) return
    try {
      await updateTranscript({ scribeSessionId: open._id, transcript: editText })
      setEditText(null)
      await draftNow(open._id)
    } catch (error) {
      toast.error(scribeError(error, 'The transcript couldn’t be saved. Try again.'))
    }
  }

  const throwAway = async () => {
    if (!open) return
    try {
      await discard({ scribeSessionId: open._id })
      setSessionId(null)
      setConfirmDiscard(false)
      setConsent(false)
      toast('Recording discarded')
    } catch (error) {
      toast.error(scribeError(error, 'Couldn’t discard it. Try again.'))
    }
  }

  const addMeasures = (measures: ClinicalMeasure[]) => {
    const fresh = measures.filter((m) => !added.has(m.id))
    if (!fresh.length) return
    onAddMeasures(fresh.map((m) => ({ ...m, id: newMeasureId() })))
    setAdded((prev) => new Set([...prev, ...fresh.map((m) => m.id)]))
  }

  const draft = open?.draft
  const header = (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pt-primary text-pt-on-primary">
        <Mic className="h-4 w-4" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-pt-ink">{SCRIBE_NAME}</p>
      {SCRIBE_PILOT && <span className="rounded-full bg-pt-green-bg px-2 py-0.5 text-xs font-medium text-pt-green-fg">Free during the pilot</span>}
      <InfoTip>
        Records the session and drafts the note for you to check, edit and sign. The audio isn’t kept: only the words are saved, for you and
        the patient’s care team. Names and phone numbers are taken out before anything goes to the AI.
      </InfoTip>
    </div>
  )

  let body: ReactNode
  if (recording) {
    body = <RecordingView recorder={recorder} stream={mic} earlier={earlierAtStart.current} onStop={() => void finish()} />
  } else if (drafting) {
    body = (
      <div className="flex items-center gap-3 rounded-xl bg-pt-sunken p-4 text-sm text-pt-ink">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-pt-muted" aria-hidden />
        <span>
          Writing the draft from {open ? minutesLabel(open.audioSeconds) : 'the recording'}. This takes 15 to 30 seconds…
        </span>
      </div>
    )
  } else if (open) {
    const transcriptLines = open.transcript.split('\n').filter((l) => l.trim())
    const suggestions = draft?.measures ?? []
    const inNote = new Set(noteMeasures.map((m) => JSON.stringify([m.kind, m.key, m.side, m.value, m.result])))
    const pendingSuggestions = suggestions.filter((m) => !added.has(m.id) && !inNote.has(JSON.stringify([m.kind, m.key, m.side, m.value, m.result])))
    body = (
      <div className="space-y-3">
        {draft ? (
          <p className="flex items-start gap-2 rounded-xl bg-pt-amber-bg px-3 py-2.5 text-sm font-medium text-pt-amber-fg">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            AI-generated draft. Review every section before signing.
          </p>
        ) : (
          <p className="text-sm text-pt-ink">
            {transcriptLines.length ? `Recording saved (${minutesLabel(open.audioSeconds)}).` : 'This recording has no words yet.'} Draft the note
            from it, or record more.
          </p>
        )}

        {draft && draft.redFlags.length > 0 && (
          <div className="rounded-xl bg-pt-rose-bg px-3 py-2.5 text-sm text-pt-rose-fg">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4" aria-hidden /> Possible red flags heard
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {draft.redFlags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs">Check these yourself and act on them before the patient leaves.</p>
          </div>
        )}

        {draft && draft.missing.length > 0 && (
          <p className="text-sm text-pt-muted">
            <span className="font-medium text-pt-ink">Not in the recording:</span> {draft.missing.join(', ')}. Add them if you assessed them.
          </p>
        )}

        {draft && suggestions.length > 0 && (
          <div className="rounded-xl border border-pt-line p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-pt-ink">Measures heard ({suggestions.length})</p>
              {pendingSuggestions.length > 1 && (
                <button type="button" onClick={() => addMeasures(pendingSuggestions)} className="text-sm font-semibold text-pt-ink underline-offset-2 hover:underline">
                  Add all
                </button>
              )}
            </div>
            <ul className="mt-2 divide-y divide-pt-line">
              {suggestions.map((m) => {
                const isIn = !pendingSuggestions.includes(m)
                const detail = measureDetail(m)
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 text-sm">
                      <span className="font-medium text-pt-ink">{measureTitle(m)}</span>
                      {detail && <span className="text-pt-muted"> · {detail}</span>}
                      <span className="ml-1.5 font-semibold tabular-nums text-pt-ink">{measureResult(m)}</span>
                    </span>
                    {isIn ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-pt-green-fg">
                        <Check className="h-3.5 w-3.5" aria-hidden /> In the note
                      </span>
                    ) : (
                      <Button className={cn(secondaryButtonClass, 'h-9 shrink-0 px-3')} onClick={() => addMeasures([m])}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
            {draft.droppedMeasures > 0 && (
              <p className="mt-1 text-xs text-pt-muted">
                {draft.droppedMeasures} more {draft.droppedMeasures === 1 ? 'value' : 'values'} heard didn’t fit the measures list; add them yourself if needed.
              </p>
            )}
          </div>
        )}

        {draft && (draft.exercises.length > 0 || draft.followUp || draft.carePlan) && (
          <div className="flex flex-col gap-1.5 text-sm text-pt-muted">
            {draft.exercises.length > 0 && (
              <p className="flex items-start gap-2">
                <Dumbbell className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-medium text-pt-ink">Exercises heard:</span> {draft.exercises.map((e) => (e.dosage ? `${e.name} (${e.dosage})` : e.name)).join('; ')}.
                  You can send them as a home programme after signing.
                </span>
              </p>
            )}
            {draft.carePlan && (
              <p className="flex items-start gap-2">
                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-medium text-pt-ink">Care plan:</span>{' '}
                  {draft.carePlan.action === 'update' ? 'changes to the current plan' : `a new plan with ${draft.carePlan.goals.length} goal${draft.carePlan.goals.length === 1 ? '' : 's'}`},
                  drafted from what you said. You can check and save it after signing.
                </span>
              </p>
            )}
            {draft.followUp && (
              <p className="flex items-start gap-2">
                <CalendarPlus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-medium text-pt-ink">Follow-up:</span> {draft.followUp.text} You can book it after signing.
                </span>
              </p>
            )}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="flex items-center gap-1 text-sm font-semibold text-pt-ink"
            aria-expanded={showTranscript}
          >
            {showTranscript ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Transcript ({minutesLabel(open.audioSeconds)})
          </button>
          {showTranscript &&
            (editText === null ? (
              <div className="mt-2">
                <ScribeTranscript earlier={open.transcript} lines={[]} speaking={false} emptyText="No words were recorded." />
                <button type="button" onClick={() => setEditText(open.transcript)} className="mt-1.5 text-sm font-medium text-pt-ink underline-offset-2 hover:underline">
                  Correct the transcript
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={10} className="rounded-xl text-sm" aria-label="Transcript" />
                <div className="flex gap-2">
                  <Button className={cn(secondaryButtonClass, 'h-10')} onClick={() => setEditText(null)}>
                    Cancel
                  </Button>
                  <Button className={cn(primaryButtonClass, 'h-10')} onClick={() => void saveTranscriptAndRedraft()}>
                    Save and draft again
                  </Button>
                </div>
              </div>
            ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button className={cn(draft ? secondaryButtonClass : primaryButtonClass, 'h-10')} disabled={!transcriptLines.length} onClick={() => void draftNow()}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            {draft ? 'Draft again' : 'Draft the note'}
          </Button>
          <Button className={cn(secondaryButtonClass, 'h-10')} disabled={starting} onClick={() => void begin()}>
            {starting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mic className="mr-1.5 h-4 w-4" />}
            Record more
          </Button>
          {confirmDiscard ? (
            <Button className="h-10 rounded-xl bg-pt-rose-fg px-4 text-pt-surface hover:bg-pt-rose-fg/90" onClick={() => void throwAway()}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Discard recording and draft
            </Button>
          ) : (
            <Button className={cn(secondaryButtonClass, 'h-10')} onClick={() => setConfirmDiscard(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Discard
            </Button>
          )}
        </div>
      </div>
    )
  } else {
    const needsConsent = sourceOf === 'in_person'
    body = (
      <div className="space-y-3">
        <p className="text-sm text-pt-muted">
          Talk as you normally would. The words appear live, and when you stop, the note drafts itself below for you to check and sign.
        </p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What to record">
          {(
            [
              { value: 'in_person', label: 'Record the session' },
              { value: 'dictation', label: 'Dictate my note' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={source === option.value}
              onClick={() => setSource(option.value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition active:scale-95',
                source === option.value ? 'border-pt-primary bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong text-pt-ink hover:bg-pt-hover'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {needsConsent ? (
          <ConsentCheck id="scribe-consent" checked={consent} onChange={setConsent} patientFirstName={patientFirstName} />
        ) : (
          <p className="text-sm text-pt-muted">Talk through the visit in your own words; only your voice is recorded.</p>
        )}
        <Button className={cn(primaryButtonClass, 'h-11 w-full sm:w-auto sm:px-6')} disabled={starting || (needsConsent && !consent)} onClick={() => void begin()}>
          {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
          {needsConsent ? 'Start recording' : 'Start dictating'}
        </Button>
      </div>
    )
  }

  return (
    <section aria-label={SCRIBE_NAME} className="mb-5 rounded-2xl border border-pt-line bg-pt-surface p-4">
      {header}
      {body}
    </section>
  )
}
