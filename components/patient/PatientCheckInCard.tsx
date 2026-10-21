'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, ArrowRight, Check, HeartPulse, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { programError } from '@/components/exercise-programs/errors'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Mood = 'great' | 'good' | 'okay' | 'low'
type Exercises = 'all' | 'some' | 'none'

const MOODS: { value: Mood; label: string }[] = [
  { value: 'great', label: 'Great' },
  { value: 'good', label: 'Good' },
  { value: 'okay', label: 'Okay' },
  { value: 'low', label: 'Low' },
]
const EXERCISES: { value: Exercises; label: string }[] = [
  { value: 'all', label: 'All of them' },
  { value: 'some', label: 'Some' },
  { value: 'none', label: 'Not today' },
]

function painColour(score: number, selected: boolean) {
  if (!selected) return 'bg-white text-neutral-600 hover:bg-rh-canvas border-black/[0.08]'
  if (score >= 7) return 'bg-[#be3a5f] text-white border-[#be3a5f]'
  if (score >= 4) return 'bg-[#e8a54f] text-white border-[#e8a54f]'
  return 'bg-[#005b57] text-white border-[#005b57]'
}

function Chips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-full border px-3.5 py-1.5 text-sm transition-all active:scale-95',
            value === option.value ? 'border-[#005b57] bg-[#005b57] font-medium text-white' : 'border-black/[0.08] bg-white text-neutral-700 hover:bg-[#e6f0ef]'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
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
      <section className="flex items-center gap-4 rounded-3xl bg-[#d4fae8] p-5 text-[#003d38]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#005b57]">
          <Check className="h-5 w-5" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Thanks for checking in today</p>
          <p className="text-sm text-[#003d38]/75">
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
    <section className="space-y-5 rounded-3xl border border-black/[0.04] bg-white p-5 shadow-[0_10px_30px_-14px_rgba(0,46,44,0.18)] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff0f4] text-[#be3a5f]">
          <HeartPulse className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-[#002e2c]">How are you today?</h2>
          <p className="text-sm text-neutral-500">
            A quick check-in for {physio}.{last ? ` Last time: pain ${last.painScore}/10, ${formatDistanceToNow(last.createdAt, { addSuffix: true })}.` : ''}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-[#002e2c]">Pain right now</p>
        <p className="text-xs text-neutral-500">0 is no pain, 10 is the worst you can imagine</p>
        <div className="mt-2 grid grid-cols-11 gap-1" role="radiogroup" aria-label="Pain score">
          {Array.from({ length: 11 }, (_, score) => (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={pain === score}
              onClick={() => setPain(score)}
              className={cn('h-10 rounded-xl border text-sm font-semibold tabular-nums transition-all active:scale-90', painColour(score, pain === score))}
            >
              {score}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-[#002e2c]">How much can you do day to day?</p>
          <span className="text-sm font-semibold tabular-nums text-[#005b57]">{fn}/10</span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={fn}
          onChange={(e) => setFn(Number(e.target.value))}
          className="mt-2 w-full accent-[#005b57]"
          aria-label="Daily activities, 0 nothing to 10 everything as normal"
        />
        <div className="flex justify-between text-[11px] text-neutral-400">
          <span>Very little</span>
          <span>Everything as normal</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium text-[#002e2c]">Mood</p>
          <Chips options={MOODS} value={mood} onChange={setMood} label="Mood" />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-[#002e2c]">Did your exercises?</p>
          <Chips options={EXERCISES} value={exercises} onChange={setExercises} label="Exercises done" />
        </div>
      </div>

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="resize-none rounded-2xl"
        placeholder={`Anything ${physio === 'your physiotherapist' ? 'they' : physio.split(' ')[0]} should know? (optional)`}
        aria-label="Note for your physiotherapist"
      />
      <button
        type="button"
        role="checkbox"
        aria-checked={concern}
        onClick={() => setConcern((c) => !c)}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-all active:scale-95',
          concern ? 'border-[#be3a5f] bg-[#fff0f4] font-medium text-[#be3a5f]' : 'border-black/[0.08] bg-white text-neutral-700 hover:bg-[#fff0f4]'
        )}
      >
        <AlertTriangle className="h-4 w-4" />
        I&apos;m worried about something
      </button>

      <Button onClick={send} disabled={saving} className="h-11 w-full rounded-2xl bg-[#005b57] text-white hover:bg-[#00443e] active:scale-[0.98] sm:w-auto">
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
      className="group flex items-center gap-4 rounded-3xl bg-[#005b57] p-5 text-white shadow-[0_18px_40px_-16px_rgba(0,46,44,0.4)] transition-transform hover:-translate-y-0.5"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">How are you getting on?</p>
        <p className="text-sm text-white/75">It’s been a little while since you finished treatment with {next.physioName}. Tell us how it went.</p>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
    </Link>
  )
}
