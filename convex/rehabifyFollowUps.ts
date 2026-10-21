/**
 * Follow-ups for Rehabify patients are paid sessions.
 *
 * A patient who came to a physio through Rehabify (website, Joy or the physio's Rehabify
 * booking link) pays the standard Rehabify price for each session, so a follow-up the physio
 * schedules becomes a "scheduled: pay to confirm" booking rather than a free appointment.
 * It holds the slot for a day, and the patient pays from their dashboard (OpenBookingsCard).
 * Patients of a clinic, or a physio's own private patients, are unaffected.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthenticatedUser } from "./auth";
import { insertServiceBooking } from "./marketplace/booking";
import { PHYSIO_SCHEDULED_HOLD_MS } from "./helpers/slotHolds";
import { hasPriorAssessment } from "./helpers/rehabifyPricing";
import { getService, isBookableServiceId } from "../lib/rehabify-services";
import { lagosDateTime } from "./helpers/lagosTime";

const REHABIFY_SOURCES = new Set(["marketplace", "joy_whatsapp", "booking_link"]);

/** Whether sessions between this patient and physio are Rehabify-priced (pay to confirm). */
export async function isRehabifyCare(
  ctx: QueryCtx,
  patientId: Id<"users">,
  physiotherapistId: Id<"users">
): Promise<boolean> {
  const physio = await ctx.db.get(physiotherapistId);
  const profile = physio?.physiotherapistProfileId ? await ctx.db.get(physio.physiotherapistProfileId) : null;
  if (!profile || profile.clinicId) return false;
  const relationship = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", patientId).eq("physiotherapistId", physiotherapistId))
    .first();
  return Boolean(relationship && REHABIFY_SOURCES.has(relationship.source ?? ""));
}

/** For the scheduling screens: whether a new session must be booked and paid through Rehabify. */
export const getCareBillingMode = query({
  args: { patientId: v.optional(v.id("users")), physiotherapistId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject)).unique();
    if (!user) return null;
    const pair =
      user.role === "physiotherapist" && args.patientId
        ? { patientId: args.patientId, physiotherapistId: user._id }
        : user.role === "patient" && args.physiotherapistId
          ? { patientId: user._id, physiotherapistId: args.physiotherapistId }
          : null;
    if (!pair) return null;
    const rehabify = await isRehabifyCare(ctx, pair.patientId, pair.physiotherapistId);
    return {
      mode: rehabify ? ("rehabify" as const) : ("own" as const),
      // Treatment sessions follow an assessment; until then only consultations/assessments can be booked
      assessed: rehabify ? await hasPriorAssessment(ctx, pair.patientId) : true,
    };
  },
});

/** Physio schedules a paid Rehabify session for their patient; it confirms once the patient pays. */
export const scheduleRehabifyFollowUp = mutation({
  args: {
    patientId: v.id("users"),
    serviceId: v.string(),
    slotStart: v.number(),
    zoneId: v.optional(v.id("travelZones")),
    area: v.optional(v.string()),
    patientAddress: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const physio = await getAuthenticatedUser(ctx);
    if (physio.role !== "physiotherapist") throw new ConvexError("Only physiotherapists can schedule follow-ups.");
    if (!isBookableServiceId(args.serviceId)) throw new ConvexError("Choose a Rehabify service.");
    if (!(await isRehabifyCare(ctx, args.patientId, physio._id))) {
      throw new ConvexError("This patient isn't a Rehabify patient of yours. Schedule a normal appointment instead.");
    }
    const patient = (await ctx.db.get(args.patientId)) as Doc<"users"> | null;
    if (!patient) throw new ConvexError("Patient not found.");

    const result = await insertServiceBooking(ctx, {
      patient,
      physiotherapistId: physio._id,
      serviceId: args.serviceId,
      slotStart: args.slotStart,
      zoneId: args.zoneId,
      area: args.area,
      patientAddress: args.patientAddress,
      patientNotes: args.notes,
      sourceSystem: "rh_patient_dashboard",
      scheduledBy: "physiotherapist",
      holdMs: PHYSIO_SCHEDULED_HOLD_MS,
    });

    const service = getService(args.serviceId);
    const physioName = `${physio.firstName ?? ""} ${physio.lastName ?? ""}`.trim() || "Your physiotherapist";
    await ctx.db.insert("notifications", {
      userId: args.patientId,
      type: "appointment_scheduled",
      priority: "high",
      status: "pending",
      payload: {
        title: "Session scheduled: pay to confirm",
        body: `${physioName} scheduled your ${service?.shortName ?? "session"} for ${lagosDateTime(args.slotStart)}. Pay within 24 hours to confirm it.`,
        data: { entityType: "marketplace_booking", entityId: result.bookingId, actionUrl: "/dashboard/patient" },
      },
      createdAt: Date.now(),
    });
    return result;
  },
});
