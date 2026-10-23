"use client";

import { useState, useEffect } from "react";
import { Bell, CheckCircle, AlertCircle, Target, Activity, Clock } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatDistanceToNow, format } from "date-fns";
import { TreatmentPlanSyncIndicator, SyncStatusIndicator } from "./TreatmentPlanSyncIndicator";
import { VideoEmbed } from "@/components/media/VideoEmbed";
import { StorageImage } from "@/components/media/StorageImage";
import { ExerciseCompletionModal } from "./treatment/ExerciseCompletionModal";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Play, CalendarDays, TrendingUp, Upload } from "@/components/icons";
import { useToast } from "@/components/ui/use-toast";

import { Id } from "@/convex/_generated/dataModel";

interface PatientTreatmentPlanViewProps {
  treatmentPlanId: string;
}

export function PatientTreatmentPlanView({ treatmentPlanId }: PatientTreatmentPlanViewProps) {
  const activeTabState = useState("overview");
  const [activeTab, setActiveTab] = activeTabState;

  // Fetch treatment plan with real-time updates
  const treatmentPlan = useQuery(api.treatmentPlans.getTreatmentPlan, {
    treatmentPlanId: treatmentPlanId as Id<"treatmentPlans">,
  });

  // Fetch change history
  const changeHistory = useQuery(api.treatmentPlanSync.getTreatmentPlanChangeHistory, {
    treatmentPlanId,
    limit: 10,
  });

  // Mark changes as read when viewing
  const markAsRead = useMutation(api.treatmentPlanSync.markTreatmentChangesAsRead);

  // Completion tracking state
  const [selectedExercise, setSelectedExercise] = useState<{
    id: string;
    name: string;
    phaseOrder: number;
    sets: number;
    reps: number;
  } | null>(null);

  // Fetch today's progress
  const todayProgress = useQuery(api.exerciseCompletions.getTodayProgress, {
    treatmentPlanId: treatmentPlanId as any,
  });

  // Fetch weekly stats
  const weeklyStats = useQuery(api.exerciseCompletions.getWeeklyProgress, {
    treatmentPlanId: treatmentPlanId as any,
  });

  const isCompletedToday = (exerciseId: string) => {
    return todayProgress?.some((c: any) => c.exerciseId === exerciseId);
  };

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const updateTreatmentPlan = useMutation(api.treatmentPlans.updateTreatmentPlan);
  const { toast } = useToast();
  const [uploadingImages, setUploadingImages] = useState<Record<string, { before: boolean; after: boolean }>>({});

  const handleUploadExerciseImage = async (
    phaseOrder: number,
    exerciseId: string,
    which: 'before' | 'after',
    file: File | null
  ) => {
    if (!treatmentPlan || !file) return;
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

      const updatedPhases: any[] = (treatmentPlan.phases ? [...treatmentPlan.phases] : []).map((p: any) => ({ ...p, exercises: [...p.exercises] }));
      const targetPhase = updatedPhases.find((p) => p.order === phaseOrder);
      if (!targetPhase) throw new Error('Phase not found');
      const targetExercise = targetPhase.exercises.find((e: any) => e.exerciseId === exerciseId);
      if (!targetExercise) throw new Error('Exercise not found in phase');
      if (which === 'before') targetExercise.beforeImageStorageId = storageId;
      if (which === 'after') targetExercise.afterImageStorageId = storageId;

      await updateTreatmentPlan({
        treatmentPlanId: treatmentPlan._id as any,
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

  useEffect(() => {
    if (treatmentPlan && changeHistory) {
      // Mark all unread changes as read after 2 seconds of viewing
      const timer = setTimeout(() => {
        markAsRead({ treatmentPlanId });
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [treatmentPlan, changeHistory, treatmentPlanId, markAsRead]);

  if (!treatmentPlan) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Loading treatment plan...</p>
        </div>
      </div>
    );
  }

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case "exercise_added":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "exercise_modified":
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case "goal_updated":
        return <Target className="h-4 w-4 text-blue-500" />;
      case "assessment_added":
        return <Activity className="h-4 w-4 text-purple-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  // Lightweight view types for lint-friendly maps
  type TPGoal = { description?: string; targetValue?: number | string; metric?: string };
  type TPExercise = {
    youtubeId?: string;
    videoUrl?: string;
    name?: string;
    sets?: number;
    reps?: number;
    notes?: string;
    beforeImageStorageId?: string;
    afterImageStorageId?: string;
    exerciseId?: string;
  };
  type TPPhase = { order: number; name?: string; exercises?: TPExercise[] };
  type TPChange = {
    _id: string;
    changeType: string;
    changeDescription?: string;
    timestamp: number | string;
    changedBy?: { firstName?: string; lastName?: string };
  };

  const getChangeTypeLabel = (changeType: string) => {
    switch (changeType) {
      case "exercise_added":
        return "Exercise Added";
      case "exercise_modified":
        return "Exercise Updated";
      case "exercise_removed":
        return "Exercise Removed";
      case "goal_updated":
        return "Goal Updated";
      case "assessment_added":
        return "Assessment Added";
      case "status_changed":
        return "Status Changed";
      case "phase_updated":
        return "Phase Updated";
      default:
        return "Plan Updated";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with sync indicator */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{treatmentPlan.title}</h1>
          <p className="text-muted-foreground">
            Created {format(new Date(treatmentPlan.createdAt), "PPP")}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <SyncStatusIndicator />
          <TreatmentPlanSyncIndicator />
          <Badge variant={treatmentPlan.status === "active" ? "default" : "secondary"}>
            {treatmentPlan.status}
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="exercises">Exercises</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="updates">
            Updates
            {changeHistory && changeHistory.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {changeHistory.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Plan Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Plan Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium">Description</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {treatmentPlan.description || "No description provided"}
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Duration</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {treatmentPlan.estimatedDuration} weeks
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Current Phase</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Phase {treatmentPlan.currentPhase || 1}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Goals */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Treatment Goals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {treatmentPlan.goals?.map((goal: TPGoal, index: number) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="h-2 w-2 rounded-full bg-blue-500 mt-2" />
                      <div>
                        <p className="text-sm font-medium">{goal.description}</p>
                        <p className="text-xs text-muted-foreground">
                          Target: {goal.targetValue} {goal.metric}
                        </p>
                      </div>
                    </div>
                  )) || (
                      <p className="text-sm text-muted-foreground">No goals set</p>
                    )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="exercises" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Exercise Program</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {treatmentPlan.phases?.map((phase: TPPhase) => (
                  <div key={phase.order} className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-4">
                      Phase {phase.order}: {phase.name}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {phase.exercises?.map((exercise: TPExercise, index: number) => (
                        <div key={index} className="border rounded-lg p-3 space-y-2">
                          {(exercise.youtubeId || exercise.videoUrl) && (
                            <VideoEmbed youtubeId={exercise.youtubeId} url={exercise.videoUrl} />
                          )}
                          <h4 className="font-medium">{(exercise as { name?: string }).name || exercise.exerciseId}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {exercise.sets} sets × {exercise.reps} reps
                          </p>
                          {exercise.notes && (
                            <p className="text-xs text-muted-foreground mt-2">
                              {exercise.notes}
                            </p>
                          )}
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <h5 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                              <Target className="w-3.5 h-3.5 text-green-600" />
                              Progress Tracking
                            </h5>
                            <div className="grid grid-cols-2 gap-3">
                              {/* Before Photo */}
                              <div>
                                <div className="text-xs font-medium text-gray-600 mb-1.5">Before</div>
                                {(exercise as { beforeImageStorageId?: string }).beforeImageStorageId ? (
                                  <div className="relative rounded-md overflow-hidden border border-gray-200 aspect-[4/3]">
                                    <StorageImage storageId={(exercise as { beforeImageStorageId?: string }).beforeImageStorageId || ''} />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] py-1 text-center backdrop-blur-sm">Before</div>
                                  </div>
                                ) : (
                                  <div className="border border-dashed border-gray-200 rounded-md p-2 flex flex-col items-center justify-center gap-1 bg-gray-50 aspect-[4/3]">
                                    <div className="text-center text-[10px] text-gray-400">No photo uploaded yet</div>
                                  </div>
                                )}
                              </div>

                              {/* After Photo */}
                              <div>
                                <div className="text-xs font-medium text-gray-600 mb-1.5">After</div>
                                {(exercise as { afterImageStorageId?: string }).afterImageStorageId ? (
                                  <div className="relative rounded-md overflow-hidden border border-gray-200 aspect-[4/3]">
                                    <StorageImage storageId={(exercise as { afterImageStorageId?: string }).afterImageStorageId || ''} />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] py-1 text-center backdrop-blur-sm">After</div>
                                  </div>
                                ) : (
                                  <div className="border border-dashed border-gray-200 rounded-md p-2 flex flex-col items-center justify-center gap-1 bg-gray-50 aspect-[4/3]">
                                    <div className="text-center text-[10px] text-gray-400">No photo uploaded yet</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="pt-2">
                            {isCompletedToday(exercise.exerciseId || '') ? (
                              <Button variant="outline" className="w-full bg-green-50 text-green-700 border-green-200 hover:bg-green-100" disabled>
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Completed Today
                              </Button>
                            ) : (
                              <Button
                                className="w-full bg-green-600 hover:bg-green-700"
                                onClick={() => setSelectedExercise({
                                  id: exercise.exerciseId || '',
                                  name: (exercise as { name?: string }).name || exercise.exerciseId || 'Exercise',
                                  phaseOrder: phase.order,
                                  sets: exercise.sets || 3,
                                  reps: exercise.reps || 10,
                                })}
                              >
                                Mark as Complete
                              </Button>
                            )}
                          </div>
                        </div>
                      )) || (
                          <p className="text-sm text-muted-foreground col-span-2">
                            No exercises assigned to this phase
                          </p>
                        )}
                    </div>
                  </div>
                )) || (
                    <p className="text-center text-muted-foreground py-8">
                      No exercise phases defined
                    </p>
                  )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Progress Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card className="bg-green-50 border-green-100">
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Completed Today</p>
                      <p className="text-2xl font-bold text-green-700">{todayProgress?.length || 0}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-blue-50 border-blue-100">
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                      <TrendingUp className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Weekly Adherence</p>
                      <p className="text-2xl font-bold text-blue-700">{Math.round(weeklyStats?.completionRate || 0)}%</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-purple-50 border-purple-100">
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                      <CalendarDays className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Sessions</p>
                      <p className="text-2xl font-bold text-purple-700">{weeklyStats?.actualCompletions || 0}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Recent Activity</h3>
                {weeklyStats?.completions && weeklyStats.completions.length > 0 ? (
                  <div className="space-y-3">
                    {weeklyStats.completions.map((completion: any) => (
                      <div key={completion._id} className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                          <div>
                            <p className="font-medium">{completion.exerciseId}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(completion.completedAt), "PPP p")}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <span className="block font-medium">{completion.setsCompleted} sets × {completion.repsCompleted} reps</span>
                          {completion.painLevel > 0 && (
                            <span className="text-xs text-orange-600">Pain Level: {completion.painLevel}/10</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No exercises completed yet this week</p>
                    <p className="text-sm">Start your exercises to see progress!</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="updates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Recent Updates
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!changeHistory || changeHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No updates yet</p>
                  <p className="text-sm">Changes to your treatment plan will appear here</p>
                </div>
              ) : (
                <ScrollArea className="h-96">
                  <div className="space-y-4">
                    {changeHistory.map((change: TPChange, index: number) => (
                      <div key={change._id}>
                        <div className="flex items-start gap-3">
                          {getChangeIcon(change.changeType)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <Badge variant="secondary" className="text-xs">
                                {getChangeTypeLabel(change.changeType)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(change.timestamp), { addSuffix: true })}
                              </span>
                            </div>
                            <p className="text-sm mt-1">{change.changeDescription}</p>
                            {change.changedBy && (
                              <p className="text-xs text-muted-foreground mt-1">
                                by {change.changedBy.firstName} {change.changedBy.lastName}
                              </p>
                            )}
                          </div>
                        </div>
                        {index < changeHistory.length - 1 && (
                          <Separator className="mt-4" />
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {selectedExercise && (
        <ExerciseCompletionModal
          isOpen={!!selectedExercise}
          onClose={() => setSelectedExercise(null)}
          treatmentPlanId={treatmentPlanId}
          exerciseId={selectedExercise.id}
          exerciseName={selectedExercise.name}
          phaseOrder={selectedExercise.phaseOrder}
          defaultSets={selectedExercise.sets}
          defaultReps={selectedExercise.reps}
        />
      )}
    </div>
  );
}
