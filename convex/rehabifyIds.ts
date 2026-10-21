/**
 * Backfill and safety net for permanent Rehabify IDs (helpers/rehabifyIds.ts).
 *
 * assignMissing numbers every patient, clinician and clinic that has no ID yet, oldest first,
 * so existing accounts get numbers in sign-up order. It self-continues page by page and also
 * runs on a cron to catch any creation path that forgets to call ensureUserNumbers.
 *
 *   npx convex run rehabifyIds:assignMissing --prod      (one-off backfill after deploy)
 *   npx convex run rehabifyIds:auditDuplicates --prod    (should report no duplicates)
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { ensureClinicNumber, ensureUserNumbers, skipsRehabifyId } from "./helpers/rehabifyIds";
import { STAFF_ROLES } from "./helpers/rehabifyIdFormat";

const PHASES = ["patient", ...STAFF_ROLES, "clinic"] as const;
type Phase = (typeof PHASES)[number];
const PAGE_SIZE = 200;

export const assignMissing = internalMutation({
  args: {
    phase: v.optional(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const phase = (PHASES.includes(args.phase as Phase) ? args.phase : PHASES[0]) as Phase;
    const cursor = args.cursor ?? null;
    let assigned = 0;
    let isDone: boolean;
    let continueCursor: string;

    if (phase === "clinic") {
      const page = await ctx.db
        .query("clinics")
        .withIndex("by_clinic_number", (q) => q.eq("clinicNumber", undefined))
        .paginate({ numItems: PAGE_SIZE, cursor });
      for (const clinic of page.page) {
        await ensureClinicNumber(ctx, clinic._id);
        assigned++;
      }
      ({ isDone, continueCursor } = page);
    } else {
      const page =
        phase === "patient"
          ? await ctx.db
              .query("users")
              .withIndex("by_role_and_patient_number", (q) => q.eq("role", "patient").eq("patientNumber", undefined))
              .paginate({ numItems: PAGE_SIZE, cursor })
          : await ctx.db
              .query("users")
              .withIndex("by_role_and_staff_number", (q) => q.eq("role", phase).eq("staffNumber", undefined))
              .paginate({ numItems: PAGE_SIZE, cursor });
      for (const user of page.page) {
        if (skipsRehabifyId(user.clerkId)) continue;
        if (user.clerkId.startsWith("guest-") && !(await guestStillHasBookings(ctx, user))) continue;
        await ensureUserNumbers(ctx, user._id);
        assigned++;
      }
      ({ isDone, continueCursor } = page);
    }

    const nextPhase = PHASES[PHASES.indexOf(phase) + 1];
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.rehabifyIds.assignMissing, { phase, cursor: continueCursor });
    } else if (nextPhase) {
      await ctx.scheduler.runAfter(0, internal.rehabifyIds.assignMissing, { phase: nextPhase, cursor: null });
    }
    return { phase, assigned, phaseDone: isDone };
  },
});

/** A guest row whose bookings were all moved to a real account is an orphan and gets no number. */
async function guestStillHasBookings(ctx: MutationCtx, user: Doc<"users">): Promise<boolean> {
  const booking = await ctx.db
    .query("marketplaceBookings")
    .withIndex("by_patient", (q) => q.eq("patientId", user._id))
    .first();
  return booking !== null;
}

/** Verification: lists any Rehabify ID held by more than one record, plus the counters. */
export const auditDuplicates = internalQuery({
  args: {},
  handler: async (ctx) => {
    const seen = new Map<string, number>();
    const count = (id: string | undefined) => {
      if (id) seen.set(id, (seen.get(id) ?? 0) + 1);
    };
    for await (const user of ctx.db.query("users")) {
      count(user.patientNumber);
      count(user.staffNumber);
    }
    for await (const clinic of ctx.db.query("clinics")) count(clinic.clinicNumber);
    const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }));
    const counters = await ctx.db.query("idCounters").collect();
    return {
      duplicates,
      assigned: seen.size,
      counters: counters.map((c) => ({ kind: c.kind, next: c.next })),
    };
  },
});
