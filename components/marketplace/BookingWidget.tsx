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

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Book a Session</CardTitle>
        <CardDescription>Schedule your appointment online</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
