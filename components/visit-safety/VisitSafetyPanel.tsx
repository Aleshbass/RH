'use client'

/**
 * The controls for a home visit under way, shared by the appointment drawer's card and the
 * safety bar on every page: check in with the patient's door code, ask for more time, leave
 * safely, and the help button.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation } from 'convex/react'
import { CheckCircle2, Clock, DoorOpen, KeyRound, LogOut, MapPin, ShieldAlert, ShieldCheck, TriangleAlert } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { lagosTime } from '@/convex/helpers/lagosTime'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui'
import { HoldPill } from './HoldPill'
import { currentPosition, safetyApi, type SafetyVisit, type SkipReason } from './safetyApi'

const SKIP_OPTIONS: { value: SkipReason; label: string }[] = [
  { value: 'no_code', label: 'The patient couldn’t find the code' },
  { value: 'family_answered', label: 'A family member let me in' },
  { value: 'code_wrong', label: 'The code didn’t work' },
  { value: 'other', label: 'Something else' },
]

function errorText(error: unknown, fallback: string) {
  const data = (error as { data?: unknown })?.data
  if (typeof data === 'string' && data) return data
  return fallback
}

/** "I've arrived": the patient's 4-digit code, or start without it and say why. */
export function ArriveForm({ visit }: { visit: SafetyVisit }) {
  const arrive = useMutation(safetyApi.arrive)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [skip, setSkip] = useState(false)
  const [reason, setReason] = useState<SkipReason | null>(null)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const first = visit.patientFirstName
  const locked = visit.codeAttemptsLeft === 0

  const submit = async (withCode: boolean) => {
    setBusy(true)
    setMessage(null)
    try {
      const pos = await currentPosition(5000)
      const result = await arrive(
        withCode ? { visitId: visit._id, code, ...pos } : { visitId: visit._id, skipReason: reason ?? 'other', skipNote: note.trim() || undefined, ...pos }
      )
      if (result.ok) {
        playSound('success')
        toast.success(withCode ? `Checked in. ${first} can see it’s you.` : 'Checked in without the code. The care team can see why.')
      } else {
        playSound('error')
        setMessage(result.message)
        setCode('')
        if (result.attemptsLeft === 0) setSkip(true)
      }
    } catch (error) {
      playSound('error')
      toast.error(errorText(error, 'That didn’t work. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  if (skip || locked) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-pt-muted">Why are you going in without {first}’s code? The care team sees this.</p>
        <div className="grid gap-2">
          {SKIP_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setReason(option.value)}
              className={cn(
                'rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors',
                reason === option.value ? 'border-pt-ink bg-pt-sunken font-semibold text-pt-ink' : 'border-pt-line text-pt-ink hover:bg-pt-hover'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {reason && (
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 300))}
            placeholder={reason === 'other' ? 'Tell us briefly what happened' : 'Anything to add (optional)'}
            className="min-h-[72px] rounded-xl border-pt-line bg-pt-surface text-sm"
          />
        )}
        <div className="flex gap-2">
          {!locked && (
            <Button variant="ghost" className="h-11 rounded-xl text-pt-muted" onClick={() => setSkip(false)} disabled={busy}>
              Back to the code
            </Button>
          )}
          <Button
            className={cn(primaryButtonClass, 'h-11 flex-1')}
            disabled={busy || !reason || (reason === 'other' && note.trim().length < 3)}
            onClick={() => void submit(false)}
          >
            <DoorOpen className="mr-2 h-4 w-4" />
            Check in without the code
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm text-pt-muted" htmlFor={`door-code-${visit._id}`}>
        At the door, ask {first} for their 4-digit code. They have it on their phone, with your photo.
      </label>
      <div className="flex gap-2">
        <input
          id={`door-code-${visit._id}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && code.length === 4 && !busy) void submit(true)
          }}
          placeholder="• • • •"
          aria-label="Door code"
          className="h-12 w-36 rounded-xl border border-pt-line bg-pt-surface text-center font-mono text-2xl tracking-[0.4em] text-pt-ink outline-none placeholder:text-pt-faint focus:border-pt-ink"
        />
        <Button className={cn(primaryButtonClass, 'h-12 flex-1')} disabled={busy || code.length !== 4} onClick={() => void submit(true)}>
          <KeyRound className="mr-2 h-4 w-4" />
          I’ve arrived
        </Button>
      </div>
      {message && <p className="text-sm font-medium text-pt-rose-fg" role="alert">{message}</p>}
      <button type="button" onClick={() => setSkip(true)} className="text-sm font-medium text-pt-muted underline-offset-2 hover:text-pt-ink hover:underline">
        No code? Check in without it
      </button>
    </div>
  )
}

/** The help button: press and hold, then the care team gets the alert with your location. */
export function HelpPill({ visitId, className, compact = false }: { visitId?: string; className?: string; compact?: boolean }) {
  const sendHelp = useMutation(safetyApi.sendHelp)
  const helpLocation = useMutation(safetyApi.helpLocation)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    try {
      // Don't wait for the phone's location: send now, add the location when it comes
      const quick = await currentPosition(1500)
      const { alertId } = await sendHelp({ ...(visitId ? { visitId } : {}), ...quick })
      toast.success('Help alert sent. The care team will call you now.', { duration: 8000 })
      if (quick.lat === undefined) {
        const later = await currentPosition(15_000)
        if (later.lat !== undefined && later.lng !== undefined) await helpLocation({ alertId, lat: later.lat, lng: later.lng, accuracy: later.accuracy })
      }
    } catch (error) {
      toast.error(errorText(error, 'The alert didn’t go. Call the care team or 112 now.'), { duration: 12000 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <HoldPill
      label={compact ? 'Help' : 'Hold for help'}
      holdingLabel={compact ? 'Hold…' : 'Keep holding…'}
      icon={ShieldAlert}
      tone="danger"
      busy={busy}
      onConfirm={() => void send()}
      className={className}
    />
  )
}

/** What's happening on the visit and what to do next. */
export function VisitSafetyPanel({ visit }: { visit: SafetyVisit }) {
  const moreTime = useMutation(safetyApi.moreTime)
  const leave = useMutation(safetyApi.leave)
  const imSafe = useMutation(safetyApi.imSafe)
  const [busy, setBusy] = useState<string | null>(null)
  const first = visit.patientFirstName
  const checking = visit.check !== 'ok'

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key)
    try {
      await action()
      playSound('success')
      toast.success(done)
    } catch (error) {
      playSound('error')
      toast.error(errorText(error, 'That didn’t work. Please try again.'))
    } finally {
      setBusy(null)
    }
  }

  if (visit.stage === 'left') {
    return (
      <p className="flex items-center gap-2 text-sm text-pt-muted">
        <CheckCircle2 className="h-4 w-4 text-pt-green-fg" />
        Left safely at {visit.leftAt ? lagosTime(visit.leftAt) : '—'}.
      </p>
    )
  }

  const helpSent = visit.help && visit.help.status !== 'resolved'

  return (
    <div className="space-y-4">
      {helpSent && <HelpSentNote alertId={visit.help!._id} safe={Boolean(visit.help!.physioSafeAt)} />}

      {checking && !helpSent && (
        <div className="space-y-3 rounded-2xl bg-pt-amber-bg p-4 text-pt-amber-fg">
          <p className="flex items-start gap-2 text-sm font-semibold">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Are you OK? This visit was due to end at {lagosTime(visit.expectedEndAt)}.
            {visit.check === 'escalated' ? ' The care team has been told and will call you.' : ' Answer so the care team doesn’t have to call.'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              className={cn(primaryButtonClass, 'h-11')}
              disabled={busy !== null}
              onClick={() => void run('safe-left', () => imSafe({ visitId: visit._id, then: 'left' }), 'Thanks. Visit closed.')}
            >
              I’m safe, I’ve left
            </Button>
            <Button
              className={cn(secondaryButtonClass, 'h-11')}
              disabled={busy !== null}
              onClick={() => void run('safe-more', () => imSafe({ visitId: visit._id, then: 'more_time' }), 'Thanks. We’ll check again in 30 minutes.')}
            >
              I’m safe, still here
            </Button>
          </div>
        </div>
      )}

      {visit.stage === 'on_the_way' ? (
        <>
          <p className="flex items-center gap-2 text-sm text-pt-ink">
            <MapPin className="h-4 w-4 text-pt-muted" />
            On the way since {lagosTime(visit.onTheWayAt)}. {first} has your photo and their code.
          </p>
          <ArriveForm visit={visit} />
        </>
      ) : (
        <>
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2 font-medium text-pt-ink">
              <ShieldCheck className="h-4 w-4 text-pt-green-fg" />
              Checked in at {visit.arrivedAt ? lagosTime(visit.arrivedAt) : '—'}
              {visit.doorCheck === 'code' ? ' with the door code' : ' without the code'}
            </p>
            <p className="flex items-center gap-2 text-pt-muted">
              <Clock className="h-4 w-4" />
              We’ll check on you if you haven’t left by {lagosTime(visit.expectedEndAt + 20 * 60_000)}.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              className={cn(secondaryButtonClass, 'h-11')}
              disabled={busy !== null || !visit.canExtend}
              onClick={() => void run('more', () => moreTime({ visitId: visit._id }), 'Added 30 minutes.')}
            >
              <Clock className="mr-2 h-4 w-4" />
              Need more time
            </Button>
            <Button
              className={cn(primaryButtonClass, 'h-11')}
              disabled={busy !== null}
              onClick={() =>
                void run(
                  'leave',
                  async () => leave({ visitId: visit._id, ...(await currentPosition(4000)) }),
                  'Left safely. Remember to mark the visit done.'
                )
              }
            >
              <LogOut className="mr-2 h-4 w-4" />
              Left safely
            </Button>
          </div>
        </>
      )}

      {!helpSent && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-pt-line p-3">
          <p className="text-xs text-pt-muted">Feel unsafe? Hold the button. The care team gets your location and calls you.</p>
          <HelpPill visitId={visit._id} className="shrink-0" />
        </div>
      )}
    </div>
  )
}

/** After the help button: what happens now, and "I'm safe" once it's over. */
export function HelpSentNote({ alertId, safe }: { alertId: string; safe: boolean }) {
  const imSafe = useMutation(safetyApi.imSafe)
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-3 rounded-2xl bg-pt-rose-bg p-4 text-pt-rose-fg">
      <p className="flex items-start gap-2 text-sm font-semibold">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        {safe
          ? 'You told us you’re safe. The care team will still call to check before closing the alert.'
          : 'Help alert sent. The care team has your location and will call you now. In danger? Call 112.'}
      </p>
      {!safe && (
        <HoldPill
          label="Hold if you’re safe now"
          tone="soft"
          busy={busy}
          icon={ShieldCheck}
          onConfirm={async () => {
            setBusy(true)
            try {
              await imSafe({ alertId })
              toast.success('Thanks. The care team will still call to check.')
            } catch {
              toast.error('That didn’t go. Please try again.')
            } finally {
              setBusy(false)
            }
          }}
          className="w-full"
        />
      )}
    </div>
  )
}
