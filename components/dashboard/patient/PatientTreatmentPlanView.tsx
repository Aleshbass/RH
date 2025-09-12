"use client";

import { useState, useEffect } from "react";
import { Bell, CheckCircle, AlertCircle, Target, Activity, Clock } from "lucide-react";
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

interface PatientTreatmentPlanViewProps {
  treatmentPlanId: string;
}

export function PatientTreatmentPlanView({ treatmentPlanId }: PatientTreatmentPlanViewProps) {
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch treatment plan with real-time updates
  const treatmentPlan = useQuery(api.treatmentPlans.getTreatmentPlan, {
    treatmentPlanId,
  });

  // Fetch change history
  const changeHistory = useQuery(api.treatmentPlanSync.getTreatmentPlanChangeHistory, {
    treatmentPlanId,
    limit: 10,
  });

  // Mark changes as read when viewing
  const markAsRead = useMutation(api.treatmentPlanSync.markTreatmentChangesAsRead);

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
                          {(exercise as { beforeImageStorageId?: string; afterImageStorageId?: string }).beforeImageStorageId || (exercise as { beforeImageStorageId?: string; afterImageStorageId?: string }).afterImageStorageId ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                              {(exercise as { beforeImageStorageId?: string }).beforeImageStorageId && (
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">Before</div>
                                  <StorageImage storageId={(exercise as { beforeImageStorageId?: string }).beforeImageStorageId || ''} className="w-full h-48 object-cover rounded" />
                                </div>
                              )}
                              {(exercise as { afterImageStorageId?: string }).afterImageStorageId && (
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">After</div>
                                  <StorageImage storageId={(exercise as { afterImageStorageId?: string }).afterImageStorageId || ''} className="w-full h-48 object-cover rounded" />
                                </div>
                              )}
                            </div>
                          ) : null}
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
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Progress tracking will be displayed here</p>
                <p className="text-sm">Complete exercises to see your progress</p>
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
    </div>
  );
}
