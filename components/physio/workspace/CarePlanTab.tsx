'use client'

import { useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { Check, History, Layers, Loader2, ShieldAlert } from '@/components/icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { InteractiveTreatmentPlan } from '@/components/dashboard/physiotherapist/treatment/InteractiveTreatmentPlan'
import { ExerciseProgramsPanel } from '@/components/exercise-programs/ExerciseProgramsPanel'
import { EmptyState, Panel, StatusBadge, primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui'
import { programError } from '@/components/exercise-programs/errors'
import { useMutationUntyped, useQueryUntyped } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { goalMeasureName, goalProgress, goalValueText, type GoalMeasure, type GoalProgress, type MeasuredNote } from '@/convex/helpers/goalMeasures'
import { Fact, Meter, useWorkspaceReadOnly, workspaceApi, type Goal, type Workspace } from './shared'
import { ReportSummary } from './ProgressReportPanel'

/** Baseline → latest → target for a goal linked to a measure, with how far along it is. */
function GoalMeasureProgress({ link, progress }: { link: GoalMeasure; progress: GoalProgress }) {
  const text = (value: number) => goalValueText(link, value)
  const parts = [
    progress.baseline !== null ? `Baseline ${text(progress.baseline)}` : 'No value recorded yet',
    progress.latest !== null && progress.latestAt !== progress.baselineAt ? `now ${text(progress.latest)}` : null,
    `target ${text(link.target)}`,
  ].filter(Boolean)
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-xs text-pt-muted">
          <span className="font-medium text-pt-ink">{goalMeasureName(link)}</span> · {parts.join(' · ')}
        </p>
        {progress.percent !== null && <span className="shrink-0 text-xs font-semibold tabular-nums text-pt-ink">{progress.percent}%</span>}
      </div>
      {progress.percent !== null && <Meter value={progress.percent} max={100} />}
    </div>
  )
}

function GoalRow({
  goal,
  index,
  planId,
  editable,
  notes,
  since,
}: {
  goal: Goal
  index: number
  planId: string
  editable: boolean
  notes: MeasuredNote[] | undefined
  since: number
}) {
  const progress = goal.measure ? goalProgress(goal.measure, notes, since) : null
  const setAchieved = useMutationUntyped(workspaceApi.physioCare.setGoalAchieved)
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    setBusy(true)
    try {
      await setAchieved({ planId, goalIndex: index, achieved: !goal.achieved })
      if (!goal.achieved) playSound('success')
    } catch (error) {
      toast.error(programError(error, 'Couldn’t update the goal. Please try again.'))
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
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition active:scale-90',
          goal.achieved ? 'border-pt-accent bg-pt-accent text-[#06210a]' : 'border-pt-line-strong hover:border-pt-ink'
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : goal.achieved && <Check className="h-3.5 w-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium text-pt-ink', goal.achieved && 'text-pt-faint line-through')}>{goal.description}</p>
        {(goal.targetValue || goal.timeline) && <p className="text-xs text-pt-muted">{[goal.targetValue, goal.timeline].filter(Boolean).join(' · ')}</p>}
        {goal.measure && progress && !goal.achieved && <GoalMeasureProgress link={goal.measure} progress={progress} />}
        {/* Reaching the number never ticks the goal on its own: the physio decides */}
        {progress?.reached && !goal.achieved && editable && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone="green" dot>
              Target reached
            </StatusBadge>
            <Button size="sm" className={cn(secondaryButtonClass, 'h-9')} disabled={busy} onClick={toggle}>
              Mark as met
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}

export function CarePlanTab({
  workspace,
  onEditPlan,
  onSaveTemplate,
}: {
  workspace: Workspace
  /** Opens the care plan drawer (create, or revise the current plan). */
  onEditPlan: () => void
  onSaveTemplate: () => void
}) {
  const history = useQueryUntyped(workspaceApi.physioCare.getCarePlanHistory, { patientId: workspace.patient._id }) as
    | { planId: string; planTitle: string; version: number; kind: string; reason: string; at: number }[]
    | undefined
  const plan = workspace.plan
  const isActive = workspace.episode.status === 'active'
  // The clinic owner reading the record: the plan, goals and programmes show; only the clinician changes them
  const readOnly = useWorkspaceReadOnly()
  // Measures for goals with a measured target (clinic colleagues' notes included, as on the server)
  const hasLinkedGoal = Boolean(plan?.goals.some((g) => g.measure))
  const measuredNotes = useQueryUntyped(workspaceApi.physioCare.getClinicalNoteMeasures, hasLinkedGoal ? { patientId: workspace.patient._id } : 'skip') as
    | MeasuredNote[]
    | undefined

  return (
    <div className="space-y-5">
      {plan ? (
        <Panel
          title={plan.title}
          description={`Version ${plan.version} · updated ${formatDistanceToNow(plan.updatedAt, { addSuffix: true })}`}
          info={
            readOnly
              ? 'The patient sees this plan in their app. Each revision is kept as a new version with the clinician’s reason.'
              : 'The patient sees this plan in their app. Each revision is kept as a new version with your reason, and they’re told when it changes.'
          }
          actions={
            !readOnly && (
            <>
              <Button size="sm" className={cn(secondaryButtonClass, 'h-9')} onClick={onSaveTemplate}>
                <Layers className="mr-1.5 h-3.5 w-3.5" />
                Save as template
              </Button>
              {isActive && (
                <Button size="sm" className={cn(primaryButtonClass, 'h-9')} onClick={onEditPlan}>
                  Revise plan
                </Button>
              )}
            </>
            )
          }
        >
          <div className="space-y-5 px-5 pb-5 pt-3">
            {plan.description && <p className="text-sm text-pt-muted">{plan.description}</p>}
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label="Frequency">{plan.sessionFrequency || 'Not set'}</Fact>
              <Fact label="Planned sessions">{plan.plannedSessions ?? 'Not set'}</Fact>
              <Fact label="Sessions done">{workspace.sessions.completed}</Fact>
              <Fact label="Review date">{plan.reviewDate ? format(plan.reviewDate, 'd MMM yyyy') : 'Not set'}</Fact>
            </dl>
            {plan.precautions && (
              <div className="flex gap-3 rounded-2xl bg-pt-rose-bg p-4 text-sm text-pt-rose-fg">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Precautions and safety guidance</p>
                  <p className="mt-0.5 whitespace-pre-line text-pt-ink">{plan.precautions}</p>
                </div>
              </div>
            )}
            {plan.changeReason && (
              <div className="rounded-2xl bg-pt-sunken p-4 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">Reason for this version</p>
                <p className="mt-1 text-pt-ink">{plan.changeReason}</p>
              </div>
            )}
          </div>
          <div className="border-t border-pt-line">
            <div className="flex items-center justify-between gap-3 px-5 pt-4">
              <p className="text-sm font-semibold text-pt-ink">Functional goals</p>
              <span className="text-xs tabular-nums text-pt-muted">
                {plan.goalsAchieved} of {plan.goals.length} met
              </span>
            </div>
            <div className="px-5 pt-2">
              <Meter value={plan.goalsAchieved} max={plan.goals.length} />
            </div>
            <ul className="divide-y divide-pt-line pb-2 pt-1">
              {plan.goals.map((goal, index) => (
                <GoalRow key={index} goal={goal} index={index} planId={plan._id} editable={isActive && !readOnly} notes={measuredNotes} since={workspace.episode.startedAt} />
              ))}
            </ul>
          </div>
        </Panel>
      ) : (
        <Panel>
          <EmptyState
            icon={<ShieldAlert />}
            title={isActive ? 'No care plan yet' : 'No care plan on record'}
            description={
              readOnly
                ? 'Their clinician sets the functional goals, how often they’ll be seen, when to review, and any precautions. It shows here as soon as it’s written.'
                : 'Set out functional goals, how often you’ll see them, when to review, and any precautions. Start blank or from one of your templates. Your patient sees it in their app.'
            }
            action={
              isActive && !readOnly && (
                <Button className={primaryButtonClass} onClick={onEditPlan}>
                  Create care plan
                </Button>
              )
            }
          />
        </Panel>
      )}

      {!readOnly && <ReportSummary patientId={workspace.patient._id} firstName={workspace.patient.firstName} />}

      <ExerciseProgramsPanel
        patientId={workspace.patient._id}
        patientName={workspace.patient.firstName || 'your patient'}
        hasPhone={Boolean(workspace.patient.phoneNumber?.replace(/\D/g, '').length)}
        canWrite={isActive && !readOnly}
      />

      {plan && plan.totalExercises > 0 && !readOnly && (
        <section className="space-y-3">
          <h3 className="px-1 text-[15px] font-semibold tracking-tight text-pt-ink">Exercises in the care plan</h3>
          <InteractiveTreatmentPlan patientId={workspace.patient._id} variant="exercises" />
        </section>
      )}

      {history && history.length > 0 && (
        <Panel title="Plan history" description="Every version, with the reason it changed">
          <ol className="relative space-y-4 px-5 pb-5 pt-3">
            {history.map((entry) => (
              <li key={`${entry.planId}-${entry.version}`} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pt-sunken text-pt-ink">
                  <History className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-pt-ink">
                    {entry.planTitle} <StatusBadge className="ml-1">v{entry.version}</StatusBadge>
                  </p>
                  <p className="text-sm text-pt-muted">{entry.reason}</p>
                  <p className="text-xs text-pt-faint">{format(entry.at, 'd MMM yyyy, h:mm a')}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  )
}
