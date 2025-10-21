'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Target, Activity, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { InteractiveTreatmentPlan as TreatmentPlanType } from '@/types/assessments';
import { ExerciseLibrary } from './ExerciseLibrary';
import { OswestryAssessmentForm } from '../assessments/OswestryAssessmentForm';
import { exerciseService } from '@/lib/exercisedb/exerciseService';
import { LazyExerciseMedia } from './LazyExerciseMedia';
import { UploadDropzone } from '@/components/ui/UploadDropzone';

interface InteractiveTreatmentPlanProps {
  patientId: string;
  plan?: TreatmentPlanType;
}

export function InteractiveTreatmentPlan({ patientId, plan }: InteractiveTreatmentPlanProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [showExerciseLibrary, setShowExerciseLibrary] = useState(false);
  const [showAssessmentForm, setShowAssessmentForm] = useState(false);
  const [newGoal, setNewGoal] = useState({ description: '', target: '', currentValue: '', targetValue: '', deadline: new Date() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [exerciseDetails, setExerciseDetails] = useState<Record<string, any>>({});
  const [uploadingImages, setUploadingImages] = useState<Record<string, { before?: boolean; after?: boolean }>>({});
  const { toast } = useToast();
  
  const updateTreatmentPlan = useMutation(api.treatmentPlans.updateTreatmentPlan);
  const createTreatmentPlan = useMutation(api.treatmentPlans.createTreatmentPlan);
  const updateTreatmentPlanStatus = useMutation(api.treatmentPlans.updateTreatmentPlanStatus);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  
  // Get treatment plans for the patient
  const treatmentPlans = useQuery(api.treatmentPlans.getPatientTreatmentPlans, {
    patientId: patientId,
    status: 'active'
  });
  
  const currentPlan = treatmentPlans?.[0] || plan;
  const completionRate = currentPlan?.phases ? 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentPlan.phases.reduce((acc: number, phase: any) => {
      const phaseCompletion = phase.exercises.length > 0 ? 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        phase.exercises.reduce((exerciseAcc: number, exercise: any) => {
          // Calculate completion based on frequency and time elapsed
          const daysElapsed = Math.floor((Date.now() - currentPlan.startDate) / (1000 * 60 * 60 * 24));
          const expectedCompletions = exercise.frequency === 'Daily' ? daysElapsed : 
                                     exercise.frequency === 'Weekly' ? Math.floor(daysElapsed / 7) : 1;
          return exerciseAcc + Math.min(1, expectedCompletions > 0 ? 1 : 0);
        }, 0) / phase.exercises.length : 0;
      return acc + phaseCompletion;
    }, 0) / currentPlan.phases.length * 100 : 0;

  // Fetch exercise details when plan changes
  useEffect(() => {
    const fetchExerciseDetails = async () => {
      if (!currentPlan?.phases) return;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const details: Record<string, any> = {};
      
      for (const phase of currentPlan.phases) {
        for (const exercise of phase.exercises) {
          try {
            const exerciseDetail = await exerciseService.getExerciseById(exercise.exerciseId);
            if (exerciseDetail) {
              details[exercise.exerciseId] = exerciseDetail;
            }
          } catch {
            // Silently handle plan update errors
          }
        }
      }
      
      setExerciseDetails(details);
    };

    fetchExerciseDetails();
  }, [currentPlan]);

  // Handle upload of before/after images for a specific exercise within a phase
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

      // Build updated phases with new storageId on targeted exercise
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatedPhases: any[] = (currentPlan.phases ? [...currentPlan.phases] : []).map((p: any) => ({ ...p, exercises: [...p.exercises] }));
      const targetPhase = updatedPhases.find((p) => p.order === phaseOrder);
      if (!targetPhase) throw new Error('Phase not found');
      const targetExercise = targetPhase.exercises.find((e: any) => e.exerciseId === exerciseId);
      if (!targetExercise) throw new Error('Exercise not found in phase');
      if (which === 'before') targetExercise.beforeImageStorageId = storageId;
      if (which === 'after') targetExercise.afterImageStorageId = storageId;

      await updateTreatmentPlan({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // Create a new draft plan with minimal required fields
      const planId = await createTreatmentPlan({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // Immediately activate the plan so it appears in the active view
      await updateTreatmentPlanStatus({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addExerciseToPlan = async (exercise: any) => {
    if (!currentPlan) return;
    
    try {
      // Add exercise to the current active phase or create a new phase
      const updatedPhases = currentPlan.phases ? [...currentPlan.phases] : [];
      
      if (updatedPhases.length === 0) {
        // Create first phase
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
        // Add to last phase
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    if (!currentPlan || !newGoal.description || !newGoal.target) return;
    
    try {
      const updatedGoals = currentPlan.goals ? [...currentPlan.goals] : [];
      updatedGoals.push({
        description: newGoal.description,
        targetValue: newGoal.targetValue,
        timeline: format(newGoal.deadline, 'yyyy-MM-dd'),
        measurable: true
      });
      
      await updateTreatmentPlan({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        treatmentPlanId: currentPlan._id as any,
        goals: updatedGoals
      });
      
      setNewGoal({ description: '', target: '', currentValue: '', targetValue: '', deadline: new Date() });
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{currentPlan?.title ?? 'No Active Treatment Plan'}</CardTitle>
              <CardDescription>{currentPlan?.description ?? 'Assign a template or create a plan to get started.'}</CardDescription>
            </div>
            {currentPlan && (
              <Badge variant={currentPlan.status === 'active' ? 'default' : 'secondary'}>
                {currentPlan.status}
              </Badge>
            )}
            {!currentPlan && (
              <Button onClick={handleCreatePlan}>
                <Plus className="h-4 w-4 mr-2" />
                Create Plan
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{Math.round(completionRate)}%</div>
              <div className="text-sm text-muted-foreground">Completion Rate</div>
            </div>
            <div className="text-center">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <div className="text-2xl font-bold">{currentPlan?.phases?.reduce((acc: number, phase: any) => acc + phase.exercises.length, 0) || 0}</div>
              <div className="text-sm text-muted-foreground">Exercises</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{currentPlan?.goals?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Goals</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {currentPlan?.endDate ? 'MMM d' : 'TBD'}
              </div>
              <div className="text-sm text-muted-foreground">Target End</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="exercises">Exercises</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Plan Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Timeline</h4>
                  <div className="space-y-2 text-sm">
                    <div>Start: {currentPlan?.startDate ? format(new Date(currentPlan.startDate), 'MMM d, yyyy') : 'Not set'}</div>
                    <div>Target End: {currentPlan?.endDate ? format(new Date(currentPlan.endDate), 'MMM d, yyyy') : 'Ongoing'}</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Current Status</h4>
                  <Progress value={completionRate} className="h-2" />
                  <p className="text-sm text-muted-foreground mt-2">
                    {Math.round(completionRate)}% of exercises completed this week
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Dialog open={showExerciseLibrary} onOpenChange={setShowExerciseLibrary}>
              <DialogTrigger asChild>
                <Button className="w-full">
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

            <Dialog open={showAssessmentForm} onOpenChange={setShowAssessmentForm}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Activity className="h-4 w-4 mr-2" />
                  Run Assessment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Oswestry Disability Index</DialogTitle>
                </DialogHeader>
                <OswestryAssessmentForm patientId={patientId} onComplete={() => setShowAssessmentForm(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        <TabsContent value="exercises" className="space-y-4">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {currentPlan?.phases?.map((phase: any) => (
            <Card key={phase.order}>
              <CardHeader>
                <CardTitle>{phase.name}</CardTitle>
                <CardDescription>{phase.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {phase.exercises?.map((exercise: any, exIdx: number) => {
                    const exerciseDetail = exerciseDetails[exercise.exerciseId];
                    return (
                      <div key={exIdx} className="border rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <h5 className="font-medium mb-2">{exerciseDetail?.name || exercise.exerciseId}</h5>
                            <p className="text-sm text-muted-foreground">&quot;Custom exercise - add your own instructions&quot;</p>
                            {exerciseDetail?.overview || exercise.notes}
                            {exerciseDetail?.targetMuscles && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {exerciseDetail.targetMuscles.map((muscle: string) => (
                                  <Badge key={muscle} variant="secondary" className="text-xs">{muscle}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div><span className="font-medium">Sets:</span> {exercise.sets}</div>
                              <div><span className="font-medium">Reps:</span> {exercise.reps}</div>
                              <div><span className="font-medium">Frequency:</span> {exercise.frequency}</div>
                            </div>
                            {exerciseDetail?.instructions && (
                              <div>
                                <h6 className="font-medium text-sm mb-1">Instructions:</h6>
                                <ul className="text-xs space-y-1">
                                  {exerciseDetail.instructions.map((instruction: string, idx: number) => (
                                    <li key={idx} className="text-muted-foreground">• {instruction}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          <div>
                            {exerciseDetail && (
                              <LazyExerciseMedia 
                                exerciseDetail={exerciseDetail}
                                exerciseId={exercise.exerciseId}
                              />
                            )}
                            {/* Before/After images upload & preview */}
                            <div className="mt-4 space-y-3">
                              <h6 className="font-medium text-sm">Exercise Images</h6>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <div className="text-xs font-medium mb-2">Before</div>
                                  {exercise.beforeImageStorageId ? (
                                    <StorageImage storageId={exercise.beforeImageStorageId} />
                                  ) : (
                                    <UploadDropzone
                                      accept="image/*"
                                      maxSizeMb={5}
                                      variant="image"
                                      onFileSelected={(f) => handleUploadExerciseImage(phase.order, exercise.exerciseId, 'before', f)}
                                    />
                                  )}
                                </div>
                                <div>
                                  <div className="text-xs font-medium mb-2">After</div>
                                  {exercise.afterImageStorageId ? (
                                    <StorageImage storageId={exercise.afterImageStorageId} />
                                  ) : (
                                    <UploadDropzone
                                      accept="image/*"
                                      maxSizeMb={5}
                                      variant="image"
                                      onFileSelected={(f) => handleUploadExerciseImage(phase.order, exercise.exerciseId, 'after', f)}
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )) || (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">No exercises added yet. Use the &quot;Add Exercise&quot; button to get started.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="goals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Treatment Goals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {currentPlan?.goals?.map((goal: any, index: any) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        <span className="font-medium">{goal.description}</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Target: {goal.targetValue}
                        {goal.timeline && ` by ${goal.timeline}`}
                      </div>
                    </div>
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  </div>
                )) || (
                  <p className="text-muted-foreground text-center py-4">No goals set yet. Add goals to track treatment progress.</p>
                )}
                
                {/* Add Goal Form */}
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Add New Goal</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <input
                        type="text"
                        value={newGoal.description}
                        onChange={(e) => setNewGoal({...newGoal, description: e.target.value})}
                        className="w-full mt-1 px-3 py-2 border rounded-md"
                        placeholder="e.g., Reduce pain level to 3/10"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Target Value</label>
                      <input
                        type="text"
                        value={newGoal.targetValue}
                        onChange={(e) => setNewGoal({...newGoal, targetValue: e.target.value})}
                        className="w-full mt-1 px-3 py-2 border rounded-md"
                        placeholder="e.g., 3/10 pain level"
                      />
                    </div>
                  </div>
                  <Button onClick={addGoal} className="mt-3" disabled={!newGoal.description || !newGoal.targetValue}>
                    Add Goal
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Progress Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{Math.round(completionRate)}%</div>
                  <p className="text-muted-foreground">Overall Progress</p>
                </div>
                
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {currentPlan?.phases?.map((phase: any) => (
                  <div key={phase.order} className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2">{phase.name}</h4>
                    <div className="space-y-2">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {phase.exercises.map((exercise: any) => (
                        <div key={exercise.exerciseId} className="flex justify-between items-center text-sm">
                          <span>{exercise.exerciseId}</span>
                          <span className="text-muted-foreground">{exercise.frequency}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )) || (
                  <p className="text-muted-foreground text-center py-4">No progress data available yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Small preview component for Convex storage images
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const StorageImage: React.FC<{ storageId: any }> = ({ storageId }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const url = useQuery(api.files.getFileUrl, { storageId: storageId as any });
  if (!url) return null;
  return (
    <img src={url} alt="Exercise" className="w-full h-24 object-cover rounded border" />
  );
};
