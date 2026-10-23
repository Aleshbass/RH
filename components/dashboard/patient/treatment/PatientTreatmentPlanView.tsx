'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Loader2,
  PlayCircle,
  Repeat,
  Target,
} from '@/components/icons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  EmptyState,
  InfoTip,
  LoadingBlocks,
  Panel,
  PatientDrawer,
  SectionLabel,
  StatusBadge,
  cardClass,
  fieldClass,
  primaryButtonClass,
  tabsListClass,
  tabsTriggerClass,
  type Tone,
} from '@/components/patient/ui';
import { playSound } from '@/lib/sounds';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------------------------- */
/* Types and helpers                                                                            */
/* -------------------------------------------------------------------------------------------- */

/** One exercise in a plan phase (treatmentPlans.phases[].exercises[]), plus library details. */
type PlanExercise = {
  exerciseId: string;
  name?: string;
  libraryName?: string;
  instructions?: string;
  libraryInstructions?: string | string[];
  sets: number;
  reps: number;
  duration?: string;
  frequency: string;
  notes?: string;
  videoUrl?: string;
  youtubeId?: string;
};

type PlanPhase = { name: string; description: string; duration: string; order: number; exercises: PlanExercise[] };
type PlanGoal = { description: string; targetValue: string; timeline: string; measurable: boolean; achieved?: boolean };

/** treatmentPlans row as the patient queries return it (the fields used here) */
type Plan = {
  _id: string;
  title: string;
  description?: string;
  status: string;
  startDate: number;
  endDate?: number;
  goals: PlanGoal[];
  phases: PlanPhase[];
  sessionFrequency?: string;
  plannedSessions?: number;
  reviewDate?: number;
  precautions?: string;
  physiotherapist?: { firstName?: string; lastName?: string } | null;
};

/** An exercise with the stage it belongs to (completions are keyed by both). */
type Exercise = PlanExercise & { phaseOrder: number; phaseName: string };

const PLAN_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'green' },
  completed: { label: 'Finished', tone: 'neutral' },
  on_hold: { label: 'Paused', tone: 'amber' },
  draft: { label: 'Being prepared', tone: 'neutral' },
  cancelled: { label: 'Stopped', tone: 'neutral' },
};

/** Display name: the clinician's free-text name, then the library exercise, then the note. */
function exerciseName(exercise: PlanExercise): string {
  return exercise.name || exercise.libraryName || exercise.notes || 'Exercise';
}

/** Instructions may be a single string (clinic programmes) or a list (library exercises). */
function exerciseInstructions(exercise: PlanExercise): string[] {
  const raw = exercise.instructions ?? exercise.libraryInstructions;
  if (Array.isArray(raw)) return raw.filter((line) => typeof line === 'string' && line.trim());
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}

function dose(exercise: PlanExercise) {
  const parts = [`${exercise.sets} × ${exercise.reps}`];
  if (exercise.duration) parts.push(exercise.duration);
  if (exercise.frequency) parts.push(exercise.frequency);
  return parts.join(' · ');
}

function videoLink(exercise: PlanExercise) {
  if (exercise.videoUrl) return exercise.videoUrl;
  if (exercise.youtubeId) return `https://www.youtube.com/watch?v=${exercise.youtubeId}`;
  return null;
}

function flatten(plan: Plan): Exercise[] {
  return (plan.phases ?? []).flatMap((phase) =>
    (phase.exercises ?? []).map((exercise) => ({ ...exercise, phaseOrder: phase.order ?? 0, phaseName: phase.name }))
  );
}

/** Exercises with a daily-type frequency (or none) are today's; if none are, all of them. */
function todaysExercises(all: Exercise[]) {
  const daily = all.filter((exercise) => {
    const freq = (exercise.frequency ?? '').toLowerCase();
    return !freq || freq.includes('daily') || freq.includes('day') || freq.includes('today');
  });
  return daily.length > 0 ? daily : all;
}

const keyOf = (exercise: Exercise) => `${exercise.phaseOrder}-${exercise.exerciseId}`;

function painTone(score: number, selected: boolean) {
  if (!selected) return 'border-pt-line-strong bg-pt-surface text-pt-muted hover:bg-pt-hover';
  if (score >= 7) return 'border-transparent bg-pt-rose-fg text-white dark:text-[#16181c]';
  if (score >= 4) return 'border-transparent bg-pt-amber-fg text-white dark:text-[#16181c]';
  return 'border-transparent bg-pt-green-fg text-white dark:text-[#16181c]';
}

/* -------------------------------------------------------------------------------------------- */
/* Pieces                                                                                       */
/* -------------------------------------------------------------------------------------------- */

const SETS_REPS_HELP =
  'Reps (repetitions) are how many times you do the movement in a row. A set is one round of reps. "3 × 10" means 3 rounds of 10, with a short rest between rounds.';

function ExerciseRow({ exercise, done, onOpen }: { exercise: Exercise; done: boolean; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50 sm:px-4',
          done ? 'border-transparent bg-pt-accent-soft' : 'border-pt-line bg-pt-surface hover:bg-pt-hover'
        )}
      >
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            done ? 'bg-pt-accent text-[#06210a]' : 'border-2 border-pt-line-strong text-transparent'
          )}
          aria-hidden
        >
          <Check className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-semibold', done ? 'text-pt-accent-ink' : 'text-pt-ink')}>
            {exerciseName(exercise)}
          </span>
          <span className="block truncate text-xs text-pt-muted">{dose(exercise)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-pt-muted">
          {done ? 'Done today' : 'How to'}
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>
    </li>
  );
}

/** Exercise details: dose, steps, video and (for the active plan) marking it done. */
function ExerciseDrawer({
  exercise,
  planId,
  done,
  readOnly,
  onClose,
}: {
  exercise: Exercise | null;
  planId: string;
  done: boolean;
  readOnly: boolean;
  onClose: () => void;
}) {
  const logExerciseCompletion = useMutation(api.treatmentPlans.logExerciseCompletion);
  const [pain, setPain] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => {
    onClose();
    setPain(null);
    setNotes('');
  };

  const markDone = async () => {
    if (!exercise) return;
    setSaving(true);
    try {
      await logExerciseCompletion({
        treatmentPlanId: planId as Id<'treatmentPlans'>,
        exerciseId: exercise.exerciseId,
        phaseOrder: exercise.phaseOrder,
        notes: notes.trim() || undefined,
        painLevel: pain ?? undefined,
      });
      playSound('success');
      toast.success('Nice work. Marked as done.');
      close();
    } catch {
      playSound('error');
      toast.error('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const steps = exercise ? exerciseInstructions(exercise) : [];
  const video = exercise ? videoLink(exercise) : null;
  const canLog = !readOnly && !done;

  return (
    <PatientDrawer
      open={exercise !== null}
      onOpenChange={(open) => !open && close()}
      title={exercise ? exerciseName(exercise) : 'Exercise'}
      description={exercise?.phaseName ? `Part of ${exercise.phaseName}` : undefined}
      footer={
        canLog ? (
          <Button onClick={markDone} disabled={saving} className={cn(primaryButtonClass, 'h-12 w-full text-[15px]')}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Mark as done
          </Button>
        ) : done && !readOnly ? (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-pt-accent-soft py-3 text-sm font-semibold text-pt-accent-ink">
            <Check className="h-4 w-4" />
            Done for today. See you tomorrow.
          </p>
        ) : undefined
      }
    >
      {exercise && (
        <div className="space-y-6">
          <div>
            <SectionLabel className="mb-2 flex items-center gap-1">
              Your dose
              <InfoTip>{SETS_REPS_HELP}</InfoTip>
            </SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-pt-sunken px-4 py-3">
                <p className="text-xs text-pt-muted">Sets</p>
                <p className="text-xl font-semibold tabular-nums text-pt-ink">{exercise.sets}</p>
              </div>
              <div className="rounded-2xl bg-pt-sunken px-4 py-3">
                <p className="text-xs text-pt-muted">Reps each set</p>
                <p className="text-xl font-semibold tabular-nums text-pt-ink">{exercise.reps}</p>
              </div>
              {exercise.duration && (
                <div className="rounded-2xl bg-pt-sunken px-4 py-3">
                  <p className="text-xs text-pt-muted">Hold or time</p>
                  <p className="text-sm font-semibold text-pt-ink">{exercise.duration}</p>
                </div>
              )}
              {exercise.frequency && (
                <div className="rounded-2xl bg-pt-sunken px-4 py-3">
                  <p className="text-xs text-pt-muted">How often</p>
                  <p className="text-sm font-semibold text-pt-ink">{exercise.frequency}</p>
                </div>
              )}
            </div>
          </div>

          {steps.length > 0 && (
            <div>
              <SectionLabel className="mb-2">How to do it</SectionLabel>
              <ol className="space-y-2.5">
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-pt-ink">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pt-primary text-xs font-semibold text-pt-on-primary">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {exercise.notes && exercise.notes !== exerciseName(exercise) && (
            <div className="rounded-2xl bg-pt-sun-bg px-4 py-3 text-sm text-pt-sun-fg">
              <p className="font-semibold">Note from your physio</p>
              <p className="mt-0.5 leading-relaxed">{exercise.notes}</p>
            </div>
          )}

          {video && (
            <a
              href={video}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-pt-line px-4 py-3 text-sm font-medium text-pt-ink transition-colors hover:bg-pt-hover"
            >
              <PlayCircle className="h-5 w-5 shrink-0" />
              <span className="flex-1">Watch how it’s done</span>
              <ArrowRight className="h-4 w-4 text-pt-faint" />
            </a>
          )}

          {canLog && (
            <div className="space-y-4 border-t border-pt-line pt-5">
              <div>
                <p className="flex items-center gap-1 text-sm font-semibold text-pt-ink">
                  How much did it hurt?
                  <InfoTip>Optional. 0 means no pain, 10 the worst you can imagine. Your physio sees this and can adjust the exercise.</InfoTip>
                </p>
                <div className="mt-2 grid grid-cols-11 gap-1" role="radiogroup" aria-label="Pain during the exercise">
                  {Array.from({ length: 11 }, (_, score) => (
                    <button
                      key={score}
                      type="button"
                      role="radio"
                      aria-checked={pain === score}
                      onClick={() => setPain(pain === score ? null : score)}
                      className={cn('h-10 rounded-xl border text-sm font-semibold tabular-nums transition-all active:scale-90', painTone(score, pain === score))}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="exercise-notes" className="text-sm font-semibold text-pt-ink">
                  Anything to tell your physio? <span className="font-normal text-pt-faint">(optional)</span>
                </label>
                <Textarea
                  id="exercise-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="For example: the last few reps were hard"
                  className={cn(fieldClass, 'mt-2 resize-none')}
                />
              </div>
            </div>
          )}

          {readOnly && (
            <p className="rounded-2xl bg-pt-sunken px-4 py-3 text-sm text-pt-muted">
              This plan isn’t active, so exercises from it can’t be ticked off.
            </p>
          )}
        </div>
      )}
    </PatientDrawer>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-pt-sunken" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-pt-accent transition-all duration-500" style={{ width: `${value}%` }} />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Plan                                                                                         */
/* -------------------------------------------------------------------------------------------- */

function PlanBody({ plan, interactive }: { plan: Plan; interactive: boolean }) {
  const completionMap = useQuery(
    api.treatmentPlans.getExerciseCompletionMap,
    interactive ? { treatmentPlanId: plan._id as Id<'treatmentPlans'> } : 'skip'
  ) as Record<string, boolean> | undefined;
  const [open, setOpen] = useState<Exercise | null>(null);

  const all = flatten(plan);
  const today = todaysExercises(all);
  const isDone = (exercise: Exercise) => Boolean(completionMap?.[keyOf(exercise)]);
  const doneToday = today.filter(isDone).length;
  const progress = today.length > 0 ? (doneToday / today.length) * 100 : 0;
  const goals = (plan.goals ?? []).filter((goal) => goal?.description);
  const phases = [...(plan.phases ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const status = PLAN_STATUS[plan.status] ?? { label: plan.status, tone: 'neutral' as Tone };
  const physio = [plan.physiotherapist?.firstName, plan.physiotherapist?.lastName].filter(Boolean).join(' ');

  const facts = [
    plan.sessionFrequency && { label: 'Sessions', value: plan.sessionFrequency, help: 'How often your physio plans to see you.' },
    plan.plannedSessions && { label: 'Planned visits', value: String(plan.plannedSessions), help: 'How many sessions your physio expects this plan to take.' },
    plan.reviewDate && {
      label: 'Next review',
      value: format(plan.reviewDate, 'd MMM yyyy'),
      help: 'When your physio plans to check your progress and update this plan.',
    },
  ].filter(Boolean) as { label: string; value: string; help: string }[];

  return (
    <div className="space-y-6">
      {/* Summary */}
      <section className={cn(cardClass, 'p-5 sm:p-6')} data-tour="plan-summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-pt-ink">{plan.title}</h2>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </div>
            <p className="mt-1 text-sm text-pt-muted">
              {physio ? `From ${physio} · ` : ''}
              Started {format(plan.startDate, 'd MMM yyyy')}
              {plan.endDate ? ` · until ${format(plan.endDate, 'd MMM yyyy')}` : ''}
            </p>
          </div>
        </div>
        {plan.description && <p className="mt-3 text-sm leading-relaxed text-pt-muted">{plan.description}</p>}

        {interactive && today.length > 0 && (
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 font-medium text-pt-ink">
                Today’s exercises
                <InfoTip>
                  Ticks reset every morning. Doing your exercises regularly (your physio calls this adherence) is one of the biggest things you can
                  do to recover faster.
                </InfoTip>
              </span>
              <span className="tabular-nums text-pt-muted">
                {doneToday} of {today.length} done
              </span>
            </div>
            <ProgressBar value={progress} />
          </div>
        )}

        {facts.length > 0 && (
          <dl className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.label} className="rounded-2xl bg-pt-sunken px-4 py-3">
                <dt className="flex items-center gap-1 text-xs text-pt-muted">
                  {fact.label}
                  <InfoTip>{fact.help}</InfoTip>
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-pt-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {plan.precautions && (
          <div className="mt-4 flex gap-3 rounded-2xl bg-pt-amber-bg px-4 py-3 text-sm text-pt-amber-fg">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Take care</p>
              <p className="mt-0.5 leading-relaxed">{plan.precautions}</p>
            </div>
          </div>
        )}
      </section>

      <Tabs defaultValue={interactive ? 'today' : 'all'} className="space-y-4">
        <TabsList className={tabsListClass}>
          {interactive && (
            <TabsTrigger value="today" className={tabsTriggerClass}>
              Today
            </TabsTrigger>
          )}
          <TabsTrigger value="all" className={tabsTriggerClass}>
            All exercises
          </TabsTrigger>
          <TabsTrigger value="goals" className={tabsTriggerClass}>
            Goals & stages
          </TabsTrigger>
        </TabsList>

        {interactive && (
          <TabsContent value="today" className="mt-0 space-y-3">
            <p className="px-1 text-sm text-pt-muted">
              {format(new Date(), 'EEEE d MMMM')} · tap an exercise to see how to do it
            </p>
            {today.length === 0 ? (
              <Panel>
                <EmptyState icon={Dumbbell} title="No exercises yet" description="Your physio hasn’t added exercises to this plan yet." />
              </Panel>
            ) : (
              <ul className="space-y-2">
                {today.map((exercise) => (
                  <ExerciseRow key={keyOf(exercise)} exercise={exercise} done={isDone(exercise)} onOpen={() => setOpen(exercise)} />
                ))}
              </ul>
            )}
          </TabsContent>
        )}

        <TabsContent value="all" className="mt-0 space-y-6">
          {all.length === 0 ? (
            <Panel>
              <EmptyState icon={Dumbbell} title="No exercises yet" description="Your physio hasn’t added exercises to this plan yet." />
            </Panel>
          ) : (
            phases.map((phase, index) => (
              <div key={phase.order} className="space-y-2">
                <div className="flex items-center gap-1 px-1">
                  <SectionLabel>
                    {phases.length > 1 ? `Stage ${index + 1} · ` : ''}
                    {phase.name}
                  </SectionLabel>
                  {index === 0 && phases.length > 1 && (
                    <InfoTip>
                      Your plan is split into stages. Each one builds on the last, and your physio moves you on when you’re ready.
                    </InfoTip>
                  )}
                </div>
                {(phase.exercises ?? []).length === 0 ? (
                  <p className="px-1 text-sm text-pt-muted">No exercises in this stage yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {phase.exercises.map((ex) => {
                      const exercise: Exercise = { ...ex, phaseOrder: phase.order ?? 0, phaseName: phase.name };
                      return (
                        <ExerciseRow
                          key={keyOf(exercise)}
                          exercise={exercise}
                          done={interactive && isDone(exercise)}
                          onOpen={() => setOpen(exercise)}
                        />
                      );
                    })}
                  </ul>
                )}
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="goals" className="mt-0 space-y-6">
          <Panel
            title="Your goals"
            info="What you and your physio are working towards. Your physio ticks a goal off when you reach it."
            bodyClassName="px-3 pb-3 pt-2 sm:px-4"
          >
            {goals.length === 0 ? (
              <EmptyState icon={Target} title="No goals yet" description="Your physio hasn’t added goals to this plan." className="py-8" />
            ) : (
              <ul className="space-y-1">
                {goals.map((goal, i) => (
                  <li key={i} className="flex gap-3 rounded-2xl px-2 py-3">
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                        goal.achieved ? 'bg-pt-accent text-[#06210a]' : 'bg-pt-blue-bg text-pt-blue-fg'
                      )}
                    >
                      {goal.achieved ? <Check className="h-4 w-4" /> : <Target className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-pt-ink">{goal.description}</p>
                      <p className="mt-0.5 text-xs text-pt-muted">
                        {[goal.targetValue && `Target: ${goal.targetValue}`, goal.timeline && `By: ${goal.timeline}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {goal.achieved && <StatusBadge tone="green">Reached</StatusBadge>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {phases.length > 0 && (
            <Panel
              title="Stages of your plan"
              info="Your recovery is planned in stages. Each stage has its own focus and exercises."
              bodyClassName="px-5 pb-5 pt-3 sm:px-6"
            >
              <ol className="relative space-y-5 border-l-2 border-pt-line pl-5">
                {phases.map((phase, index) => (
                  <li key={phase.order} className="relative">
                    <span className="absolute -left-[29px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-pt-primary text-[11px] font-semibold text-pt-on-primary">
                      {index + 1}
                    </span>
                    <p className="text-sm font-semibold text-pt-ink">{phase.name}</p>
                    <p className="text-xs text-pt-muted">
                      {[phase.duration, `${phase.exercises?.length ?? 0} exercise${phase.exercises?.length === 1 ? '' : 's'}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {phase.description && <p className="mt-1 text-sm leading-relaxed text-pt-muted">{phase.description}</p>}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </TabsContent>
      </Tabs>

      <ExerciseDrawer
        exercise={open}
        planId={plan._id}
        done={open ? interactive && isDone(open) : false}
        readOnly={!interactive}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

function OtherPlans({ plans }: { plans: Plan[] }) {
  if (plans.length === 0) return null;
  return (
    <Panel title="Earlier plans" info="Plans that have finished, are paused or were replaced by a newer one." bodyClassName="px-3 pb-3 pt-2">
      <ul>
        {plans.map((plan) => {
          const status = PLAN_STATUS[plan.status] ?? { label: plan.status, tone: 'neutral' as Tone };
          return (
            <li key={plan._id}>
              <Link
                href={`/dashboard/patient/treatment-plans/${plan._id}`}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-pt-hover"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pt-sunken text-pt-muted">
                  <ClipboardList className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-pt-ink">{plan.title}</span>
                  <span className="block text-xs text-pt-muted">Started {format(plan.startDate, 'd MMM yyyy')}</span>
                </span>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-pt-faint" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/**
 * The patient's treatment plan. Without `planId`: the active plan (exercises can be ticked off)
 * and any earlier plans. With `planId`: that plan, read-only unless it is the active one.
 */
export function PatientTreatmentPlanView({ planId }: { planId?: string }) {
  const user = useQuery(api.users.getMyUser) as { _id: Id<'users'> } | null | undefined;
  const activePlan = useQuery(api.treatmentPlans.getPatientActivePlan) as Plan | null | undefined;
  const allPlans = useQuery(api.treatmentPlans.getPatientTreatmentPlans, user ? { patientId: user._id } : 'skip') as
    | Plan[]
    | undefined;

  if (activePlan === undefined || (planId && allPlans === undefined)) return <LoadingBlocks rows={4} />;

  // The active-plan query has the exercise details but not the physio's name; the list has the name
  const current = activePlan
    ? { ...activePlan, physiotherapist: activePlan.physiotherapist ?? allPlans?.find((p) => p._id === activePlan._id)?.physiotherapist ?? null }
    : null;

  // A specific plan
  if (planId) {
    if (current && current._id === planId) return <PlanBody plan={current} interactive />;
    const plan = allPlans?.find((p) => p._id === planId);
    if (!plan) {
      return (
        <Panel>
          <EmptyState
            icon={ClipboardList}
            title="Plan not found"
            description="This plan may have been removed, or the link is out of date."
            action={
              <Button asChild className={primaryButtonClass}>
                <Link href="/dashboard/patient/treatment-plans">Go to my plan</Link>
              </Button>
            }
          />
        </Panel>
      );
    }
    return (
      <div className="space-y-4">
        {activePlan && (
          <Link
            href="/dashboard/patient/treatment-plans"
            className="flex items-center justify-between gap-3 rounded-2xl bg-pt-sun-bg px-4 py-3 text-sm text-pt-sun-fg"
          >
            <span>
              You’re looking at an older plan. Your current one is <span className="font-semibold">{activePlan.title}</span>.
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </Link>
        )}
        <PlanBody plan={plan} interactive={false} />
      </div>
    );
  }

  const others = (allPlans ?? []).filter((p) => p._id !== activePlan?._id && p.status !== 'draft');

  if (activePlan === null) {
    return (
      <div className="space-y-6">
        <Panel>
          <EmptyState
            icon={ClipboardList}
            title="No active plan yet"
            description="After your assessment, your physio writes a plan with your goals and home exercises. It will appear here."
            action={
              <Button asChild className={primaryButtonClass}>
                <Link href="/dashboard/patient/appointments?book=1">
                  <Calendar className="mr-2 h-4 w-4" />
                  Book a session
                </Link>
              </Button>
            }
          />
        </Panel>
        <OtherPlans plans={others} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PlanBody plan={current ?? activePlan} interactive />
      <OtherPlans plans={others} />
    </div>
  );
}

/**
 * Today's exercises from the active treatment plan, for the Exercises page. Renders `fallback`
 * when there is no active plan or it has no exercises.
 */
export function TodayPlanExercises({ fallback = null }: { fallback?: ReactNode }) {
  const plan = useQuery(api.treatmentPlans.getPatientActivePlan) as Plan | null | undefined;
  const completionMap = useQuery(
    api.treatmentPlans.getExerciseCompletionMap,
    plan?._id ? { treatmentPlanId: plan._id as Id<'treatmentPlans'> } : 'skip'
  ) as Record<string, boolean> | undefined;
  const [open, setOpen] = useState<Exercise | null>(null);

  if (plan === undefined) return null;
  if (!plan) return <>{fallback}</>;
  const today = todaysExercises(flatten(plan));
  if (today.length === 0) return <>{fallback}</>;
  const isDone = (exercise: Exercise) => Boolean(completionMap?.[keyOf(exercise)]);
  const doneCount = today.filter(isDone).length;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-pt-muted" />
          Today from your treatment plan
        </span>
      }
      description={`${plan.title} · ${doneCount} of ${today.length} done`}
      info="Exercises from the plan your physio wrote for you. Tap one to see how to do it, then mark it done. Ticks reset every morning."
      actions={
        <Link href="/dashboard/patient/treatment-plans" className="text-sm font-medium text-pt-muted hover:text-pt-ink">
          Full plan
        </Link>
      }
    >
      <div className="mb-3">
        <ProgressBar value={(doneCount / today.length) * 100} />
      </div>
      <ul className="space-y-2">
        {today.map((exercise) => (
          <ExerciseRow key={keyOf(exercise)} exercise={exercise} done={isDone(exercise)} onOpen={() => setOpen(exercise)} />
        ))}
      </ul>
      <ExerciseDrawer
        exercise={open}
        planId={plan._id}
        done={open ? isDone(open) : false}
        readOnly={false}
        onClose={() => setOpen(null)}
      />
    </Panel>
  );
}
