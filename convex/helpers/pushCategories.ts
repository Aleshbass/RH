/**
 * Which phone notifications people can switch off, and which notification types fall under each.
 * Shared by the server (helpers/pushNotify.ts) and the settings screen
 * (components/pwa/NotificationSettings.tsx). Plain TypeScript: no Convex imports.
 */

export const PUSH_CATEGORIES = [
  {
    id: "patients",
    label: "New patients and bookings",
    description: "New bookings to accept, patients assigned to you, changes to visits, feedback and pain alerts.",
  },
  { id: "messages", label: "Messages", description: "Chat messages from patients, colleagues and Rehabify." },
  { id: "payments", label: "Payments", description: "Invoices paid, refunds, payment reminders and payouts." },
  {
    id: "account",
    label: "Account and compliance",
    description: "Approval, licence expiry, agreements to sign and news from Rehabify.",
  },
  { id: "reminders", label: "Reminders", description: "Sessions about to start and other reminders." },
  {
    id: "community",
    label: "Community",
    description: "Case of the Week, answers to your questions, and when your answer is marked helpful.",
  },
  {
    id: "celebrations",
    label: "Birthdays and milestones",
    description: "Patients' birthdays, care anniversaries and check-ins due, and wishes from your care team.",
  },
] as const;

export type PushCategory = (typeof PUSH_CATEGORIES)[number]["id"];

export const PUSH_CATEGORY_IDS: PushCategory[] = PUSH_CATEGORIES.map((c) => c.id);

/** Notification types that stay in the bell only: things the person just did themselves. */
const BELL_ONLY = new Set([
  "invoice_sent",
  "invitation_created",
  "onboarding_complete",
  "notification_created",
  // Points earned: shown in the bell and on Me, never a phone buzz
  "reward_points",
]);

const CATEGORY_OF: Record<string, PushCategory> = {
  // New patients and bookings
  appointment_scheduled: "patients",
  appointment_confirmed: "patients",
  appointment_cancelled: "patients",
  appointment_rescheduled: "patients",
  appointment_time_proposed: "patients",
  appointment_time_declined: "patients",
  appointment_feedback: "patients",
  booking_accept_expiring: "patients",
  patient_waiting_in_call: "patients",
  patient_onboarded: "patients",
  patient_inactive: "patients",
  invitation_accepted: "patients",
  referral_assigned: "patients",
  // A referring doctor's patient moved on (contacted, booked, seen...) or a report was shared
  referral_update: "patients",
  exercise_pain_flag: "patients",
  exercise_completed: "patients",
  treatment_plan_accepted: "patients",
  video_call_scheduled: "patients",
  questionnaire_completed: "patients",
  outcome_alert: "patients",
  outcome_feedback: "patients",
  // Messages
  message_received: "messages",
  // Payments
  invoice_created: "payments",
  payment_received: "payments",
  payment_confirmed: "payments",
  payment_reminder: "payments",
  invoice_payment_reminder: "payments",
  payout_completed: "payments",
  payout_failed: "payments",
  refund_issued: "payments",
  // Reminders
  appointment_reminder: "reminders",
  session_starting: "reminders",
  daily_reminder: "reminders",
  exercise_program: "reminders",
  patient_plan: "reminders",
  session_completed: "reminders",
  questionnaire_requested: "reminders",
  questionnaire_reminder: "reminders",
  outcome_check: "reminders",
  // Community
  community_case: "community",
  community_answer: "community",
  community_helpful: "community",
  // Birthdays and milestones (careMoments.ts)
  care_moment: "celebrations",
  care_moment_digest: "celebrations",
};

/**
 * The category a notification type belongs to, or null for bell-only types.
 * Anything not listed (approvals, licence, agreements, announcements...) is "account".
 */
export function pushCategoryFor(type: string): PushCategory | null {
  if (BELL_ONLY.has(type)) return null;
  if (CATEGORY_OF[type]) return CATEGORY_OF[type];
  if (type.startsWith("treatment_plan_")) return "reminders";
  return "account";
}

/** Sent even during quiet hours: missing these costs a patient or a session. */
export const URGENT_PUSH_TYPES = new Set([
  "booking_accept_expiring",
  "patient_waiting_in_call",
  "session_starting",
  "exercise_pain_flag",
]);

export type QuietHours = { start: string; end: string };

export const DEFAULT_QUIET_HOURS: QuietHours = { start: "22:00", end: "07:00" };

/** True if "HH:MM" `now` falls inside quiet hours (which may run past midnight). */
export function inQuietHours(now: string, quiet: QuietHours): boolean {
  if (quiet.start === quiet.end) return false;
  return quiet.start < quiet.end ? now >= quiet.start && now < quiet.end : now >= quiet.start || now < quiet.end;
}
