'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { ExerciseLibrary } from '@/components/dashboard/physiotherapist/treatment/ExerciseLibrary';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import type { Exercise as AssessmentExercise } from '@/types/assessments';
import { Loader2, X } from 'lucide-react';

export default function ExerciseLibraryPage() {
  const { toast } = useToast();
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedExercises, setSelectedExercises] = useState<AssessmentExercise[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Load my patients (active relationships)
  const myPatients = useQuery(api.patientInvitations.getMyPatients, { status: 'active' });

  // Load the active plan for the selected patient (if any)
  const activePlans = useQuery(
    api.treatmentPlans.getPatientTreatmentPlans,
    selectedPatientId ? ({ patientId: selectedPatientId as any, status: 'active' }) : 'skip'
  );
  const activePlan = activePlans?.[0] || null;

  // Mutations
  const createTreatmentPlan = useMutation(api.treatmentPlans.createTreatmentPlan);
  const updateTreatmentPlan = useMutation(api.treatmentPlans.updateTreatmentPlan);
  const updateTreatmentPlanStatus = useMutation(api.treatmentPlans.updateTreatmentPlanStatus);

  const selectedPatient = useMemo(
    () => myPatients?.find((p: any) => p._id === selectedPatientId) || null,
    [myPatients, selectedPatientId]
  );

  const onExerciseSelect = (exercise: AssessmentExercise) => {
    setSelectedExercises((prev) => {
      if (prev.some((e) => e._id === exercise._id)) return prev;
      return [...prev, exercise];
    });
  };

  const clearSelection = () => setSelectedExercises([]);

  const buildPhaseFromSelected = () => {
    return {
      name: 'Phase 1',
      description: 'Initial phase',
      duration: '2 weeks',
      order: 1,
      exercises: selectedExercises.map((ex) => ({
        exerciseId: ex._id,
        sets: ex.sets || 3,
        reps: ex.reps || 10,
        duration: undefined,
        frequency: ex.frequency || 'Daily',
        notes: ex.instructions?.join('. ') || '',
      })),
    };
  };

  const handleAssignToExistingPlan = async () => {
    if (!selectedPatientId || !activePlan || selectedExercises.length === 0) return;
    setIsAssigning(true);
    try {
      const updatedPhases = activePlan.phases ? [...activePlan.phases] : [];
      if (updatedPhases.length === 0) {
        updatedPhases.push(buildPhaseFromSelected());
      } else {
        const last = updatedPhases[updatedPhases.length - 1];
        last.exercises = [
          ...last.exercises,
          ...selectedExercises.map((ex) => ({
            exerciseId: ex._id,
            sets: ex.sets || 3,
            reps: ex.reps || 10,
            duration: undefined,
            frequency: ex.frequency || 'Daily',
            notes: ex.instructions?.join('. ') || '',
          })),
        ];
      }

      await updateTreatmentPlan({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        treatmentPlanId: activePlan._id as any,
        phases: updatedPhases,
      });

      toast({ title: 'Exercises Assigned', description: 'Selected exercises were added to the active plan.' });
      clearSelection();
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to add exercises to the plan.', variant: 'destructive' });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleCreateNewPlan = async () => {
    if (!selectedPatientId || selectedExercises.length === 0) return;
    setIsCreating(true);
    try {
      const planId = await createTreatmentPlan({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patientId: selectedPatientId as any,
        title: 'Treatment Plan',
        description: '',
        startDate: Date.now(),
        endDate: undefined,
        priority: 'medium',
        goals: [],
        phases: [buildPhaseFromSelected()],
        reviewInterval: 14,
        notes: '',
      });

      await updateTreatmentPlanStatus({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        treatmentPlanId: planId as any,
        status: 'active',
      });

      toast({ title: 'Plan Created', description: 'A new plan was created and activated with your selected exercises.' });
      clearSelection();
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to create treatment plan.', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">Exercise library</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Choose a patient, pick exercises, then add them to their active plan or start a new one.
        </p>
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          More physiotherapy exercises are on the way. Until then, add your own from a patient’s treatment plan, with before and after photos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assign to Patient</CardTitle>
          <CardDescription>Select a patient and manage assignment of selected exercises.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <div className="text-sm font-medium mb-1">Patient</div>
              <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a patient" />
                </SelectTrigger>
                <SelectContent>
                  {(myPatients || []).map((p: any) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.firstName} {p.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="text-sm font-medium mb-1">Active Plan</div>
              <div className="text-sm">
                {activePlan ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#005b57] dark:text-[#2dd4bf]" />
                    <span>{activePlan.title}</span>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                ) : (
                  <span className="text-muted-foreground">No active plan</span>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-start md:justify-end">
              <Button
                variant="secondary"
                onClick={handleAssignToExistingPlan}
                disabled={!selectedPatientId || selectedExercises.length === 0 || !activePlan || isAssigning}
              >
                {isAssigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add to Active Plan
              </Button>
              <Button
                onClick={handleCreateNewPlan}
                disabled={!selectedPatientId || selectedExercises.length === 0 || isCreating}
              >
                {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create New Plan
              </Button>
            </div>
          </div>

          {selectedExercises.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium mb-2">Selected Exercises ({selectedExercises.length})</div>
              <div className="flex flex-wrap gap-2">
                {selectedExercises.map((ex) => (
                  <Badge key={ex._id} variant="secondary" className="gap-1 pr-1">
                    {ex.name}
                    <button
                      type="button"
                      onClick={() => setSelectedExercises((prev) => prev.filter((e) => e._id !== ex._id))}
                      className="ml-1 rounded-full hover:bg-black/10 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Button variant="ghost" size="sm" onClick={clearSelection} className="h-6 text-xs">
                  Clear All
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ExerciseLibrary onExerciseSelect={onExerciseSelect} selectedExercises={selectedExercises} />
    </div>
  );
}
