import { cronJobs } from "convex/server";
import { triggerRetryProcessing } from "./helpers/triggerRetryProcessing";

const crons = cronJobs();

crons.interval(
  "process-notification-retries",
  { minutes: 5 },
  triggerRetryProcessing,
  {}
);

export default crons;