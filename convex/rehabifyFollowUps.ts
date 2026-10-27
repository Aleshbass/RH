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
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthenticatedUser } from "./auth";
import { insertServiceBooking } from "./marketplace/booking";
import { PHYSIO_SCHEDULED_HOLD_MS } from "./helpers/slotHolds";
import { hasPriorAssessment } from "./helpers/rehabifyPricing";
import { awaitingConfirmationFrom } from "./helpers/appointmentStatus";
import { emailAboutAppointment, personName, syncGoogleCalendarEvent } from "./helpers/appointmentNotify";
import { formatKobo, getService, isBookableServiceId } from "../lib/rehabify-services";
import { lagosDate, lagosDateTime, lagosTimeRange } from "./helpers/lagosTime";

const REHABIFY_SOURCES = new Set(["marketplace", "joy_whatsapp", "booking_link"]);

/** Whether sessions between this patient and physio are Rehabify-priced (pay to confirm). */
export async function isRehabifyCare(
  ctx: QueryCtx,
  patientId: Id<"users">,
  physiotherapistId: Id<"users">
): Promise<boolean> {
  const physio = await ctx.db.get(physiotherapistId);
  const profile = physio?.physiotherapistProfileId ? await ctx.db.get(physio.physiotherapistProfileId) : null;
  // Clinic members bill through their clinic; a physio who sees only their own patients has no
  // Rehabify Care patients (anyone they still see is treated as their own patient)
  if (!profile || profile.clinicId || profile.practiceMode === "independent") return false;
  // Old data can hold more than one row for a pair: any Rehabify-sourced one makes it Rehabify Care
  const relationships = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", patientId).eq("physiotherapistId", physiotherapistId))
    .take(10);
  return relationships.some((relationship) => REHABIFY_SOURCES.has(relationship.source ?? ""));
}

/** Paid for through Rehabify: a paid booking that created the visit, or a paid invoice for it. */
export async function isVisitPaid(ctx: QueryCtx, appointment: Doc<"appointments">): Promise<boolean> {
  const booking = await ctx.db
    .query("marketplaceBookings")
    .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
    .first();
  // A booking only creates its visit once paid (or covered by Rehabify Access)
  if (booking) return true;
  const paidInvoices = await ctx.db
    .query("invoices")
    .withIndex("by_patient_id", (q) => q.eq("patientId", appointment.patientId))
    .filter((q) => q.eq(q.field("status"), "paid"))
    .collect();
  return paidInvoices.some((invoice) => invoice.relatedAppointmentIds?.includes(appointment._id));
}

/**
 * Payment rules follow the relationship: a Rehabify Care visit is confirmed only by paying.
 * A physio's own patients and clinic patients are confirmed when the other side accepts (they
 * pay the physio or clinic their own way). Record-only rows aren't visits.
 */
export async function mustPayToConfirm(ctx: QueryCtx, appointment: Doc<"appointments">): Promise<boolean> {
  if (appointment.isRecordOnly) return false;
  if (!(await isRehabifyCare(ctx, appointment.patientId, appointment.physiotherapistId))) return false;
  return !(await isVisitPaid(ctx, appointment));
}

/**
 * A patient's request the physio accepts with an invoice: a Rehabify patient's, for a visit that
 * isn't paid for yet. A paid visit the patient asked to move is simply confirmed at the new time.
 */
export async function needsInvoiceOnAccept(ctx: QueryCtx, appointment: Doc<"appointments">): Promise<boolean> {
  if (awaitingConfirmationFrom(appointment) !== "provider") return false;
  return mustPayToConfirm(ctx, appointment);
}

/**
 * What the physio's scheduling screens get back for a new booking: their payout for it (plus
 * travel share), never what the patient is charged.
 */
async function physioBookingResult(
  ctx: MutationCtx,
  result: { bookingId: Id<"marketplaceBookings">; holdExpiresAt: number; durationMinutes: number }
) {
  const booking = await ctx.db.get(result.bookingId);
  return {
    bookingId: result.bookingId,
    holdExpiresAt: result.holdExpiresAt,
    durationMinutes: result.durationMinutes,
    payoutKobo: booking?.physiotherapistEarnings ?? 0,
  };
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
    return await physioBookingResult(ctx, result);
  },
});

/**
 * Physio accepts a Rehabify patient's request and sends the invoice in one step. They pick the
 * service from Rehabify's price list (never an amount), the request becomes a pay-to-confirm
 * booking at the time the patient asked for, and the visit is confirmed once the patient pays.
 */
export const acceptRequestWithInvoice = mutation({
  args: {
    appointmentId: v.id("appointments"),
    serviceId: v.string(),
    zoneId: v.optional(v.id("travelZones")),
    area: v.optional(v.string()),
    patientAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const physio = await getAuthenticatedUser(ctx);
    if (physio.role !== "physiotherapist") throw new ConvexError("Only physiotherapists can accept requests.");
    if (!isBookableServiceId(args.serviceId)) throw new ConvexError("Choose a service from the price list.");
    const request = await ctx.db.get(args.appointmentId);
    if (!request || request.physiotherapistId !== physio._id) throw new ConvexError("Request not found.");
    if (awaitingConfirmationFrom(request) !== "provider") {
      throw new ConvexError("This visit isn't waiting for your answer any more.");
    }
    if (request.startTime <= Date.now()) throw new ConvexError("This request's time has passed. Suggest another time instead.");
    if (!(await needsInvoiceOnAccept(ctx, request))) {
      throw new ConvexError("This visit doesn't need an invoice, so just accept it.");
    }
    const patient = (await ctx.db.get(request.patientId)) as Doc<"users"> | null;
    if (!patient) throw new ConvexError("Patient not found.");

    // The request makes way for the booking at the same time; paying turns the booking into the visit
    await syncGoogleCalendarEvent(ctx, request._id, "delete");
    await ctx.db.delete(request._id);

    const result = await insertServiceBooking(ctx, {
      patient,
      physiotherapistId: physio._id,
      serviceId: args.serviceId,
      slotStart: request.startTime,
      zoneId: args.zoneId,
      area: args.area,
      patientAddress: args.patientAddress ?? request.location,
      patientNotes: request.notesForTherapist,
      sourceSystem: "rh_patient_dashboard",
      scheduledBy: "physiotherapist",
      fromPatientRequest: true,
      // Pay within a day, and before the visit starts
      holdMs: Math.min(PHYSIO_SCHEDULED_HOLD_MS, request.startTime - Date.now()),
    });

    const service = getService(args.serviceId);
    const physioName = personName(physio, "Your physiotherapist");
    const price = formatKobo(result.chargeKobo);
    const payBy = lagosDateTime(result.holdExpiresAt);
    await ctx.db.insert("notifications", {
      userId: patient._id,
      type: "appointment_scheduled",
      priority: "high",
      status: "pending",
      payload: {
        title: "Request accepted: pay to confirm",
        body: `${physioName} accepted your visit on ${lagosDateTime(request.startTime)}. Pay ${price} by ${payBy} to confirm it.`,
        data: { entityType: "marketplace_booking", entityId: result.bookingId, actionUrl: "/dashboard/patient" },
      },
      createdAt: Date.now(),
    });
    const end = request.startTime + result.durationMinutes * 60_000;
    await emailAboutAppointment(ctx, {
      to: patient.email,
      audience: "patient",
      subject: `${physioName} accepted your request: pay to confirm`,
      greetingName: patient.firstName,
      heading: "Your physio accepted your request",
      paragraphs: [
        `${physioName} accepted your ${service?.name ?? "session"} on ${lagosDate(request.startTime)}, ${lagosTimeRange(request.startTime, end)} (Lagos time), ${service?.mode === "home" ? "at your home" : "by video call"}.`,
        `It costs ${price}. Pay by ${payBy} to confirm your visit. We hold the time for you until then.`,
      ],
      buttonLabel: "Pay now",
      buttonPath: "/dashboard/patient",
    });
    return await physioBookingResult(ctx, result);
  },
});
