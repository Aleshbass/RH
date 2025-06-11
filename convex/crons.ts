import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Process notification retry queue every 5 minutes
crons.interval(
  "process-notification-retries",
  { minutes: 5 },
  api.scheduled.notification_retry.triggerRetryProcessing,
  {}
);

export default crons;