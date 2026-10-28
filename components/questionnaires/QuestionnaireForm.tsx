'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Loader2, Plus, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'
import { cn } from '@/lib/utils'
import { PSFS_MAX_ACTIVITIES, PSFS_MAX_ACTIVITY_LENGTH, PSFS_SCALE, itemScale, questionnairePages } from '@/lib/questionnaires/instruments'
import { AnswerError, cleanDraftAnswers, cleanPsfs, isAnswered, scoreResponse, scoreText } from '@/lib/questionnaires/scoring'
import { NOT_APPLICABLE, type AnswerValue, type InstrumentDef, type PsfsActivity, type Scale } from '@/lib/questionnaires/types'

export type QuestionnaireInput = { answers?: AnswerValue[]; psfs?: PsfsActivity[] }

/**
 * A questionnaire, item by item, in its published wording.
 * - `patient`: a few questions per screen with Back / Next; every question needs an answer (or
 *   "Doesn't apply" where the instrument allows it). `onProgress` runs on each Next, to save a draft.
 * - `physio`: everything on one list for typing in a paper form; questions can be left blank,
 *   and the score shows as you go.
 */
export function QuestionnaireForm({
  def,
  mode,
  initialAnswers,
  initialPsfs,
  previousPsfs = [],
  submitting = false,
  submitLabel,
  onProgress,
  onSubmit,
}: {
  def: InstrumentDef
  mode: 'patient' | 'physio'
  initialAnswers?: AnswerValue[] | null
  initialPsfs?: PsfsActivity[] | null
  /** PSFS activities from last time, rated again with their names fixed */
  previousPsfs?: string[]
  submitting?: boolean
  submitLabel: string
  onProgress?: (input: QuestionnaireInput) => void
  onSubmit: (input: QuestionnaireInput) => void
}) {
  const [answers, setAnswers] = useState<AnswerValue[]>(() => def.items.map((_, i) => initialAnswers?.[i] ?? null))
  const [psfs, setPsfs] = useState<PsfsActivity[]>(() => startingPsfs(previousPsfs, initialPsfs))
  const pages = useMemo(() => questionnairePages(def), [def])
  const [page, setPage] = useState(() => (mode === 'patient' ? firstOpenPage(pages, answers) : 0))
  const [error, setError] = useState<string | null>(null)
  const topRef = useRef<HTMLDivElement>(null)

  const setAnswer = (index: number, value: AnswerValue) => {
    setError(null)
    setAnswers((prev) => prev.map((v, i) => (i === index ? value : v)))
  }

  if (def.kind === 'psfs') {
    const submitPsfs = () => {
      try {
        const rows = cleanPsfs(psfs, true, mode === 'patient' ? previousPsfs : [])
        onSubmit({ psfs: rows })
      } catch (e) {
        setError(e instanceof AnswerError ? e.message : 'Check your answers.')
      }
    }
    return (
      <div className="space-y-5">
        <PsfsFields
          def={def}
          rows={psfs}
          fixed={previousPsfs}
          onChange={(rows) => {
            setError(null)
            setPsfs(rows)
          }}
        />
        {mode === 'physio' && <LiveScore def={def} input={{ psfs }} />}
        {error && <FormError>{error}</FormError>}
        <Button type="button" className={cn(primaryButtonClass, 'h-12 w-full text-[15px]')} disabled={submitting} onClick={submitPsfs}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    )
  }

  const unanswered = (indexes: number[]) => indexes.filter((i) => answers[i] === null)

  if (mode === 'physio') {
    return (
      <div className="space-y-6">
        {pages.map((p, n) => (
          <PageItems key={n} def={def} page={p} answers={answers} onAnswer={setAnswer} allowClear />
        ))}
        <LiveScore def={def} input={{ answers }} />
        {error && <FormError>{error}</FormError>}
        <Button
          type="button"
          className={cn(primaryButtonClass, 'h-11 w-full')}
          disabled={submitting}
          onClick={() => {
            const score = scoreResponse(def, { answers: cleanDraftAnswers(def, answers) })
            if (score.total === null) return setError(`Not enough answers to score ${def.short}. ${def.scoringNote}`)
            onSubmit({ answers: cleanDraftAnswers(def, answers) })
          }}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    )
  }

  const current = pages[page]
  const last = page === pages.length - 1
  const answeredCount = answers.filter((a) => a !== null).length
  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const next = () => {
    const open = unanswered(current.items)
    if (open.length > 0) {
      setError(open.length === 1 ? `Please answer question ${open[0] + 1}.` : `Please answer questions ${open.map((i) => i + 1).join(', ')}.`)
      document.getElementById(itemId(def, open[0]))?.focus()
      return
    }
    if (last) {
      onSubmit({ answers })
      return
    }
    onProgress?.({ answers })
    setPage(page + 1)
    scrollTop()
  }

  return (
    <div ref={topRef} className="scroll-mt-24 space-y-5">
      <div>
        <div className="flex items-baseline justify-between text-xs text-pt-muted">
          <span>
            {current.title}
            {pages.length > 1 ? ` · screen ${page + 1} of ${pages.length}` : ''}
          </span>
          <span className="tabular-nums">
            {answeredCount} of {def.items.length} answered
          </span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-pt-sunken"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={def.items.length}
          aria-valuenow={answeredCount}
          aria-label="Questions answered"
        >
          <div className="h-full rounded-full bg-pt-accent transition-[width] motion-reduce:transition-none" style={{ width: `${(answeredCount / def.items.length) * 100}%` }} />
        </div>
      </div>

      <PageItems def={def} page={current} answers={answers} onAnswer={setAnswer} />

      {error && <FormError>{error}</FormError>}

      <div className="flex gap-3">
        {page > 0 && (
          <Button
            type="button"
            variant="outline"
            className={cn(secondaryButtonClass, 'h-12 px-5')}
            onClick={() => {
              setError(null)
              onProgress?.({ answers })
              setPage(page - 1)
              scrollTop()
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        )}
        <Button type="button" className={cn(primaryButtonClass, 'h-12 flex-1 text-[15px]')} disabled={submitting} onClick={next}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {last ? submitLabel : 'Next'}
          {!last && <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

/** Where a returning patient picks up: the first screen with a question still open. */
function firstOpenPage(pages: ReturnType<typeof questionnairePages>, answers: AnswerValue[]) {
  const index = pages.findIndex((p) => p.items.some((i) => answers[i] === null))
  return index === -1 ? Math.max(0, pages.length - 1) : index
}

function startingPsfs(previous: string[], saved: PsfsActivity[] | null | undefined): PsfsActivity[] {
  const rows: PsfsActivity[] = previous.map((activity) => ({
    activity,
    score: saved?.find((s) => s.activity.toLowerCase() === activity.toLowerCase())?.score ?? null,
  }))
  for (const s of saved ?? []) {
    if (!rows.some((r) => r.activity.toLowerCase() === s.activity.toLowerCase())) rows.push({ ...s })
  }
  // A first PSFS starts with three empty rows (three activities is usual); re-rating starts with last time's
  const blanks = previous.length === 0 ? Math.max(0, 3 - rows.length) : 0
  for (let i = 0; i < blanks; i++) rows.push({ activity: '', score: null })
  return rows
}

const itemId = (def: InstrumentDef, index: number) => `q-${def.key}-${index}`

function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-pt-rose-bg px-4 py-3 text-sm text-pt-rose-fg">
      {children}
    </p>
  )
}

function PageItems({
  def,
  page,
  answers,
  onAnswer,
  allowClear = false,
}: {
  def: InstrumentDef
  page: ReturnType<typeof questionnairePages>[number]
  answers: AnswerValue[]
  onAnswer: (index: number, value: AnswerValue) => void
  allowClear?: boolean
}) {
  // The section's question goes above the first item that uses it (KOOS/HOOS: after the pain frequency item)
  const stemBefore = page.stem ? page.items.find((i) => !def.items[i].scale) : undefined
  return (
    <section className="space-y-4">
      <h3 className="text-[15px] font-semibold text-pt-ink">{page.title}</h3>
      {page.items.map((index) => (
        <div key={index} className="space-y-4">
          {index === stemBefore && <p className="text-sm text-pt-muted">{page.stem}</p>}
          <ItemField def={def} index={index} value={answers[index]} onChange={(v) => onAnswer(index, v)} allowClear={allowClear} />
        </div>
      ))}
    </section>
  )
}

function ItemField({
  def,
  index,
  value,
  onChange,
  allowClear,
}: {
  def: InstrumentDef
  index: number
  value: AnswerValue
  onChange: (value: AnswerValue) => void
  allowClear: boolean
}) {
  const item = def.items[index]
  const scale = itemScale(def, index)
  const name = itemId(def, index)
  return (
    <fieldset className="rounded-2xl border border-pt-line p-4">
      <legend className="sr-only">
        Question {index + 1}: {item.text}
      </legend>
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-[15px] font-medium leading-snug text-pt-ink" aria-hidden>
          <span className="mr-1.5 tabular-nums text-pt-faint">{index + 1}.</span>
          {item.text}
        </p>
        {allowClear && value !== null && (
          <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-pt-muted hover:bg-pt-hover hover:text-pt-ink" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>
      <ScaleInput id={name} name={name} scale={scale} value={isAnswered(value) ? value : null} onChange={onChange} />
      {def.allowNotApplicable && (
        <label className="mt-2 inline-flex cursor-pointer">
          <input type="radio" name={name} className="peer sr-only" checked={value === NOT_APPLICABLE} onChange={() => onChange(NOT_APPLICABLE)} />
          <span className="inline-flex min-h-10 items-center rounded-lg border border-dashed border-pt-line-strong px-3 text-sm text-pt-muted transition-colors hover:bg-pt-hover peer-checked:border-solid peer-checked:border-pt-primary peer-checked:bg-pt-primary peer-checked:text-pt-on-primary peer-focus-visible:ring-2 peer-focus-visible:ring-pt-accent/60">
            Doesn’t apply to me
          </span>
        </label>
      )}
    </fieldset>
  )
}

/** One radio group: labelled options in a column, or 0–10 in a row with words at each end. */
function ScaleInput({
  id,
  name,
  scale,
  value,
  onChange,
  label,
}: {
  id: string
  name: string
  scale: Scale
  value: number | null
  onChange: (value: number) => void
  label?: string
}) {
  if (scale.kind === 'numeric') {
    const values = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i)
    return (
      <div role="radiogroup" aria-label={label}>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
          {values.map((n, i) => (
            <label key={n} className="cursor-pointer">
              <input
                id={i === 0 ? id : undefined}
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                className="peer sr-only"
                aria-label={n === scale.min ? `${n}, ${scale.minLabel}` : n === scale.max ? `${n}, ${scale.maxLabel}` : String(n)}
              />
              <span className="flex h-11 items-center justify-center rounded-lg border border-pt-line-strong text-sm font-semibold tabular-nums text-pt-ink transition-colors hover:bg-pt-hover peer-checked:border-pt-primary peer-checked:bg-pt-primary peer-checked:text-pt-on-primary peer-focus-visible:ring-2 peer-focus-visible:ring-pt-accent/60">
                {n}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between gap-4 text-[11px] leading-tight text-pt-muted">
          <span className="max-w-[45%]">
            {scale.min} = {scale.minLabel}
          </span>
          <span className="max-w-[45%] text-right">
            {scale.max} = {scale.maxLabel}
          </span>
        </div>
      </div>
    )
  }
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1.5">
      {scale.options.map((o, i) => (
        <label key={o.value} className="cursor-pointer">
          <input
            id={i === 0 ? id : undefined}
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="peer sr-only"
          />
          <span className="flex min-h-11 items-center gap-3 rounded-xl border border-pt-line-strong px-3.5 py-2.5 text-sm text-pt-ink transition-colors hover:bg-pt-hover peer-checked:border-pt-primary peer-checked:bg-pt-primary peer-checked:text-pt-on-primary peer-focus-visible:ring-2 peer-focus-visible:ring-pt-accent/60">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  )
}

function PsfsFields({
  def,
  rows,
  fixed,
  onChange,
}: {
  def: InstrumentDef
  rows: PsfsActivity[]
  fixed: string[]
  onChange: (rows: PsfsActivity[]) => void
}) {
  const isFixed = (activity: string) => fixed.some((f) => f.toLowerCase() === activity.toLowerCase())
  const update = (index: number, patch: Partial<PsfsActivity>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  return (
    <div className="space-y-4">
      <p className="text-sm text-pt-muted">
        {fixed.length > 0
          ? 'Last time you told us these activities were hard. Today, how well can you do each one? You can add others too.'
          : def.instructions}
      </p>
      {rows.map((row, index) => {
        const locked = isFixed(row.activity) && index < fixed.length
        const name = `q-psfs-${index}`
        return (
          <fieldset key={index} className="space-y-3 rounded-2xl border border-pt-line p-4">
            <legend className="sr-only">Activity {index + 1}</legend>
            <div className="flex items-center gap-2">
              {locked ? (
                <p className="flex-1 text-[15px] font-medium text-pt-ink">{row.activity}</p>
              ) : (
                <Input
                  value={row.activity}
                  maxLength={PSFS_MAX_ACTIVITY_LENGTH}
                  onChange={(e) => update(index, { activity: e.target.value })}
                  placeholder={index === 0 ? 'e.g. Climbing the stairs at home' : 'Another activity'}
                  aria-label={`Activity ${index + 1}`}
                  className={cn(fieldClass, 'h-11 flex-1')}
                />
              )}
              {!locked && rows.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove activity ${index + 1}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-pt-muted hover:bg-pt-hover hover:text-pt-ink"
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <ScaleInput
              id={name}
              name={name}
              scale={PSFS_SCALE}
              value={row.score}
              onChange={(score) => update(index, { score })}
              label={row.activity ? `How well can you do: ${row.activity}` : `Activity ${index + 1} score`}
            />
          </fieldset>
        )
      })}
      {rows.length < PSFS_MAX_ACTIVITIES && (
        <button
          type="button"
          onClick={() => onChange([...rows, { activity: '', score: null }])}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-medium text-pt-ink hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Add an activity
        </button>
      )}
    </div>
  )
}

/** Physio entry: the score as it stands. */
function LiveScore({ def, input }: { def: InstrumentDef; input: QuestionnaireInput }) {
  let total: number | null = null
  let subscales: { key: string; label: string; value: number | null }[] = []
  try {
    const result =
      def.kind === 'psfs'
        ? scoreResponse(def, { psfs: cleanPsfs(input.psfs ?? [], false) })
        : scoreResponse(def, { answers: cleanDraftAnswers(def, input.answers ?? []) })
    total = result.total
    subscales = result.subscales
  } catch {
    // Duplicate PSFS names: no score until fixed
  }
  return (
    <div className="rounded-2xl bg-pt-sunken px-4 py-3 text-sm" aria-live="polite">
      <p className="text-pt-muted">
        {def.totalLabel}: <span className="font-semibold tabular-nums text-pt-ink">{scoreText(def, total)}</span>
        {total === null && <span className="ml-1 text-xs">({def.scoringNote})</span>}
      </p>
      {subscales.length > 0 && def.key !== 'nprs' && (
        <p className="mt-1 text-xs text-pt-muted">
          {subscales.map((s) => `${s.label} ${scoreText(def, s.value)}`).join(' · ')}
        </p>
      )}
    </div>
  )
}
