/**
 * "Patients looking for care": moments when a patient wants a physio and the team can help
 * (careQueue.ts). Each raises one open signal (per booking, or per patient and kind a day) and
 * tells every admin at once by bell and phone push. Signals close themselves when the booking
 * moves on (careQueue.sweep) or when an admin marks them handled.
 */
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { insertNotification } from "./pushNotify";

export type CareSignalKind = "awaiting_physio" | "unpaid_checkout" | "joy_matching" | "browsing" | "no_physio" | "help_choosing";

const DAY = 24 * 60 * 60 * 1000;
export const CARE_QUEUE_PATH = "/dashboard/admin/care-queue";

const TITLES: Record<CareSignalKind, string> = {
  awaiting_physio: "Paid patient waiting for a physio",
  unpaid_checkout: "Patient started booking but hasn't paid",
  joy_matching: "Patient looking for a physio on Joy",
  browsing: "Patient browsing Find a Physio",
  no_physio: "New patient with no physio yet",
  help_choosing: "Patient asked for help choosing a physio",
};

const PRIORITY: Record<CareSignalKind, "urgent" | "high" | "medium" | "low"> = {
  awaiting_physio: "high",
  unpaid_checkout: "medium",
  joy_matching: "medium",
  browsing: "low",
  no_physio: "medium",
  help_choosing: "high",
};

export type CareSignalInput = {
  kind: CareSignalKind;
  patientId?: Id<"users">;
  bookingId?: Id<"marketplaceBookings">;
  physiotherapistId?: Id<"users">;
  guestName?: string;
  guestPhone?: string;
  /** One line: what they're looking for */
  detail: string;
  /** When the physio must answer by (awaiting_physio) */
  dueAt?: number;
  /** "Help me choose a physio" answers (help_choosing) */
  request?: Doc<"careSignals">["request"];
};

async function openSignalFor(ctx: MutationCtx, input: CareSignalInput): Promise<Doc<"careSignals"> | null> {
  if (input.bookingId) {
    return await ctx.db
      .query("careSignals")
      .withIndex("by_booking", (q) => q.eq("bookingId", input.bookingId))
      .filter((q) => q.eq(q.field("status"), "open"))
      .first();
  }
  if (input.patientId) {
    const since = Date.now() - DAY;
    return await ctx.db
      .query("careSignals")
      .withIndex("by_patient_kind", (q) => q.eq("patientId", input.patientId).eq("kind", input.kind))
      .filter((q) => q.gte(q.field("createdAt"), since))
      .first();
  }
  return null;
}

/** Who the alert names: the Rehabify ID, else the guest's name. */
async function whoLabel(ctx: MutationCtx, input: CareSignalInput) {
  const patient = input.patientId ? await ctx.db.get(input.patientId) : null;
  return patient?.patientNumber ?? input.guestName?.trim() ?? "A patient";
}

export async function alertAdmins(ctx: MutationCtx, kind: CareSignalKind, body: string) {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .take(25);
  const now = Date.now();
  for (const admin of admins) {
    await insertNotification(ctx, {
      userId: admin._id,
      type: "care_queue",
      priority: PRIORITY[kind],
      status: "pending",
      payload: { title: TITLES[kind], body, link: CARE_QUEUE_PATH, data: { actionUrl: CARE_QUEUE_PATH } },
      createdAt: now,
    });
  }
}

/** Raise (or refresh) the signal and alert the team the first time, or when the situation changes. */
export async function raiseCareSignal(ctx: MutationCtx, input: CareSignalInput) {
  const now = Date.now();
  const existing = await openSignalFor(ctx, input);
  const who = await whoLabel(ctx, input);
  if (existing) {
    const changed = existing.kind !== input.kind;
    await ctx.db.patch(existing._id, {
      kind: input.kind,
      detail: input.detail.slice(0, 240),
      lastSeenAt: now,
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
      ...(input.physiotherapistId ? { physiotherapistId: input.physiotherapistId } : {}),
      ...(input.request ? { request: input.request } : {}),
    });
    // A checkout that's now paid and waiting on the physio is new news for the team
    if (changed) await alertAdmins(ctx, input.kind, `${who}: ${input.detail}`);
    return existing._id;
  }
  if (input.patientId && !input.bookingId) {
    // Already handled today for this patient and kind: don't alert again
    const since = now - DAY;
    const recent = await ctx.db
      .query("careSignals")
      .withIndex("by_patient_kind", (q) => q.eq("patientId", input.patientId).eq("kind", input.kind))
      .filter((q) => q.gte(q.field("createdAt"), since))
      .first();
    if (recent) return recent._id;
  }
  const id = await ctx.db.insert("careSignals", {
    kind: input.kind,
    status: "open",
    patientId: input.patientId,
    bookingId: input.bookingId,
    physiotherapistId: input.physiotherapistId,
    guestName: input.guestName?.slice(0, 120),
    guestPhone: input.guestPhone?.slice(0, 40),
    detail: input.detail.slice(0, 240),
    dueAt: input.dueAt,
    request: input.request,
    createdAt: now,
    lastSeenAt: now,
  });
  await alertAdmins(ctx, input.kind, `${who}: ${input.detail}`);
  return id;
}

/** Close a signal (automatically when the booking moves on, or by an admin). */
export async function closeCareSignal(ctx: MutationCtx, signal: Doc<"careSignals">, note: string, by?: Id<"users">) {
  if (signal.status !== "open") return;
  await ctx.db.patch(signal._id, { status: "handled", handledAt: Date.now(), handledNote: note.slice(0, 300), ...(by ? { handledBy: by } : {}) });
}
