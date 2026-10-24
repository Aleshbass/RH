'use client'

/**
 * Admin, Course tab: the cohort's final assessment (questions, pass mark, what the certificate
 * needs) and each paid physio's attendance, score and certificate.
 */

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Award, ClipboardCheck, ExternalLink, Loader2, Pencil, Plus, Trash2, Users } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { adminAssessment, adminLearnerProgress } from '@/convex/learn'
import { useMutationUntyped, useQueryUntyped, type QueryResult } from '@/lib/convexUntyped'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog, EmptyState, inputClass, Panel, primaryButtonClass, softButtonClass, StatusBadge } from '@/components/admin/ui'
import { Callout, errorMessage, hintClass, labelClass, LoadingBlock, textareaClass } from '@/components/admin/partners/shared'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { AdminDrawer, Field } from './drawer'

// The generated api types sit at TypeScript's depth limit, so this file reads the Learn
// functions untyped; every result is cast to the type of the Convex function it came from.
const learnApi = (api as unknown as { learn: Record<string, unknown> }).learn

type Assessment = NonNullable<QueryResult<typeof adminAssessment>>
type ProgressData = QueryResult<typeof adminLearnerProgress>
type Learner = ProgressData['learners'][number]
type Status = 'draft' | 'open' | 'closed'
type Question = { id?: string; prompt: string; options: string[]; answer: number; explanation: string }
type Draft = {
  status: Status
  passMark: number
  maxAttempts: number
  minSessions: number
  signatoryName: string
  signatoryTitle: string
  questions: Question[]
}

const STATUS: Record<Status, { label: string; tone: 'neutral' | 'green' | 'amber'; hint: string }> = {
  draft: { label: 'Draft', tone: 'neutral', hint: 'Hidden from physios while you write it.' },
  open: { label: 'Open', tone: 'green', hint: 'Physios can take it now.' },
  closed: { label: 'Closed', tone: 'amber', hint: 'No new attempts. Scores and certificates stay.' },
}

const EMPTY_QUESTION: Question = { prompt: '', options: ['', '', '', ''], answer: 0, explanation: '' }

function draftFrom(assessment: Assessment | null): Draft {
  return assessment
    ? { ...assessment, questions: assessment.questions.map((q) => ({ ...q, options: [...q.options] })) }
    : { status: 'draft', passMark: 70, maxAttempts: 3, minSessions: 0, signatoryName: '', signatoryTitle: '', questions: [] }
}

/**
 * Pasted questions, one block each:
 *   1. Which test…?
 *   a) Option
 *   *b) Correct option
 * A line starting "Why:" becomes the explanation.
 */
function parseQuestions(text: string): Question[] {
  const out: Question[] = []
  let current: Question | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const option = line.match(/^(\*)?\s*(?:[a-fA-F][).:]|[-•])\s*(\*)?\s*(.+)$/)
    if (option && current) {
      if (option[1] || option[3]) current.answer = current.options.length
      current.options.push(option[4].trim())
      continue
    }
    const why = line.match(/^(?:why|explanation)\s*:\s*(.+)$/i)
    if (why && current) {
      current.explanation = why[1]
      continue
    }
    current = { prompt: line.replace(/^(?:q\s*)?\d+\s*[).:-]\s*/i, ''), options: [], answer: 0, explanation: '' }
    out.push(current)
  }
  return out.filter((q) => q.prompt && q.options.length >= 2)
}

function QuestionCard({
  index,
  question,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  index: number
  question: Question
  count: number
  onChange: (q: Question) => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  return (
    <div className="space-y-3 rounded-xl bg-rh-canvas p-3.5 dark:bg-white/[0.04]">
      <div className="flex items-center gap-1">
        <span className="mr-auto text-xs font-semibold text-neutral-500 dark:text-neutral-400">Question {index + 1}</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move down">
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={onRemove} aria-label="Remove question">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <textarea
        rows={2}
        maxLength={600}
        value={question.prompt}
        placeholder="e.g. Which test best rules out an ACL tear?"
        onChange={(e) => onChange({ ...question, prompt: e.target.value })}
        className={textareaClass}
        aria-label={`Question ${index + 1}`}
      />
      <div className="space-y-1.5">
        {question.options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`answer-${index}`}
              checked={question.answer === i}
              onChange={() => onChange({ ...question, answer: i })}
              className="h-4 w-4 shrink-0 accent-rh-ink"
              aria-label={`Answer ${i + 1} is correct`}
            />
            <Input
              value={option}
              maxLength={240}
              placeholder={`Answer ${i + 1}`}
              onChange={(e) => onChange({ ...question, options: question.options.map((o, j) => (j === i ? e.target.value : o)) })}
              className={cn(inputClass, 'h-8 flex-1', question.answer === i && 'ring-2 ring-emerald-500/40')}
            />
            {question.options.length > 2 && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...question,
                    options: question.options.filter((_, j) => j !== i),
                    answer: question.answer === i ? 0 : question.answer > i ? question.answer - 1 : question.answer,
                  })
                }
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-black/5 hover:text-rose-600"
                aria-label={`Remove answer ${i + 1}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {question.options.length < 6 && (
          <button
            type="button"
            onClick={() => onChange({ ...question, options: [...question.options, ''] })}
            className="pl-6 text-xs font-medium text-neutral-500 hover:text-rh-ink dark:hover:text-white"
          >
            + Add an answer
          </button>
        )}
      </div>
      <Input
        value={question.explanation}
        maxLength={600}
        placeholder="Why it's right (optional, shown after they finish)"
        onChange={(e) => onChange({ ...question, explanation: e.target.value })}
        className={cn(inputClass, 'h-8 text-xs')}
      />
    </div>
  )
}

function AssessmentDrawer({
  cohortId,
  initial,
  hasAttempts,
  open,
  onClose,
}: {
  cohortId: Id<'learnCohorts'>
  initial: Draft
  hasAttempts: boolean
  open: boolean
  onClose: () => void
}) {
  const save = useMutationUntyped(learnApi.adminSaveAssessment)
  const [draft, setDraft] = useState<Draft>(initial)
  const [busy, setBusy] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const setQuestion = (i: number, q: Question) => set('questions', draft.questions.map((x, j) => (j === i ? q : x)))
  const move = (i: number, by: number) => {
    const next = [...draft.questions]
    const [q] = next.splice(i, 1)
    next.splice(i + by, 0, q)
    set('questions', next)
  }
  const parsed = pasting ? parseQuestions(pasted) : []

  const submit = async () => {
    setBusy(true)
    try {
      await save({
        cohortId,
        status: draft.status,
        passMark: Number(draft.passMark),
        maxAttempts: Number(draft.maxAttempts),
        minSessions: Number(draft.minSessions),
        signatoryName: draft.signatoryName || undefined,
        signatoryTitle: draft.signatoryTitle || undefined,
        questions: draft.questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options, answer: q.answer, explanation: q.explanation || undefined })),
      })
      playSound('success')
      toast.success(draft.status === 'open' ? 'Saved. Physios can take the assessment now.' : 'Assessment saved')
      onClose()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the assessment'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminDrawer
      open={open}
      onOpenChange={(o) => !o && !busy && onClose()}
      title="Final assessment and certificate"
      description="Multiple choice, marked automatically. Physios see their score straight away."
      footer={
        <>
          <span className="mr-auto text-xs text-neutral-500">{draft.questions.length} questions</span>
          <Button variant="ghost" className={softButtonClass} onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className={primaryButtonClass} onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <p className={labelClass}>Status</p>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-rh-canvas p-1 dark:bg-white/[0.04]">
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set('status', s)}
                className={cn(
                  'rounded-lg py-1.5 text-sm font-medium transition',
                  draft.status === s ? 'bg-white text-rh-ink shadow-sm dark:bg-rh-ink-3 dark:text-white' : 'text-neutral-500 hover:text-rh-ink dark:hover:text-white'
                )}
              >
                {STATUS[s].label}
              </button>
            ))}
          </div>
          <p className={hintClass}>{STATUS[draft.status].hint}</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Pass mark (%)" htmlFor="a-pass">
            <Input id="a-pass" type="number" min={1} max={100} value={draft.passMark} onChange={(e) => set('passMark', Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Attempts" htmlFor="a-attempts">
            <Input id="a-attempts" type="number" min={1} max={10} value={draft.maxAttempts} onChange={(e) => set('maxAttempts', Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Sessions to attend" htmlFor="a-sessions">
            <Input id="a-sessions" type="number" min={0} max={50} value={draft.minSessions} onChange={(e) => set('minSessions', Number(e.target.value))} className={inputClass} />
          </Field>
        </div>
        <p className={cn(hintClass, '-mt-3')}>
          The certificate unlocks once a physio passes and has joined this many live sessions (0 = no attendance rule). Attendance counts when they tap
          &ldquo;Join&rdquo;; you can correct it under Learners.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Signed by (on the certificate)" htmlFor="a-sign-name" hint="Optional. Leave empty to show “Rehabify Learn”.">
            <Input id="a-sign-name" maxLength={80} placeholder="Dr. …" value={draft.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Their title" htmlFor="a-sign-title">
            <Input id="a-sign-title" maxLength={80} placeholder="Programme Lead" value={draft.signatoryTitle} onChange={(e) => set('signatoryTitle', e.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className={labelClass}>Questions</p>
            <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => setPasting((p) => !p)}>
              {pasting ? 'Close' : 'Paste questions'}
            </Button>
          </div>
          {hasAttempts && (
            <Callout tone="warning">Physios have already taken this. You can fix wording and answers, but not add or remove questions.</Callout>
          )}
          {pasting && (
            <div className="space-y-2 rounded-xl border border-dashed border-black/15 p-3 dark:border-white/15">
              <textarea
                rows={7}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                className={cn(textareaClass, 'font-mono text-xs')}
                placeholder={'1. Which test best rules out an ACL tear?\na) Anterior drawer\n*b) Lachman test\nc) McMurray test\nWhy: Lachman is the most sensitive test for ACL tears.'}
              />
              <div className="flex items-center justify-between gap-2">
                <p className={hintClass}>Mark the right answer with *. One blank line between questions is fine.</p>
                <Button
                  size="sm"
                  className={primaryButtonClass}
                  disabled={parsed.length === 0}
                  onClick={() => {
                    set('questions', [...draft.questions, ...parsed])
                    setPasted('')
                    setPasting(false)
                    toast.success(`${parsed.length} questions added. Check them below, then save.`)
                  }}
                >
                  Add {parsed.length || ''} {parsed.length === 1 ? 'question' : 'questions'}
                </Button>
              </div>
            </div>
          )}
          {draft.questions.map((q, i) => (
            <QuestionCard
              key={q.id ?? `new-${i}`}
              index={i}
              count={draft.questions.length}
              question={q}
              onChange={(next) => setQuestion(i, next)}
              onMove={(by) => move(i, by)}
              onRemove={() => set('questions', draft.questions.filter((_, j) => j !== i))}
            />
          ))}
          <Button
            variant="ghost"
            className={cn(softButtonClass, 'w-full')}
            onClick={() => set('questions', [...draft.questions, { ...EMPTY_QUESTION, options: [...EMPTY_QUESTION.options] }])}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add a question
          </Button>
        </div>
      </div>
    </AdminDrawer>
  )
}

export function AssessmentSummary({ cohortId }: { cohortId: Id<'learnCohorts'> }) {
  const assessment = useQueryUntyped(learnApi.adminAssessment, { cohortId }) as Assessment | null | undefined
  const [editing, setEditing] = useState(false)
  if (assessment === undefined) return <LoadingBlock />
  const status = assessment ? STATUS[assessment.status] : null
  return (
    <Panel
      title="Final assessment"
      description="What physios must do to get their certificate."
      actions={
        <Button size="sm" className={primaryButtonClass} onClick={() => setEditing(true)}>
          {assessment ? <Pencil className="mr-1.5 h-3.5 w-3.5" /> : <Plus className="mr-1.5 h-4 w-4" />}
          {assessment ? 'Edit' : 'Set up'}
        </Button>
      }
      bodyClassName="px-5 pb-5 pt-2"
    >
      {assessment && status ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          <span>
            {assessment.questions.length} questions · pass {assessment.passMark}% · {assessment.maxAttempts}{' '}
            {assessment.maxAttempts === 1 ? 'attempt' : 'attempts'}
            {assessment.minSessions ? ` · attend ${assessment.minSessions} sessions` : ''}
            {assessment.attempts ? ` · ${assessment.attempts} taken` : ''}
          </span>
        </div>
      ) : (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Not set up yet. Add questions (or paste them in one go), choose the pass mark, and open it in the final week.
        </p>
      )}
      {editing && (
        <AssessmentDrawer
          cohortId={cohortId}
          initial={draftFrom(assessment)}
          hasAttempts={Boolean(assessment?.attempts)}
          open={editing}
          onClose={() => setEditing(false)}
        />
      )}
    </Panel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Learners
// ─────────────────────────────────────────────────────────────────────────────

function learnerStatus(l: Learner): { label: string; tone: 'neutral' | 'green' | 'amber' | 'teal' } {
  if (l.certificate && !l.certificate.revoked) return { label: 'Certified', tone: 'green' }
  if (l.passed) return { label: 'Passed', tone: 'teal' }
  if (l.attempts) return { label: 'Not passed yet', tone: 'amber' }
  return { label: 'In progress', tone: 'neutral' }
}

function LearnerDrawer({ learner, data, onClose }: { learner: Learner | null; data: ProgressData; onClose: () => void }) {
  const setAttendance = useMutationUntyped(learnApi.adminSetAttendance)
  const issue = useMutationUntyped(learnApi.adminIssueCertificate)
  const revoke = useMutationUntyped(learnApi.adminRevokeCertificate)
  const [name, setName] = useState(learner?.certificate?.name ?? learner?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const certified = Boolean(learner?.certificate && !learner.certificate.revoked)

  return (
    <AdminDrawer open={learner !== null} onOpenChange={(o) => !o && onClose()} title={learner?.name ?? ''} description={learner ? `${learner.email} · ${learner.track}` : undefined}>
      {learner && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Sessions joined', value: `${learner.attendedSessionIds.length}/${data.sessions.length}` },
              { label: 'Best score', value: learner.bestScore === null ? '—' : `${learner.bestScore}%` },
              { label: 'Weeks ticked', value: learner.weeksDone },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.04]">
                <p className="text-lg font-semibold text-rh-ink dark:text-white">{s.value}</p>
                <p className="text-[11px] text-neutral-500">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className={labelClass}>Attendance</p>
            {data.sessions.length === 0 && <p className="text-sm text-neutral-500">No sessions yet.</p>}
            {data.sessions.map((s) => {
              const attended = learner.attendedSessionIds.includes(s.id)
              return (
                <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-rh-canvas dark:hover:bg-white/[0.04]">
                  <input
                    type="checkbox"
                    checked={attended}
                    onChange={(e) =>
                      void setAttendance({ registrationId: learner.registrationId, sessionId: s.id, attended: e.target.checked }).catch((error: unknown) =>
                        toast.error(errorMessage(error, 'Could not update attendance'))
                      )
                    }
                    className="h-4 w-4 accent-rh-ink"
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate text-rh-ink dark:text-white">{s.title ?? 'Live session'}</span>
                    <span className="block text-xs text-neutral-500">{s.label}</span>
                  </span>
                </label>
              )
            })}
          </div>

          <div className="space-y-2">
            <p className={labelClass}>Certificate</p>
            {certified && learner.certificate && (
              <Link
                href={`/learn/verify/${learner.certificate.code}`}
                target="_blank"
                className="flex items-center gap-2 rounded-xl bg-rh-honeydew/50 px-3 py-2 text-sm font-medium text-rh-ink dark:bg-emerald-400/10 dark:text-white"
              >
                <Award className="h-4 w-4" /> {learner.certificate.code} <ExternalLink className="ml-auto h-3.5 w-3.5" />
              </Link>
            )}
            <Field label="Name on the certificate" htmlFor="learner-cert-name">
              <Input id="learner-cert-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className={primaryButtonClass}
                disabled={busy || name.trim().length < 3}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await issue({ registrationId: learner.registrationId, name })
                    playSound(certified ? 'success' : 'certified')
                    toast.success(certified ? 'Name updated on the certificate' : 'Certificate issued')
                  } catch (error) {
                    toast.error(errorMessage(error, 'Could not issue the certificate'))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {certified ? 'Update name' : 'Issue certificate'}
              </Button>
              {certified && (
                <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => setConfirmRevoke(true)}>
                  Withdraw
                </Button>
              )}
            </div>
            {!certified && <p className={hintClass}>Issuing skips the assessment and attendance rules, e.g. for a physio assessed in person.</p>}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Withdraw this certificate?"
        description="The verify page will say it's no longer valid. You can issue a new one later."
        confirmLabel="Withdraw"
        destructive
        onConfirm={async () => {
          if (!learner) return
          await revoke({ registrationId: learner.registrationId })
          playSound('reject')
          toast.success('Certificate withdrawn')
        }}
      />
    </AdminDrawer>
  )
}

export function LearnersPanel({ cohortId }: { cohortId: Id<'learnCohorts'> }) {
  const data = useQueryUntyped(learnApi.adminLearnerProgress, { cohortId }) as ProgressData | undefined
  const [selectedId, setSelectedId] = useState<Id<'learnRegistrations'> | null>(null)
  if (data === undefined) return <LoadingBlock />
  const selected = data.learners.find((l) => l.registrationId === selectedId) ?? null
  const certified = data.learners.filter((l) => l.certificate && !l.certificate.revoked).length

  return (
    <Panel
      title="Learners"
      description={data.learners.length ? `${data.learners.length} paid · ${certified} certified` : 'Paid physios appear here.'}
      actions={<ClipboardCheck className="h-4 w-4 text-neutral-400" />}
    >
      {data.learners.length === 0 ? (
        <EmptyState icon={<Users />} title="No paid physios yet" />
      ) : (
        <ul className="divide-y divide-black/[0.05] px-2 pb-2 dark:divide-white/[0.06]">
          {data.learners.map((l) => {
            const status = learnerStatus(l)
            const short = data.minSessions > 0 && l.attendedSessionIds.length < data.minSessions
            return (
              <li key={l.registrationId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(l.registrationId)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-rh-canvas dark:hover:bg-white/[0.04]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{l.name}</span>
                    <span className={cn('block text-xs', short ? 'text-amber-700 dark:text-amber-300' : 'text-neutral-500 dark:text-neutral-400')}>
                      {l.attendedSessionIds.length}/{data.sessions.length} sessions · {l.bestScore === null ? 'not taken' : `best ${l.bestScore}%`}
                    </span>
                  </span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {selected && <LearnerDrawer key={selected.registrationId} learner={selected} data={data} onClose={() => setSelectedId(null)} />}
    </Panel>
  )
}
