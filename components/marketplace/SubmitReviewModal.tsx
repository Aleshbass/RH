"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Star } from "lucide-react";
import { toast } from "sonner";

interface SubmitReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  physiotherapistId: Id<"users">;
  physiotherapistName: string;
  bookingId?: Id<"marketplaceBookings">;
  onSuccess?: () => void;
}

export default function SubmitReviewModal({
  open,
  onOpenChange,
  physiotherapistId,
  physiotherapistName,
  bookingId,
  onSuccess,
}: SubmitReviewModalProps) {
  const [overallRating, setOverallRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [communicationRating, setCommunicationRating] = useState(0);
  const [treatmentRating, setTreatmentRating] = useState(0);
  const [professionalismRating, setProfessionalismRating] = useState(0);
  const [valueRating, setValueRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitReview = useMutation(api.marketplace.reviews.submitReview);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (overallRating === 0) {
      toast.error("Please select an overall rating");
      return;
    }

    if (reviewText.trim().length < 10) {
      toast.error("Please provide a review with at least 10 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitReview({
        physiotherapistId,
        bookingId,
        overallRating,
        communicationRating: communicationRating || undefined,
        treatmentEffectivenessRating: treatmentRating || undefined,
        professionalismRating: professionalismRating || undefined,
        valueForMoneyRating: valueRating || undefined,
        reviewTitle: reviewTitle || undefined,
        reviewText,
      });

      toast.success("Review submitted successfully!", {
        description: "Thank you for your feedback",
      });

      // Reset form
      setOverallRating(0);
      setCommunicationRating(0);
      setTreatmentRating(0);
      setProfessionalismRating(0);
      setValueRating(0);
      setReviewTitle("");
      setReviewText("");
      
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error("Failed to submit review", {
        description: error.message || "Please try again",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStarRating = (
    rating: number,
    setRating: (value: number) => void,
    label: string,
    required = false
  ) => {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => required && setHoveredRating(star)}
              onMouseLeave={() => required && setHoveredRating(0)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={`h-8 w-8 ${
                  star <= (required ? hoveredRating || rating : rating)
                    ? "fill-amber-400 text-amber-400"
                    : "text-gray-300"
                }`}
              />
            </button>
          ))}
          {rating > 0 && (
            <span className="ml-2 text-sm text-gray-600">
              {rating === 1 && "Poor"}
              {rating === 2 && "Fair"}
              {rating === 3 && "Good"}
              {rating === 4 && "Very Good"}
              {rating === 5 && "Excellent"}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rate Your Experience</DialogTitle>
          <DialogDescription>
            Share your feedback about your session with {physiotherapistName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Overall Rating */}
          {renderStarRating(overallRating, setOverallRating, "Overall Experience", true)}

          {/* Detailed Ratings */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-sm text-gray-700">Detailed Ratings (Optional)</h3>
            {renderStarRating(communicationRating, setCommunicationRating, "Communication")}
            {renderStarRating(treatmentRating, setTreatmentRating, "Treatment Effectiveness")}
            {renderStarRating(professionalismRating, setProfessionalismRating, "Professionalism")}
            {renderStarRating(valueRating, setValueRating, "Value for Money")}
          </div>

          {/* Review Title */}
          <div className="space-y-2">
            <Label htmlFor="reviewTitle">Review Title (Optional)</Label>
            <Input
              id="reviewTitle"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              placeholder="Summary of your experience"
              maxLength={100}
            />
          </div>

          {/* Review Text */}
          <div className="space-y-2">
            <Label htmlFor="reviewText">
              Your Review <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reviewText"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Tell others about your experience..."
              rows={6}
              className="resize-none"
              maxLength={1000}
              required
            />
            <p className="text-xs text-gray-500 text-right">
              {reviewText.length}/1000 characters
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
              disabled={isSubmitting || overallRating === 0 || reviewText.trim().length < 10}
              className="bg-[#005b57] hover:bg-[#00443e]"
            >
              {isSubmitting ? "Submitting..." : "Submit Review"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
