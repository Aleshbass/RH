'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, ArrowRight, Check, Frown, HeartPulse, Loader2, Meh, Smile } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { programError } from '@/components/exercise-programs/errors'
import { IconChip, InfoTip, cardClass, fieldClass, primaryButtonClass } from '@/components/patient/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Mood = 'great' | 'good' | 'okay' | 'low'
type Exercises = 'all' | 'some' | 'none'

const MOODS: { value: Mood; label: string; icon: typeof Smile }[] = [
  { value: 'great', label: 'Great', icon: Smile },
  { value: 'good', label: 'Good', icon: Smile },
  { value: 'okay', label: 'Okay', icon: Meh },
  { value: 'low', label: 'Low', icon: Frown },
]
const EXERCISES: { value: Exercises; label: string }[] = [
  { value: 'all', label: 'All of them' },
  { value: 'some', label: 'Some' },
  { value: 'none', label: 'Not today' },
]

/** Mild, moderate and severe pain in the patient tints. */
function painClass(score: number, selected: boolean) {
  if (!selected) return 'border-pt-line bg-pt-surface text-pt-muted hover:bg-pt-hover hover:text-pt-ink'
  if (score >= 7) return 'border-transparent bg-pt-rose-fg text-pt-surface'
  if (score >= 4) return 'border-transparent bg-pt-amber-fg text-pt-surface'
  return 'border-transparent bg-pt-green-fg text-pt-surface'
}

function painWord(score: number) {
  if (score === 0) return 'No pain'
  if (score <= 3) return 'Mild'
  if (score <= 6) return 'Moderate'
  return 'Severe'
}

const chipClass = (selected: boolean) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-all active:scale-95',
    selected
      ? 'border-pt-primary bg-pt-primary font-medium text-pt-on-primary'
      : 'border-pt-line bg-pt-surface text-pt-ink hover:bg-pt-hover'
  )

function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; icon?: typeof Smile }[]
  value: T | null
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={chipClass(value === option.value)}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function FieldLabel({ children, info }: { children: ReactNode; info?: ReactNode }) {
  return (
    <p className="flex items-center gap-1 text-sm font-semibold text-pt-ink">
      {children}
      {info && <InfoTip>{info}</InfoTip>}
    </p>
  )
}

/** A quick daily check-in the patient's physiotherapist sees on their dashboard. */
export function PatientCheckInCard() {
  const data = useQuery(api.physioCare.getMyCheckIns, {})
  const submit = useMutation(api.physioCare.submitCheckIn)
  const [pain, setPain] = useState<number | null>(null)
  const [fn, setFn] = useState(5)
  const [mood, setMood] = useState<Mood | null>(null)
  const [exercises, setExercises] = useState<Exercises | null>(null)
  const [note, setNote] = useState('')
  const [concern, setConcern] = useState(false)
  const [saving, setSaving] = useState(false)
  const [justSent, setJustSent] = useState(false)

  if (!data) return null
  const last = data.recent[0]
  const physio = data.physioName ?? 'your physiotherapist'

  if (data.checkedInToday || justSent) {
    return (
      <section data-tour="check-in" className="flex h-full items-center gap-4 rounded-3xl bg-pt-green-bg p-5 sm:p-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pt-surface text-pt-green-fg">
          <Check className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-pt-ink">Thanks for checking in today</p>
          <p className="text-sm text-pt-muted">
            {last ? `Pain ${last.painScore}/10 · ` : ''}
            {physio} can see how you’re doing. Check in again tomorrow.
          </p>
        </div>
      </section>
    )
  }

  const send = async () => {
    if (pain === null) return toast.error('Choose a pain score from 0 to 10.')
    if (!exercises) return toast.error('Tell us whether you did your exercises.')
    if (concern && !note.trim()) return toast.error(`Tell ${physio} what’s worrying you in the note.`)
    setSaving(true)
    try {
      const result = await submit({
        painScore: pain,
        functionScore: fn,
        mood: mood ?? undefined,
        exercisesDone: exercises,
        note: note.trim() || undefined,
        concern: concern || undefined,
      })
      playSound('success')
      setJustSent(true)
      if (result.flagged) {
        toast.message(`We’ve let ${physio} know`, { description: 'If your pain is severe or sudden, contact them or seek medical help.' })
      }
    } catch (error) {
      toast.error(programError(error, 'Couldn’t send your check-in. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section data-tour="check-in" className={cn(cardClass, 'h-full space-y-6 p-5 sm:p-6')}>
      <div className="flex items-start gap-3">
        <IconChip icon={HeartPulse} tone="rose" />
        <div className="min-w-0">
          <h2 className="flex items-center gap-1 text-base font-semibold tracking-tight text-pt-ink">
            How are you today?
            <InfoTip>
              A 20-second daily check-in. {physio === 'your physiotherapist' ? 'Your physio' : physio} sees your answers and can adjust your
              plan between visits.
            </InfoTip>
          </h2>
          <p className="text-[13px] text-pt-muted">
            A quick check-in for {physio}.
            {last ? ` Last time: pain ${last.painScore}/10, ${formatDistanceToNow(last.createdAt, { addSuffix: true })}.` : ''}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <FieldLabel info="0 means no pain at all and 10 is the worst pain you can imagine. Pick how it feels right now, not on your worst day.">
            Pain right now
          </FieldLabel>
          {pain !== null && <span className="text-sm font-semibold text-pt-muted">{painWord(pain)}</span>}
        </div>
        <div className="mt-2 grid grid-cols-11 gap-1" role="radiogroup" aria-label="Pain score from 0 to 10">
          {Array.from({ length: 11 }, (_, score) => (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={pain === score}
              aria-label={`${score}, ${painWord(score).toLowerCase()}`}
              onClick={() => setPain(score)}
              className={cn('h-10 rounded-xl border text-sm font-semibold tabular-nums transition-all active:scale-90', painClass(score, pain === score))}
            >
              {score}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-pt-faint">
          <span>No pain</span>
          <span>Worst imaginable</span>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <FieldLabel info="Think of everyday things like walking, stairs, work and sleep. 10 means you can do everything as normal; 0 means you can hardly do anything.">
            How much can you do day to day?
          </FieldLabel>
          <span className="rounded-full bg-pt-accent-soft px-2.5 py-0.5 text-sm font-semibold tabular-nums text-pt-accent-ink">{fn}/10</span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={fn}
          onChange={(e) => setFn(Number(e.target.value))}
          className="mt-3 h-2 w-full cursor-pointer accent-[#00cd0f]"
          aria-label="Daily activities, 0 nothing to 10 everything as normal"
        />
        <div className="flex justify-between text-[11px] text-pt-faint">
          <span>Very little</span>
          <span>Everything as normal</span>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel>Mood</FieldLabel>
          <Chips options={MOODS} value={mood} onChange={setMood} label="Mood" />
        </div>
        <div className="space-y-2">
          <FieldLabel info="The home exercises your physio gave you. Be honest: it helps them pitch your programme right.">
            Did your exercises?
          </FieldLabel>
          <Chips options={EXERCISES} value={exercises} onChange={setExercises} label="Exercises done" />
        </div>
      </div>

      <div className="space-y-3">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className={cn(fieldClass, 'resize-none rounded-2xl')}
          placeholder={`Anything ${physio === 'your physiotherapist' ? 'they' : physio.split(' ')[0]} should know? (optional)`}
          aria-label="Note for your physiotherapist"
        />
        <button
          type="button"
          role="checkbox"
          aria-checked={concern}
          onClick={() => setConcern((c) => !c)}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-all active:scale-95',
            concern
              ? 'border-transparent bg-pt-rose-bg font-medium text-pt-rose-fg'
              : 'border-pt-line bg-pt-surface text-pt-ink hover:bg-pt-rose-bg hover:text-pt-rose-fg'
          )}
        >
          <AlertTriangle className="h-4 w-4" />
          I&apos;m worried about something
        </button>
      </div>

      <Button onClick={send} disabled={saving} className={cn(primaryButtonClass, 'h-11 w-full sm:w-auto sm:px-6')}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Send check-in
      </Button>
    </section>
  )
}

/** Shown when Rehabify asks how a finished course of treatment went. */
export function PatientFollowUpBanner() {
  const followUps = useQuery(api.physioCare.getMyFollowUps, {})
  if (!followUps || followUps.length === 0) return null
  const next = followUps[0]
  return (
    <Link
      href={`/dashboard/patient/follow-up/${next.episodeId}`}
      className="group flex items-center gap-4 rounded-3xl bg-pt-primary p-5 text-pt-on-primary transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/60"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">How are you getting on?</p>
        <p className="text-sm opacity-75">
          It’s been a little while since you finished treatment with {next.physioName}. Tell us how it went. It takes a minute.
        </p>
      </div>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pt-accent text-[#06210a]">
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}
