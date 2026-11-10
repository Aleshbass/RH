'use client'

/**
 * The AI scribe during a video call (physios only, inside CallRoom). The physio's microphone and
 * the patient's audio are transcribed separately, so every line is labelled Physio or Patient.
 * The panel can be hidden while it keeps recording. Leaving the call stops and saves it first;
 * afterwards the patient's note opens so the AI can draft it (app/video-call/[callId]/page.tsx).
 */
import { useEffect, useState, type MutableRefObject } from 'react'
import { useCallStateHooks } from '@stream-io/video-react-sdk'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Loader2, Mic, Pause, Play, Square, WifiOff, X } from '@/components/icons'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { Id } from '@/convex/_generated/dataModel'
import { formatClock, LevelMeter, ScribeTranscript } from '@/components/physio/notes/scribe/ScribePanel'
import { SCRIBE_NAME, SCRIBE_PILOT, scribeApi, scribeError, type ScribeSessionId } from '@/components/physio/notes/scribe/scribeApi'
import { useScribeRecorder, type RecorderState } from '@/components/physio/notes/scribe/useScribeRecorder'

export type CallScribeConfig = {
  patientId: Id<'users'>
  patientFirstName: string
  appointmentId?: Id<'appointments'>
  /** Something was recorded: after the call, open the note to draft it */
  onRecorded: () => void
  /** Opens the patient's note now (the call carries on in a small window) */
  onOpenNote?: () => void
}

const pill = 'rounded-full px-2 py-0.5 text-xs font-medium'
const darkButton = 'flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition disabled:opacity-50'

export function CallScribePanel({
  config,
  open,
  onClose,
  stopRef,
  onStateChange,
}: {
  config: CallScribeConfig
  open: boolean
  onClose: () => void
  /** CallRoom calls this before leaving, so the last words are saved */
  stopRef: MutableRefObject<(() => Promise<void>) | null>
  onStateChange: (state: RecorderState) => void
}) {
  const { useMicrophoneState, useRemoteParticipants } = useCallStateHooks()
  const { mediaStream } = useMicrophoneState()
  const remotes = useRemoteParticipants()
  const patientStream = remotes[0]?.audioStream ?? null
  const myStream = mediaStream ?? null

  const access = useQuery(scribeApi.access, {})
  const start = useMutation(scribeApi.start)
  const recorder = useScribeRecorder()
  const { setInputStream, stop } = recorder
  const [consent, setConsent] = useState(false)
  const [sessionId, setSessionId] = useState<ScribeSessionId | null>(null)
  const [starting, setStarting] = useState(false)

  // Muting, unmuting and the patient rejoining change the audio; keep transcribing what's there
  useEffect(() => setInputStream('physio', myStream), [myStream, setInputStream])
  useEffect(() => setInputStream('patient', patientStream), [patientStream, setInputStream])
  useEffect(() => {
    stopRef.current = stop
    return () => {
      stopRef.current = null
    }
  }, [stop, stopRef])
  useEffect(() => onStateChange(recorder.state), [recorder.state, onStateChange])

  if (!access?.enabled) return null

  const recording = recorder.state === 'starting' || recorder.state === 'recording' || recorder.state === 'paused' || recorder.state === 'stopping'

  const begin = async () => {
    setStarting(true)
    try {
      const id =
        sessionId ??
        (await start({ patientId: config.patientId, source: 'video_call', consentRecorded: consent, appointmentId: config.appointmentId })).scribeSessionId
      setSessionId(id)
      config.onRecorded()
      await recorder.start(
        id,
        [
          { channel: 'physio', speaker: 'physio', stream: myStream },
          { channel: 'patient', speaker: 'patient', stream: patientStream },
        ],
        recorder.elapsed
      )
    } catch (error) {
      toast.error(scribeError(error, 'The scribe couldn’t start. Try again.'))
    } finally {
      setStarting(false)
    }
  }

  return (
    <aside
      aria-label={SCRIBE_NAME}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex max-h-[75dvh] flex-col rounded-t-[28px] bg-white pb-[env(safe-area-inset-bottom)] text-neutral-900 shadow-[0_-20px_60px_-24px_rgba(0,0,0,0.3)]',
        'lg:static lg:z-auto lg:max-h-none lg:w-[360px] lg:shrink-0 lg:overflow-hidden lg:rounded-[28px] lg:pb-0 lg:shadow-[0_20px_60px_-24px_rgba(0,0,0,0.2)] lg:ring-1 lg:ring-black/5',
        !open && 'hidden'
      )}
    >
      <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Mic className="h-4 w-4" aria-hidden /> {SCRIBE_NAME}
          {SCRIBE_PILOT && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Free during the pilot</span>}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={recording ? 'Hide the scribe (it keeps recording)' : 'Close the scribe'}
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {recording ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className={cn('h-2.5 w-2.5 rounded-full', recorder.state === 'recording' ? 'animate-pulse bg-rose-600' : 'bg-neutral-400')} aria-hidden />
                {recorder.state === 'paused' ? 'Paused' : recorder.state === 'stopping' ? 'Saving…' : 'Recording'}
                <span className="tabular-nums text-neutral-500">{formatClock(recorder.elapsed)}</span>
              </span>
              {recorder.mode === 'live' && <span className={cn(pill, 'bg-emerald-50 text-emerald-700')}>Live</span>}
              {recorder.mode === 'connecting' && <span className={cn(pill, 'bg-neutral-100 text-neutral-600')}>Connecting…</span>}
              {recorder.mode === 'backup' && (
                <span className={cn(pill, 'flex items-center gap-1 bg-amber-50 text-amber-700')}>
                  <WifiOff className="h-3 w-3" aria-hidden /> Backup mode
                </span>
              )}
              <LevelMeter stream={myStream} active={recorder.state === 'recording'} tone="call" />
            </div>
            {!myStream && <p className="text-xs text-neutral-500">You’re muted, so only {config.patientFirstName} is being transcribed.</p>}
            <ScribeTranscript lines={recorder.lines} speaking={recorder.speaking && recorder.state === 'recording'} tone="call" className="max-h-none" />
            {(recorder.fatal || recorder.saveError || recorder.notice) && (
              <p className={cn('text-xs', recorder.fatal || recorder.saveError ? 'text-rose-600' : 'text-neutral-500')}>
                {recorder.fatal ?? recorder.saveError ?? recorder.notice}
              </p>
            )}
          </>
        ) : sessionId ? (
          <div className="space-y-2 text-sm">
            <p className="font-semibold">Recording saved ({formatClock(recorder.elapsed)}).</p>
            <p className="text-neutral-600">When you end the call, {config.patientFirstName}’s note opens so the AI can draft it for you to check and sign.</p>
            {recorder.fatal && <p className="text-xs text-rose-600">{recorder.fatal}</p>}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-neutral-600">
              Transcribes you and {config.patientFirstName} separately as you talk. After the call the AI drafts the note; you check and sign it. The
              audio isn’t kept.
            </p>
            <label htmlFor="call-scribe-consent" className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-neutral-100 p-3">
              <Checkbox id="call-scribe-consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
              <span>{config.patientFirstName} agreed to this call being recorded so an AI can draft the note.</span>
            </label>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-black/5 px-5 py-3">
        {recording ? (
          <>
            {recorder.state === 'paused' ? (
              <button type="button" onClick={recorder.resume} className={cn(darkButton, 'flex-1 bg-neutral-100 text-neutral-900 hover:bg-neutral-200')}>
                <Play className="h-4 w-4" /> Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={recorder.pause}
                disabled={recorder.state !== 'recording'}
                className={cn(darkButton, 'flex-1 bg-neutral-100 text-neutral-900 hover:bg-neutral-200')}
              >
                <Pause className="h-4 w-4" /> Pause
              </button>
            )}
            <button
              type="button"
              onClick={() => void recorder.stop()}
              disabled={recorder.state === 'starting' || recorder.state === 'stopping'}
              className={cn(darkButton, 'flex-[2] bg-neutral-900 text-white hover:bg-neutral-800')}
            >
              {recorder.state === 'stopping' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} Stop
            </button>
          </>
        ) : sessionId ? (
          <>
            <button type="button" onClick={() => void begin()} disabled={starting} className={cn(darkButton, 'flex-1 bg-neutral-100 text-neutral-900 hover:bg-neutral-200')}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />} Record more
            </button>
            {config.onOpenNote && (
              <button type="button" onClick={config.onOpenNote} className={cn(darkButton, 'flex-1 bg-neutral-900 text-white hover:bg-neutral-800')}>
                Draft the note now
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => void begin()}
            disabled={!consent || starting}
            className={cn(darkButton, 'flex-1 bg-neutral-900 text-white hover:bg-neutral-800')}
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />} Start recording
          </button>
        )}
      </div>
    </aside>
  )
}
