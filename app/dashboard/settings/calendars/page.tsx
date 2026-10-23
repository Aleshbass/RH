"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar } from "@/components/icons";

export default function CalendarSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calendar Settings</h1>
        <p className="text-muted-foreground">External calendar integrations are disabled. All bookings are managed in-app.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Calendar Integration
            </CardTitle>
            <CardDescription>
              Calendar sync is disabled for this project. Your Rehabify calendar works independently.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                Calendar integrations (Google/Outlook) are turned off. You can continue to create and manage appointments directly in the Rehabify calendar.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integration Status</CardTitle>
            <CardDescription>All external calendar integrations are currently turned off.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Appointments will appear instantly in your Rehabify calendar without syncing to third-party providers.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
