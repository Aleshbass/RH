"use client";

import { useState } from "react";
import { Plus, FileText, Link, Calendar, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface AssessmentIntegrationProps {
  patientId: string;
  treatmentPlanId?: string;
  onAssessmentCreated?: (assessmentId: string) => void;
}

export function AssessmentIntegration({ 
  patientId, 
  treatmentPlanId, 
  onAssessmentCreated 
}: AssessmentIntegrationProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAssessmentType, setSelectedAssessmentType] = useState("");
  const [linkToTreatmentPlan, setLinkToTreatmentPlan] = useState(!!treatmentPlanId);
  const [selectedTreatmentPlan, setSelectedTreatmentPlan] = useState(treatmentPlanId || "");
  const [notes, setNotes] = useState("");
  const [isBaseline, setIsBaseline] = useState(false);

  // Fetch patient's treatment plans
  const treatmentPlans = useQuery(api.treatmentPlans.getPatientTreatmentPlans, {
    patientId: patientId,
  });

  // Fetch existing assessments
  const assessments = useQuery(api.assessments.getPatientAssessments, {
    patientId: patientId,
  });

  const createAssessment = useMutation(api.treatmentPlanSync.createAssessmentWithPlanIntegration);

  const assessmentTypes = [
    {
      id: "oswestry",
      name: "Oswestry Disability Index",
      description: "Lower back pain and disability assessment",
      category: "Spine",
    },
    {
      id: "dash",
      name: "DASH Questionnaire",
      description: "Disabilities of Arm, Shoulder and Hand",
      category: "Upper Extremity",
    },
    {
      id: "neck_disability",
      name: "Neck Disability Index",
      description: "Neck pain and disability assessment",
      category: "Spine",
    },
    {
      id: "knee_injury",
      name: "Knee Injury and Osteoarthritis Outcome Score",
      description: "Knee function and symptoms assessment",
      category: "Lower Extremity",
    },
    {
      id: "shoulder_function",
      name: "Shoulder Function Assessment",
      description: "Comprehensive shoulder mobility and strength",
      category: "Upper Extremity",
    },
    {
      id: "psfs",
      name: "Patient-Specific Functional Scale (PSFS)",
      description: "Patient-identified functional limitations rated 0-10",
      category: "Functional",
    },
    {
      id: "nprs",
      name: "Numeric Pain Rating Scale (NPRS)",
      description: "Current, best and worst pain in last 24 hours (0-10)",
      category: "Pain",
    },
    {
      id: "nps",
      name: "Net Promoter Score (NPS)",
      description: "Patient satisfaction and likelihood to recommend (0-10)",
      category: "Satisfaction",
    },
  ];

  const handleCreateAssessment = async () => {
    if (!selectedAssessmentType) {
      toast.error("Please select an assessment type");
      return;
    }

    try {
      const selectedType = assessmentTypes.find(type => type.id === selectedAssessmentType);
      
      // Mock assessment responses - in real implementation, this would come from assessment form
      const mockResponses = [
        {
          questionId: "q1",
          question: "Sample question 1",
          answer: "Sample answer",
          score: 2,
        },
        {
          questionId: "q2", 
          question: "Sample question 2",
          answer: "Sample answer",
          score: 1,
        },
      ];

      const assessmentId = await createAssessment({
        patientId,
        treatmentPlanId: linkToTreatmentPlan ? selectedTreatmentPlan : undefined,
        assessmentType: selectedAssessmentType,
        title: selectedType?.name || "Assessment",
        responses: mockResponses,
        totalScore: 3,
        maxScore: 10,
        percentageScore: 30,
        interpretation: "Mild disability indicated",
        isBaseline,
        notes,
      });

      toast.success("Assessment created and linked to treatment plan");
      setIsDialogOpen(false);
      onAssessmentCreated?.(assessmentId);
      
      // Reset form
      setSelectedAssessmentType("");
      setNotes("");
      setIsBaseline(false);
      
    } catch (error) {
      console.error("Failed to create assessment:", error);
      toast.error("Failed to create assessment");
    }
  };

  return (
    <div className="space-y-6">
      {/* Assessment Creation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Assessment & Treatment Plan Integration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Create assessments and automatically link them to treatment plans for comprehensive patient care.
            </p>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Assessment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Assessment</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  {/* Assessment Type Selection */}
                  <div className="space-y-2">
                    <Label>Assessment Type</Label>
                    <Select value={selectedAssessmentType} onValueChange={setSelectedAssessmentType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select assessment type" />
                      </SelectTrigger>
                      <SelectContent>
                        {assessmentTypes.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{type.name}</span>
                              <span className="text-xs text-muted-foreground">{type.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Treatment Plan Integration */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="linkTreatmentPlan"
                        checked={linkToTreatmentPlan}
                        onChange={(e) => setLinkToTreatmentPlan(e.target.checked)}
                        className="rounded"
                      />
                      <Label htmlFor="linkTreatmentPlan" className="flex items-center gap-2">
                        <Link className="h-4 w-4" />
                        Link to Treatment Plan
                      </Label>
                    </div>

                    {linkToTreatmentPlan && (
                      <div className="space-y-2">
                        <Label>Select Treatment Plan</Label>
                        <Select value={selectedTreatmentPlan} onValueChange={setSelectedTreatmentPlan}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select treatment plan" />
                          </SelectTrigger>
                          <SelectContent>
                            {treatmentPlans?.map((plan: { _id: string; title?: string; status?: string }) => (
                              <SelectItem key={plan._id} value={plan._id}>
                                <div className="flex items-center justify-between w-full">
                                  <span>{plan.title}</span>
                                  <Badge variant="outline" className="ml-2">
                                    {plan.status}
                                  </Badge>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Assessment Options */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="isBaseline"
                        checked={isBaseline}
                        onChange={(e) => setIsBaseline(e.target.checked)}
                        className="rounded"
                      />
                      <Label htmlFor="isBaseline">Mark as baseline assessment</Label>
                    </div>

                    <div className="space-y-2">
                      <Label>Notes (Optional)</Label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Additional notes about this assessment..."
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateAssessment}>
                      Create Assessment
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Existing Assessments */}
      {assessments && assessments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Assessments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {assessments.slice(0, 5).map((assessment: { _id: string; title?: string; baseline?: boolean; treatmentPlanId?: string; completedAt: number | string; totalScore?: number; maxScore?: number; percentageScore?: number; interpretation?: string }) => (
                <div key={assessment._id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{assessment.title}</h4>
                        {assessment.baseline && (
                          <Badge variant="secondary">Baseline</Badge>
                        )}
                        {assessment.treatmentPlanId && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Link className="h-3 w-3" />
                            Linked
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDistanceToNow(new Date(assessment.completedAt), { addSuffix: true })}
                        </span>
                        <span>Score: {assessment.totalScore}/{assessment.maxScore} ({assessment.percentageScore}%)</span>
                      </div>
                      <p className="text-sm">{assessment.interpretation}</p>
                    </div>
                    <Button variant="ghost" size="sm">
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assessment Guidelines */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Assessment Guidelines
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium">Baseline Assessments</h4>
                <p className="text-sm text-muted-foreground">
                  Conduct initial assessments to establish baseline measurements before treatment begins.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Progress Tracking</h4>
                <p className="text-sm text-muted-foreground">
                  Regular reassessments help track patient progress and adjust treatment plans accordingly.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Treatment Integration</h4>
                <p className="text-sm text-muted-foreground">
                  Link assessments to treatment plans for comprehensive patient care documentation.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Patient Communication</h4>
                <p className="text-sm text-muted-foreground">
                  Assessment results are automatically synced to patients for transparency and engagement.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
