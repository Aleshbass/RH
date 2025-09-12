"use client";

import { useState } from "react";
import { useQueryUntyped, useMutationUntyped } from "@/lib/convexUntyped";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, Video, Loader2 } from "lucide-react";

interface AppointmentCalendarIntegrationProps {
  appointmentId: string;
  patientEmail: string;
  patientName: string;
  startTime: Date;
  endTime: Date;
  serviceType: string;
  notes?: string;
  onSyncComplete?: (result: { success: boolean; meetLink?: string }) => void;
}

export function AppointmentCalendarIntegration({
  appointmentId,
  patientEmail,
  patientName,
  startTime,
  endTime,
  serviceType,
  notes,
  onSyncComplete,
}: AppointmentCalendarIntegrationProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [createMeet, setCreateMeet] = useState(true);
  const [selectedCalendar, setSelectedCalendar] = useState("primary");
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user: any = useQueryUntyped(api.users.getMyUser as any) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createCalendarEvent: any = useMutationUntyped(api.calendar.service.createCalendarEvent as any) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connectedCalendars: any[] | undefined = useQueryUntyped(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.calendar.service.getCalendars as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user ? ({ userId: user._id } as any) : undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any[];

  const handleSyncAppointment = async () => {
    if (!user) return;

    try {
      setIsSyncing(true);
      setSyncStatus('syncing');

      const result = await createCalendarEvent({
        userId: user._id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        appointmentId: appointmentId as any,
        summary: `Physiotherapy Session - ${serviceType}`,
        description: notes || `Scheduled physiotherapy session with ${user.firstName} ${user.lastName}`,
        startTime: startTime.getTime(),
        endTime: endTime.getTime(),
        attendees: [
          { email: patientEmail, displayName: patientName },
          { email: user.email, displayName: `${user.firstName} ${user.lastName}` },
        ],
        createMeetLink: createMeet,
        calendarId: selectedCalendar,
      });

      setSyncStatus('success');
      onSyncComplete?.({ success: true, meetLink: result.meetLink });
      
      return result;
    } catch (error) {
      console.error("Failed to sync appointment:", error);
      setSyncStatus('error');
      onSyncComplete?.({ success: false });
    } finally {
      setIsSyncing(false);
    }
  };

  const isConnected = connectedCalendars && connectedCalendars.length > 0;

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Calendar Integration
        </CardTitle>
        <CardDescription>
          Sync this appointment with Google Calendar and generate Google Meet link
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Connect your Google Calendar to sync appointments and enable Google Meet links
              </AlertDescription>
            </Alert>
            <Button 
              onClick={() => window.location.href = '/dashboard/settings/calendars'}
              className="w-full"
            >
              Connect Google Calendar
            </Button>
          </div>
        ) : (
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
                disabled={isSyncing}
              />
            </div>

            <div className="space-y-2">
              <Label>Calendar</Label>
              <div className="space-y-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {connectedCalendars?.map((calendar: any) => (
                  <div key={calendar.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: calendar.backgroundColor || '#4285f4' }}
                      />
                      <span className="text-sm">{calendar.summary}</span>
                      {calendar.primary && (
                        <span className="text-xs text-muted-foreground">(Primary)</span>
                      )}
                    </div>
                    <input
                      type="radio"
                      name="calendar"
                      value={calendar.id}
                      checked={selectedCalendar === calendar.id}
                      onChange={(e) => setSelectedCalendar(e.target.value)}
                      disabled={isSyncing}
                      className="radio"
                    />
                  </div>
                ))}
              </div>
            </div>

            {syncStatus === 'success' && (
              <Alert variant="default">
                <AlertDescription>
                  Appointment successfully synced with Google Calendar
                </AlertDescription>
              </Alert>
            )}

            {syncStatus === 'error' && (
              <Alert variant="destructive">
                <AlertDescription>
                  Failed to sync appointment. Please try again.
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleSyncAppointment}
              disabled={isSyncing}
              className="w-full"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Calendar className="mr-2 h-4 w-4" />
                  Sync with Google Calendar
                </>
              )}
            </Button>

            <div className="text-sm text-muted-foreground">
              <p>• Creates Google Calendar event</p>
              <p>• Sends invites to both patient and physiotherapist</p>
              {createMeet && <p>• Generates Google Meet link</p>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
