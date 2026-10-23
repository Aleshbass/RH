"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { toast } from "sonner";
import { PatientProfileMiniCard } from "@/components/dashboard/physiotherapist/PatientProfileMiniCard";

export default function UseTreatmentTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const templateId = (params?.templateId as string) as Id<"treatmentTemplates">;

  const template = useQuery(api.treatmentPlans.getTreatmentTemplateById, { templateId });
  const patients = useQuery(api.patients.getMyPatients, { limit: 100 });
  const assignTemplate = useMutation(api.treatmentPlans.assignTemplateToPatient);

  const [patientId, setPatientId] = useState<Id<"users"> | "">("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [activate, setActivate] = useState<boolean>(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (template) {
      setTitle(template.title || "");
      setDescription(template.description || "");
    }
  }, [template]);

  const filteredPatients = useMemo(() => {
    if (!patients) return [];
    const s = search.toLowerCase();
    return (patients as Array<{
      _id: Id<"users">;
      firstName?: string;
      lastName?: string;
      email?: string;
    }>).filter((p) =>
      (p.firstName || "").toLowerCase().includes(s) ||
      (p.lastName || "").toLowerCase().includes(s) ||
      (p.email || "").toLowerCase().includes(s)
    );
  }, [patients, search]);

  const onAssign = async () => {
    if (!patientId) return toast.error("Select a patient to assign");
    try {
      await assignTemplate({
        templateId,
        patientId: patientId as Id<"users">,
        title,
        description,
        priority,
        activate,
      });
      toast.success("Template assigned successfully");
      // Navigate to patient's treatment plan page
      router.push(`/dashboard/physiotherapist/patients/${patientId}/treatment-plan`);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Failed to assign template");
    }
  };

  if (template === undefined || patients === undefined) {
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
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6">
        <Button variant="ghost" asChild>
          <Link href={`/dashboard/physiotherapist/treatment-templates/${templateId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Template
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Plan Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Priority</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as 'low' | 'medium' | 'high')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input id="activate" type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
              <label htmlFor="activate" className="text-sm">Activate immediately</label>
            </div>
            <Button onClick={onAssign} className="w-full">Assign Template</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Select Patient</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {patientId ? (
              <PatientProfileMiniCard patientId={patientId as Id<"users">} />
            ) : null}
            <Input placeholder="Search patients..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-80 overflow-auto border rounded">
              {filteredPatients.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No patients found</div>
              ) : (
                <ul>
                  {filteredPatients.map((p: {
                    _id: Id<"users">;
                    firstName?: string;
                    lastName?: string;
                    email?: string;
                  }) => (
                    <li
                      key={p._id}
                      className={`p-3 cursor-pointer hover:bg-accent ${patientId === p._id ? 'bg-accent' : ''}`}
                      onClick={() => setPatientId(p._id)}
                    >
                      <div className="font-medium">{p.firstName} {p.lastName}</div>
                      <div className="text-xs text-muted-foreground">{p.email}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
