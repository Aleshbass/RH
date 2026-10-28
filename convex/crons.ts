import { cronJobs } from "convex/server";
import { triggerRetryProcessing } from "./helpers/triggerRetryProcessing";
import * as generatedApi from "./_generated/api";

// The generated api types are already `any` (a circular reference in _generated/api.d.ts);
// typing it here keeps the app-wide tsc under TypeScript's instantiation depth limit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal: any = (generatedApi as any).internal;

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

// Ask patients how they are doing ~2 weeks after a physio completes their care, 09:30 WAT
crons.daily(
  "send-care-follow-ups",
  { hourUTC: 8, minuteUTC: 30 },
  internal.physioCare.sendDueFollowUps,
  {}
);

crons.interval("expire-joy-provider-responses", { minutes: 5 }, internal.joyIntegration.dispatchExpiredJoyProviderResponses, {});
// Website requests the physio didn't answer in time go back to the patient (Booking Policy 5.4)
crons.interval("expire-booking-requests", { minutes: 5 }, internal.rehabifyFollowUps.expireBookingRequests, {});

// Phone alerts (pushAlerts.ts): online sessions starting in 10 minutes; licences expiring or
// expired, and patients who stopped exercising, checked each morning (08:05 / 08:15 WAT)
crons.interval("push-session-starting", { minutes: 5 }, internal.pushAlerts.sessionStartingSoon, {});
crons.daily("push-licence-expiry", { hourUTC: 7, minuteUTC: 5 }, internal.pushAlerts.checkLicenceExpiry, {});
crons.daily("push-exercise-inactivity", { hourUTC: 7, minuteUTC: 15 }, internal.pushAlerts.checkExerciseInactivity, {});
crons.interval("retry-joy-event-outbox", { minutes: 1 }, internal.joyIntegration.retryJoyEvents, {});

// Partner webhooks: safety net for deliveries whose scheduled retry was lost.
crons.interval(
  "partner-webhook-delivery-sweeper",
  { minutes: 5 },
  internal.partnerWebhooks.sweepDeliveries,
  {}
);

// Rehabify IDs: number any patient, clinician or clinic a creation path missed.
crons.interval(
  "assign-missing-rehabify-ids",
  { minutes: 30 },
  internal.rehabifyIds.assignMissing,
  {}
);

// Paystack safety net: settle checkouts that were paid but whose webhook never arrived.
crons.interval(
  "reconcile-paystack-payments",
  { minutes: 10 },
  internal.paymentReconciliation.reconcilePaystackPayments,
  {}
);

// Marketplace: close web bookings left unpaid for a day (their slot holds have lapsed).
crons.interval(
  "expire-unpaid-marketplace-bookings",
  { hours: 1 },
  internal.marketplace.booking.expireUnpaidBookings,
  {}
);

// Partner API: drop expired idempotency keys and gateway replay nonces.
crons.interval(
  "partner-api-cleanup",
  { hours: 1 },
  internal.partnerApi.cleanupExpired,
  {}
);

// Rehabify Learn: email physios the day before and an hour before each live session.
crons.interval(
  "learn-session-reminders",
  { minutes: 10 },
  internal.learn.sendSessionReminders,
  {}
);

// Clinic subscriptions: roll billing periods and issue invoices, send allowance warnings,
// reminders and notices, and move unpaid clinics to past due and read-only. 08:00 WAT.
crons.daily(
  "clinic-subscriptions-daily",
  { hourUTC: 7, minuteUTC: 0 },
  internal.clinicBilling.runDailyClinicSubscriptions,
  {}
);

// Flex / Flex Max: end finished 30-day periods, email a renew link ~3 days before the end (no
// automatic renewal), and start periods that were waiting for the programme.
crons.interval(
  "patient-plan-sweep",
  { hours: 1 },
  internal.exercisePrograms.sweepPatientPlans,
  {}
);

// Physio payouts (Payout Policy): every Friday at 07:00 WAT prepare the week's run of Available
// payouts for an admin to review and Pay all (nothing is sent automatically), and remind a physio
// once when a session note is more than 24 hours late.
crons.weekly(
  "prepare-weekly-payout-run",
  { dayOfWeek: "friday", hourUTC: 6, minuteUTC: 0 },
  internal.payouts.prepareWeeklyPayoutRun,
  {}
);
crons.interval(
  "payout-note-nudges",
  { hours: 1 },
  internal.payouts.sendPayoutNoteNudges,
  {}
);

export default crons;
