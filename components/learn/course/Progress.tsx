'use client'

/**
 * The way to the certificate: a small progress card on the course page, the final assessment
 * (one question at a time) and the certificate itself, both opened in the course drawer.
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ArrowLeft, ArrowRight, Award, Check, Circle, Loader2, RotateCcw, X } from '@/components/icons'
import { errorMessage } from '@/components/partners/portal/shared'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { AssessmentResult } from '@/convex/learn'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { displayFont, fieldClass } from '../shared'
import { CertificateActions, CertificatePreview, useCertificate } from './Certificate'
import { celebrate, eyebrowClass, type CourseOk } from './shared'

type Progress = CourseOk['progress']
type Open = (panel: { kind: 'assessment' } | { kind: 'certificate' }) => void

function attemptsLeft(progress: Progress) {
  return progress.assessment ? Math.max(0, progress.assessment.maxAttempts - progress.assessment.attemptsUsed) : 0
}

function assessmentLine(progress: Progress) {
  const a = progress.assessment
  if (progress.passed) return `Passed${a?.bestScore != null ? ` · ${a.bestScore}%` : ''}`
  if (!a) return 'Opens in the final week'
  if (a.status === 'closed') return 'Closed'
  const left = attemptsLeft(progress)
  if (left === 0) return 'No attempts left. Contact the team.'
  return `${a.passMark}% to pass · ${left} ${left === 1 ? 'attempt' : 'attempts'} left`
}

function Step({ done, title, detail }: { done: boolean; title: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          done ? 'bg-rh-ink text-rh-lime' : 'text-rh-ink/25'
        )}
      >
        {done ? <Check className="h-3 w-3" /> : <Circle className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className={cn('block text-sm font-semibold', done ? 'text-rh-ink' : 'text-rh-ink/80')}>{title}</span>
        <span className="block text-xs text-rh-ink/50">{detail}</span>
      </span>
    </li>
  )
}

/** Course page card: steps to the certificate and the one thing to do next. */
export function ProgressCard({ progress, open }: { progress: Progress; open: Open }) {
  if (progress.certificate) {
    return (
      <button
        type="button"
        onClick={() => open({ kind: 'certificate' })}
        className="group flex w-full items-center gap-4 rounded-[1.75rem] bg-rh-ink p-5 text-left text-white transition hover:-translate-y-0.5 sm:p-6"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rh-lime text-rh-ink">
          <Award className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[20px] leading-tight', displayFont)}>You&apos;re certified</span>
          <span className="mt-0.5 block text-sm text-white/65">View, download or share your certificate</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-white/50 transition group-hover:translate-x-0.5" />
      </button>
    )
  }

  const steps = [
    ...(progress.minSessions > 0
      ? [{ done: progress.attended >= progress.minSessions, title: `Attend ${progress.minSessions} live sessions`, detail: `${Math.min(progress.attended, progress.minSessions)} of ${progress.minSessions} so far` }]
      : []),
    { done: progress.passed, title: 'Pass the final assessment', detail: assessmentLine(progress) },
    { done: false, title: 'Get your certificate', detail: progress.canClaim ? 'Ready to claim' : 'Unlocks when the steps above are done' },
  ]
  const done = steps.filter((s) => s.done).length
  const canTake = Boolean(progress.assessment?.status === 'open' && !progress.passed && attemptsLeft(progress) > 0)

  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-soft sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className={eyebrowClass}>Your certificate</h2>
        <span className="text-xs font-semibold text-rh-ink/50">
          {done} of {steps.length}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-rh-sand">
        <div className="h-full rounded-full bg-rh-lime transition-[width] duration-700" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-4 space-y-3">
        {steps.map((s) => (
          <Step key={s.title} {...s} />
        ))}
      </ul>
      {(progress.canClaim || canTake) && (
        <button
          type="button"
          onClick={() => open({ kind: progress.canClaim ? 'certificate' : 'assessment' })}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-rh-ink text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98]"
        >
          {progress.canClaim ? 'Claim your certificate' : progress.assessment?.attemptsUsed ? 'Try the assessment again' : 'Take the final assessment'}
          <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Final assessment
// ─────────────────────────────────────────────────────────────────────────────

type MyAssessment = {
  passMark: number
  maxAttempts: number
  attemptsUsed: number
  passed: boolean
  questions: { id: string; prompt: string; options: string[] }[]
}

const LETTERS = 'ABCDEF'

function draftKey(cohortId: string) {
  return `rh-learn-assessment-${cohortId}`
}

function Result({ result, onRetry, onCertificate }: { result: AssessmentResult; onRetry: () => void; onCertificate: () => void }) {
  return (
    <div className="animate-in fade-in duration-300">
      <div className={cn('rounded-[1.75rem] p-6 text-center', result.passed ? 'bg-rh-ink text-white' : 'bg-white')}>
        <p className={cn('text-[56px] leading-none tracking-tight', displayFont)}>{result.scorePct}%</p>
        <p className={cn('mt-2 text-[17px] font-semibold', result.passed ? 'text-rh-lime' : 'text-rh-ink')}>
          {result.passed ? 'You passed' : 'Not this time'}
        </p>
        <p className={cn('mt-1 text-sm', result.passed ? 'text-white/65' : 'text-rh-ink/60')}>
          {result.correct} of {result.total} correct · {result.passMark}% needed
        </p>
        {result.passed ? (
          <button
            type="button"
            onClick={onCertificate}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rh-lime text-[15px] font-semibold text-rh-ink transition hover:brightness-95"
          >
            Get your certificate <ArrowRight className="h-4 w-4" />
          </button>
        ) : result.attemptsLeft > 0 ? (
          <>
            <p className="mt-4 text-sm text-rh-ink/65">
              You have {result.attemptsLeft} {result.attemptsLeft === 1 ? 'attempt' : 'attempts'} left. Revisit the week materials, then try again.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rh-ink text-[15px] font-semibold text-white transition hover:bg-black"
            >
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
          </>
        ) : (
          <p className="mt-4 text-sm text-rh-ink/65">You&apos;ve used all your attempts. Your tutors will be in touch about next steps.</p>
        )}
      </div>

      {result.review && (
        <section className="mt-6">
          <h3 className={eyebrowClass}>Your answers</h3>
          <ol className="mt-3 space-y-3">
            {result.review.map((q, i) => {
              const right = q.chosen === q.answer
              return (
                <li key={i} className="rounded-2xl bg-white p-4">
                  <p className="flex gap-2 text-[15px] font-semibold leading-6 text-rh-ink">
                    <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', right ? 'bg-rh-lime text-rh-ink' : 'bg-rh-rose text-rh-ink')}>
                      {right ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    </span>
                    {q.prompt}
                  </p>
                  {!right && <p className="mt-2 pl-7 text-sm text-rh-ink/55 line-through">{q.options[q.chosen]}</p>}
                  <p className="mt-1 pl-7 text-sm font-medium text-rh-ink">{q.options[q.answer]}</p>
                  {q.explanation && <p className="mt-2 pl-7 text-sm leading-6 text-rh-ink/65">{q.explanation}</p>}
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </div>
  )
}

export function AssessmentPanel({ cohortId, openCertificate }: { cohortId: Id<'learnCohorts'>; openCertificate: () => void }) {
  const assessment = useQuery(api.learn.getMyAssessment, { cohortId }) as MyAssessment | null | undefined
  const submit = useMutation(api.learn.submitAssessment)
  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AssessmentResult | null>(null)
  const total = assessment?.questions.length ?? 0

  // Answers survive closing the drawer (on this device) until they're submitted
  useEffect(() => {
    if (!total) return
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey(cohortId)) ?? 'null') as (number | null)[] | null
      setAnswers(saved && saved.length === total ? saved : Array(total).fill(null))
    } catch {
      setAnswers(Array(total).fill(null))
    }
  }, [cohortId, total])
  const choose = (option: number) => {
    const next = answers.map((a, i) => (i === index ? option : a))
    setAnswers(next)
    try {
      localStorage.setItem(draftKey(cohortId), JSON.stringify(next))
    } catch {
      // Private browsing: answers stay in memory only
    }
  }

  const answered = useMemo(() => answers.filter((a) => a !== null).length, [answers])

  if (result) {
    return (
      <Result
        result={result}
        onCertificate={openCertificate}
        onRetry={() => {
          setResult(null)
          setStarted(false)
          setIndex(0)
          setAnswers(Array(total).fill(null))
        }}
      />
    )
  }
  if (assessment === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-white" />
  if (assessment === null) {
    return <p className="rounded-2xl bg-white p-4 text-sm text-rh-ink/65">The assessment isn&apos;t open right now. Your tutors will let you know when it is.</p>
  }
  const left = assessment.maxAttempts - assessment.attemptsUsed
  if (assessment.passed || left <= 0) {
    return (
      <p className="rounded-2xl bg-white p-4 text-sm text-rh-ink/65">
        {assessment.passed ? "You've passed the assessment." : "You've used all your attempts. Your tutors will be in touch."}
      </p>
    )
  }

  if (!started) {
    return (
      <div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: total, label: total === 1 ? 'question' : 'questions' },
            { value: `${assessment.passMark}%`, label: 'to pass' },
            { value: left, label: left === 1 ? 'attempt left' : 'attempts left' },
          ].map((f) => (
            <div key={f.label} className="rounded-2xl bg-white p-4 text-center">
              <p className={cn('text-[26px] leading-none text-rh-ink', displayFont)}>{f.value}</p>
              <p className="mt-1.5 text-xs text-rh-ink/55">{f.label}</p>
            </div>
          ))}
        </div>
        <ul className="mt-5 space-y-2 text-sm leading-6 text-rh-ink/70">
          <li>There&apos;s no timer. Take it when you have a quiet moment.</li>
          <li>Your answers are kept on this device until you submit, so you can close it and come back.</li>
          <li>You see your score straight away.</li>
        </ul>
        <button
          type="button"
          onClick={() => {
            setStarted(true)
            const firstOpen = answers.findIndex((a) => a === null)
            setIndex(firstOpen === -1 ? 0 : firstOpen)
          }}
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rh-ink text-[15px] font-semibold text-white transition hover:bg-black active:scale-[0.98]"
        >
          {answered > 0 ? `Continue (${answered} of ${total} answered)` : 'Start'} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    )
  }

  const question = assessment.questions[index]
  const last = index === total - 1
  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = (await submit({ cohortId, answers: answers as number[] })) as AssessmentResult
      try {
        localStorage.removeItem(draftKey(cohortId))
      } catch {
        // ignore
      }
      setResult(next)
      playSound(next.passed ? 'approve' : 'reject')
    } catch (err) {
      setError(errorMessage(err, "Your answers didn't send. Check your connection and try again."))
      playSound('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between text-xs font-semibold text-rh-ink/50">
        <span>
          Question {index + 1} of {total}
        </span>
        <span>{answered} answered</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-rh-sand">
        <div className="h-full rounded-full bg-rh-ink transition-[width] duration-300" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <div key={question.id} className="animate-in fade-in slide-in-from-right-2 duration-200">
        <p className={cn('mt-6 text-[21px] leading-snug text-rh-ink', displayFont)}>{question.prompt}</p>
        <div className="mt-5 space-y-2" role="radiogroup" aria-label={`Question ${index + 1}`}>
          {question.options.map((option, i) => {
            const selected = answers[index] === i
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(i)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl p-4 text-left text-[15px] leading-6 transition active:scale-[0.99]',
                  selected ? 'bg-rh-ink text-white' : 'bg-white text-rh-ink hover:ring-1 hover:ring-inset hover:ring-rh-ink/15'
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    selected ? 'bg-rh-lime text-rh-ink' : 'bg-rh-cream text-rh-ink/60'
                  )}
                >
                  {LETTERS[i]}
                </span>
                {option}
              </button>
            )
          })}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      <div className="sticky bottom-0 -mx-5 mt-auto flex gap-2 bg-rh-cream/95 px-5 pb-1 pt-5 backdrop-blur sm:-mx-7 sm:px-7">
        <button
          type="button"
          onClick={() => (index === 0 ? setStarted(false) : setIndex(index - 1))}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-rh-ink ring-1 ring-inset ring-rh-ink/10 hover:ring-rh-ink/25"
          aria-label="Previous question"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        {last ? (
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || answered < total}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-rh-ink text-[15px] font-semibold text-white transition hover:bg-black disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {answered < total ? `Answer all ${total} to submit` : 'Submit answers'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIndex(index + 1)}
            disabled={answers[index] === null}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-rh-ink text-[15px] font-semibold text-white transition hover:bg-black disabled:opacity-40"
          >
            Next <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Certificate
// ─────────────────────────────────────────────────────────────────────────────

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function CertificatePanel({ course }: { course: CourseOk }) {
  const { progress } = course
  const claim = useMutation(api.learn.claimCertificate)
  const [name, setName] = useState(progress.suggestedName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewName = useDebounced(name.trim() || progress.suggestedName, 250)

  const cert = progress.certificate
  const data = useMemo(
    () => ({
      ...progress.certificateCohort,
      name: cert?.name ?? previewName,
      code: cert?.code ?? 'PREVIEW',
      issuedAt: cert?.issuedAt ?? Date.now(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cert?.code, cert?.name, cert?.issuedAt, previewName, progress.certificateCohort.cohortLabel, progress.certificateCohort.signatoryName]
  )
  const showPreview = Boolean(cert || progress.canClaim)
  const { svg, src, failed } = useCertificate(showPreview ? data : null)

  if (!showPreview) {
    return (
      <p className="rounded-2xl bg-white p-4 text-sm leading-6 text-rh-ink/65">
        Your certificate unlocks once you&apos;ve {progress.minSessions > 0 ? `attended ${progress.minSessions} live sessions and ` : ''}passed the final
        assessment.
      </p>
    )
  }

  return (
    <div>
      <CertificatePreview src={src} failed={failed} />
      {cert ? (
        <div className="mt-5">
          <CertificateActions svg={svg} data={data} />
        </div>
      ) : (
        <form
          className="mt-5"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            try {
              await claim({ cohortId: course.cohort.id, name })
              celebrate()
              playSound('certified')
            } catch (err) {
              setError(errorMessage(err, 'Something went wrong. Please try again.'))
              playSound('error')
            } finally {
              setBusy(false)
            }
          }}
        >
          <label htmlFor="certificate-name" className="text-sm font-semibold text-rh-ink">
            Your name, as it should appear
          </label>
          <input
            id="certificate-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            className={cn(fieldClass, 'mt-2')}
            autoComplete="name"
          />
          <p className="mt-2 text-xs leading-5 text-rh-ink/55">
            Add a title if you use one, e.g. &ldquo;Dr.&rdquo; or &ldquo;PT&rdquo;. Check the spelling: the preview above updates as you type, and the name
            can&apos;t be changed by you after claiming.
          </p>
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={busy || name.trim().length < 3}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rh-ink text-[15px] font-semibold text-white transition hover:bg-black disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
            Claim my certificate
          </button>
        </form>
      )}
    </div>
  )
}
