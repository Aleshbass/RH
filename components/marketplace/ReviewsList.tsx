"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";
import { Star, ThumbsUp, Loader2 } from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface ReviewsListProps {
  physiotherapistId: Id<"users">;
}

export default function ReviewsList({ physiotherapistId }: ReviewsListProps) {
  const reviews = useQuery(api.marketplace.reviews.getPhysiotherapistReviews, {
    physiotherapistId,
    limit: 10,
  });

  if (reviews === undefined) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-[#005b57]" />
      </div>
    );
  }

  if (!reviews || reviews.reviews.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-gray-600">No reviews yet</p>
          <p className="text-sm text-gray-500 mt-2">
            Be the first to book and review this physiotherapist
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.reviews.map((review: any) => (
        <Card key={review._id}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              {/* Reviewer Avatar */}
              <div className="flex-shrink-0">
                {review.patient?.imageUrl ? (
                  <Image
                    src={review.patient.imageUrl}
                    alt={review.patient.fullName}
                    width={48}
                    height={48}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-white font-semibold">
                    {review.patient?.firstName?.[0] || "A"}
                  </div>
                )}
              </div>

              {/* Review Content */}
              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {review.patient?.fullName || "Anonymous"}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${
                              i < review.overallRating
                                ? "fill-amber-400 text-amber-400"
                                : "fill-gray-200 text-gray-200"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-gray-600">
                        {format(new Date(review.createdAt), "MMM d, yyyy")}
                      </span>
                      {review.isVerifiedBooking && (
                        <Badge variant="secondary" className="text-xs">
                          Verified Booking
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Review Title */}
                {review.reviewTitle && (
                  <h4 className="font-semibold text-gray-900 mb-2">
                    {review.reviewTitle}
                  </h4>
                )}

                {/* Review Text */}
                <p className="text-gray-700 leading-relaxed mb-3">
                  {review.reviewText}
                </p>

                {/* Category Ratings */}
                {(review.communicationRating ||
                  review.treatmentEffectivenessRating ||
                  review.professionalismRating ||
                  review.valueForMoneyRating) && (
                  <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                    {review.communicationRating && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Communication</span>
                        <span className="font-medium">
                          {review.communicationRating}/5
                        </span>
                      </div>
                    )}
                    {review.treatmentEffectivenessRating && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Effectiveness</span>
                        <span className="font-medium">
                          {review.treatmentEffectivenessRating}/5
                        </span>
                      </div>
                    )}
                    {review.professionalismRating && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Professionalism</span>
                        <span className="font-medium">
                          {review.professionalismRating}/5
                        </span>
                      </div>
                    )}
                    {review.valueForMoneyRating && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Value</span>
                        <span className="font-medium">
                          {review.valueForMoneyRating}/5
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Physiotherapist Response */}
                {review.response && (
                  <div className="mt-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
                    <p className="text-sm font-semibold text-blue-900 mb-1">
                      Response from Physiotherapist
                    </p>
                    <p className="text-sm text-blue-800">{review.response.text}</p>
                    <p className="text-xs text-blue-600 mt-2">
                      {format(new Date(review.response.respondedAt), "MMM d, yyyy")}
                    </p>
                  </div>
                )}

                {/* Helpful Button */}
                <div className="mt-3 flex items-center gap-4">
                  <Button variant="ghost" size="sm" className="text-gray-600">
                    <ThumbsUp className="h-4 w-4 mr-1" />
                    Helpful {review.helpfulCount ? `(${review.helpfulCount})` : ""}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {reviews.hasMore && (
        <div className="text-center pt-4">
          <Button variant="outline">Load More Reviews</Button>
        </div>
      )}
    </div>
  );
}
