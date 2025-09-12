"use client";

import React, { useCallback, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { ExerciseLibrary } from "./ExerciseLibrary";
import { UploadDropzone } from "@/components/ui/UploadDropzone";

export type TemplateExercise = {
  exerciseId?: string; // external ID or ExerciseDB id
  exerciseRefId?: Id<"exercises">; // optional internal reference
  name?: string;
  sets?: number;
  reps?: number;
  duration?: string;
  frequency?: string;
  restPeriod?: string;
  instructions?: string[];
  notes?: string;
  videoUrl?: string;
  imageUrl?: string;
  youtubeId?: string;
  beforeImageStorageId?: Id<"_storage">;
  afterImageStorageId?: Id<"_storage">;
};

export type TemplatePhase = {
  name: string;
  description?: string;
  duration?: string;
  order: number;
  exercises: TemplateExercise[];
};

interface TemplateBuilderProps {
  templateId?: Id<"treatmentTemplates">; // Optional for create mode
  initialPhases?: TemplatePhase[];
  mode?: "edit" | "create"; // UX hint, does not change behavior drastically
  onPhasesChange?: (phases: TemplatePhase[]) => void; // Emit state up for create page
  onSaveClick?: () => void; // Optional custom save behavior in create mode
}

export default function TemplateBuilder({ templateId, initialPhases = [], onPhasesChange, onSaveClick }: TemplateBuilderProps) {
  const [phases, setPhases] = useState<TemplatePhase[]>(
    initialPhases.length > 0
      ? initialPhases.map((p, i) => ({
          name: p.name,
          description: p.description || "",
          duration: p.duration || "",
          order: p.order ?? i + 1,
          exercises: (p.exercises || []).map((e) => ({ ...e })),
        }))
      : [
          {
            name: "Phase 1",
            description: "",
            duration: "2 weeks",
            order: 1,
            exercises: [],
          },
        ]
  );
  const [templateName] = useState('');
  const [templateDescription] = useState('');
  const [templateCategory] = useState('general');
  const [addingToPhase, setAddingToPhase] = useState<number | null>(null);
  const createTemplate = useMutation(api.treatmentTemplates.createTemplate);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [beforePreviews, setBeforePreviews] = useState<Record<string, File | null>>({});
  const [afterPreviews, setAfterPreviews] = useState<Record<string, File | null>>({});

  // Emit phase changes to parent (useful in create mode)
  useEffect(() => {
    onPhasesChange?.(phases);
  }, [phases, onPhasesChange]);

  // Helpers
  const extractYouTubeId = useCallback((url: string): string | undefined => {
    if (!url) return undefined;
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        return u.pathname.replace("/", "").trim() || undefined;
      }
      if (u.hostname.includes("youtube.com")) {
        const v = u.searchParams.get("v");
        if (v) return v;
        const parts = u.pathname.split("/").filter(Boolean);
        const embedIdx = parts.indexOf("embed");
        if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
        const shortsIdx = parts.indexOf("shorts");
        if (shortsIdx >= 0 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
      }
    } catch {}
    const m = url.match(/(?:youtu\\.be\/|youtube\\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\\w-]{11})/);
    return m?.[1];
  }, []);

  const compressImageFile = useCallback(async (file: File, maxWidth = 1600, maxHeight = 1600, quality = 0.7): Promise<Blob> => {
    const img = document.createElement("img");
    const src = URL.createObjectURL(file);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = src;
    });
    const canvas = document.createElement("canvas");
    let { width, height } = img;
    const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(img, 0, 0, width, height);
    const mime = file.type.includes("png") ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), mime, quality));
    URL.revokeObjectURL(src);
    return blob;
  }, []);

  const uploadCompressedImage = useCallback(async (file: File): Promise<Id<"_storage">> => {
    const blob = await compressImageFile(file);
    const uploadUrl: string = await generateUploadUrl({ fileType: file.type || "image/jpeg", fileName: file.name || "image.jpg" });
    const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type || "image/jpeg" }, body: blob });
    if (!res.ok) throw new Error("Failed to upload image");
    const json = await res.json();
    return json.storageId as Id<"_storage">;
  }, [compressImageFile, generateUploadUrl]);

  const addPhase = () => {
    setPhases((prev) => [
      ...prev,
      {
        name: `Phase ${prev.length + 1}`,
        description: "",
        duration: "2 weeks",
        order: prev.length + 1,
        exercises: [],
      },
    ]);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addExerciseToPhase = (phaseIdx: number, exercise: any) => {
    setPhases((prev) => {
      const next = [...prev];
      const target = next[phaseIdx];
      const newExercise: TemplateExercise = {
        exerciseId: exercise.exerciseId || `custom-${Date.now()}`,
        name: exercise.name,
        sets: exercise.sets || 3,
        reps: exercise.reps || 10,
        duration: exercise.duration || '30s',
        restPeriod: exercise.restPeriod || '60s',
        instructions: exercise.instructions || [],
        notes: exercise.notes || '',
        videoUrl: exercise.videoUrl,
        imageUrl: exercise.imageUrl,
      };
      target.exercises.push(newExercise);
      return next;
    });
  };

  const removePhase = (idx: number) => {
    setPhases((prev) => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, order: i + 1 })));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePhaseField = (idx: number, field: keyof TemplatePhase, value: any) => {
    setPhases((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };


  const removeExerciseFromPhase = (phaseIdx: number, exIdx: number) => {
    setPhases((prev) => {
      const next = [...prev];
      next[phaseIdx].exercises.splice(exIdx, 1);
      return next;
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateExerciseField = (phaseIdx: number, exIdx: number, field: keyof TemplateExercise, value: any) => {
    setPhases((prev) => {
      const next = [...prev];
      const ex = next[phaseIdx].exercises[exIdx];
      if (field === "youtubeId") {
        // Accept either a bare ID or a full URL; attempt to parse URL if needed
        const parsed = value && typeof value === "string" && value.includes("http") ? extractYouTubeId(value) : value;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ex as any)[field] = parsed || "";
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ex as any)[field] = value;
      }
      return next;
    });
  };

  const onSave = async () => {
    // If we have a templateId (edit mode), persist immediately
    if (templateId) {
      try {
        if (!templateName.trim()) {
          toast.error('Please enter a template name');
          return;
        }

        const template = {
          name: templateName,
          description: templateDescription,
          category: templateCategory,
          exercises: phases.map((phase) => phase.exercises).flat().map((ex: TemplateExercise) => ({
            exerciseId: ex.exerciseId,
            name: ex.name,
            sets: ex.sets || 3,
            reps: ex.reps || 10,
            duration: ex.duration || '30s',
            restPeriod: ex.restPeriod || '60s',
            instructions: ex.instructions || [],
            notes: ex.notes || '',
            videoUrl: ex.videoUrl,
            imageUrl: ex.imageUrl,
            beforeImageStorageId: ex.beforeImageStorageId,
            afterImageStorageId: ex.afterImageStorageId,
          })),
        };

        await createTemplate(template);
        toast.success("Template created");
      } catch {
        toast.error("Failed to create template");
      }
      return;
    }

    // Create mode: emit phases upward or call custom save if provided
    try {
      onPhasesChange?.(phases);
      if (onSaveClick) {
        await onSaveClick();
      }
      toast.success("Phases prepared");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      toast.error(e?.message || "Failed to prepare phases");
    }
  };

  const frequencyOptions = ["Daily", "3x per week", "Weekly", "Twice daily"];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Phases & Exercises</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addPhase}>
            <Plus className="h-4 w-4 mr-2" /> Add Phase
          </Button>
          <Button onClick={onSave}>Save Changes</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {phases.map((phase, phaseIdx) => (
          <div key={phaseIdx} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 mr-3">
                <Input
                  value={phase.name}
                  onChange={(e) => updatePhaseField(phaseIdx, "name", e.target.value)}
                  placeholder="Phase name"
                />
                <Input
                  value={phase.duration || ""}
                  onChange={(e) => updatePhaseField(phaseIdx, "duration", e.target.value)}
                  placeholder="Duration (e.g., 2 weeks)"
                />
                <Input
                  value={phase.description || ""}
                  onChange={(e) => updatePhaseField(phaseIdx, "description", e.target.value)}
                  placeholder="Short description"
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removePhase(phaseIdx)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3">
              {phase.exercises.map((ex, exIdx) => (
                <div key={exIdx} className="border rounded p-3">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                    <div className="md:col-span-2">
                      <label className="text-xs text-muted-foreground">Exercise ID</label>
                      <Input
                        value={ex.exerciseId || ""}
                        onChange={(e) => updateExerciseField(phaseIdx, exIdx, "exerciseId", e.target.value)}
                        placeholder="exercise id"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Sets</label>
                      <Input
                        type="number"
                        value={ex.sets ?? 3}
                        onChange={(e) => updateExerciseField(phaseIdx, exIdx, "sets", Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Reps</label>
                      <Input
                        type="number"
                        value={ex.reps ?? 10}
                        onChange={(e) => updateExerciseField(phaseIdx, exIdx, "reps", Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Frequency</label>
                      <Select
                        value={ex.frequency || "Daily"}
                        onValueChange={(v) => updateExerciseField(phaseIdx, exIdx, "frequency", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {frequencyOptions.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-muted-foreground">Notes</label>
                      <Input
                        value={ex.notes || ""}
                        onChange={(e) => updateExerciseField(phaseIdx, exIdx, "notes", e.target.value)}
                        placeholder="Notes for patient"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-muted-foreground">Video URL (optional)</label>
                      <Input
                        value={ex.videoUrl || ""}
                        onChange={(e) => updateExerciseField(phaseIdx, exIdx, "videoUrl", e.target.value)}
                        placeholder="https://...mp4"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-muted-foreground">YouTube URL (optional)</label>
                      <Input
                        value={ex.youtubeId || ""}
                        onChange={(e) => updateExerciseField(phaseIdx, exIdx, "youtubeId", e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                      />
                    </div>
                    {/* Before/After Images */}
                    <div className="md:col-span-3">
                      <label className="text-xs text-muted-foreground">Before Image (optional)</label>
                      <UploadDropzone
                        accept="image/*"
                        maxSizeMb={5}
                        value={beforePreviews[`${phaseIdx}-${exIdx}`] || null}
                        onFileSelected={async (file) => {
                          const key = `${phaseIdx}-${exIdx}`;
                          if (!file) {
                            setBeforePreviews((p) => ({ ...p, [key]: null }));
                            updateExerciseField(phaseIdx, exIdx, "beforeImageStorageId", undefined);
                            return;
                          }
                          try {
                            const storageId = await uploadCompressedImage(file);
                            setBeforePreviews((p) => ({ ...p, [key]: file }));
                            updateExerciseField(phaseIdx, exIdx, "beforeImageStorageId", storageId);
                            toast.success("Before image uploaded");
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          } catch (err: any) {
                            toast.error(err?.message || "Failed to upload before image");
                          }
                        }}
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="text-xs text-muted-foreground">After Image (optional)</label>
                      <UploadDropzone
                        accept="image/*"
                        maxSizeMb={5}
                        value={afterPreviews[`${phaseIdx}-${exIdx}`] || null}
                        onFileSelected={async (file) => {
                          const key = `${phaseIdx}-${exIdx}`;
                          if (!file) {
                            setAfterPreviews((p) => ({ ...p, [key]: null }));
                            updateExerciseField(phaseIdx, exIdx, "afterImageStorageId", undefined);
                            return;
                          }
                          try {
                            const storageId = await uploadCompressedImage(file);
                            setAfterPreviews((p) => ({ ...p, [key]: file }));
                            updateExerciseField(phaseIdx, exIdx, "afterImageStorageId", storageId);
                            toast.success("After image uploaded");
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          } catch (err: any) {
                            toast.error(err?.message || "Failed to upload after image");
                          }
                        }}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="icon" onClick={() => removeExerciseFromPhase(phaseIdx, exIdx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setAddingToPhase(phaseIdx)}>
                  <Plus className="h-4 w-4 mr-2" /> Add Exercise
                </Button>
              </div>

              {/* Exercise Picker Dialog per phase */}
              <Dialog open={addingToPhase === phaseIdx} onOpenChange={(o) => !o && setAddingToPhase(null)}>
                <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Select Exercise</DialogTitle>
                  </DialogHeader>
                  <ExerciseLibrary
                    onExerciseSelect={(ex) => {
                      addExerciseToPhase(phaseIdx, ex);
                      setAddingToPhase(null);
                    }}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
