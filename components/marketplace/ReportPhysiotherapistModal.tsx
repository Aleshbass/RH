"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "@/components/icons";
import { toast } from "sonner";

interface ReportPhysiotherapistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  physiotherapistId: Id<"users">;
  physiotherapistName: string;
  appointmentId?: Id<"appointments">;
  bookingId?: Id<"marketplaceBookings">;
  onSuccess?: () => void;
}

export default function ReportPhysiotherapistModal({
  open,
  onOpenChange,
  physiotherapistId,
  physiotherapistName,
  appointmentId,
  bookingId,
  onSuccess,
}: ReportPhysiotherapistModalProps) {
  const [reason, setReason] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reportPhysiotherapist = useMutation(
    api.marketplace.reports.reportPhysiotherapist
  );

  const reasons = [
    {
      value: "unprofessional_behavior",
      label: "Unprofessional Behavior",
    },
    {
      value: "poor_treatment_quality",
      label: "Poor Treatment Quality",
    },
    {
      value: "safety_concern",
      label: "Safety Concern",
    },
    {
      value: "billing_issue",
      label: "Billing Issue",
    },
    {
      value: "harassment",
      label: "Harassment",
    },
    {
      value: "breach_of_confidentiality",
      label: "Breach of Confidentiality",
    },
    { value: "other", label: "Other" },
  ];

  const severityLevels = [
    { value: "low", label: "Low - Minor concern", color: "text-yellow-600" },
    {
      value: "medium",
      label: "Medium - Needs attention",
      color: "text-orange-600",
    },
    { value: "high", label: "High - Serious issue", color: "text-red-600" },
    {
      value: "critical",
      label: "Critical - Immediate action required",
      color: "text-red-800",
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason) {
      toast.error("Please select a reason");
      return;
    }

    if (!severity) {
      toast.error("Please select severity level");
      return;
    }

    if (description.trim().length < 20) {
      toast.error("Please provide a detailed description (at least 20 characters)");
      return;
    }

    setIsSubmitting(true);
    try {
      await reportPhysiotherapist({
        physiotherapistId,
        reason: reason as any,
        severity: severity as any,
        description,
        appointmentId,
        bookingId,
      });

      toast.success("Report submitted successfully", {
        description:
          "Our team will review your report and take appropriate action",
      });

      // Reset form
      setReason("");
      setSeverity("");
      setDescription("");

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error("Failed to submit report", {
        description: error.message || "Please try again",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Report a Concern
          </DialogTitle>
          <DialogDescription>
            Report concerns about {physiotherapistName}. Your report will be
            reviewed by our admin team.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason for Report <span className="text-red-500">*</span>
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Severity */}
          <div className="space-y-2">
            <Label htmlFor="severity">
              Severity Level <span className="text-red-500">*</span>
            </Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger id="severity">
                <SelectValue placeholder="Select severity level" />
              </SelectTrigger>
              <SelectContent>
                {severityLevels.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className={s.color}>{s.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Detailed Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please provide a detailed description of your concern..."
              rows={8}
              className="resize-none"
              maxLength={2000}
              required
            />
            <p className="text-xs text-gray-500 text-right">
              {description.length}/2000 characters (minimum 20)
            </p>
          </div>

          {/* Disclaimer */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              <strong>Important:</strong> False or malicious reports may result
              in action against your account. Please only submit legitimate
              concerns.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !reason ||
                !severity ||
                description.trim().length < 20
              }
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? "Submitting..." : "Submit Report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
