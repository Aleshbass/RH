'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Play,
  CheckCircle2,
  Target,
  Activity,
  MessageSquare,
  Video,
  FileText,
  Calendar,
  ChevronRight,
  Trophy,
  Clock,
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// Using any types to avoid deep type instantiation errors with Convex
/* eslint-disable @typescript-eslint/no-explicit-any */

export function PatientTreatmentPlanView() {
  const [activeTab, setActiveTab] = useState<'today' | 'all' | 'progress'>('today');
  const [selectedExercise, setSelectedExercise] = useState<any>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [painLevel, setPainLevel] = useState<number>(0);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);

  // Query active treatment plan
  const activePlan = useQuery(api.treatmentPlans.getPatientActivePlan);
  const completionMap = useQuery(api.treatmentPlans.getExerciseCompletionMap,
    activePlan?._id ? { treatmentPlanId: activePlan._id as Id<'treatmentPlans'> } : "skip"
  );

  const logExerciseCompletion = useMutation(api.treatmentPlans.logExerciseCompletion);

  // Mock data for demonstration if no active plan
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
            instructions: ['Start on hands and knees', 'Extend right arm and left leg', 'Hold for 5 seconds', 'Return to starting position'],
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
            instructions: ['Start on hands and knees', 'Arch back up (cat)', 'Drop belly down (camel)', 'Move slowly between positions'],
            targetMuscles: ['spine', 'core'],
            precautions: ['Move within pain-free range']
          }
        ]
      }
    ],
    goals: [
      { description: 'Reduce pain level from 8/10 to 3/10', targetValue: '3/10', measurable: true },
      { description: 'Improve daily function and mobility', targetValue: 'Full daily activities', measurable: true }
    ]
  };

  const currentPlan = activePlan || mockPlan;

  const openCompletionModal = (exercise: any, phaseOrder: number) => {
    setSelectedExercise({ ...exercise, phaseOrder });
    setIsCompletionModalOpen(true);
  };

  const handleExerciseComplete = async () => {
    if (!selectedExercise) return;

    try {
      await logExerciseCompletion({
        treatmentPlanId: currentPlan._id as Id<'treatmentPlans'>,
        exerciseId: selectedExercise.exerciseId,
        phaseOrder: selectedExercise.phaseOrder,
        notes: completionNotes
      });

      toast.success('Exercise Completed!', {
        description: 'Great job! Your progress has been recorded.',
      });

      setIsCompletionModalOpen(false);
      setSelectedExercise(null);
      setCompletionNotes('');
      setPainLevel(0);
    } catch {
      toast.error('Error', {
        description: 'Failed to record completion. Please try again.',
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
    if (freq.includes('daily')) return 'Daily';
    if (freq.includes('3x') || freq.includes('three times')) return 'Mon, Wed, Fri';
    if (freq.includes('2x') || freq.includes('twice')) return 'Mon, Thu';
    if (freq.includes('weekly')) return 'Weekly';
    return frequency;
  };

  const getTodaysExercises = (): any[] => {
    return currentPlan.phases?.flatMap((phase: any) =>
      phase.exercises.filter((exercise: any) =>
        // Relaxed filter: Show if daily, today, or if no specific frequency is set (assume daily)
        // Also include 'weekly' or 'x' to ensure they show up at least somewhere if logic is simple
        !exercise.frequency ||
        exercise.frequency.toLowerCase().includes('daily') ||
        exercise.frequency.toLowerCase().includes('today') ||
        exercise.frequency.toLowerCase().includes('weekly') ||
        exercise.frequency.toLowerCase().includes('time') // matches 3x times, etc.
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

  const todaysExercises = getTodaysExercises();
  const completedToday = todaysExercises.filter(ex => isExerciseCompleted(ex.exerciseId, ex.phaseOrder)).length;
  const progressPercent = calculateProgress();

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Process Tracker / Hero Section */}
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 rounded-full -mr-16 -mt-16 blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-50 rounded-full -ml-12 -mb-12 blur-xl" />

        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">{currentPlan.title}</h2>
              <p className="text-gray-500 text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Target: {currentPlan.endDate ? format(new Date(currentPlan.endDate), 'MMM d, yyyy') : 'Ongoing'}
              </p>
            </div>
            <div className="bg-brand/10 text-brand font-bold px-3 py-1 rounded-full text-sm">
              Phase 1
            </div>
          </div>

          {/* Progress Bar with Milestones */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-medium text-gray-600 mb-1">
              <span>Progress</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                className="h-full bg-brand rounded-full"
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>Start</span>
              <span>Recovery Goal</span>
            </div>
          </div>

          {/* Daily Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-50">
            <div className="text-center">
              <div className="text-xl font-bold text-gray-900">{completedToday}/{todaysExercises.length}</div>
              <div className="text-xs text-gray-500">Today's Tasks</div>
            </div>
            <div className="text-center border-l border-gray-100">
              <div className="text-xl font-bold text-green-600 flex items-center justify-center gap-1">
                <Activity className="h-4 w-4" />
                Good
              </div>
              <div className="text-xs text-gray-500">Status</div>
            </div>
            <div className="text-center border-l border-gray-100">
              <div className="text-xl font-bold text-blue-600">7</div>
              <div className="text-xs text-gray-500">Day Streak</div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex p-1 bg-gray-100/80 rounded-2xl backdrop-blur-sm sticky top-0 z-20">
        {(['today', 'all', 'progress'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium rounded-xl transition-all duration-200",
              activeTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {tab === 'today' ? "Today" : tab === 'all' ? "Full Plan" : "Progress"}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="min-h-[400px]">
        {activeTab === 'today' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-semibold text-gray-900">Today's Schedule</h3>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {format(new Date(), 'EEEE, MMM d')}
              </span>
            </div>

            {todaysExercises.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                <div className="bg-white p-4 rounded-full shadow-sm inline-block mb-4">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">All caught up!</h3>
                <p className="text-gray-500 max-w-xs mx-auto mt-2">
                  No exercises scheduled for today. Enjoy your rest day!
                </p>
              </div>
            ) : (
              todaysExercises.map((exercise: any) => {
                const isCompleted = isExerciseCompleted(exercise.exerciseId, exercise.phaseOrder || 0);
                return (
                  <motion.div
                    key={exercise.exerciseId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => !isCompleted && openCompletionModal(exercise, exercise.phaseOrder || 0)}
                    className={cn(
                      "bg-white p-4 rounded-2xl border transition-all cursor-pointer hover:border-brand/50 hover:shadow-md group",
                      isCompleted ? "border-green-200 bg-green-50/30 cursor-default" : "border-gray-100 shadow-sm"
                    )}
                  >
                    <div className="flex items-start gap-4">
                      {/* Checkbox / Status Indicator - Moved to Left */}
                      <div className="mt-1">
                        {isCompleted ? (
                          <div className="bg-green-100 p-2 rounded-full">
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          </div>
                        ) : (
                          <div className="bg-gray-100 p-2 rounded-full group-hover:bg-brand/10 transition-colors">
                            <div className="h-5 w-5 rounded-full border-2 border-gray-400 group-hover:border-brand bg-white" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-gray-900 text-lg truncate pr-2">{exercise.name}</h4>
                        </div>

                        <div className="flex gap-2 mb-3">
                          <Badge variant="secondary" className="bg-gray-100 text-gray-600 font-normal text-xs">
                            {exercise.sets} sets × {exercise.reps} reps
                          </Badge>
                        </div>

                        <p className="text-gray-500 text-sm mb-4 line-clamp-2">{exercise.description}</p>

                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 rounded-xl border-gray-200 h-10"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(exercise.videoUrl, '_blank');
                            }}
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Watch
                          </Button>

                          {!isCompleted && (
                            <Button
                              size="sm"
                              className="flex-[2] rounded-xl bg-gray-900 hover:bg-black text-white h-10"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCompletionModal(exercise, exercise.phaseOrder || 0);
                              }}
                            >
                              Mark Complete
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'all' && (
          <div className="space-y-6">
            {currentPlan.phases?.map((phase: any) => (
              <div key={phase.order} className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <div className="h-6 w-1 bg-brand rounded-full" />
                  <h3 className="font-bold text-gray-900">{phase.name}</h3>
                </div>
                {phase.exercises.map((exercise: any) => {
                  const isCompleted = isExerciseCompleted(exercise.exerciseId, phase.order);
                  return (
                    <div
                      key={exercise.exerciseId}
                      onClick={() => !isCompleted && openCompletionModal(exercise, phase.order)}
                      className={cn(
                        "bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors",
                        isCompleted && "cursor-default"
                      )}
                    >
                      {/* Checkbox / Status Indicator - Moved to Left */}
                      <div>
                        {isCompleted ? (
                          <div className="bg-green-100 p-1.5 rounded-full">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </div>
                        ) : (
                          <div className="bg-gray-100 p-1.5 rounded-full group-hover:bg-brand/10 transition-colors">
                            <div className="h-4 w-4 rounded-full border-2 border-gray-400 group-hover:border-brand bg-white" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-gray-900 truncate">{exercise.name}</h4>
                        </div>
                        <p className="text-sm text-gray-500 truncate">{exercise.sets} sets × {exercise.reps} reps • {getScheduledDays(exercise.frequency)}</p>
                      </div>

                      {!isCompleted && (
                        <Button
                          size="sm"
                          className="rounded-xl bg-gray-900 text-white ml-3 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCompletionModal(exercise, phase.order);
                          }}
                        >
                          Mark
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'progress' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-brand/10 to-blue-50 p-6 rounded-3xl">
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-white p-3 rounded-2xl shadow-sm">
                  <Trophy className="h-6 w-6 text-yellow-500" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Achievements</h3>
                  <p className="text-sm text-gray-600">Your recovery milestones</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-white/60 p-3 rounded-xl flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium text-gray-700">First Week Completed</span>
                </div>
                <div className="bg-white/60 p-3 rounded-xl flex items-center gap-3">
                  <Activity className="h-5 w-5 text-blue-500" />
                  <span className="text-sm font-medium text-gray-700">7-Day Streak!</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-gray-900 mb-4 px-1">Treatment Goals</h3>
              <div className="space-y-3">
                {currentPlan.goals?.map((goal: any, index: any) => (
                  <div key={index} className="bg-white p-4 rounded-2xl border border-gray-100 flex gap-4">
                    <div className="bg-blue-50 p-2 rounded-xl h-fit">
                      <Target className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{goal.description}</p>
                      <p className="text-sm text-gray-500 mt-1">Target: {goal.targetValue}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Completion Dialog */}
      <Dialog open={isCompletionModalOpen} onOpenChange={setIsCompletionModalOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete {selectedExercise?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="bg-gray-50 p-4 rounded-xl">
              <h4 className="font-medium mb-2 text-sm text-gray-900">Instructions</h4>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                {selectedExercise?.instructions?.map((inst: string, i: number) => (
                  <li key={i}>{inst}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <Label>How was the pain level? (0-10)</Label>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">No Pain</span>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={painLevel}
                  onChange={(e) => setPainLevel(Number(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand"
                />
                <span className="text-sm font-bold w-8 text-center">{painLevel}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="Any difficulties or observations?"
                className="rounded-xl resize-none"
              />
            </div>

            <Button
              onClick={handleExerciseComplete}
              className="w-full rounded-xl h-12 text-base font-medium"
            >
              Mark as Complete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
