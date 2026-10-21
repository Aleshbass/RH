/**
 * Hands out permanent Rehabify IDs (format rules in ./rehabifyIdFormat).
 *
 * Call ensureUserNumbers after any user insert or role change, and ensureClinicNumber after a
 * clinic insert. Both are idempotent. A cron (rehabifyIds.assignMissing) catches any path that
 * forgets. Each Convex mutation is one transaction, so two sign-ups can never share a number.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ID_START, formatRehabifyId, isStaffRole, type RehabifyIdKind } from "./rehabifyIdFormat";

/** Exact lookup for a parsed RH-P or RH-C ID (see parseRehabifyId). Clinic IDs return null. */
export async function findUserByRehabifyId(
  ctx: QueryCtx,
  id: { kind: RehabifyIdKind; value: string }
): Promise<Doc<"users"> | null> {
  if (id.kind === "patient") {
    return await ctx.db
      .query("users")
      .withIndex("by_patient_number", (q) => q.eq("patientNumber", id.value))
      .first();
  }
  if (id.kind === "staff") {
    return await ctx.db
      .query("users")
      .withIndex("by_staff_number", (q) => q.eq("staffNumber", id.value))
      .first();
  }
  return null;
}

/** Placeholder rows that never get a number (claimed guest rows are handled in claimGuestBookings). */
export function skipsRehabifyId(clerkId: string): boolean {
  return clerkId.startsWith("test-clerk-");
}

export async function allocateRehabifyId(ctx: MutationCtx, kind: RehabifyIdKind): Promise<string> {
  const counter = await ctx.db
    .query("idCounters")
    .withIndex("by_kind", (q) => q.eq("kind", kind))
    .unique();
  const n = counter?.next ?? ID_START;
  if (counter) {
    await ctx.db.patch(counter._id, { next: n + 1 });
  } else {
    await ctx.db.insert("idCounters", { kind, next: n + 1 });
  }
  return formatRehabifyId(kind, n);
}

/**
 * Gives the user an RH-P number if they're a patient and an RH-C number if they're clinical staff.
 * Returns the user's numbers after the change.
 */
export async function ensureUserNumbers(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<{ patientNumber?: string; staffNumber?: string }> {
  const user = await ctx.db.get(userId);
  if (!user) return {};
  const numbers = { patientNumber: user.patientNumber, staffNumber: user.staffNumber };
  if (skipsRehabifyId(user.clerkId)) return numbers;
  const patch: { patientNumber?: string; staffNumber?: string } = {};
  if (user.role === "patient" && !user.patientNumber) {
    patch.patientNumber = await allocateRehabifyId(ctx, "patient");
  }
  if (isStaffRole(user.role) && !user.staffNumber) {
    patch.staffNumber = await allocateRehabifyId(ctx, "staff");
  }
  if (patch.patientNumber || patch.staffNumber) await ctx.db.patch(userId, patch);
  return { ...numbers, ...patch };
}

/**
 * A guest who books and later signs up keeps the number from their guest bookings instead of
 * getting a second one. Guest rows give up their number either way (the cron skips them after).
 */
export async function adoptGuestPatientNumber(
  ctx: MutationCtx,
  userId: Id<"users">,
  guestUserIds: Id<"users">[]
): Promise<void> {
  let adopted = !!(await ctx.db.get(userId))?.patientNumber;
  for (const guestId of new Set(guestUserIds)) {
    if (guestId === userId) continue;
    const guest = await ctx.db.get(guestId);
    if (!guest?.patientNumber || !guest.clerkId.startsWith("guest-")) continue;
    await ctx.db.patch(guestId, { patientNumber: undefined });
    if (!adopted) {
      await ctx.db.patch(userId, { patientNumber: guest.patientNumber });
      adopted = true;
    }
  }
  await ensureUserNumbers(ctx, userId);
}

export async function ensureClinicNumber(ctx: MutationCtx, clinicId: Id<"clinics">): Promise<void> {
  const clinic = await ctx.db.get(clinicId);
  if (!clinic || clinic.clinicNumber) return;
  await ctx.db.patch(clinicId, { clinicNumber: await allocateRehabifyId(ctx, "clinic") });
}
