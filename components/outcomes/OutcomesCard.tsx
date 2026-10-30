'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { ArrowRight, Copy, HeartPulse, Loader2, Pause, Play, Quote, Send, Star, WhatsApp } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { IconChip, Panel, PhysioDrawer, StatusBadge, primaryButtonClass, softButtonClass } from '@/components/physio/ui'
import type { Id } from '@/convex/_generated/dataModel'
import { MOMENT_LABEL, globalChangeLabel } from '@/lib/outcomes/moments'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { ScoreScale, painWord } from './CheckFlow'
import { FeedbackCardComposer } from './FeedbackCardComposer'
import { PainTrend } from './PainTrend'
import { outcomeRefs } from './refs'

/** "7 → 3" with what it means underneath. `higherIsBetter` for function and goal scores. */
export function ChangeTile({
  label,
  from,
  to,
  higherIsBetter = false,
  unit = 'point',
  className,
}: {
  label: string
  from: number | null
  to: number | null
  higherIsBetter?: boolean
  unit?: string
  className?: string
}) {
  const diff = from !== null && to !== null ? (higherIsBetter ? to - from : from - to) : null
  return (
    <div className={cn('rounded-3xl border border-pt-line bg-pt-surface p-4 sm:p-5', className)}>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-pt-muted">{label}</p>
      <p className="mt-2 flex items-center gap-2 text-[32px] font-semibold leading-none tabular-nums tracking-tight text-pt-ink sm:text-[36px]">
        {from ?? '–'}
        {to !== null && (
          <>
            <ArrowRight className="h-5 w-5 text-pt-faint" />
            {to}
          </>
        )}
      </p>
      <p
        className={cn(
          'mt-2 text-[13px] font-semibold',
          diff === null ? 'text-pt-faint' : diff > 0 ? 'text-pt-green-fg' : diff < 0 ? 'text-pt-rose-fg' : 'text-pt-muted'
        )}
      >
        {diff === null
          ? to === null && from !== null
            ? 'Starting point'
            : 'Not enough answers yet'
          : diff === 0
            ? 'No change'
            : `${Math.abs(diff)} ${Math.abs(diff) === 1 ? unit : `${unit}s`} ${diff > 0 ? 'better' : 'worse'}`}
      </p>
    </div>
  )
}

/** wa.me wants the international number without "+"; Nigerian local numbers start with 0. */
function whatsappDigits(phone: string | null) {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `234${digits.slice(1)}`
  return digits.length >= 10 ? digits : null
}

export function OutcomesCard({
  patientId,
  episodeId,
  patientFirstName,
}: {
  patientId: Id<'users'>
  /** The course of care on screen; the open (or latest) one when left out. */
  episodeId?: Id<'careEpisodes'>
  patientFirstName: string | null
}) {
  const data = useQuery(outcomeRefs.forPatient, { patientId, episodeId })
  const setPaused = useMutation(outcomeRefs.setPaused)
  const [sendOpen, setSendOpen] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)
  const [cardFor, setCardFor] = useState<Id<'outcomeChecks'> | null>(null)
  const first = patientFirstName || 'The patient'

  if (data === undefined) return <div className="h-64 animate-pulse rounded-3xl bg-pt-sunken" />
  if (!data || !data.episode) return null
  const { episode, pain, readOnly } = data
  const canAct = !readOnly && episode.status === 'active'
  const hasAnything = pain !== null || data.recent.length > 0

  async function togglePause() {
    try {
      const res = await setPaused({ patientId, paused: !episode.paused })
      toast.success(res.paused ? 'Automatic checks paused for this patient.' : 'Automatic checks are back on.')
    } catch {
      toast.error('Couldn’t change that. Try again.')
    }
  }

  return (
    <Panel
      title="Outcomes"
      info={
        <>
          Rehabify asks the patient how they are before treatment starts, around each session, weekly in between and at discharge, by email
          and phone notification (no sign-in). Their answers can’t be edited. Scores you type in are marked as yours. A drop of 2 points or more
          is a change patients notice (the MCID).
        </>
      }
      actions={
        canAct && (
          <Button variant="ghost" size="sm" className="h-8 rounded-lg text-pt-muted" onClick={() => void togglePause()}>
            {episode.paused ? <Play className="mr-1.5 h-3.5 w-3.5" /> : <Pause className="mr-1.5 h-3.5 w-3.5" />}
            {episode.paused ? 'Resume' : 'Pause'}
          </Button>
        )
      }
    >
      <div className="space-y-4 px-5 pb-5 pt-3 sm:px-6">
        {hasAnything ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <ChangeTile label="Pain (0–10)" from={pain?.baseline ?? null} to={pain?.latest ?? null} />
              {data.goal && data.goal.first !== null ? (
                <ChangeTile label={data.goal.activity} from={data.goal.first} to={data.goal.latest} higherIsBetter />
              ) : (
                <ChangeTile
                  label="Daily activities (0–10)"
                  from={data.function?.first ?? null}
                  to={data.function && data.function.count > 1 ? data.function.latest : null}
                  higherIsBetter
                />
              )}
            </div>

            {data.weekly.length > 1 && (
              <div className="rounded-3xl border border-pt-line p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-pt-ink">Pain by week</p>
                  {pain?.meaningful && <StatusBadge tone="green">Meaningful change</StatusBadge>}
                </div>
                <PainTrend points={data.weekly} />
              </div>
            )}

            {data.sessions.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-pt-muted">Before → after recent sessions</p>
                <div className="flex flex-wrap gap-2">
                  {data.sessions.map((s) => (
                    <span key={s.appointmentId} className="inline-flex items-center gap-1.5 rounded-full bg-pt-sunken px-3 py-1 text-xs font-semibold tabular-nums text-pt-ink">
                      {format(s.at, 'd MMM')}
                      <span className="font-normal text-pt-faint">·</span>
                      {s.before}
                      <ArrowRight className="h-3 w-3 text-pt-faint" />
                      {s.after}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm leading-relaxed text-pt-muted">
            {episode.status === 'active'
              ? `No scores yet. Rehabify asks ${first} where they’re starting from before the next confirmed session, or send a check-in now.`
              : 'No scores were collected for this course of care.'}
          </p>
        )}

        {data.final && (
          <div className="rounded-3xl bg-pt-sunken/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-pt-ink">Final scores</p>
              <div className="flex items-center gap-2">
                {data.final.rating !== null && (
                  <span className="inline-flex items-center gap-0.5" aria-label={`Rated ${data.final.rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={cn('h-3.5 w-3.5', n <= data.final!.rating! ? 'text-pt-ink' : 'text-pt-line-strong')} />
                    ))}
                  </span>
                )}
                {data.final.canShare && <StatusBadge tone="green">Can be shared</StatusBadge>}
              </div>
            </div>
            {globalChangeLabel(data.final.globalChange) && (
              <p className="mt-1 text-[13px] text-pt-muted">Compared with the start: {globalChangeLabel(data.final.globalChange)}</p>
            )}
            {data.final.feedback && (
              <p className="mt-3 flex gap-2 text-[15px] leading-relaxed text-pt-ink">
                <Quote className="mt-1 h-3.5 w-3.5 shrink-0 text-pt-faint" />
                {data.final.feedback}
              </p>
            )}
            {data.final.canShare && !readOnly && (
              <Button variant="outline" className="mt-4 h-10 w-full rounded-xl border-pt-line-strong bg-pt-surface text-pt-ink hover:bg-pt-hover" onClick={() => setCardFor(data.final!.checkId)}>
                Create feedback card
              </Button>
            )}
          </div>
        )}

        <div className="flex items-start gap-3 rounded-2xl bg-pt-green-bg/60 px-4 py-3">
          <IconChip icon={HeartPulse} tone="green" className="h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4" />
          <p className="pt-1 text-[13px] leading-relaxed text-pt-ink">
            {data.pending
              ? `Waiting on ${first}: ${MOMENT_LABEL[data.pending.moment].toLowerCase()} sent ${formatDistanceToNow(data.pending.sentAt, { addSuffix: true })}${data.pending.via.length ? ` by ${data.pending.via.map((v) => (v === 'app' ? 'phone notification' : v === 'whatsapp' ? 'WhatsApp' : v)).join(' and ')}` : ''}.`
              : episode.status !== 'active'
                ? data.final
                  ? `${first} sent their final scores ${formatDistanceToNow(data.final.at, { addSuffix: true })}.`
                  : data.dischargeAsked
                    ? `${first} was asked for final scores at discharge.`
                    : 'Care is complete.'
                : episode.paused
                  ? `Automatic checks are paused for ${first}.`
                  : data.next?.kind === 'before_visit'
                    ? `Rehabify asks ${first} about pain an hour before the next session (${format(data.next.at + 3_600_000, 'EEE d MMM, HH:mm')}) and again after it.`
                    : data.next
                      ? `Next automatic check-in: ${format(data.next.at, 'EEEE d MMM')}.`
                      : 'Automatic checks are on.'}
          </p>
        </div>

        {canAct && (
          <div className="grid grid-cols-2 gap-2">
            <Button className={cn(primaryButtonClass, 'h-11')} onClick={() => setSendOpen(true)} disabled={Boolean(data.pending && Date.now() - data.pending.sentAt < 86_400_000)}>
              <Send className="mr-1.5 h-4 w-4" />
              Send check-in
            </Button>
            <Button className={cn(softButtonClass, 'h-11')} onClick={() => setRecordOpen(true)}>
              Record scores
            </Button>
          </div>
        )}
      </div>

      <SendCheckDrawer open={sendOpen} onOpenChange={setSendOpen} patientId={patientId} firstName={first} />
      <FeedbackCardComposer checkId={cardFor} onClose={() => setCardFor(null)} />
      <RecordScoresDrawer open={recordOpen} onOpenChange={setRecordOpen} patientId={patientId} firstName={first} />
    </Panel>
  )
}

function SendCheckDrawer({
  open,
  onOpenChange,
  patientId,
  firstName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: Id<'users'>
  firstName: string
}) {
  const sendNow = useMutation(outcomeRefs.sendNow)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<Awaited<ReturnType<typeof sendNow>> | null>(null)

  async function send() {
    setBusy(true)
    try {
      setSent(await sendNow({ patientId }))
      playSound('send')
    } catch (err) {
      playSound('error')
      const data = (err as { data?: unknown })?.data
      toast.error(typeof data === 'string' ? data : 'Couldn’t send the check-in. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const wa = sent ? whatsappDigits(sent.phone) : null
  const message = sent
    ? `Hi ${sent.firstName ?? ''}, a quick question from your physio: how are you today? It takes under a minute, no sign-in: ${sent.url}`.replace('Hi ,', 'Hi,')
    : ''

  return (
    <PhysioDrawer
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setSent(null)
      }}
      title={sent ? 'Check-in sent' : `Send ${firstName} a check-in`}
      description={sent ? MOMENT_LABEL[sent.moment] : 'Pain and daily activities, one tap each. No sign-in.'}
      footer={
        sent ? (
          <Button className={cn(primaryButtonClass, 'h-11 w-full')} onClick={() => onOpenChange(false)}>
            Done
          </Button>
        ) : (
          <Button className={cn(primaryButtonClass, 'h-11 w-full')} onClick={() => void send()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send now'}
          </Button>
        )
      }
    >
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-pt-muted">
            {sent.via.length
              ? `Sent by ${sent.via.map((v) => (v === 'app' ? 'phone notification' : v === 'whatsapp' ? 'WhatsApp' : v)).join(' and ')}.`
              : 'Saved.'}{' '}
            You can also pass the link on yourself. It works once and closes in a few days.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {wa && (
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(softButtonClass, 'inline-flex h-11 items-center justify-center text-sm font-medium')}
              >
                <WhatsApp className="mr-1.5 h-4 w-4" />
                WhatsApp
              </a>
            )}
            <Button
              className={cn(softButtonClass, 'h-11', !wa && 'col-span-2')}
              onClick={() => {
                void navigator.clipboard.writeText(sent.url).then(() => toast.success('Link copied'))
              }}
            >
              <Copy className="mr-1.5 h-4 w-4" />
              Copy link
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm leading-relaxed text-pt-muted">
          <p>
            Rehabify sends {firstName} a link by email and phone notification. If there’s no starting point yet, it asks for one, with what
            they most want to get back to.
          </p>
          <p>Automatic checks still go before and after sessions. Use this between sessions or after a change in treatment.</p>
        </div>
      )}
    </PhysioDrawer>
  )
}

const WHEN = [
  { value: 'pre_session', label: 'Start of today’s session' },
  { value: 'post_session', label: 'End of today’s session' },
  { value: 'check_in', label: 'Another time' },
] as const

function RecordScoresDrawer({
  open,
  onOpenChange,
  patientId,
  firstName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: Id<'users'>
  firstName: string
}) {
  const record = useMutation(outcomeRefs.recordScores)
  const [when, setWhen] = useState<(typeof WHEN)[number]['value']>('pre_session')
  const [pain, setPain] = useState<number | null>(null)
  const [fn, setFn] = useState<number | null>(null)
  const [withFunction, setWithFunction] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (pain === null) return
    setBusy(true)
    try {
      await record({ patientId, when, pain, functionScore: withFunction && fn !== null ? fn : undefined })
      playSound('success')
      toast.success('Scores saved')
      setPain(null)
      setFn(null)
      onOpenChange(false)
    } catch (err) {
      playSound('error')
      const data = (err as { data?: unknown })?.data
      toast.error(typeof data === 'string' ? data : 'Couldn’t save the scores. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PhysioDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Record scores"
      description={`What ${firstName} tells you in the session. Marked as entered by you.`}
      footer={
        <Button className={cn(primaryButtonClass, 'h-11 w-full')} onClick={() => void save()} disabled={pain === null || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-2">
          {WHEN.map((w) => (
            <button
              key={w.value}
              type="button"
              onClick={() => setWhen(w.value)}
              className={cn(
                'rounded-2xl px-4 py-3 text-left text-sm font-medium transition',
                when === w.value ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-ink hover:bg-pt-hover'
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-pt-ink">Pain (0–10)</p>
          <ScoreScale value={pain} onChange={setPain} low="No pain" high="Worst imaginable" word={painWord} />
        </div>
        {withFunction ? (
          <div>
            <p className="mb-1 text-sm font-semibold text-pt-ink">Daily activities (0–10)</p>
            <ScoreScale value={fn} onChange={setFn} low="Can’t do them" high="No trouble at all" />
          </div>
        ) : (
          <button type="button" className="text-sm font-medium text-pt-ink underline underline-offset-4" onClick={() => setWithFunction(true)}>
            Add daily activities score
          </button>
        )}
      </div>
    </PhysioDrawer>
  )
}
