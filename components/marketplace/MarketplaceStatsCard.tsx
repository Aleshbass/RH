"use client";

import { IconComponent } from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";

interface MarketplaceStatsCardProps {
  title: string;
  value: string | number;
  icon: IconComponent;
  trend?: string;
}

export default function MarketplaceStatsCard({
  title,
  value,
  icon: Icon,
  trend,
}: MarketplaceStatsCardProps) {
  const displayValue = value === 0 || value === "0" ? "0" : value;
  const isZero = value === 0 || value === "0" || value === "N/A";
  
  return (
    <Card className={`transition-all ${isZero ? 'border-gray-200' : 'border-l-4 border-l-pink-500'}`}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className={`text-3xl font-bold mt-1 ${isZero ? 'text-gray-400' : 'bg-gradient-to-r from-[#005b57] to-pink-600 bg-clip-text text-transparent'}`}>
              {displayValue}
            </p>
            {trend && (
              <p className="text-xs text-gray-500 mt-1">{trend}</p>
            )}
            {isZero && (
              <p className="text-xs text-pink-600 mt-2 font-medium">
                {title === "Profile Views" && "Set pricing to start"}
                {title === "Total Bookings" && "Waiting for first booking"}
                {title === "Total Earnings" && "No earnings yet"}
                {title === "Average Rating" && "No reviews yet"}
              </p>
            )}
          </div>
          <div className={`p-3 rounded-xl ${isZero ? 'bg-gray-100' : 'bg-gradient-to-br from-pink-100 to-purple-100'}`}>
            <Icon className={`h-6 w-6 ${isZero ? 'text-gray-400' : 'text-pink-600'}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
