'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Target, Dumbbell, Calendar, TrendingUp, ChevronDown, ChevronUp, Info, Trash2 } from '@/components/icons';
import { format } from 'date-fns';
import { InteractiveTreatmentPlan as TreatmentPlanType } from '@/types/assessments';
import { ExerciseLibrary } from './ExerciseLibrary';
import { LazyExerciseMedia } from './LazyExerciseMedia';
import { UploadDropzone } from '@/components/ui/UploadDropzone';

interface InteractiveTreatmentPlanProps {
  patientId: string;
  plan?: TreatmentPlanType;
  /** 'exercises' shows only the home exercise programme (the workspace has its own plan editor). */
  variant?: 'full' | 'exercises';
}

export function InteractiveTreatmentPlan({ patientId, plan, variant = 'full' }: InteractiveTreatmentPlanProps) {
  const exercisesOnly = variant === 'exercises';
  const [showExerciseLibrary, setShowExerciseLibrary] = useState(false);
  const [showGoalsSection, setShowGoalsSection] = useState(true);
  const [newGoal, setNewGoal] = useState({ description: '', targetValue: '' });
  const [uploadingImages, setUploadingImages] = useState<Record<string, { before?: boolean; after?: boolean }>>({});
  const [deletePlanDialogOpen, setDeletePlanDialogOpen] = useState(false);
  const [deleteExerciseDialog, setDeleteExerciseDialog] = useState<{ open: boolean; phaseOrder: number; exerciseId: string } | null>(null);
  const { toast } = useToast();

  const updateTreatmentPlan = useMutation(api.treatmentPlans.updateTreatmentPlan);
  const createTreatmentPlan = useMutation(api.treatmentPlans.createTreatmentPlan);
  const updateTreatmentPlanStatus = useMutation(api.treatmentPlans.updateTreatmentPlanStatus);
  const deleteTreatmentPlan = useMutation(api.treatmentPlans.deleteTreatmentPlan);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  // Get treatment plans for the patient
  const treatmentPlans = useQuery(api.treatmentPlans.getPatientTreatmentPlans, {
    patientId: patientId,
    status: 'active'
  });

  const currentPlan = treatmentPlans?.[0] || plan;


  // Fetch exercise details from Convex
  const exerciseIds = currentPlan?.phases?.flatMap((p: any) => p.exercises.map((e: any) => e.exerciseId)) || [];
  const exercisesData = useQuery(api.exercises.getExercisesByIds, { ids: exerciseIds });

  // Create a map for easy lookup
  const exerciseDetails = React.useMemo(() => {
    const details: Record<string, any> = {};
    if (exercisesData) {
      exercisesData.forEach((ex: any) => {
        if (ex) details[ex._id] = ex;
      });
    }
    return details;
  }, [exercisesData]);

  // Fetch patient progress
  const weeklyProgress = useQuery(api.exerciseCompletions.getWeeklyProgress,
    currentPlan?._id ? { treatmentPlanId: currentPlan._id as any } : "skip"
  );

  const handleUploadExerciseImage = async (
    phaseOrder: number,
    exerciseId: string,
    which: 'before' | 'after',
    file: File | null
  ) => {
    if (!currentPlan || !file) return;
    const key = `${phaseOrder}-${exerciseId}`;
    setUploadingImages((prev) => ({ ...prev, [key]: { ...prev[key], [which]: true } }));
    try {
      const uploadUrl = await generateUploadUrl({ fileType: file.type || 'application/octet-stream', fileName: file.name });
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      const { storageId } = await res.json();

      const updatedPhases: any[] = (currentPlan.phases ? [...currentPlan.phases] : []).map((p: any) => ({ ...p, exercises: [...p.exercises] }));
      const targetPhase = updatedPhases.find((p) => p.order === phaseOrder);
      if (!targetPhase) throw new Error('Phase not found');
      const targetExercise = targetPhase.exercises.find((e: any) => e.exerciseId === exerciseId);
      if (!targetExercise) throw new Error('Exercise not found in phase');
      if (which === 'before') targetExercise.beforeImageStorageId = storageId;
      if (which === 'after') targetExercise.afterImageStorageId = storageId;

      await updateTreatmentPlan({
        treatmentPlanId: currentPlan._id as any,
        phases: updatedPhases,
      });

      toast({
        title: 'Image Uploaded',
        description: `${which === 'before' ? 'Before' : 'After'} image saved for this exercise.`,
      });
    } catch (e) {
      toast({
        title: 'Upload failed',
        description: 'Could not upload the image. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploadingImages((prev) => ({ ...prev, [key]: { ...prev[key], [which]: false } }));
    }
  };

  const handleCreatePlan = async () => {
    try {
      const planId = await createTreatmentPlan({
        patientId: patientId as any,
        title: 'Treatment Plan',
        description: '',
        startDate: Date.now(),
        endDate: undefined,
        priority: 'medium',
        goals: [],
        phases: [],
        reviewInterval: 14,
        notes: '',
      });

      await updateTreatmentPlanStatus({
        treatmentPlanId: planId as any,
        status: 'active',
      });

      toast({
        title: 'Plan Created',
        description: 'A new treatment plan has been created and activated.',
      });
    } catch (e) {
      toast({
        title: 'Error',
        description: 'Failed to create treatment plan.',
        variant: 'destructive',
      });
    }
  };

  const addExerciseToPlan = async (exercise: any) => {
    if (!currentPlan) return;

    try {
      const updatedPhases = currentPlan.phases ? [...currentPlan.phases] : [];

      if (updatedPhases.length === 0) {
        updatedPhases.push({
          name: 'Phase 1',
          description: 'Initial treatment phase',
          duration: '2 weeks',
          order: 1,
          exercises: [{
            exerciseId: exercise._id,
            sets: 3,
            reps: 10,
            frequency: 'Daily',
            notes: exercise.instructions?.join('. ') || ''
          }]
        });
      } else {
        const lastPhase = updatedPhases[updatedPhases.length - 1];
        lastPhase.exercises.push({
          exerciseId: exercise._id,
          sets: 3,
          reps: 10,
          frequency: 'Daily',
          notes: exercise.instructions?.join('. ') || ''
        });
      }

      await updateTreatmentPlan({
        treatmentPlanId: currentPlan._id as any,
        phases: updatedPhases
      });

      setShowExerciseLibrary(false);
      toast({
        title: 'Exercise Added',
        description: `${exercise.name} has been added to the treatment plan.`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to add exercise to treatment plan.',
        variant: 'destructive',
      });
    }
  };

  const addGoal = async () => {
    if (!currentPlan || !newGoal.description || !newGoal.targetValue) return;

    try {
      const updatedGoals = currentPlan.goals ? [...currentPlan.goals] : [];
      updatedGoals.push({
        description: newGoal.description,
        targetValue: newGoal.targetValue,
        timeline: format(new Date(), 'yyyy-MM-dd'),
        measurable: true
      });

      await updateTreatmentPlan({
        treatmentPlanId: currentPlan._id as any,
        goals: updatedGoals
      });

      setNewGoal({ description: '', targetValue: '' });
      toast({
        title: 'Goal Added',
        description: 'New treatment goal has been added successfully.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to add goal to treatment plan.',
        variant: 'destructive',
      });
    }
  };

  const handleDeletePlan = async () => {
    if (!currentPlan) return;

    try {
      await deleteTreatmentPlan({ treatmentPlanId: currentPlan._id as any });
      setDeletePlanDialogOpen(false);
      toast({
        title: 'Plan Deleted',
        description: 'Treatment plan has been successfully deleted.',
      });
      // Optionally navigate back to patient details
      window.history.back();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete treatment plan.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteExercise = async (phaseOrder: number, exerciseId: string) => {
    if (!currentPlan) return;

    try {
      // Remove the exercise from the phases
      const updatedPhases = (currentPlan.phases ? [...currentPlan.phases] : []).map((p: any) => {
        if (p.order === phaseOrder) {
          return {
            ...p,
            exercises: p.exercises.filter((e: any) => e.exerciseId !== exerciseId)
          };
        }
        return { ...p };
      });

      await updateTreatmentPlan({
        treatmentPlanId: currentPlan._id as any,
        phases: updatedPhases
      });

      setDeleteExerciseDialog(null);
      toast({
        title: 'Exercise Removed',
        description: 'Exercise has been successfully removed from the treatment plan.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove exercise from treatment plan.',
        variant: 'destructive',
      });
    }
  };

  const totalExercises = currentPlan?.phases?.reduce((acc: number, phase: any) => acc + phase.exercises.length, 0) || 0;

  if (!currentPlan && exercisesOnly) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 px-6 py-10 text-center dark:border-white/10">
        <Dumbbell className="mx-auto h-7 w-7 text-neutral-300 dark:text-neutral-600" />
        <p className="mt-2 text-sm font-semibold text-rh-night dark:text-white">Set up the care plan first</p>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Once there's a plan, you can add home exercises to it here.</p>
      </div>
    );
  }

  if (!currentPlan) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 px-6 py-14 dark:border-neutral-700">
        <div className="max-w-sm space-y-2 text-center">
          <Dumbbell className="mx-auto h-8 w-8 text-neutral-300 dark:text-neutral-600" />
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">No treatment plan yet</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Set out the exercises and goals for this patient’s recovery.</p>
          <Button onClick={handleCreatePlan} size="sm" className="mt-2 bg-[#005b57] text-white hover:bg-[#00443e] dark:bg-[#2dd4bf] dark:text-neutral-950 dark:hover:bg-[#5eead4]">
            <Plus className="mr-1.5 h-4 w-4" />
            Create a plan
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan summary */}
      {!exercisesOnly && (
      <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">{currentPlan.title}</h2>
              <Badge
                variant="secondary"
                className={
                  currentPlan.status === 'active'
                    ? 'bg-[#005b57]/10 text-[#005b57] dark:bg-[#2dd4bf]/10 dark:text-[#2dd4bf]'
                    : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                }
              >
                {currentPlan.status === 'active' ? 'Active' : currentPlan.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{currentPlan.description || 'Personalised treatment plan'}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeletePlanDialogOpen(true)}
            className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete plan
          </Button>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-3">
          {[
            ['Exercises', totalExercises],
            ['Goals', currentPlan.goals?.length || 0],
            ['Done this week', `${Math.round(weeklyProgress?.completionRate || 0)}%`],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-neutral-900 dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span>
              Started {currentPlan.startDate ? format(new Date(currentPlan.startDate), 'd MMM yyyy') : 'recently'}
            </span>
            <span>Target: {currentPlan.endDate ? format(new Date(currentPlan.endDate), 'd MMM yyyy') : 'ongoing'}</span>
          </div>
          <Progress value={weeklyProgress?.completionRate || 0} className="mt-2 h-1.5" />
        </div>

        {weeklyProgress?.completions && weeklyProgress.completions.length > 0 && (
          <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Recent activity</h4>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
              {weeklyProgress.completions.slice(0, 5).map((completion: any) => (
                <div
                  key={completion._id}
                  className="w-44 shrink-0 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
                >
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {format(new Date(completion.completedAt), 'd MMM, h:mm a')}
                  </div>
                  <div className="mt-1 truncate text-sm font-medium text-neutral-900 dark:text-white">
                    {exerciseDetails[completion.exerciseId]?.name || 'Exercise'}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {completion.setsCompleted} sets × {completion.repsCompleted} reps
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      )}

      {/* Exercises */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Exercises</h3>
          <Dialog open={showExerciseLibrary} onOpenChange={setShowExerciseLibrary}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-[#005b57] text-white hover:bg-[#00443e] dark:bg-[#2dd4bf] dark:text-neutral-950 dark:hover:bg-[#5eead4]">
                <Plus className="mr-1.5 h-4 w-4" />
                Add exercise
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] max-w-6xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Exercise library</DialogTitle>
              </DialogHeader>
              <ExerciseLibrary onExerciseSelect={addExerciseToPlan} />
            </DialogContent>
          </Dialog>
        </div>

        {currentPlan.phases && (currentPlan.phases as any[]).length > 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(currentPlan.phases as any[]).map((phase: any) =>
              phase.exercises.map((exercise: any, exIdx: number) => {
                const exerciseDetail = exerciseDetails[exercise.exerciseId];
                return (
                  <div
                    key={`${phase.order}-${exIdx}`}
                    className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div className="relative flex items-start gap-4 p-4">
                      {exerciseDetail ? (
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800">
                          <LazyExerciseMedia exerciseDetail={exerciseDetail} exerciseId={exercise.exerciseId} />
                        </div>
                      ) : (
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                          <Dumbbell className="h-8 w-8 text-neutral-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 pr-8">
                        <h4 className="line-clamp-2 text-sm font-semibold text-neutral-900 dark:text-white">
                          {exerciseDetail?.name || 'Unknown exercise'}
                        </h4>
                        {exerciseDetail?.targetMuscles && (
                          <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {exerciseDetail.targetMuscles.slice(0, 3).join(' · ')}
                          </p>
                        )}
                        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          <div className="flex gap-1">
                            <dt className="text-neutral-500 dark:text-neutral-400">Sets</dt>
                            <dd className="font-medium tabular-nums text-neutral-900 dark:text-white">{exercise.sets || '–'}</dd>
                          </div>
                          <div className="flex gap-1">
                            <dt className="text-neutral-500 dark:text-neutral-400">Reps</dt>
                            <dd className="font-medium tabular-nums text-neutral-900 dark:text-white">{exercise.reps || '–'}</dd>
                          </div>
                          {exercise.frequency && (
                            <div className="flex min-w-0 gap-1">
                              <dt className="text-neutral-500 dark:text-neutral-400">How often</dt>
                              <dd className="truncate font-medium text-neutral-900 dark:text-white">{exercise.frequency}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteExerciseDialog({ open: true, phaseOrder: phase.order, exerciseId: exercise.exerciseId })}
                        className="absolute right-2 top-2 h-8 w-8 text-neutral-400 hover:text-red-600"
                        aria-label="Remove exercise"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Photos the patient uploads to show progress */}
                    <div className="border-t border-neutral-100 p-4 dark:border-neutral-800">
                      <p className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">Progress photos from the patient</p>
                      <div className="grid grid-cols-2 gap-3">
                        {(
                          [
                            ['Before', exercise.beforeImageStorageId],
                            ['After', exercise.afterImageStorageId],
                          ] as const
                        ).map(([label, storageId]) => (
                          <div key={label}>
                            {storageId ? (
                              <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
                                <StorageImage storageId={storageId} />
                                <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                                  {label}
                                </span>
                              </div>
                            ) : (
                              <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-lg border border-dashed border-neutral-200 text-center dark:border-neutral-700">
                                <span className="text-xs text-neutral-500 dark:text-neutral-400">No photo yet</span>
                                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{label}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-neutral-700">
            <Dumbbell className="mx-auto h-8 w-8 text-neutral-300 dark:text-neutral-600" />
            <p className="mt-3 text-sm font-medium text-neutral-900 dark:text-white">No exercises yet</p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Add exercises from the library for this patient to do at home.</p>
            <Button onClick={() => setShowExerciseLibrary(true)} variant="outline" size="sm" className="mt-4">
              <Plus className="mr-1.5 h-4 w-4" />
              Add the first exercise
            </Button>
          </div>
        )}
      </section>

      {/* Goals */}
      {!exercisesOnly && (
      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setShowGoalsSection(!showGoalsSection)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={showGoalsSection}
        >
          <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Goals</h3>
          {showGoalsSection ? (
            <ChevronUp className="h-4 w-4 text-neutral-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-neutral-400" />
          )}
        </button>

        {showGoalsSection && (
          <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            {currentPlan.goals && currentPlan.goals.length > 0 ? (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {currentPlan.goals.map((goal: any, index: number) => (
                  <li key={index} className="flex items-start gap-3 px-4 py-3">
                    <Target className="mt-0.5 h-4 w-4 shrink-0 text-[#005b57] dark:text-[#2dd4bf]" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 dark:text-white">{goal.description}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Target: {goal.targetValue}
                        {goal.timeline ? ` · ${goal.timeline}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">No goals yet. Add the first one below.</p>
            )}

            <div className="border-t border-neutral-100 p-4 dark:border-neutral-800">
              <p className="text-sm font-medium text-neutral-900 dark:text-white">Add a goal</p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="goal-description" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    Goal
                  </label>
                  <Input
                    id="goal-description"
                    value={newGoal.description}
                    onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                    placeholder="e.g. Walk without a stick"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="goal-target" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    Target
                  </label>
                  <Input
                    id="goal-target"
                    value={newGoal.targetValue}
                    onChange={(e) => setNewGoal({ ...newGoal, targetValue: e.target.value })}
                    placeholder="e.g. Pain 3/10 or less"
                  />
                </div>
              </div>
              <Button
                onClick={addGoal}
                size="sm"
                variant="outline"
                className="mt-3"
                disabled={!newGoal.description || !newGoal.targetValue}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add goal
              </Button>
            </div>
          </div>
        )}
      </section>
      )}

      {/* Delete Plan Confirmation Dialog */}
      <AlertDialog open={deletePlanDialogOpen} onOpenChange={setDeletePlanDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Treatment Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this treatment plan? This action cannot be undone. The patient will be notified of this change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePlan}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Exercise Confirmation Dialog */}
      <AlertDialog
        open={deleteExerciseDialog?.open || false}
        onOpenChange={(open) => !open && setDeleteExerciseDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Exercise?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this exercise from the treatment plan? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteExerciseDialog) {
                  handleDeleteExercise(deleteExerciseDialog.phaseOrder, deleteExerciseDialog.exerciseId);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove Exercise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Storage image component
const StorageImage: React.FC<{ storageId: any }> = ({ storageId }) => {
  const url = useQuery(api.files.getFileUrl, { storageId: storageId as any });
  if (!url) return null;
  return (
    <img src={url} alt="Exercise" className="w-full h-32 object-cover rounded-lg border-2 border-gray-200" />
  );
};
