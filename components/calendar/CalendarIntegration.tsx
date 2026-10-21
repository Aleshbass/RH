"use client";

import { useCallback, useState, useEffect } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface CalendarIntegrationProps {
  userId: Id<"users">;
  className?: string;
}

interface Calendar {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
  backgroundColor?: string;
  foregroundColor?: string;
}

export function CalendarIntegration({ userId, className }: CalendarIntegrationProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedCalendars, setSelectedCalendars] = useState<Set<string>>(new Set());

  const generateAuthUrl = useAction(api.calendar.oauth.generateAuthUrl);
  const syncCalendars = useAction(api.calendar.service.syncCalendars);
  const connectedCalendars = useQuery(api.calendar.service.getCalendars, { userId });

  const handleConnect = useCallback(async () => {
    try {
      setIsConnecting(true);
      const { authUrl } = await generateAuthUrl({ 
        userId, 
        platform: "google" as const 
      });
      window.location.href = authUrl;
    } catch (error) {
      console.error("Failed to generate auth URL:", error);
    } finally {
      setIsConnecting(false);
    }
  }, [userId, generateAuthUrl]);

  const handleSyncCalendars = useCallback(async () => {
    try {
      await syncCalendars({ userId });
    } catch (error) {
      console.error("Failed to sync calendars:", error);
    }
  }, [userId, syncCalendars]);

  // Auto-sync calendars when credentials are available but no cached calendars exist
  useEffect(() => {
    if (connectedCalendars !== undefined && connectedCalendars.length === 0) {
      handleSyncCalendars();
    }
  }, [connectedCalendars, handleSyncCalendars]);

  // Handle OAuth redirect with success parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const calendarSuccess = urlParams.get('calendar_success');
    
    if (calendarSuccess === 'true' && userId) {
      // Force refresh calendars after successful OAuth
      handleSyncCalendars();
      // Clean up URL parameter
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [userId, handleSyncCalendars]);

  const toggleCalendar = useCallback((calendarId: string) => {
    setSelectedCalendars((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(calendarId)) {
        newSet.delete(calendarId);
      } else {
        newSet.add(calendarId);
      }
      return newSet;
    });
  }, []);

  const isConnected = connectedCalendars && connectedCalendars.length > 0;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Calendar Integration
        </CardTitle>
        <CardDescription>
          Connect your Google Calendar to get Google Meet links for video sessions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected ? (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Connect your Google Calendar to add video sessions with a Google Meet link to your calendar. Other appointments stay in Rehabify and aren&apos;t copied to Google Calendar.
              </AlertDescription>
            </Alert>
            
            <Button 
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full"
              size="lg"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Calendar className="mr-2 h-4 w-4" />
                  Connect Google Calendar
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">Connected</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {connectedCalendars.length} calendars
              </Badge>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Available Calendars</h4>
              <div className="space-y-2">
                {connectedCalendars.map((calendar: Calendar) => (
                  <div
                    key={calendar.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: calendar.backgroundColor || '#4285f4' }}
                      />
                      <div>
                        <p className="text-sm font-medium">{calendar.summary}</p>
                        {calendar.primary && (
                          <Badge variant="secondary" className="text-xs">
                            Primary
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={selectedCalendars.has(calendar.id)}
                      onCheckedChange={() => toggleCalendar(calendar.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
