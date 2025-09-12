"use client";

import { useState, useEffect } from "react";
import { Bell, CheckCircle, Clock, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatDistanceToNow } from "date-fns";
import { Id } from '@/convex/_generated/dataModel'

interface TreatmentPlanSyncIndicatorProps {
  className?: string;
}

export function TreatmentPlanSyncIndicator({ className }: TreatmentPlanSyncIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Subscribe to real-time updates
  type UpdatesPayload = {
    unreadCount: number;
    hasUpdates: boolean;
    recentChanges: Array<{
      _id: Id<'treatmentPlanVersions'>;
      changeType: string;
      changeDescription?: string;
      timestamp: number | string;
      treatmentPlanTitle?: string;
      treatmentPlanId: string;
    }>;
  };
  const updates = useQuery(api.treatmentPlanSync.subscribeToTreatmentUpdates) as UpdatesPayload | undefined;
  const markAsRead = useMutation(api.treatmentPlanSync.markTreatmentChangesAsRead);

  const handleMarkAllAsRead = async () => {
    if (!updates?.recentChanges?.length) return;

    try {
      // Group changes by treatment plan
      type ChangeLite = { treatmentPlanId: string; _id: Id<'treatmentPlanVersions'> };
      const changesByPlan = updates.recentChanges.reduce<Record<string, Id<'treatmentPlanVersions'>[]>>((acc: Record<string, Id<'treatmentPlanVersions'>[]>, change: ChangeLite) => {
        const key = change.treatmentPlanId;
        (acc[key] ||= []).push(change._id);
        return acc;
      }, {});

      // Mark each plan's changes as read
      for (const [treatmentPlanId, versionIds] of Object.entries(changesByPlan)) {
        await markAsRead({
          treatmentPlanId: treatmentPlanId as Id<'treatmentPlans'>,
          versionIds,
        });
      }
    } catch (error) {
      console.error("Failed to mark changes as read:", error);
    }
  };

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case "exercise_added":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "exercise_modified":
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case "goal_updated":
        return <Clock className="h-4 w-4 text-blue-500" />;
      case "assessment_added":
        return <CheckCircle className="h-4 w-4 text-purple-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getChangeTypeLabel = (changeType: string) => {
    switch (changeType) {
      case "exercise_added":
        return "Exercise Added";
      case "exercise_modified":
        return "Exercise Updated";
      case "exercise_removed":
        return "Exercise Removed";
      case "goal_updated":
        return "Goal Updated";
      case "assessment_added":
        return "Assessment Added";
      case "status_changed":
        return "Status Changed";
      case "phase_updated":
        return "Phase Updated";
      default:
        return "Plan Updated";
    }
  };

  if (!updates) {
    return (
      <Button variant="ghost" size="sm" disabled className={className}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={`relative ${className}`}>
          <Bell className="h-4 w-4" />
          {updates.hasUpdates && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {updates.unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Treatment Plan Updates</h4>
            {updates.hasUpdates && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleMarkAllAsRead}
                className="text-xs"
              >
                Mark all read
              </Button>
            )}
          </div>

          {!updates.hasUpdates ? (
            <div className="text-center py-6 text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No new updates</p>
            </div>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {updates.recentChanges.map((change: { _id: string; changeType: string; changeDescription?: string; timestamp: number | string; treatmentPlanTitle?: string }, index: number) => (
                  <div key={change._id}>
                    <div className="flex items-start space-x-3">
                      {getChangeIcon(change.changeType)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">
                            {change.treatmentPlanTitle}
                          </p>
                          <Badge variant="secondary" className="text-xs">
                            {getChangeTypeLabel(change.changeType)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {change.changeDescription}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(change.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    {index < updates.recentChanges.length - 1 && (
                      <Separator className="mt-3" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Treatment Plan Update Card for Patient Dashboard
 */
interface TreatmentPlanUpdateCardProps {
  className?: string;
}

export function TreatmentPlanUpdateCard({ className }: TreatmentPlanUpdateCardProps) {
  const planUpdates = useQuery(api.treatmentPlanSync.getPatientTreatmentPlanUpdates);

  // Lightweight type for plan updates list
  type PlanUpdate = {
    _id: string;
    title?: string;
    hasUnreadChanges?: boolean;
    unreadChanges: number;
    latestChange?: { changeType: string; changeDescription?: string; timestamp: number | string };
  };

  if (!planUpdates?.length) {
    return null;
  }

  const plansWithUpdates = planUpdates.filter((plan: { hasUnreadChanges?: boolean }) => !!plan.hasUnreadChanges);

  if (!plansWithUpdates.length) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="h-5 w-5 text-blue-500" />
          Treatment Plan Updates
          <Badge variant="destructive" className="ml-auto">
            {plansWithUpdates.reduce((sum: number, plan: PlanUpdate) => sum + (plan.unreadChanges || 0), 0)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {plansWithUpdates.map((plan: PlanUpdate) => (
          <div key={plan._id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">{plan.title}</h4>
              <Badge variant="outline">
                {plan.unreadChanges} new change{plan.unreadChanges !== 1 ? 's' : ''}
              </Badge>
            </div>
            
            {plan.latestChange && (
              <div className="text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  {getChangeIcon(plan.latestChange.changeType)}
                  <span>{plan.latestChange.changeDescription}</span>
                </div>
                <p className="text-xs mt-1">
                  {formatDistanceToNow(new Date(plan.latestChange.timestamp), { addSuffix: true })}
                </p>
              </div>
            )}
            
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full"
              onClick={() => window.location.href = `/dashboard/patient/treatment-plans/${plan._id}`}
            >
              View Updates
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Real-time sync status indicator
 */
interface SyncStatusIndicatorProps {
  className?: string;
}

export function SyncStatusIndicator({ className }: SyncStatusIndicatorProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [lastSync, setLastSync] = useState<Date>(new Date());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Update sync time every minute
    const interval = setInterval(() => {
      setLastSync(new Date());
    }, 60000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}>
      <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
      <span>
        {isOnline ? 'Synced' : 'Offline'} • {formatDistanceToNow(lastSync, { addSuffix: true })}
      </span>
    </div>
  );
}

function getChangeIcon(changeType: string) {
  switch (changeType) {
    case "exercise_added":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "exercise_modified":
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    case "goal_updated":
      return <Clock className="h-4 w-4 text-blue-500" />;
    case "assessment_added":
      return <CheckCircle className="h-4 w-4 text-purple-500" />;
    default:
      return <Bell className="h-4 w-4 text-gray-500" />;
  }
}
