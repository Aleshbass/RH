"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { toast } from "sonner";
import TemplateBuilder from "@/components/dashboard/physiotherapist/treatment/TemplateBuilder";

export default function EditTreatmentTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const templateId = (params?.templateId as string) as Id<"treatmentTemplates">;

  const template = useQuery(api.treatmentPlans.getTreatmentTemplateById, { templateId });
  const updateTemplate = useMutation(api.treatmentPlans.updateTreatmentTemplate);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [duration, setDuration] = useState("");
  const [difficulty, setDifficulty] = useState("Beginner");

  useEffect(() => {
    if (template) {
      setTitle(template.title || "");
      setDescription(template.description || "");
      setCategory(template.category || "");
      setDuration(template.duration || "");
      setDifficulty(template.difficulty || "Beginner");
    }
  }, [template]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateTemplate({
        templateId,
        title,
        description,
        category,
        duration,
        difficulty,
      });
      toast.success("Template updated");
      router.push(`/dashboard/physiotherapist/treatment-templates/${templateId}`);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Failed to update template");
    }
  };

  if (template === undefined) {
    return (
      <div className="mx-auto w-full">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-96 mb-6" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="mx-auto w-full">
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
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6">
        <Button variant="ghost" asChild>
          <Link href={`/dashboard/physiotherapist/treatment-templates/${templateId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Template
          </Link>
        </Button>
      </div>

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Edit Template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g., Spine" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Duration</label>
                <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g., 6-8 weeks" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Difficulty</label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Beginner">Beginner</SelectItem>
                    <SelectItem value="Intermediate">Intermediate</SelectItem>
                    <SelectItem value="Advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" className="flex-1">Save Changes</Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/dashboard/physiotherapist/treatment-templates/${templateId}`}>Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Phases & Exercises Builder */}
      <div className="mt-6">
        <TemplateBuilder templateId={templateId} initialPhases={template?.phases || []} />
      </div>
    </div>
  );
}
