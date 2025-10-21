'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Play, CheckCircle2, Target, Activity, MessageSquare, Video, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';

// Using any types to avoid deep type instantiation errors with Convex
/* eslint-disable @typescript-eslint/no-explicit-any */

export function PatientTreatmentPlanView() {
  const [activeTab, setActiveTab] = useState('today');
  const [selectedExercise, setSelectedExercise] = useState<any>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [painLevel, setPainLevel] = useState<number>(0);
  const { toast } = useToast();

  // Query active treatment plan
  const activePlan = useQuery(api.treatmentPlans.getPatientActivePlan);
  // Removed unused query for listing patient treatment plans; rely on active plan only
  const completionMap = useQuery(api.treatmentPlans.getExerciseCompletionMap, {
    treatmentPlanId: activePlan?._id as Id<'treatmentPlans'>
  });

  const logExerciseCompletion = useMutation(api.treatmentPlans.logExerciseCompletion);

  // Mock data for demonstration
  const mockPlan = {
    _id: '1',
    title: 'Lower Back Pain Recovery',
    description: 'Comprehensive treatment plan for chronic lower back pain',
    startDate: new Date('2024-01-15'),
    targetEndDate: new Date('2024-03-15'),
    status: 'active',
    phases: [
      {
        name: 'Phase 1: Pain Management',
        order: 1,
        exercises: [
          {
            exerciseId: 'bird-dog',
            name: 'Bird Dog',
            description: 'Core stability exercise',
            sets: 3,
            reps: 10,
            frequency: 'Daily',
            videoUrl: 'https://exercisedb.dev/video/bird-dog',
            instructions: [
              'Start on hands and knees',
              'Extend right arm and left leg',
              'Hold for 5 seconds',
              'Return to starting position'
            ],
            targetMuscles: ['core', 'lower back'],
            precautions: ['Keep back neutral', 'Avoid arching']
          },
          {
            exerciseId: 'cat-camel',
            name: 'Cat-Camel Stretch',
            description: 'Spinal mobility exercise',
            sets: 2,
            reps: 15,
            frequency: 'Daily',
            videoUrl: 'https://exercisedb.dev/video/cat-camel',
            instructions: [
              'Start on hands and knees',
              'Arch back up (cat)',
              'Drop belly down (camel)',
              'Move slowly between positions'
            ],
            targetMuscles: ['spine', 'core'],
            precautions: ['Move within pain-free range']
          }
        ]
      }
    ],
    goals: [
      {
        description: 'Reduce pain level from 8/10 to 3/10',
        targetValue: '3/10',
        measurable: true
      },
      {
        description: 'Improve daily function and mobility',
        targetValue: 'Full daily activities',
        measurable: true
      }
    ]
  };

  const currentPlan = activePlan || mockPlan;

  const handleExerciseComplete = async (exercise: any, phaseOrder: number) => {
    try {
      await logExerciseCompletion({
        treatmentPlanId: currentPlan._id as Id<'treatmentPlans'>,
        exerciseId: exercise.exerciseId,
        phaseOrder,
        notes: completionNotes
      });

      toast({
        title: 'Exercise Completed!',
        description: 'Great job! Your progress has been recorded.',
      });

      setSelectedExercise(null);
      setCompletionNotes('');
      setPainLevel(0);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to record completion. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const isExerciseCompleted = (exerciseId: string, phaseOrder: number) => {
    const key = `${phaseOrder}-${exerciseId}`;
    return completionMap?.[key] || false;
  };

  const getScheduledDays = (frequency: string): string => {
    if (!frequency) return 'As needed';
    const freq = frequency.toLowerCase();
    if (freq.includes('daily')) return 'Every day this week';
    if (freq.includes('3x') || freq.includes('three times')) return 'Mon, Wed, Fri';
    if (freq.includes('2x') || freq.includes('twice')) return 'Mon, Thu';
    if (freq.includes('weekly')) return 'Once per week';
    return frequency;
  };

  const getTodaysExercises = (): any[] => {
    return currentPlan.phases?.flatMap((phase: any) => 
      phase.exercises.filter((exercise: any) => 
        exercise.frequency?.toLowerCase().includes('daily') || 
        exercise.frequency?.toLowerCase().includes('today')
      ).map((exercise: any) => ({ 
        ...exercise, 
        phaseOrder: phase.order,
        scheduledDays: getScheduledDays(exercise.frequency)
      }))
    ) || [];
  };

  const calculateProgress = (): number => {
    const allExercises = currentPlan.phases?.flatMap((phase: any) => 
      phase.exercises.map((ex: any) => ({ ...ex, phaseOrder: phase.order }))
    ) || [];
    
    const completed = allExercises.filter((ex: any) => 
      isExerciseCompleted(ex.exerciseId, ex.phaseOrder || 0)
    ).length;
    
    return allExercises.length > 0 ? (completed / allExercises.length) * 100 : 0;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{currentPlan.title}</CardTitle>
              <CardDescription>{currentPlan.description}</CardDescription>
            </div>
            <Badge variant="default" className="bg-green-500">
              {currentPlan.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{Math.round(calculateProgress())}%</div>
              <div className="text-sm text-muted-foreground">Plan Progress</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{getTodaysExercises().length}</div>
              <div className="text-sm text-muted-foreground">Today&apos;s Exercises</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{currentPlan.phases?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Phases</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {currentPlan.endDate ? format(new Date(currentPlan.endDate), 'MMM d') : 'Ongoing'}
              </div>
              <div className="text-sm text-muted-foreground">Target Date</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="today">Today&apos;s Exercises</TabsTrigger>
          <TabsTrigger value="all">All Exercises</TabsTrigger>
          <TabsTrigger value="progress">My Progress</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Exercise Schedule</CardTitle>
              <CardDescription>
                Complete your prescribed exercises and track your progress
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {getTodaysExercises().map((exercise: any) => (
                  <Card key={exercise.exerciseId} className={isExerciseCompleted(exercise.exerciseId, exercise.phaseOrder || 0) ? 'border-green-200 bg-green-50' : ''}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold" onClick={() => setSelectedExercise(exercise)}>{exercise.name}</h4>
                            {isExerciseCompleted(exercise.exerciseId, exercise.phaseOrder || 0) && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{exercise.description}</p>
                          <div className="flex gap-4 text-sm mb-2">
                            <span><strong>Sets:</strong> {exercise.sets}</span>
                            <span><strong>Reps:</strong> {exercise.reps}</span>
                          </div>
                          <div className="text-sm">
                            <Badge variant="outline" className="gap-1">
                              <Calendar className="h-3 w-3" />
                              {exercise.scheduledDays}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(exercise.videoUrl, '_blank')}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Video
                          </Button>
                          
                          {!isExerciseCompleted(exercise.exerciseId, exercise.phaseOrder) && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button size="sm" disabled={isExerciseCompleted(exercise.exerciseId, exercise.phaseOrder || 0)} onClick={() => setSelectedExercise(exercise)}>
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Complete
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Complete Exercise</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <Label>Exercise: {selectedExercise?.name}</Label>
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {selectedExercise?.description}
                                    </p>
                                  </div>
                                  
                                  <div>
                                    <Label htmlFor="pain-level">Pain Level (0-10)</Label>
                                    <input
                                      type="range"
                                      min="0"
                                      max="10"
                                      value={painLevel}
                                      onChange={(e) => setPainLevel(Number(e.target.value))}
                                      className="w-full mt-2"
                                    />
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                      <span>No Pain</span>
                                      <span>{painLevel}/10</span>
                                      <span>Severe Pain</span>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <Label htmlFor="notes">Notes (Optional)</Label>
                                    <Textarea
                                      id="notes"
                                      value={completionNotes}
                                      onChange={(e) => setCompletionNotes(e.target.value)}
                                      placeholder="How did you feel? Any pain or difficulty?"
                                    />
                                  </div>
                                  
                                  <Button
                                    onClick={() => selectedExercise && handleExerciseComplete(selectedExercise, selectedExercise.phaseOrder || 0)}
                                    className="w-full"
                                  >
                                    Mark as Complete
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {getTodaysExercises().length === 0 && (
                  <Alert>
                    <AlertDescription>
                      No exercises scheduled for today. Check your full exercise list or contact your physiotherapist.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Exercises</CardTitle>
              <CardDescription>
                View all exercises in your treatment plan organized by phase
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {currentPlan.phases?.map((phase: any) => (
                  <div key={phase.order}>
                    <h4 className="font-semibold mb-3">{phase.name}</h4>
                    <div className="space-y-3">
                      {phase.exercises.map((exercise: any) => (
                        <Card key={exercise.exerciseId} className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h5 className="font-medium">{exercise.name}</h5>
                                {isExerciseCompleted(exercise.exerciseId, phase.order) && (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{exercise.description}</p>
                              <div className="text-sm space-y-1">
                                <div><strong>Instructions:</strong></div>
                                <ul className="list-disc list-inside text-sm text-muted-foreground">
                                  {exercise.instructions.map((instruction: string, idx: number) => (
                                    <li key={idx}>{instruction}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                            
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => window.open(exercise.videoUrl, '_blank')}>
                                <Play className="h-4 w-4 mr-1" />
                                Demo
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Progress</CardTitle>
              <CardDescription>
                Track your recovery journey and celebrate your achievements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">Overall Progress</h4>
                  <Progress value={calculateProgress()} className="h-3" />
                  <p className="text-sm text-muted-foreground mt-2">
                    {Math.round(calculateProgress())}% of your treatment plan completed
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Treatment Goals</h4>
                  <div className="space-y-3">
                    {currentPlan.goals?.map((goal: any, index: any) => (
                      <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                        <Target className="h-5 w-5 text-blue-500 mt-0.5" />
                        <div>
                          <p className="font-medium">{goal.description}</p>
                          <p className="text-sm text-muted-foreground">
                            Target: {goal.targetValue}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Recent Achievements</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Completed Bird Dog exercise - 3 sets of 10 reps</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Activity className="h-4 w-4 text-blue-500" />
                      <span>7-day exercise streak achieved!</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Button variant="outline" className="w-full">
          <MessageSquare className="h-4 w-4 mr-2" />
          Message Therapist
        </Button>
        <Button variant="outline" className="w-full">
          <Video className="h-4 w-4 mr-2" />
          Schedule Video Call
        </Button>
        <Button variant="outline" className="w-full">
          <FileText className="h-4 w-4 mr-2" />
          View Reports
        </Button>
      </div>
    </div>
  );
}
