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

// Send appointment reminders for next day (UTC) daily at 09:00
crons.daily(
  "send-appointment-reminders",
  { hourUTC: 9, minuteUTC: 0 },
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

// Send daily exercise reminders to patients at 7:00 UTC (8:00 AM WAT)
crons.daily(
  "send-daily-exercise-reminders",
  { hourUTC: 7, minuteUTC: 0 },
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

// Send appointment reminders every 2 hours during business hours
crons.interval(
  "send-appointment-reminders-interval",
  { hours: 2 },
  internal.reminderSystem.sendAppointmentReminders,
  {}
);

export default crons;