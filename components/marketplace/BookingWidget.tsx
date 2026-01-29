"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, ExternalLink } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";

interface BookingWidgetProps {
  profile: {
    id: Id<"users">;
    fullName: string;
    initialConsultRate: number;
    hourlyRate: number;
    packageRates: Array<{
      sessions: number;
      price: number;
      description?: string;
    }>;
    offersOnlineSessions: boolean;
    offersInPersonSessions: boolean;
    availabilitySchedule?: any;
  };
}

export default function BookingWidget({ profile }: BookingWidgetProps) {
  const router = useRouter();

  // Determine session price for display
  const sessionPrice = profile.initialConsultRate || profile.hourlyRate || 0;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Book a Session</CardTitle>
        <CardDescription>Schedule your appointment online</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Session Price Display */}
        {sessionPrice > 0 && (
          <div className="bg-gradient-to-br from-[#005b57]/5 to-emerald-50 rounded-lg p-4 border border-[#005b57]/20">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-600">Starting from</p>
                <p className="text-xs text-gray-500">Initial Consultation</p>
              </div>
              <p className="text-2xl font-bold text-[#005b57]">
                ₦{sessionPrice.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Calendar Booking Link - Primary CTA */}
        <Button
          onClick={() => router.push(`/book/${profile.id}/60`)}
          className="w-full h-12 text-base bg-[#005b57] hover:bg-[#00443e]"
        >
          <Calendar className="w-4 h-4 mr-2" />
          View Full Calendar & Book
          <ExternalLink className="w-3 h-3 ml-2" />
        </Button>

        <p className="text-xs text-center text-gray-500">
          Choose your preferred date, time, and session type
        </p>
      </CardContent>
    </Card>
  );
}
