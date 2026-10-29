/**
 * A referring doctor's view of a referral: six steps from "Received" to "Discharged", or how it
 * ended early (declined, not suitable, unreachable, closed).
 *
 * Shared by the server (doctorPortal.ts, helpers/doctorReferralUpdates.ts) and the doctor's
 * portal (components/partners/doctor). Plain TypeScript: no Convex imports.
 *
 * Mapped from the internal referral statuses (schema inboundReferrals.status), honestly:
 *   received / pending / consent_pending                       → Received
 *   contacted / intake_started / intake_completed / qualified  → Contacted
 *   booked                                                     → Booked
 *   attended                                                   → Seen (first session attended)
 *   treatment_active / in_treatment                            → In treatment
 *   completed / paid_out                                       → Discharged
 *   cancelled / refunded                                       → Declined
 *   not_suitable / redirected_for_safety                       → Not suitable
 *   closed: Discharged if treatment finished, Unreachable if we never reached the patient,
 *           otherwise Closed
 */

export const DOCTOR_STEPS = [
  { key: "received", label: "Received" },
  { key: "contacted", label: "Contacted" },
  { key: "booked", label: "Booked" },
  { key: "seen", label: "Seen" },
  { key: "in_treatment", label: "In treatment" },
  { key: "discharged", label: "Discharged" },
] as const;

export type DoctorStep = (typeof DOCTOR_STEPS)[number]["key"];
export type DoctorOutcome = "declined" | "not_suitable" | "unreachable" | "closed";
export type DoctorStage = DoctorStep | DoctorOutcome;

export const DOCTOR_OUTCOMES: Record<DoctorOutcome, { label: string; detail: string }> = {
  declined: { label: "Declined", detail: "The patient didn't go ahead with physiotherapy, or cancelled." },
  not_suitable: { label: "Not suitable", detail: "Our clinical team pointed them to more suitable care." },
  unreachable: { label: "Unreachable", detail: "We couldn't reach them, so the referral was closed." },
  closed: { label: "Closed", detail: "No further care is planned through Rehabify." },
};

/** One line on what is happening now, for the doctor. */
export const DOCTOR_STEP_NOW: Record<DoctorStep, string> = {
  received: "We'll contact them on WhatsApp shortly.",
  contacted: "We're helping them book their first session.",
  booked: "Their first session is booked.",
  seen: "They've had their first session.",
  in_treatment: "They're in treatment.",
  discharged: "They've finished treatment.",
};

export function isDoctorOutcome(stage: DoctorStage): stage is DoctorOutcome {
  return stage === "declined" || stage === "not_suitable" || stage === "unreachable" || stage === "closed";
}

export function doctorStageLabel(stage: DoctorStage): string {
  if (isDoctorOutcome(stage)) return DOCTOR_OUTCOMES[stage].label;
  return DOCTOR_STEPS.find((s) => s.key === stage)?.label ?? "Received";
}

type Milestones = {
  contactedAt?: number | null;
  bookedAt?: number | null;
  treatmentStartedAt?: number | null;
  completedAt?: number | null;
};

export function doctorStageOf(status: string, milestones: Milestones): DoctorStage {
  switch (status) {
    case "contacted":
    case "intake_started":
    case "intake_completed":
    case "qualified":
      return "contacted";
    case "booked":
      return "booked";
    case "attended":
      return "seen";
    case "treatment_active":
    case "in_treatment":
      return "in_treatment";
    case "completed":
    case "paid_out":
      return "discharged";
    case "cancelled":
    case "refunded":
      return "declined";
    case "not_suitable":
    case "redirected_for_safety":
      return "not_suitable";
    case "closed":
      if (milestones.completedAt) return "discharged";
      return milestones.contactedAt ? "closed" : "unreachable";
    default:
      return "received";
  }
}

/** Position on the six steps (0-5). For an early ending, the furthest step it reached. */
export function doctorStepIndex(stage: DoctorStage, milestones: Milestones): number {
  if (!isDoctorOutcome(stage)) return DOCTOR_STEPS.findIndex((s) => s.key === stage);
  if (milestones.completedAt) return 5;
  if (milestones.treatmentStartedAt) return 3;
  if (milestones.bookedAt) return 2;
  if (milestones.contactedAt) return 1;
  return 0;
}

/** Still in progress (not discharged and not ended early). */
export function isDoctorStageOpen(stage: DoctorStage): boolean {
  return !isDoctorOutcome(stage) && stage !== "discharged";
}

export type DoctorUrgency = "routine" | "soon" | "urgent";

export const DOCTOR_URGENCY_LABELS: Record<DoctorUrgency, string> = {
  routine: "Routine",
  soon: "Soon",
  urgent: "Urgent",
};

/** Stored priority ("standard" | "high" | "urgent") as the doctor chose it. */
export function doctorUrgencyOf(priority: string | null | undefined): DoctorUrgency {
  if (priority === "urgent") return "urgent";
  if (priority === "high") return "soon";
  return "routine";
}

export type DoctorCareSetting = "clinic" | "home" | "online";

export const DOCTOR_CARE_SETTING_LABELS: Record<DoctorCareSetting, string> = {
  clinic: "Clinic near them",
  home: "Home visit",
  online: "Online",
};

/** "Ada O." — enough for the doctor to recognise the patient on a phone notification. */
export function shortPatientName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const first = (firstName ?? "").trim();
  const initial = (lastName ?? "").trim().charAt(0);
  if (!first) return "Your patient";
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

/** In-app update for each step the referral reaches. `{patient}` is the short name. */
export const DOCTOR_STAGE_UPDATES: Partial<Record<DoctorStage, { title: string; body: string }>> = {
  contacted: { title: "We've reached {patient}", body: "Our care team is helping them book their first session." },
  booked: { title: "{patient} is booked", body: "Their first physiotherapy session is booked." },
  seen: { title: "{patient} had their first session", body: "They've been seen by their physiotherapist." },
  in_treatment: { title: "{patient} is in treatment", body: "Their course of physiotherapy is under way." },
  discharged: { title: "{patient} finished treatment", body: "They've been discharged. Open the referral to see how it went." },
  declined: { title: "Update on {patient}", body: "They didn't go ahead with physiotherapy. You can refer them again at any time." },
  not_suitable: { title: "Update on {patient}", body: "Our clinical team pointed them to more suitable care." },
  unreachable: { title: "We couldn't reach {patient}", body: "We closed the referral. Check their number and refer them again if needed." },
  closed: { title: "Referral closed: {patient}", body: "No further care is planned through Rehabify." },
};
