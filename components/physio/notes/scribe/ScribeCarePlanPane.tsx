'use client'

/**
 * The care plan (or the changes to the current one) Rehabify Scribe drafted from the session,
 * beside the note at sign-off. The physio edits or unticks it; "Approve and send" saves it with
 * the note (WorkspaceDrawers.tsx scribePlanSaveArgs). The full care plan form is still there for
 * anything more, from the Care plan tab.
 */
import type { ReactNode } from 'react'
import { ClipboardList, Plus, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { InfoTip, fieldClass } from '@/components/physio/ui'
import { measureTitle } from '@/convex/helpers/clinicalMeasures'
import { goalTemplate } from '@/convex/helpers/goalMeasures'
import { cn } from '@/lib/utils'
import type { ScribeCarePlan } from './scribeApi'

export type CarePlanReview = { include: boolean; plan: ScribeCarePlan }

const MAX_GOALS = 8

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-pt-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

export function ScribeCarePlanPane({
  review,
  onChange,
  hasPlan,
  patientFirstName,
}: {
  review: CarePlanReview
  onChange: (next: CarePlanReview) => void
  /** The patient already has a care plan: this updates it */
  hasPlan: boolean
  patientFirstName: string
}) {
  const { plan } = review
  const set = (patch: Partial<ScribeCarePlan>) => onChange({ ...review, plan: { ...plan, ...patch } })
  const setGoal = (index: number, patch: Partial<ScribeCarePlan['goals'][number]>) =>
    set({ goals: plan.goals.map((g, i) => (i === index ? { ...g, ...patch } : g)) })

  return (
    <section aria-label="Care plan" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-pt-ink">
          <ClipboardList className="h-4 w-4" aria-hidden /> {hasPlan ? 'Care plan changes' : 'Care plan'}
          <InfoTip>
            Drafted only from what you said. {hasPlan ? 'It saves a new version of the current plan.' : 'It creates the plan.'} {patientFirstName} sees it
            in their app.
          </InfoTip>
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-pt-ink">
          <Checkbox checked={review.include} onCheckedChange={(v) => onChange({ ...review, include: v === true })} aria-label="Save the care plan" />
          Save it
        </label>
      </div>

      {!review.include ? (
        <p className="rounded-xl bg-pt-sunken px-3 py-2.5 text-sm text-pt-muted">The care plan won’t change. Tick “Save it” to include it.</p>
      ) : (
        <div className="space-y-3">
          {!hasPlan && (
            <>
              <Field label="Title">
                <Input value={plan.title} onChange={(e) => set({ title: e.target.value })} className={cn(fieldClass, 'h-9')} maxLength={100} />
              </Field>
              <Field label="Approach">
                <Textarea value={plan.summary} onChange={(e) => set({ summary: e.target.value })} rows={2} maxLength={500} className="rounded-xl text-sm" />
              </Field>
            </>
          )}

          {hasPlan && plan.achievedGoals.length > 0 && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-pt-muted">Goals met</p>
              <ul className="mt-1 space-y-1">
                {plan.achievedGoals.map((goal) => (
                  <li key={goal} className="flex items-start gap-2 text-sm text-pt-ink">
                    <Checkbox
                      checked
                      onCheckedChange={() => set({ achievedGoals: plan.achievedGoals.filter((g) => g !== goal) })}
                      className="mt-0.5"
                      aria-label={`Mark “${goal}” as met`}
                    />
                    {goal}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-pt-muted">{hasPlan ? 'New goals' : 'Goals'}</p>
            <ul className="mt-1 space-y-2">
              {plan.goals.map((goal, index) => (
                <li key={index} className="rounded-xl border border-pt-line p-2.5">
                  <div className="flex items-start gap-2">
                    <Input
                      value={goal.description}
                      onChange={(e) => setGoal(index, { description: e.target.value })}
                      className={cn(fieldClass, 'h-9')}
                      aria-label={`Goal ${index + 1}`}
                      maxLength={200}
                    />
                    <button
                      type="button"
                      onClick={() => set({ goals: plan.goals.filter((_, i) => i !== index) })}
                      aria-label={`Remove goal ${index + 1}`}
                      className="shrink-0 rounded-lg p-2 text-pt-faint hover:bg-pt-hover hover:text-pt-rose-fg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Field label="By when">
                      <Input value={goal.timeline} onChange={(e) => setGoal(index, { timeline: e.target.value })} placeholder="e.g. 6 weeks" className={cn(fieldClass, 'h-9')} maxLength={60} />
                    </Field>
                    {goal.measure && (
                      <Field label={`Target · ${measureTitle(goalTemplate(goal.measure))}`}>
                        <Input
                          inputMode="decimal"
                          value={goal.target ?? ''}
                          placeholder="—"
                          onChange={(e) => {
                            const raw = e.target.value.replace(',', '.').replace(/[^\d.]/g, '')
                            setGoal(index, { target: raw && Number.isFinite(Number(raw)) ? Number(raw) : undefined })
                          }}
                          className={cn(fieldClass, 'h-9')}
                        />
                      </Field>
                    )}
                  </div>
                  {goal.measure && goal.target === undefined && (
                    <p className="mt-1 text-xs text-pt-muted">Add a target to chart it; without one it’s saved as a written goal.</p>
                  )}
                </li>
              ))}
            </ul>
            {plan.goals.length < MAX_GOALS && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 h-8 rounded-lg px-2 text-pt-ink"
                onClick={() => set({ goals: [...plan.goals, { description: '', timeline: '' }] })}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add a goal
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="How often" className="col-span-2 sm:col-span-1">
              <Input value={plan.sessionFrequency} onChange={(e) => set({ sessionFrequency: e.target.value })} placeholder="e.g. Twice a week" className={cn(fieldClass, 'h-9')} maxLength={60} />
            </Field>
            <Field label="Sessions">
              <Input
                inputMode="numeric"
                value={plan.plannedSessions ?? ''}
                placeholder="—"
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^\d]/g, '').slice(0, 3))
                  set({ plannedSessions: n >= 1 && n <= 100 ? n : undefined })
                }}
                className={cn(fieldClass, 'h-9')}
              />
            </Field>
            <Field label="Review in (weeks)">
              <Input
                inputMode="numeric"
                value={plan.reviewInWeeks ?? ''}
                placeholder="—"
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^\d]/g, '').slice(0, 2))
                  set({ reviewInWeeks: n >= 1 && n <= 52 ? n : undefined })
                }}
                className={cn(fieldClass, 'h-9')}
              />
            </Field>
          </div>
          <Field label="Precautions">
            <Textarea value={plan.precautions} onChange={(e) => set({ precautions: e.target.value })} rows={2} maxLength={1000} className="rounded-xl text-sm" />
          </Field>
          {hasPlan && (
            <Field label="Why it’s changing">
              <Input value={plan.changeReason} onChange={(e) => set({ changeReason: e.target.value })} placeholder="e.g. Goals met, moving to loading" className={cn(fieldClass, 'h-9')} maxLength={300} />
            </Field>
          )}
        </div>
      )}
    </section>
  )
}
