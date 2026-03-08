'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Target, Dumbbell, Calendar, TrendingUp, ChevronDown, ChevronUp, Info, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { InteractiveTreatmentPlan as TreatmentPlanType } from '@/types/assessments';
import { ExerciseLibrary } from './ExerciseLibrary';
import { LazyExerciseMedia } from './LazyExerciseMedia';
import { UploadDropzone } from '@/components/ui/UploadDropzone';

interface InteractiveTreatmentPlanProps {
  patientId: string;
  plan?: TreatmentPlanType;
}

export function InteractiveTreatmentPlan({ patientId, plan }: InteractiveTreatmentPlanProps) {
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

  if (!currentPlan) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="text-center max-w-md space-y-4">
          <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center">
            <Dumbbell className="h-10 w-10 text-green-600" />
          </div>
          <h3 className="text-2xl font-semibold text-gray-900">No Active Treatment Plan</h3>
          <p className="text-gray-600">Create a comprehensive treatment plan to help your patient recover faster.</p>
          <Button onClick={handleCreatePlan} className="bg-green-600 hover:bg-green-700 mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Create Treatment Plan
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Section with Gradient Background */}
      <div className="relative bg-gradient-to-br from-emerald-50 via-white to-teal-50 rounded-3xl p-8 border border-emerald-100 shadow-lg overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-emerald-100/30 to-transparent rounded-full blur-3xl -z-0"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-teal-100/30 to-transparent rounded-full blur-3xl -z-0"></div>

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-transparent">
                  {currentPlan.title}
                </h2>
                <Badge
                  variant="secondary"
                  className={`text-sm px-4 py-1.5 font-medium ${currentPlan.status === 'active'
                    ? 'bg-emerald-500 text-white border-emerald-600 shadow-md'
                    : 'bg-gray-100 text-gray-700'
                    }`}
                >
                  {currentPlan.status}
                </Badge>
              </div>
              <p className="text-gray-600 text-lg">{currentPlan.description || 'Personalized treatment plan'}</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeletePlanDialogOpen(true)}
              className="bg-red-600 hover:bg-red-700 text-white shadow-md"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Plan
            </Button>
          </div>

          {/* Stats Cards with Gradient Accents */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
            <div className="group relative bg-white/90 backdrop-blur-sm rounded-2xl p-5 border border-emerald-200/50 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative flex items-center gap-4">
                <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Dumbbell className="h-7 w-7 text-white" />
                </div>
                <div>
                  <div className="text-3xl font-bold text-gray-900">{totalExercises}</div>
                  <div className="text-sm text-gray-600 font-medium">Exercises</div>
                </div>
              </div>
            </div>

            <div className="group relative bg-white/90 backdrop-blur-sm rounded-2xl p-5 border border-teal-200/50 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative flex items-center gap-4">
                <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Target className="h-7 w-7 text-white" />
                </div>
                <div>
                  <div className="text-3xl font-bold text-gray-900">{currentPlan.goals?.length || 0}</div>
                  <div className="text-sm text-gray-600 font-medium">Goals</div>
                </div>
              </div>
            </div>

            <div className="group relative bg-white/90 backdrop-blur-sm rounded-2xl p-5 border border-blue-200/50 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative flex items-center gap-4">
                <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                  <TrendingUp className="h-7 w-7 text-white" />
                </div>
                <div>
                  <div className="text-3xl font-bold text-gray-900">{Math.round(weeklyProgress?.completionRate || 0)}%</div>
                  <div className="text-sm text-gray-600 font-medium">Adherence</div>
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced Adherence Summary */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 border border-emerald-200/50 shadow-md">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-base font-semibold text-gray-800">Plan Adherence</span>
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                {Math.round(weeklyProgress?.completionRate || 0)}%
              </span>
            </div>
            <div className="relative">
              <Progress
                value={weeklyProgress?.completionRate || 0}
                className="h-4 bg-gray-100 rounded-full overflow-hidden shadow-inner"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 to-transparent rounded-full pointer-events-none"></div>
            </div>
            <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
              <span className="flex items-center gap-1.5 font-medium">
                <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                Started {currentPlan.startDate ? format(new Date(currentPlan.startDate), 'MMM d, yyyy') : 'Recently'}
              </span>
              <span className="font-medium">
                Target: {currentPlan.endDate ? format(new Date(currentPlan.endDate), 'MMM d, yyyy') : 'Ongoing'}
              </span>
            </div>
          </div>

          {/* Enhanced Recent Activity */}
          {weeklyProgress?.completions && weeklyProgress.completions.length > 0 && (
            <div className="mt-6 bg-white/90 backdrop-blur-sm rounded-2xl p-6 border border-emerald-200/50 shadow-md">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></div>
                Recent Activity
              </h4>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-emerald-200 scrollbar-track-transparent">
                {weeklyProgress.completions.slice(0, 5).map((completion: any) => (
                  <div key={completion._id} className="flex-shrink-0 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-200/50 shadow-sm hover:shadow-md transition-shadow w-44">
                    <div className="text-xs text-emerald-700 font-semibold mb-2">
                      {format(new Date(completion.completedAt), 'MMM d, h:mm a')}
                    </div>
                    <div className="text-sm font-bold text-gray-900 truncate mb-1">
                      {exerciseDetails[completion.exerciseId]?.name || 'Exercise'}
                    </div>
                    <div className="text-xs text-gray-600 font-medium">
                      {completion.setsCompleted} sets × {completion.repsCompleted} reps
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Exercises Section with Enhanced Design */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-1.5 h-8 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></div>
            Exercises
          </h3>
          <Dialog open={showExerciseLibrary} onOpenChange={setShowExerciseLibrary}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-300">
                <Plus className="h-4 w-4 mr-2" />
                Add Exercise
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Exercise Library</DialogTitle>
              </DialogHeader>
              <ExerciseLibrary onExerciseSelect={addExerciseToPlan} />
            </DialogContent>
          </Dialog>
        </div>

        {currentPlan.phases && (currentPlan.phases as any[]).length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {(currentPlan.phases as any[]).map((phase: any) =>
              phase.exercises.map((exercise: any, exIdx: number) => {
                const exerciseDetail = exerciseDetails[exercise.exerciseId];
                return (
                  <Card key={`${phase.order}-${exIdx}`} className="group hover:shadow-xl transition-all duration-300 border-2 border-gray-100 hover:border-emerald-200 overflow-hidden bg-white rounded-2xl hover:-translate-y-1">
                    <CardContent className="p-0 flex flex-col">
                      {/* Exercise Header with Image */}
                      <div className="relative bg-gradient-to-br from-gray-50 to-emerald-50/30 p-6 border-b-2 border-gray-100">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteExerciseDialog({ open: true, phaseOrder: phase.order, exerciseId: exercise.exerciseId })}
                          className="absolute top-2 right-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <div className="flex items-start gap-4">
                          {exerciseDetail ? (
                            <div className="flex-shrink-0 w-28 h-28 rounded-xl overflow-hidden bg-white border-2 border-gray-100 shadow-md group-hover:shadow-lg transition-shadow">
                              <LazyExerciseMedia
                                exerciseDetail={exerciseDetail}
                                exerciseId={exercise.exerciseId}
                              />
                            </div>
                          ) : (
                            <div className="flex-shrink-0 w-28 h-28 rounded-xl bg-gray-100 flex items-center justify-center border-2 border-gray-200">
                              <Dumbbell className="w-10 h-10 text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-lg text-gray-900 mb-2 line-clamp-2">
                              {exerciseDetail?.name || 'Unknown Exercise'}
                            </h4>
                            {exerciseDetail?.targetMuscles && (
                              <div className="flex flex-wrap gap-1.5">
                                {exerciseDetail.targetMuscles.slice(0, 3).map((muscle: string) => (
                                  <Badge key={muscle} variant="outline" className="text-xs px-2.5 py-0.5 bg-white text-emerald-700 border-emerald-200 font-medium">
                                    {muscle}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Exercise Prescription */}
                      <div className="p-6">
                        <div className="grid grid-cols-3 gap-3 mb-6">
                          <div className="relative overflow-hidden text-center p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-2 border-emerald-200/50 group-hover:border-emerald-300 transition-colors">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-400/10 rounded-full -mr-8 -mt-8"></div>
                            <div className="relative">
                              <div className="text-2xl font-bold text-emerald-700">{exercise.sets || '-'}</div>
                              <div className="text-[11px] uppercase tracking-wider text-emerald-600 font-semibold mt-1">Sets</div>
                            </div>
                          </div>
                          <div className="relative overflow-hidden text-center p-4 rounded-xl bg-gradient-to-br from-teal-50 to-teal-100/50 border-2 border-teal-200/50 group-hover:border-teal-300 transition-colors">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-teal-400/10 rounded-full -mr-8 -mt-8"></div>
                            <div className="relative">
                              <div className="text-2xl font-bold text-teal-700">{exercise.reps || '-'}</div>
                              <div className="text-[11px] uppercase tracking-wider text-teal-600 font-semibold mt-1">Reps</div>
                            </div>
                          </div>
                          <div className="relative overflow-hidden text-center p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border-2 border-blue-200/50 group-hover:border-blue-300 transition-colors">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-400/10 rounded-full -mr-8 -mt-8"></div>
                            <div className="relative">
                              <div className="text-base font-bold text-blue-700 truncate pt-1">{exercise.frequency}</div>
                              <div className="text-[11px] uppercase tracking-wider text-blue-600 font-semibold mt-1">Freq</div>
                            </div>
                          </div>
                        </div>

                        {/* Enhanced Progress Photos Section */}
                        <div className="pt-5 border-t-2 border-gray-100">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <h5 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                <Target className="w-4 h-4 text-emerald-600" />
                                Progress Photos
                              </h5>
                              <div className="group/info relative">
                                <Info className="w-4 h-4 text-gray-400 cursor-help hover:text-emerald-600 transition-colors" />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl opacity-0 group-hover/info:opacity-100 transition-opacity pointer-events-none z-10 text-center">
                                  These photos are uploaded by the patient to track their progress over time.
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                </div>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">
                              Patient Uploads
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            {/* Before Photo */}
                            <div className="relative group/upload">
                              {exercise.beforeImageStorageId ? (
                                <div className="relative rounded-xl overflow-hidden border-2 border-gray-200 aspect-[4/3] shadow-md hover:shadow-lg transition-shadow">
                                  <StorageImage storageId={exercise.beforeImageStorageId} />
                                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-white text-xs py-2 text-center font-semibold backdrop-blur-sm">
                                    Before
                                  </div>
                                </div>
                              ) : (
                                <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-gray-50 to-gray-100/50 aspect-[4/3] hover:border-emerald-300 transition-colors">
                                  <div className="text-center">
                                    <div className="text-xs text-gray-500 font-medium">No photo yet</div>
                                    <div className="text-[10px] text-gray-400 mt-1">Before</div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* After Photo */}
                            <div className="relative group/upload">
                              {exercise.afterImageStorageId ? (
                                <div className="relative rounded-xl overflow-hidden border-2 border-gray-200 aspect-[4/3] shadow-md hover:shadow-lg transition-shadow">
                                  <StorageImage storageId={exercise.afterImageStorageId} />
                                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-white text-xs py-2 text-center font-semibold backdrop-blur-sm">
                                    After
                                  </div>
                                </div>
                              ) : (
                                <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-gray-50 to-gray-100/50 aspect-[4/3] hover:border-emerald-300 transition-colors">
                                  <div className="text-center">
                                    <div className="text-xs text-gray-500 font-medium">No photo yet</div>
                                    <div className="text-[10px] text-gray-400 mt-1">After</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        ) : (
          <Card className="border-2 border-dashed border-gray-300 rounded-2xl overflow-hidden">
            <CardContent className="text-center py-20">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                <Dumbbell className="h-10 w-10 text-emerald-600" />
              </div>
              <p className="text-gray-600 text-lg mb-6 font-medium">No exercises added yet</p>
              <Button
                onClick={() => setShowExerciseLibrary(true)}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Exercise
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Enhanced Goals Section */}
      <div className="space-y-5">
        <button
          onClick={() => setShowGoalsSection(!showGoalsSection)}
          className="flex items-center justify-between w-full text-left group"
        >
          <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-1.5 h-8 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></div>
            Treatment Goals
          </h3>
          <div className="p-2 rounded-lg bg-gray-100 group-hover:bg-emerald-100 transition-colors">
            {showGoalsSection ? (
              <ChevronUp className="h-5 w-5 text-gray-600 group-hover:text-emerald-600 transition-colors" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-600 group-hover:text-emerald-600 transition-colors" />
            )}
          </div>
        </button>

        {showGoalsSection && (
          <Card className="border-2 border-gray-100 rounded-2xl overflow-hidden shadow-lg">
            <CardContent className="p-8 space-y-6">
              {currentPlan.goals && currentPlan.goals.length > 0 ? (
                <div className="space-y-4">
                  {currentPlan.goals.map((goal: any, index: number) => (
                    <div key={index} className="group flex items-start gap-4 p-5 bg-gradient-to-br from-emerald-50/50 to-teal-50/30 rounded-xl border-2 border-emerald-200/50 hover:border-emerald-300 hover:shadow-md transition-all duration-300">
                      <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow">
                        <Target className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 text-base mb-2">{goal.description}</div>
                        <div className="text-sm text-gray-600 flex items-center gap-2">
                          <span className="font-medium text-emerald-700">Target: {goal.targetValue}</span>
                          {goal.timeline && (
                            <>
                              <span className="text-gray-400">•</span>
                              <span className="text-gray-600">{goal.timeline}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center mb-4">
                    <Target className="h-8 w-8 text-emerald-600" />
                  </div>
                  <p className="text-gray-500 font-medium">No goals set yet.</p>
                  <p className="text-sm text-gray-400 mt-1">Add your first treatment goal below</p>
                </div>
              )}

              {/* Enhanced Add Goal Form */}
              <div className="border-t-2 border-gray-100 pt-6 mt-6">
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Plus className="h-5 w-5 text-emerald-600" />
                  Add New Goal
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Goal Description</label>
                    <input
                      type="text"
                      value={newGoal.description}
                      onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                      placeholder="e.g., Reduce pain to 3/10"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Target Value</label>
                    <input
                      type="text"
                      value={newGoal.targetValue}
                      onChange={(e) => setNewGoal({ ...newGoal, targetValue: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                      placeholder="e.g., 3/10 pain level"
                    />
                  </div>
                </div>
                <Button
                  onClick={addGoal}
                  className="mt-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                  disabled={!newGoal.description || !newGoal.targetValue}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Goal
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

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
