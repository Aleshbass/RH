"use client";

// useState not used in this component
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// Alert components not used in this component
import { Calendar, Check, ExternalLink } from "lucide-react";
import { CalendarIntegration } from "@/components/calendar/CalendarIntegration";
import { Id } from "@/convex/_generated/dataModel";

export default function CalendarSettingsPage() {
  const user = useQuery(api.users.getMyUser);
  const connectedCalendars = useQuery(api.calendar.service.getCalendars, { userId: user?._id });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calendar Settings</h1>
        <p className="text-muted-foreground">
          Manage your Google Calendar integration and sync preferences
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Google Calendar Integration
            </CardTitle>
            <CardDescription>
              Connect your Google Calendar to sync appointments and enable Google Meet links
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CalendarIntegration userId={user?._id as Id<'users'>} />
          </CardContent>
        </Card>

        {connectedCalendars && connectedCalendars.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Connected Calendars</CardTitle>
              <CardDescription>
                Your Google Calendar accounts and settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {connectedCalendars.map((calendar: {
                  id: string;
                  summary: string;
                  backgroundColor?: string;
                  description?: string;
                  primary?: boolean;
                }) => (
                  <div key={calendar.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div 
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: calendar.backgroundColor || '#4285f4' }}
                      />
                      <div>
                        <p className="font-medium">{calendar.summary}</p>
                        <p className="text-sm text-muted-foreground">
                          {calendar.primary ? "Primary Calendar" : "Secondary Calendar"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-muted-foreground">Connected</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Integration Features</CardTitle>
            <CardDescription>
              What you can do with Google Calendar integration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-medium">Automatic Appointment Sync</p>
                  <p className="text-sm text-muted-foreground">
                    New appointments automatically sync to your Google Calendar
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-medium">Google Meet Integration</p>
                  <p className="text-sm text-muted-foreground">
                    Generate Google Meet links for telehealth appointments
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-medium">Patient Invitations</p>
                  <p className="text-sm text-muted-foreground">
                    Patients receive calendar invites with all appointment details
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-medium">Real-time Sync</p>
                  <p className="text-sm text-muted-foreground">
                    Changes to appointments sync instantly across all devices
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Need Help?</CardTitle>
            <CardDescription>
              Resources to help you get the most out of calendar integration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Button variant="outline" className="w-full justify-start" asChild>
                <a href="/docs/google-calendar-setup" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Google Calendar Setup Guide
                </a>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <a href="/docs/google-meet-integration" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Google Meet Integration
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
