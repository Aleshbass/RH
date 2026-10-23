"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle, AlertCircle, RefreshCw } from "@/components/icons";
import { formatDistanceToNow } from "date-fns";

interface CalendarSyncStatusProps {
  appointmentId: string;
}

export function CalendarSyncStatus({ appointmentId }: CalendarSyncStatusProps) {
  const syncStatus = useQuery(api.calendar.sync.getSyncStatus, { appointmentId });

  if (!syncStatus) return null;

  const getStatusIcon = () => {
    switch (syncStatus.status) {
      case 'synced':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Calendar className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = () => {
    switch (syncStatus.status) {
      case 'synced':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="font-medium">Calendar Sync</span>
          </div>
          <Badge className={getStatusColor()}>
            {syncStatus.status}
          </Badge>
        </div>
        
        {syncStatus.lastSync && (
          <p className="text-sm text-muted-foreground mt-2">
            Last synced {formatDistanceToNow(new Date(syncStatus.lastSync), { addSuffix: true })}
          </p>
        )}

        {syncStatus.error && (
          <p className="text-sm text-red-600 mt-2">
            Error: {syncStatus.error}
          </p>
        )}

        {syncStatus.googleMeetLink && (
          <div className="mt-3">
            <a 
              href={syncStatus.googleMeetLink} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Join Google Meet
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
