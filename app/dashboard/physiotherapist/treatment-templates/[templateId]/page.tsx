"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { ArrowLeft, Edit, PlayCircle } from "@/components/icons";
import { VideoEmbed } from "@/components/media/VideoEmbed";

export default function TreatmentTemplateDetailPage() {
  const params = useParams();
  const templateId = (params?.templateId as string) as Id<"treatmentTemplates">;

  const template = useQuery(api.treatmentPlans.getTreatmentTemplateById, {
    templateId,
  });

  const difficultyColor = (difficulty?: string) => {
    if (!difficulty) return "bg-gray-100 text-gray-800";
    if (difficulty.includes("Beginner")) return "bg-green-100 text-green-800";
    if (difficulty.includes("Intermediate")) return "bg-yellow-100 text-yellow-800";
    if (difficulty.includes("Advanced")) return "bg-red-100 text-red-800";
    return "bg-gray-100 text-gray-800";
  };

  if (template === undefined) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-96 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <Button variant="ghost" asChild>
            <Link href="/dashboard/physiotherapist/treatment-templates">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Templates
            </Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Template not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">This template may have been deleted or you do not have access.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalExercises = (template.phases || []).reduce(
    (acc: number, p: { exercises?: unknown[] }) => acc + (p.exercises?.length || 0),
    0
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" asChild>
          <Link href="/dashboard/physiotherapist/treatment-templates">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Templates
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/dashboard/physiotherapist/treatment-templates/${template._id}/edit`}>
              <Edit className="h-4 w-4 mr-2" /> Edit
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/dashboard/physiotherapist/treatment-templates/${template._id}/use`}>
              <PlayCircle className="h-4 w-4 mr-2" /> Use Template
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-xl mb-2 break-words">{template.title}</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{template.category || "General"}</Badge>
                <Badge className={difficultyColor(template.difficulty || "Beginner")}>
                  {template.difficulty || "Beginner"}
                </Badge>
                <Badge variant="secondary">{template.duration || "Flexible"}</Badge>
              </div>
            </div>
            <div className="text-sm text-muted-foreground sm:text-right">
              <div>Usage: {template.usageCount || 0}</div>
              <div>
                Updated: {new Date(template.updatedAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-muted-foreground">{template.description || "No description provided."}</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Goals</h3>
              {(template.goals?.length ? (
                <ul className="list-disc pl-6 space-y-1">
                  {template.goals.map((g: { description: string }, i: number) => (
                    <li key={i}>{g.description}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No goals defined.</p>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Phases & Exercises</h3>
                <div className="text-sm text-muted-foreground">Total exercises: {totalExercises}</div>
              </div>
              {(template.phases?.length ? (
                <div className="space-y-4">
                  {template.phases.map((phase: {
                    order: number;
                    name: string;
                    duration?: string;
                    description?: string;
                    exercises?: Array<{
                      exerciseId?: string;
                      exerciseRefId?: string;
                      youtubeId?: string;
                      videoUrl?: string;
                      sets?: number;
                      reps?: number;
                      frequency?: string;
                      notes?: string;
                    }>;
                  }) => (
                    <div key={phase.order} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Phase {phase.order}: {phase.name}</h4>
                        {phase.duration && <Badge variant="secondary">{phase.duration}</Badge>}
                      </div>
                      {phase.description && (
                        <p className="text-sm text-muted-foreground mt-1">{phase.description}</p>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        {(phase.exercises?.length ? (
                          phase.exercises.map((ex: {
                            exerciseId?: string;
                            exerciseRefId?: string;
                            youtubeId?: string;
                            videoUrl?: string;
                            sets?: number;
                            reps?: number;
                            frequency?: string;
                            notes?: string;
                          }, idx: number) => (
                            <div key={idx} className="border rounded p-3 space-y-2">
                              {(ex.youtubeId || ex.videoUrl) && (
                                <VideoEmbed youtubeId={ex.youtubeId} url={ex.videoUrl} />
                              )}
                              <div className="font-medium">{ex.exerciseId || ex.exerciseRefId || "Exercise"}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {ex.sets || 3} sets × {ex.reps || 10} reps • {ex.frequency || "Daily"}
                              </div>
                              {ex.notes && (
                                <div className="text-xs text-muted-foreground mt-1">{ex.notes}</div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-muted-foreground">No exercises added.</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No phases defined.</p>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
