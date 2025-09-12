"use client";

import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Calendar, Video } from "lucide-react";

interface AppointmentCalendarSyncProps {
  appointmentId: Id<"appointments">;
  patientEmail: string;
  patientName: string;
  physiotherapistEmail: string;
  physiotherapistName: string;
  startTime: Date;
  endTime: Date;
  type: string;
  notes?: string;
  className?: string;
}

export function AppointmentCalendarSync({
  appointmentId,
  patientEmail,
  patientName,
  physiotherapistEmail,
  physiotherapistName,
  startTime,
  endTime,
  type,
  notes,
  className,
}: AppointmentCalendarSyncProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [createMeet, setCreateMeet] = useState(true);
  const [selectedCalendar, setSelectedCalendar] = useState("primary");

  const createCalendarEvent = useAction(api.calendar.service.createCalendarEvent);

  const handleSyncAppointment = useCallback(async () => {
    try {
      setIsSyncing(true);

      const result = await createCalendarEvent({
        userId: "placeholder-user-id" as Id<"users">, // Will be replaced with actual user
        appointmentId,
        summary: `Physiotherapy Session - ${type}`,
        description: notes || `Scheduled physiotherapy session with ${physiotherapistName}`,
        startTime: startTime.getTime(),
        endTime: endTime.getTime(),
        attendees: [
          { email: patientEmail, displayName: patientName },
          { email: physiotherapistEmail, displayName: physiotherapistName },
        ],
        createMeetLink: true,
        calendarId: selectedCalendar,
      });

      console.log("Calendar event created:", result);
    } catch (error) {
      console.error("Failed to sync appointment:", error);
    } finally {
      setIsSyncing(false);
    }
  }, [
    appointmentId,
    patientEmail,
    patientName,
    physiotherapistEmail,
    physiotherapistName,
    startTime,
    endTime,
    type,
    notes,
    selectedCalendar,
    createCalendarEvent,
  ]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Sync with Google Calendar
        </CardTitle>
        <CardDescription>
          Create a calendar event for this appointment with optional Google Meet link
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="create-meet" className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              Create Google Meet link
            </Label>
            <Switch
              id="create-meet"
              checked={createMeet}
              onCheckedChange={setCreateMeet}
            />
          </div>

          <div className="space-y-2">
            <Label>Calendar</Label>
            <RadioGroup value={selectedCalendar} onValueChange={setSelectedCalendar}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="primary" id="primary" />
                <Label htmlFor="primary" className="cursor-pointer">
                  Primary Calendar
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Alert>
            <AlertDescription className="text-sm">
              This will create a calendar event and send invites to both patient and physiotherapist
            </AlertDescription>
          </Alert>
        </div>

        <Button
          onClick={handleSyncAppointment}
          disabled={isSyncing}
          className="w-full"
          size="lg"
        >
          {isSyncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Event...
            </>
          ) : (
            <>
              <Calendar className="mr-2 h-4 w-4" />
              Create Calendar Event
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
