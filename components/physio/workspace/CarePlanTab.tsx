'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { Check, History, Loader2, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { InteractiveTreatmentPlan } from '@/components/dashboard/physiotherapist/treatment/InteractiveTreatmentPlan'
import { EmptyState, Panel, StatusBadge, primaryButtonClass } from '@/components/physio/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { Fact, Meter, type Goal, type Workspace } from './shared'

const FREQUENCIES = ['1 session a week', '2 sessions a week', '3 sessions a week', 'Every 2 weeks']

type DraftGoal = { description: string; targetValue: string; timeline: string; achieved?: boolean }

function toDateInput(ms?: number) {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function CarePlanForm({ workspace, onDone }: { workspace: Workspace; onDone: () => void }) {
  const save = useMutation(api.physioCare.saveCarePlan)
  const plan = workspace.plan
  const [title, setTitle] = useState(plan?.title ?? '')
  const [description, setDescription] = useState(plan?.description ?? '')
  const [goals, setGoals] = useState<DraftGoal[]>(
    plan?.goals.length
      ? plan.goals.map((g) => ({ description: g.description, targetValue: g.targetValue, timeline: g.timeline, achieved: g.achieved }))
      : [{ description: '', targetValue: '', timeline: '' }]
  )
  const [frequency, setFrequency] = useState(plan?.sessionFrequency ?? '')
  const [planned, setPlanned] = useState(plan?.plannedSessions ? String(plan.plannedSessions) : '')
  const [reviewDate, setReviewDate] = useState(toDateInput(plan?.reviewDate))
  const [precautions, setPrecautions] = useState(plan?.precautions ?? '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const updateGoal = (index: number, patch: Partial<DraftGoal>) =>
    setGoals((current) => current.map((g, i) => (i === index ? { ...g, ...patch } : g)))

  const submit = async () => {
    if (!title.trim()) return toast.error('Give the plan a title.')
    if (!goals.some((g) => g.description.trim())) return toast.error('Add at least one functional goal.')
    if (plan && !reason.trim()) return toast.error('Say why the plan is changing.')
    setSaving(true)
    try {
      await save({
        patientId: workspace.patient._id,
        title,
        description: description || undefined,
        goals: goals.filter((g) => g.description.trim()),
        sessionFrequency: frequency || undefined,
        plannedSessions: planned ? Number(planned) : undefined,
        reviewDate: reviewDate ? new Date(`${reviewDate}T09:00:00`).getTime() : undefined,
        precautions: precautions || undefined,
        changeReason: reason || undefined,
      })
      playSound('success')
      toast.success(plan ? 'Care plan updated' : 'Care plan created', {
        description: `${workspace.patient.firstName ?? 'Your patient'} has been notified.`,
      })
      onDone()
    } catch (error) {
      toast.error((error as Error).message || 'Couldn’t save the plan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title={plan ? `Revise plan (version ${plan.version + 1})` : 'New care plan'}>
      <div className="space-y-5 px-5 pb-5 pt-3">
        <div>
          <Label htmlFor="cp-title">Plan title</Label>
          <Input id="cp-title" className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Return to running after ankle sprain" />
        </div>
        <div>
          <Label htmlFor="cp-desc">Summary (optional)</Label>
          <Textarea id="cp-desc" className="mt-1.5 resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="The approach in a sentence or two" />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>Functional goals</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg text-rh-teal dark:text-rh-aqua"
              onClick={() => setGoals((g) => [...g, { description: '', targetValue: '', timeline: '' }])}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add goal
            </Button>
          </div>
          <div className="mt-2 space-y-2">
            {goals.map((goal, index) => (
              <div key={index} className="grid grid-cols-1 gap-2 rounded-2xl bg-rh-canvas p-3 dark:bg-white/[0.03] sm:grid-cols-[1fr_9rem_8rem_auto]">
                <Input
                  value={goal.description}
                  onChange={(e) => updateGoal(index, { description: e.target.value })}
                  placeholder="e.g. Climb stairs without a rail"
                  aria-label="Goal"
                />
                <Input value={goal.targetValue} onChange={(e) => updateGoal(index, { targetValue: e.target.value })} placeholder="Measure" aria-label="How you'll measure it" />
                <Input value={goal.timeline} onChange={(e) => updateGoal(index, { timeline: e.target.value })} placeholder="By when" aria-label="By when" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-neutral-400 hover:text-red-600"
                  onClick={() => setGoals((g) => (g.length > 1 ? g.filter((_, i) => i !== index) : g))}
                  aria-label="Remove goal"
                  disabled={goals.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label>Session frequency</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {FREQUENCIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFrequency(option)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-all active:scale-95',
                    frequency === option
                      ? 'border-rh-teal bg-rh-teal text-white dark:border-rh-aqua dark:bg-rh-aqua dark:text-rh-night'
                      : 'border-black/[0.08] hover:bg-rh-mist dark:border-white/10 dark:hover:bg-white/[0.05]'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <Input className="mt-2" value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="Or type your own" aria-label="Session frequency" />
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cp-planned">Planned sessions</Label>
              <Input id="cp-planned" className="mt-1.5" inputMode="numeric" value={planned} onChange={(e) => setPlanned(e.target.value.replace(/[^\d]/g, ''))} placeholder="8" />
            </div>
            <div>
              <Label htmlFor="cp-review">Review date</Label>
              <Input id="cp-review" className="mt-1.5" type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="cp-precautions">Precautions and safety guidance</Label>
          <Textarea
            id="cp-precautions"
            className="mt-1.5 resize-none"
            rows={3}
            value={precautions}
            onChange={(e) => setPrecautions(e.target.value)}
            placeholder="e.g. No weight-bearing over 50% until week 4. Stop if pain goes above 5/10."
          />
        </div>

        <div>
          <Label htmlFor="cp-reason">{plan ? 'Reason for this version' : 'Reason for this plan (optional)'}</Label>
          <Input
            id="cp-reason"
            className="mt-1.5"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={plan ? 'e.g. Progressed after 4-week review: pain down, range of motion up' : 'e.g. Initial assessment findings'}
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Kept with this version, and shown to your patient.</p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className={primaryButtonClass}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {plan ? 'Save new version' : 'Create plan'}
          </Button>
        </div>
      </div>
    </Panel>
  )
}

function GoalRow({ goal, index, planId, editable }: { goal: Goal; index: number; planId: string; editable: boolean }) {
  const setAchieved = useMutation(api.physioCare.setGoalAchieved)
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    setBusy(true)
    try {
      await setAchieved({ planId: planId as never, goalIndex: index, achieved: !goal.achieved })
      if (!goal.achieved) playSound('success')
    } catch (error) {
      toast.error((error as Error).message || 'Couldn’t update the goal')
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <button
        type="button"
        onClick={toggle}
        disabled={!editable || busy}
        aria-pressed={Boolean(goal.achieved)}
        aria-label={goal.achieved ? 'Mark goal as not met' : 'Mark goal as met'}
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all active:scale-90',
          goal.achieved
            ? 'border-rh-teal bg-rh-teal text-white dark:border-rh-aqua dark:bg-rh-aqua dark:text-rh-night'
            : 'border-neutral-300 hover:border-rh-teal dark:border-neutral-600'
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : goal.achieved && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>
      <div className="min-w-0">
        <p className={cn('text-sm font-medium text-rh-night dark:text-white', goal.achieved && 'text-neutral-400 line-through dark:text-neutral-500')}>
          {goal.description}
        </p>
        {(goal.targetValue || goal.timeline) && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{[goal.targetValue, goal.timeline].filter(Boolean).join(' · ')}</p>
        )}
      </div>
    </li>
  )
}

export function CarePlanTab({ workspace }: { workspace: Workspace }) {
  const [editing, setEditing] = useState(false)
  const history = useQuery(api.physioCare.getCarePlanHistory, { patientId: workspace.patient._id }) as
    | { planId: string; planTitle: string; version: number; kind: string; reason: string; at: number }[]
    | undefined
  const plan = workspace.plan
  const isActive = workspace.episode.status === 'active'

  if (editing) return <CarePlanForm workspace={workspace} onDone={() => setEditing(false)} />

  return (
    <div className="space-y-5">
      {plan ? (
        <Panel
          title={plan.title}
          description={`Version ${plan.version} · updated ${formatDistanceToNow(plan.updatedAt, { addSuffix: true })}`}
          actions={
            isActive && (
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(true)}>
                Revise plan
              </Button>
            )
          }
        >
          <div className="space-y-5 px-5 pb-5 pt-3">
            {plan.description && <p className="text-sm text-neutral-600 dark:text-neutral-300">{plan.description}</p>}
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label="Frequency">{plan.sessionFrequency || 'Not set'}</Fact>
              <Fact label="Planned sessions">{plan.plannedSessions ?? 'Not set'}</Fact>
              <Fact label="Sessions done">{workspace.sessions.completed}</Fact>
              <Fact label="Review date">{plan.reviewDate ? format(plan.reviewDate, 'd MMM yyyy') : 'Not set'}</Fact>
            </dl>
            {plan.precautions && (
              <div className="flex gap-3 rounded-2xl bg-rh-peach p-4 text-sm text-[#7c4a0a] dark:bg-amber-400/10 dark:text-amber-200">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Precautions and safety guidance</p>
                  <p className="mt-0.5 whitespace-pre-line">{plan.precautions}</p>
                </div>
              </div>
            )}
            {plan.changeReason && (
              <div className="rounded-2xl bg-rh-canvas p-4 text-sm dark:bg-white/[0.03]">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Reason for this version</p>
                <p className="mt-1 text-rh-night dark:text-neutral-200">{plan.changeReason}</p>
              </div>
            )}
          </div>
          <div className="border-t border-black/[0.04] dark:border-white/[0.06]">
            <div className="flex items-center justify-between gap-3 px-5 pt-4">
              <p className="text-sm font-semibold text-rh-night dark:text-white">Functional goals</p>
              <span className="text-xs tabular-nums text-neutral-500">
                {plan.goalsAchieved} of {plan.goals.length} met
              </span>
            </div>
            <div className="px-5 pt-2">
              <Meter value={plan.goalsAchieved} max={plan.goals.length} />
            </div>
            <ul className="divide-y divide-black/[0.04] pb-2 pt-1 dark:divide-white/[0.05]">
              {plan.goals.map((goal, index) => (
                <GoalRow key={index} goal={goal} index={index} planId={plan._id} editable={isActive} />
              ))}
            </ul>
          </div>
        </Panel>
      ) : (
        <Panel>
          <EmptyState
            icon={<ShieldAlert />}
            title={isActive ? 'No care plan yet' : 'No care plan on record'}
            description="Set out functional goals, how often you’ll see them, when to review, and any precautions. Your patient sees it in their app."
            action={
              isActive && (
                <Button className={primaryButtonClass} onClick={() => setEditing(true)}>
                  Create care plan
                </Button>
              )
            }
          />
        </Panel>
      )}

      {plan && (
        <section className="space-y-3">
          <h3 className="px-1 text-[15px] font-semibold tracking-tight text-rh-night dark:text-white">Home exercise programme</h3>
          <InteractiveTreatmentPlan patientId={workspace.patient._id} variant="exercises" />
        </section>
      )}

      {history && history.length > 0 && (
        <Panel title="Plan history" description="Every version, with the reason it changed">
          <ol className="relative space-y-4 px-5 pb-5 pt-3">
            {history.map((entry) => (
              <li key={`${entry.planId}-${entry.version}`} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rh-mist text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
                  <History className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-rh-night dark:text-white">
                    {entry.planTitle} <StatusBadge className="ml-1">v{entry.version}</StatusBadge>
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">{entry.reason}</p>
                  <p className="text-xs text-neutral-400">{format(entry.at, 'd MMM yyyy, h:mm a')}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  )
}
