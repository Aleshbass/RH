/**
 * Where a payout is in its lifecycle (Payout Policy). One function, used by every payout query,
 * the Friday run and the note nudges, so the physio, the admin and the run always agree.
 *
 *   session done → physio writes the note (due 24 h after marking it complete) → Pending
 *   → 48 h later Available (unless a patient raised a concern or an admin held it: On hold)
 *   → in the Friday run → Paying (Paystack transfer sent) → Paid, or Failed.
 *
 * Late cancellations and no-shows have no note: they're Pending from when they were created.
 * Rows without an appointment (older rows, a physio's own invoices, MediLoan) skip the note.
 * Nothing here deducts anything: the payout is always the amount on the row.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const HOUR = 60 * 60 * 1000;
export const NOTE_DUE_MS = 24 * HOUR;
export const PENDING_MS = 48 * HOUR;
/** A patient can raise a concern about a session for 7 days after it (Payment Policy 4.6). */
export const CONCERN_WINDOW_MS = 7 * 24 * HOUR;
/** A note written up to 2 hours before the session's start counts (written during the visit). */
const NOTE_EARLY_MS = 2 * HOUR;

export type PayoutStage = "awaiting_note" | "pending" | "available" | "on_hold" | "paying" | "paid" | "failed";

export type PayoutContext = {
  /** When the first session note was written, or null. */
  noteAt: number | null;
  /** The patient's open concern about this session, if any. */
  concern: Doc<"sessionConcerns"> | null;
};

export type PayoutStageInfo = {
  stage: PayoutStage;
  /** Whether this payout waits for a session note at all. */
  needsNote: boolean;
  noteDueAt: number | null;
  noteOverdue: boolean;
  pendingSince: number | null;
  availableAt: number | null;
  heldReason: string | null;
};

export const PATIENT_CONCERN_REASON =
  "The patient raised a concern about this session. We'll look into it and release the payout or contact you.";

/** Session payouts tied to an appointment wait for the note; cancellations and no-shows don't. */
export function payoutNeedsNote(payout: Pick<Doc<"payouts">, "reason" | "appointmentId">) {
  return (payout.reason ?? "session") === "session" && Boolean(payout.appointmentId);
}

export function payoutStage(payout: Doc<"payouts">, context: PayoutContext, now: number): PayoutStageInfo {
  const needsNote = payoutNeedsNote(payout);
  const noteDueAt = needsNote ? payout.createdAt + NOTE_DUE_MS : null;
  // A note written before the session was marked complete starts the clock at completion
  const pendingSince = needsNote ? (context.noteAt === null ? null : Math.max(payout.createdAt, context.noteAt)) : payout.createdAt;
  const availableAt = pendingSince === null ? null : pendingSince + PENDING_MS;
  const base = {
    needsNote,
    noteDueAt,
    noteOverdue: needsNote && context.noteAt === null && noteDueAt !== null && now > noteDueAt,
    pendingSince,
    availableAt,
    heldReason: null as string | null,
  };

  if (payout.status === "completed") return { ...base, stage: "paid" };
  if (payout.status === "processing") return { ...base, stage: "paying" };
  if (payout.status === "failed") return { ...base, stage: "failed" };

  if (payout.heldAt !== undefined || context.concern) {
    return { ...base, stage: "on_hold", heldReason: payout.heldReason ?? PATIENT_CONCERN_REASON };
  }
  if (availableAt === null) return { ...base, stage: "awaiting_note" };
  return { ...base, stage: now >= availableAt ? "available" : "pending" };
}

/** The appointment a payout is for, when the row names one. */
export async function payoutAppointment(ctx: QueryCtx | MutationCtx, payout: Doc<"payouts">) {
  return payout.appointmentId ? await ctx.db.get(payout.appointmentId) : null;
}

/**
 * The first note for the session: one attached to the appointment, or one the physio wrote for
 * this patient from the session onwards (notes written in the patient workspace aren't attached
 * to the visit).
 */
export async function firstSessionNoteAt(
  ctx: QueryCtx | MutationCtx,
  appointment: Pick<Doc<"appointments">, "_id" | "patientId" | "physiotherapistId" | "startTime">
): Promise<number | null> {
  const linked = await ctx.db
    .query("sessionLogs")
    .withIndex("by_appointment_id", (q) => q.eq("appointmentId", appointment._id))
    .take(10);
  const byPhysio = (log: Doc<"sessionLogs">) => !appointment.physiotherapistId || log.physiotherapistId === appointment.physiotherapistId;
  const isOutreach = (log: Doc<"sessionLogs">) => log.noteType === "follow_up_outreach";
  const times = linked.filter((log) => byPhysio(log) && !isOutreach(log)).map((log) => log._creationTime);
  if (times.length === 0) {
    const later = await ctx.db
      .query("sessionLogs")
      .withIndex("by_patient_id_and_date", (q) =>
        q.eq("patientId", appointment.patientId).gte("sessionDate", appointment.startTime - NOTE_EARLY_MS)
      )
      .take(20);
    for (const log of later) {
      if (byPhysio(log) && !isOutreach(log)) times.push(log._creationTime);
    }
  }
  return times.length ? Math.min(...times) : null;
}

/** The patient's open concern about a session, if any. */
export async function openConcernFor(ctx: QueryCtx | MutationCtx, appointmentId: Id<"appointments"> | undefined) {
  if (!appointmentId) return null;
  const rows = await ctx.db
    .query("sessionConcerns")
    .withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId))
    .take(10);
  return rows.find((row) => row.status === "open") ?? null;
}

/** Everything payoutStage needs, read once. Only pending rows need the note and concern. */
export async function loadPayoutContext(ctx: QueryCtx | MutationCtx, payout: Doc<"payouts">): Promise<PayoutContext> {
  if (payout.status !== "pending") return { noteAt: null, concern: null };
  const concern = await openConcernFor(ctx, payout.appointmentId);
  let noteAt: number | null = null;
  if (payoutNeedsNote(payout)) {
    const appointment = await payoutAppointment(ctx, payout);
    if (appointment) noteAt = await firstSessionNoteAt(ctx, appointment);
  }
  return { noteAt, concern };
}

export async function stageOf(ctx: QueryCtx | MutationCtx, payout: Doc<"payouts">, now: number) {
  const context = await loadPayoutContext(ctx, payout);
  return { ...payoutStage(payout, context, now), concern: context.concern };
}

// ─── Fridays (Lagos time, UTC+1, no daylight saving) ──────────────────────────

const LAGOS_OFFSET = HOUR;
const DAY = 24 * HOUR;

/** "YYYY-MM-DD" of the Lagos calendar day. */
export function lagosDayKey(utcMs: number) {
  return new Date(utcMs + LAGOS_OFFSET).toISOString().slice(0, 10);
}

/** The Friday on or after today (Lagos), as "YYYY-MM-DD". */
export function fridayOnOrAfter(now: number) {
  const day = new Date(now + LAGOS_OFFSET).getUTCDay(); // 0 Sun … 5 Fri
  return lagosDayKey(now + ((5 - day + 7) % 7) * DAY);
}

/** Noon on a "YYYY-MM-DD" Lagos day, as a timestamp (safe for formatting the date). */
export function lagosDayToMs(key: string) {
  return Date.parse(`${key}T12:00:00Z`) - LAGOS_OFFSET;
}

/** The Friday a newly Available payout will be paid: today's run before 07:00 on a Friday, else next Friday. */
export function nextRunFriday(now: number) {
  const friday = fridayOnOrAfter(now);
  const lagosHour = new Date(now + LAGOS_OFFSET).getUTCHours();
  if (friday === lagosDayKey(now) && lagosHour >= 7) return lagosDayKey(now + 7 * DAY);
  return friday;
}
