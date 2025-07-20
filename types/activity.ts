import { Id } from "../convex/_generated/dataModel";

export interface ActivityLog {
  _id: Id<"analytics_events">;
  userId?: Id<"users">;
  activity: string;
  userName: string;
  userEmail?: string;
  userRole: string;
  timestamp: number;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
} 