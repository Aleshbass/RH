import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { ActivityLog } from "../types/activity";

export interface UserActivityLogsResult {
  data: ActivityLog[];
}

export function useUserActivityLogs(limit: number = 50): UserActivityLogsResult {
  const result = useQuery(api.analytics.service.getUserActivityLogs, { limit });
  
  if (!result) {
    return { data: [] };
  }

  return {
    data: result as ActivityLog[],
  };
} 