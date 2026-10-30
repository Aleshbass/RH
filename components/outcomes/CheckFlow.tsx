'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Loader2, Star } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { fieldClass, primaryButtonClass } from '@/components/patient/ui'
import { GLOBAL_CHANGE, SHARE_CONSENT_TEXT, type OutcomeMoment, type OutcomeQuestion } from '@/lib/outcomes/moments'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import type { CheckAnswers } from './refs'

/**
 * The questions of one outcome check, one per screen, big tap targets, no typing unless the
 * patient wants to. Used by /o/<token> (no sign-in) and the patient's Progress page.
 */

const GOAL_IDEAS = ['Walking without pain', 'Climbing stairs', 'Sleeping through the night', 'Carrying my child', 'Going back to work', 'Sport or exercise']

export function painWord(n: number) {
  if (n === 0) return 'No pain'
  if (n <= 3) return 'Mild'
  if (n <= 6) return 'Moderate'
  return 'Severe'
}

/** 0–10 in two rows of big buttons, with the chosen number shown large above. */
export function ScoreScale({
  value,
  onChange,
  low,
  high,
  word,
}: {
  value: number | null
  onChange: (n: number) => void
  low: string
  high: string
  word?: (n: number) => string
}) {
  return (
    <div>
      <div className="mb-5 flex h-[72px] items-end justify-center gap-3" aria-live="polite">
        {value === null ? (
          <p className="pb-3 text-sm text-pt-faint">Tap a number</p>
        ) : (
          <>
            <span className="text-[64px] font-semibold leading-none tabular-nums tracking-tight text-pt-ink">{value}</span>
            {word && <span className="pb-2 text-sm font-medium text-pt-muted">{word(value)}</span>}
          </>
        )}
      </div>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={cn(
              'h-12 rounded-2xl text-base font-semibold tabular-nums transition active:scale-95',
              value === n ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-ink hover:bg-pt-hover'
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-xs text-pt-muted">
        <span>0 · {low}</span>
        <span>10 · {high}</span>
      </div>
    </div>
  )
}

type Step = { key: OutcomeQuestion | 'goal_now'; title: string; hint?: string; optional?: boolean }

function painTitle(moment: OutcomeMoment) {
  switch (moment) {
    case 'pre_session':
      return 'How is your pain right now, before your session?'
    case 'post_session':
      return 'How is your pain now, after your session?'
    case 'discharge':
      return 'How is your pain these days?'
    default:
      return 'How is your pain right now?'
  }
}

export function CheckFlow({
  moment,
  questions,
  physioName,
  goalActivity,
  onSubmit,
  onDone,
}: {
  moment: OutcomeMoment
  questions: OutcomeQuestion[]
  physioName: string
  /** At discharge: the activity they named at the start, asked about again. */
  goalActivity: string | null
  onSubmit: (answers: CheckAnswers) => Promise<{ baseline: number | null; pain: number }>
  onDone: (result: { baseline: number | null; pain: number }) => void
}) {
  const steps = useMemo<Step[]>(() => {
    const out: Step[] = []
    for (const q of questions) {
      if (q === 'pain') out.push({ key: 'pain', title: painTitle(moment), hint: 'Think about the area you’re being treated for.' })
      if (q === 'function') out.push({ key: 'function', title: 'How well are you managing your daily activities?', hint: 'Work, chores, getting around.' })
      if (q === 'goal' && moment === 'intake') {
        out.push({ key: 'goal', title: 'What would you most like to get back to?', hint: 'We’ll ask how it’s going as you get better.', optional: true })
      }
      if (q === 'goal' && moment === 'discharge' && goalActivity) {
        out.push({ key: 'goal_now', title: `How well can you manage “${goalActivity}” now?` })
      }
      if (q === 'global') out.push({ key: 'global', title: 'Compared with when you started, how are you now?' })
      if (q === 'rating') out.push({ key: 'rating', title: `How was your care with ${physioName}?` })
      if (q === 'feedback') {
        out.push({ key: 'feedback', title: `Anything you’d like to say about ${physioName}?`, hint: 'Optional. Your physio will read it.', optional: true })
      }
    }
    return out
  }, [questions, moment, physioName, goalActivity])

  const [index, setIndex] = useState(0)
  const [pain, setPain] = useState<number | null>(null)
  const [fn, setFn] = useState<number | null>(null)
  const [goal, setGoal] = useState('')
  const [goalScore, setGoalScore] = useState<number | null>(null)
  const [global, setGlobal] = useState<number | null>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const step = steps[index]
  const last = index === steps.length - 1
  const answered =
    step.key === 'pain'
      ? pain !== null
      : step.key === 'function'
        ? fn !== null
        : step.key === 'goal_now'
          ? goalScore !== null
          : step.key === 'global'
            ? global !== null
            : step.key === 'rating'
              ? rating !== null
              : true

  async function next() {
    if (!last) {
      setIndex((i) => i + 1)
      return
    }
    if (pain === null) return
    setBusy(true)
    setError(null)
    try {
      const result = await onSubmit({
        pain,
        functionScore: fn ?? undefined,
        goalActivity: goal.trim() || undefined,
        goalScore: goalScore ?? undefined,
        globalChange: global ?? undefined,
        rating: rating ?? undefined,
        feedback: feedback.trim() || undefined,
        shareConsent: feedback.trim() ? consent : undefined,
      })
      playSound('success')
      onDone(result)
    } catch (err) {
      playSound('error')
      const data = (err as { data?: unknown })?.data
      setError(typeof data === 'string' ? data : 'Couldn’t send that. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {steps.length > 1 && (
        <div className="mb-6 flex gap-1.5" aria-label={`Question ${index + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <span key={s.key} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= index ? 'bg-pt-primary' : 'bg-pt-sunken')} />
          ))}
        </div>
      )}

      <h1 className="text-[22px] font-semibold leading-snug tracking-tight text-pt-ink sm:text-2xl">{step.title}</h1>
      {step.hint && <p className="mt-1.5 text-sm text-pt-muted">{step.hint}</p>}

      <div className="mt-6">
        {step.key === 'pain' && <ScoreScale value={pain} onChange={setPain} low="No pain" high="Worst imaginable" word={painWord} />}
        {step.key === 'function' && <ScoreScale value={fn} onChange={setFn} low="Can’t do them" high="No trouble at all" />}
        {step.key === 'goal_now' && <ScoreScale value={goalScore} onChange={setGoalScore} low="Can’t do it" high="As well as before" />}

        {step.key === 'goal' && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {GOAL_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setGoal(idea)}
                  className={cn(
                    'rounded-full px-3.5 py-2 text-sm font-medium transition active:scale-95',
                    goal === idea ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-ink hover:bg-pt-hover'
                  )}
                >
                  {idea}
                </button>
              ))}
            </div>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value.slice(0, 120))}
              placeholder="Or write your own"
              className={cn(fieldClass, 'h-12 w-full border px-4 text-[15px]')}
            />
            {goal.trim() && (
              <div className="rounded-2xl bg-pt-sunken/60 p-4">
                <p className="mb-3 text-sm font-medium text-pt-ink">How well can you do it now?</p>
                <ScoreScale value={goalScore} onChange={setGoalScore} low="Can’t do it" high="As well as before" />
              </div>
            )}
          </div>
        )}

        {step.key === 'global' && (
          <div className="space-y-2">
            {GLOBAL_CHANGE.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGlobal(g.value)}
                className={cn(
                  'flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left text-[15px] font-medium transition active:scale-[0.99]',
                  global === g.value ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-ink hover:bg-pt-hover'
                )}
              >
                {g.label}
                {global === g.value && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        )}

        {step.key === 'rating' && (
          <div className="flex justify-center gap-2 py-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} out of 5`}
                className="rounded-2xl p-2 transition active:scale-90"
              >
                <Star className={cn('h-10 w-10', rating !== null && n <= rating ? 'text-pt-ink' : 'text-pt-line-strong')} />
              </button>
            ))}
          </div>
        )}

        {step.key === 'feedback' && (
          <div className="space-y-4">
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value.slice(0, 600))}
              rows={4}
              placeholder="What changed for you? What did they do well?"
              className={cn(fieldClass, 'w-full resize-none border p-4 text-[15px] leading-relaxed')}
            />
            {feedback.trim() && (
              <button
                type="button"
                onClick={() => setConsent((c) => !c)}
                aria-pressed={consent}
                className="flex w-full items-start gap-3 rounded-2xl bg-pt-sunken/60 p-4 text-left"
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                    consent ? 'border-pt-primary bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong bg-pt-surface'
                  )}
                >
                  {consent && <Check className="h-3 w-3" />}
                </span>
                <span className="text-[13px] leading-relaxed text-pt-muted">{SHARE_CONSENT_TEXT}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-4 rounded-xl bg-pt-rose-bg px-4 py-3 text-sm text-pt-rose-fg">{error}</p>}

      <div className="mt-8 flex items-center gap-3">
        {index > 0 && (
          <Button type="button" variant="ghost" className="h-12 rounded-xl px-4 text-pt-muted" onClick={() => setIndex((i) => i - 1)} disabled={busy}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
        )}
        <Button type="button" className={cn(primaryButtonClass, 'h-12 flex-1 text-[15px]')} onClick={() => void next()} disabled={!answered || busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : last ? (
            'Send'
          ) : step.optional && !answeredOptional(step.key, goal, feedback) ? (
            'Skip'
          ) : (
            <>
              Next
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function answeredOptional(key: Step['key'], goal: string, feedback: string) {
  if (key === 'goal') return Boolean(goal.trim())
  if (key === 'feedback') return Boolean(feedback.trim())
  return true
}

/** The thank-you: where they started and where they are, when there's a start to compare with. */
export function CheckDone({ firstName, result, physioName }: { firstName: string | null; result: { baseline: number | null; pain: number }; physioName: string }) {
  const better = result.baseline !== null && result.baseline > result.pain
  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pt-accent text-[#06210a]">
        <Check className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-pt-ink">Thank you{firstName ? `, ${firstName}` : ''}</h1>
      {result.baseline !== null ? (
        <div className="mx-auto mt-6 max-w-xs rounded-3xl bg-pt-sunken/60 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">Pain (0–10)</p>
          <p className="mt-1 flex items-center justify-center gap-3 text-[40px] font-semibold leading-none tabular-nums text-pt-ink">
            {result.baseline}
            <ArrowRight className="h-6 w-6 text-pt-faint" />
            {result.pain}
          </p>
          <p className="mt-2 text-sm font-medium text-pt-muted">
            {better ? `${result.baseline - result.pain} ${result.baseline - result.pain === 1 ? 'point' : 'points'} better than when you started` : 'Since you started'}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-pt-muted">That’s your starting point. You’ll see your progress from here.</p>
      )}
      <p className="mt-6 text-sm text-pt-muted">{physioName} will see your answers.</p>
    </div>
  )
}
