import { Id } from "../convex/_generated/dataModel";

export interface SecurityEvent {
  _id: Id<"analytics_events">;
  type: string;
  severity: string;
  message: string;
  timestamp: number;
  userId?: string;
  details?: any;
} 