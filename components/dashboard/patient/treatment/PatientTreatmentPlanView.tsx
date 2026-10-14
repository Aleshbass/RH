'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CheckCircle2, Dumbbell, Loader2, Play, Target } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Using any types to avoid deep type instantiation errors with Convex
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Display name: the clinician's free-text name, then the library exercise, then the note. */
function exerciseName(exercise: any): string {
  return exercise.name || exercise.libraryName || exercise.notes || 'Exercise';
}

/** Instructions may be a single string (clinic programmes) or a list (library exercises). */
function exerciseInstructions(exercise: any): string[] {
  const raw = exercise.instructions ?? exercise.libraryInstructions;
  if (Array.isArray(raw)) return raw.filter((line) => typeof line === 'string' && line.trim());
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}

function PlanSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your home programme">
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-2 w-full" />
      </div>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function PatientTreatmentPlanView() {
  const [activeTab, setActiveTab] = useState<'today' | 'all' | 'goals'>('today');
  const [selectedExercise, setSelectedExercise] = useState<any>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [painLevel, setPainLevel] = useState<number>(0);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const plan: any = useQuery(api.treatmentPlans.getPatientActivePlan);
  const completionMap = useQuery(
    api.treatmentPlans.getExerciseCompletionMap,
    plan?._id ? { treatmentPlanId: plan._id as Id<'treatmentPlans'> } : 'skip'
  );
  const logExerciseCompletion = useMutation(api.treatmentPlans.logExerciseCompletion);

  if (plan === undefined) return <PlanSkeleton />;

  if (plan === null) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
        <Dumbbell className="mx-auto mb-3 h-8 w-8 text-gray-300" />
        <p className="text-sm font-medium text-gray-900">
          Your physiotherapist hasn&apos;t assigned a home programme yet
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
          When they do, your exercises will appear here so you can follow along and tick them off.
        </p>
      </div>
    );
  }

  const isExerciseCompleted = (exerciseId: string, phaseOrder: number) =>
    Boolean(completionMap?.[`${phaseOrder}-${exerciseId}`]);

  const allExercises: any[] = (plan.phases ?? []).flatMap((phase: any) =>
    (phase.exercises ?? []).map((exercise: any) => ({ ...exercise, phaseOrder: phase.order ?? 0 }))
  );

  // Exercises with a daily-type frequency (or none) are shown on "Today"
  const todaysExercises = allExercises.filter((exercise) => {
    const freq = (exercise.frequency ?? '').toLowerCase();
    return !freq || freq.includes('daily') || freq.includes('day') || freq.includes('today');
  });
  const visibleToday = todaysExercises.length > 0 ? todaysExercises : allExercises;

  const completedCount = allExercises.filter((ex) => isExerciseCompleted(ex.exerciseId, ex.phaseOrder)).length;
  const progressPercent = allExercises.length > 0 ? (completedCount / allExercises.length) * 100 : 0;
  const goals: any[] = (plan.goals ?? []).filter((goal: any) => goal?.description);

  const openCompletionModal = (exercise: any) => {
    setSelectedExercise(exercise);
    setIsCompletionModalOpen(true);
  };

  const handleExerciseComplete = async () => {
    if (!selectedExercise) return;
    setSaving(true);
    try {
      await logExerciseCompletion({
        treatmentPlanId: plan._id as Id<'treatmentPlans'>,
        exerciseId: selectedExercise.exerciseId,
        phaseOrder: selectedExercise.phaseOrder,
        notes: completionNotes.trim() || undefined,
        painLevel,
      });
      toast.success('Exercise marked as done');
      setIsCompletionModalOpen(false);
      setSelectedExercise(null);
      setCompletionNotes('');
      setPainLevel(0);
    } catch {
      toast.error('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderExercise = (exercise: any) => {
    const done = isExerciseCompleted(exercise.exerciseId, exercise.phaseOrder);
    const instructions = exerciseInstructions(exercise);
    return (
      <div
        key={`${exercise.phaseOrder}-${exercise.exerciseId}`}
        className={cn(
          'rounded-xl border bg-white p-4',
          done ? 'border-green-200' : 'border-gray-200'
        )}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">
            {done ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h4 className="truncate text-sm font-semibold text-gray-900">{exerciseName(exercise)}</h4>
            <p className="text-xs text-gray-500">
              {exercise.sets} sets × {exercise.reps} reps
              {exercise.frequency ? ` · ${exercise.frequency}` : ''}
            </p>
            {instructions.length > 0 && (
              <p className="line-clamp-2 text-sm text-gray-600">{instructions.join(' ')}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              {exercise.videoUrl && (
                <Button asChild variant="outline" size="sm" className="h-9">
                  <a href={exercise.videoUrl} target="_blank" rel="noopener noreferrer">
                    <Play className="mr-1.5 h-4 w-4" />
                    Watch
                  </a>
                </Button>
              )}
              {done ? (
                <span className="self-center text-xs font-medium text-green-700">Done</span>
              ) : (
                <Button size="sm" className="h-9" onClick={() => openCompletionModal(exercise)}>
                  Mark as done
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-900">{plan.title}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {plan.startDate ? `Started ${format(new Date(plan.startDate), 'd MMM yyyy')}` : null}
          {plan.endDate ? ` · Until ${format(new Date(plan.endDate), 'd MMM yyyy')}` : ''}
        </p>
        {allExercises.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Exercises done</span>
              <span className="tabular-nums">
                {completedCount} of {allExercises.length}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto whitespace-nowrap rounded-lg bg-gray-100 p-1">
        {(
          [
            ['today', 'Today'],
            ['all', 'All exercises'],
            ['goals', 'Goals'],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'today' && (
        <div className="space-y-3">
          <p className="px-1 text-sm text-gray-500">{format(new Date(), 'EEEE, d MMMM')}</p>
          {visibleToday.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
              No exercises in this programme yet.
            </p>
          ) : (
            visibleToday.map(renderExercise)
          )}
        </div>
      )}

      {activeTab === 'all' && (
        <div className="space-y-6">
          {(plan.phases ?? []).map((phase: any) => (
            <div key={phase.order} className="space-y-3">
              {(plan.phases?.length ?? 0) > 1 && (
                <h3 className="px-1 text-sm font-semibold text-gray-900">{phase.name}</h3>
              )}
              {(phase.exercises ?? []).length === 0 ? (
                <p className="px-1 text-sm text-gray-500">No exercises in this part yet.</p>
              ) : (
                phase.exercises.map((exercise: any) => renderExercise({ ...exercise, phaseOrder: phase.order ?? 0 }))
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'goals' && (
        <div className="space-y-3">
          {goals.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
              Your physiotherapist hasn&apos;t added goals to this programme.
            </p>
          ) : (
            goals.map((goal: any, index: number) => (
              <div key={index} className="flex gap-3 rounded-xl border border-gray-200 bg-white p-4">
                <Target className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{goal.description}</p>
                  {goal.targetValue && <p className="mt-0.5 text-sm text-gray-500">Target: {goal.targetValue}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Dialog open={isCompletionModalOpen} onOpenChange={setIsCompletionModalOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedExercise ? exerciseName(selectedExercise) : 'Exercise'}</DialogTitle>
            <DialogDescription>Let your physiotherapist know how it went.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {selectedExercise && exerciseInstructions(selectedExercise).length > 0 && (
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="mb-1 text-sm font-medium text-gray-900">How to do it</p>
                <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
                  {exerciseInstructions(selectedExercise).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="pain-level">Pain during the exercise (0 = none, 10 = worst)</Label>
              <div className="flex items-center gap-3">
                <input
                  id="pain-level"
                  type="range"
                  min="0"
                  max="10"
                  value={painLevel}
                  onChange={(e) => setPainLevel(Number(e.target.value))}
                  className="h-2 flex-1 cursor-pointer accent-brand"
                />
                <span className="w-8 text-center text-sm font-semibold tabular-nums">{painLevel}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="completion-notes">Notes (optional)</Label>
              <Textarea
                id="completion-notes"
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="Anything that was hard or painful?"
                className="resize-none"
              />
            </div>

            <Button onClick={handleExerciseComplete} disabled={saving} className="h-11 w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Mark as done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
