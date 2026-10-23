"use client";

import { Star } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface RatingBreakdownProps {
  breakdown: {
    totalReviews: number;
    averageRating: number;
    breakdown: {
      5: number;
      4: number;
      3: number;
      2: number;
      1: number;
    };
    categoryAverages: {
      communication: number;
      treatmentEffectiveness: number;
      professionalism: number;
      valueForMoney: number;
    };
  };
}

export default function RatingBreakdown({ breakdown }: RatingBreakdownProps) {
  if (!breakdown || breakdown.totalReviews === 0) {
    return null;
  }

  const getRatingPercentage = (count: number): number => {
    return breakdown.totalReviews > 0
      ? Math.round((count / breakdown.totalReviews) * 100)
      : 0;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rating Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Rating */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-5xl font-bold text-gray-900">
              {breakdown.averageRating.toFixed(1)}
            </div>
            <div className="flex items-center justify-center mt-2">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`h-5 w-5 ${
                    i < Math.round(breakdown.averageRating)
                      ? "fill-amber-400 text-amber-400"
                      : "fill-gray-200 text-gray-200"
                  }`}
                />
              ))}
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {breakdown.totalReviews} reviews
            </p>
          </div>

          {/* Rating Distribution */}
          <div className="flex-1 space-y-2">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = breakdown.breakdown[rating as keyof typeof breakdown.breakdown];
              const percentage = getRatingPercentage(count);

              return (
                <div key={rating} className="flex items-center gap-3">
                  <div className="flex items-center gap-1 w-12">
                    <span className="text-sm font-medium">{rating}</span>
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  </div>
                  <Progress value={percentage} className="flex-1" />
                  <span className="text-sm text-gray-600 w-12 text-right">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Averages */}
        {(breakdown.categoryAverages.communication > 0 ||
          breakdown.categoryAverages.treatmentEffectiveness > 0 ||
          breakdown.categoryAverages.professionalism > 0 ||
          breakdown.categoryAverages.valueForMoney > 0) && (
          <>
            <div className="border-t pt-6">
              <h4 className="font-semibold mb-4">Category Ratings</h4>
              <div className="grid grid-cols-2 gap-4">
                {breakdown.categoryAverages.communication > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Communication</span>
                      <span className="font-medium">
                        {breakdown.categoryAverages.communication.toFixed(1)}/5
                      </span>
                    </div>
                    <Progress
                      value={
                        (breakdown.categoryAverages.communication / 5) * 100
                      }
                    />
                  </div>
                )}

                {breakdown.categoryAverages.treatmentEffectiveness > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Effectiveness</span>
                      <span className="font-medium">
                        {breakdown.categoryAverages.treatmentEffectiveness.toFixed(
                          1
                        )}
                        /5
                      </span>
                    </div>
                    <Progress
                      value={
                        (breakdown.categoryAverages.treatmentEffectiveness /
                          5) *
                        100
                      }
                    />
                  </div>
                )}

                {breakdown.categoryAverages.professionalism > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Professionalism</span>
                      <span className="font-medium">
                        {breakdown.categoryAverages.professionalism.toFixed(1)}/5
                      </span>
                    </div>
                    <Progress
                      value={
                        (breakdown.categoryAverages.professionalism / 5) * 100
                      }
                    />
                  </div>
                )}

                {breakdown.categoryAverages.valueForMoney > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Value for Money</span>
                      <span className="font-medium">
                        {breakdown.categoryAverages.valueForMoney.toFixed(1)}/5
                      </span>
                    </div>
                    <Progress
                      value={
                        (breakdown.categoryAverages.valueForMoney / 5) * 100
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
