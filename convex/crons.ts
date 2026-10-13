import { cronJobs } from "convex/server";
import { triggerRetryProcessing } from "./helpers/triggerRetryProcessing";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Process notification retries every 5 minutes
crons.interval(
  "process-notification-retries",
  { minutes: 5 },
  triggerRetryProcessing,
  {}
);

// Check for upcoming maintenance every day at 9 AM
crons.daily(
  "check-upcoming-maintenance",
  { hourUTC: 9, minuteUTC: 0 },
  internal.resourceNotifications.checkAllClinicsMaintenanceDaily,
  {}
);

// Check for resource conflicts every hour during business hours (8 AM - 6 PM UTC)
crons.hourly(
  "check-resource-conflicts",
  { minuteUTC: 0 },
  internal.resourceNotifications.checkAllClinicsConflictsHourly,
  {}
);

// Send maintenance reminders every 4 hours
crons.interval(
  "send-maintenance-reminders",
  { hours: 4 },
  internal.resourceNotifications.sendMaintenanceReminders,
  {}
);

// Cleanup old completed tasks weekly on Sunday at 2 AM
crons.weekly(
  "cleanup-old-tasks",
  { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
  internal.resourceNotifications.cleanupOldNotifications,
  {}
);

// Send appointment reminders for next day daily at 08:00 UTC (9:00 AM WAT for Nigeria)
crons.daily(
  "send-appointment-reminders",
  { hourUTC: 8, minuteUTC: 0 },
  internal.scheduled.appointment_reminders.sendDailyAppointmentReminders,
  {}
);

// Send pending patient invitation reminders daily at 10:00 UTC
crons.daily(
  "send-patient-invitation-reminders",
  { hourUTC: 10, minuteUTC: 0 },
  internal.scheduled.invitation_reminders.sendPendingInvitationReminders,
  {}
);

// Send daily exercise reminders to patients at 6:00 UTC (7:00 AM WAT)
crons.daily(
  "send-daily-exercise-reminders",
  { hourUTC: 6, minuteUTC: 0 },
  internal.reminders.sendDailyExerciseReminders,
  {}
);

// Send invoice payment reminders daily at 9:00 UTC (10:00 AM WAT)
crons.daily(
  "send-invoice-payment-reminders",
  { hourUTC: 9, minuteUTC: 0 },
  internal.reminderSystem.sendInvoicePaymentReminders,
  {}
);

// Send appointment reminders every hour (more frequent for better coverage)
crons.interval(
  "send-appointment-reminders-interval",
  { hours: 1 },
  internal.reminderSystem.sendAppointmentReminders,
  {}
);

crons.interval("expire-joy-provider-responses", { minutes: 5 }, internal.joyIntegration.dispatchExpiredJoyProviderResponses, {});
crons.interval("retry-joy-event-outbox", { minutes: 1 }, internal.joyIntegration.retryJoyEvents, {});

// Partner webhooks: safety net for deliveries whose scheduled retry was lost.
crons.interval(
  "partner-webhook-delivery-sweeper",
  { minutes: 5 },
  internal.partnerWebhooks.sweepDeliveries,
  {}
);

// Partner API: drop expired idempotency keys and gateway replay nonces.
crons.interval(
  "partner-api-cleanup",
  { hours: 1 },
  internal.partnerApi.cleanupExpired,
  {}
);

export default crons;
