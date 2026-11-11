/**
 * Follow-ups for Rehabify patients are paid sessions.
 *
 * A patient who came to a physio through Rehabify (website, Joy or the physio's Rehabify
 * booking link) pays the standard Rehabify price for each session, so a follow-up the physio
 * schedules becomes a "scheduled: pay to confirm" booking rather than a free appointment.
 * It holds the slot for a day, and the patient pays from their dashboard (OpenBookingsCard).
 * Patients of a clinic, or a physio's own private patients, are unaffected.
 */
import { insertNotification } from "./helpers/pushNotify";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthenticatedUser } from "./auth";
import { activatePaidBooking, askPhysioToRespond, insertServiceBooking } from "./marketplace/booking";
import { findSlotClash, PHYSIO_SCHEDULED_HOLD_MS } from "./helpers/slotHolds";
import { createRefundRequest } from "./helpers/refunds";
import { isPhysioNetworkEligible } from "./physioSetup";
import { isWithinWorkingHours } from "./calendar/availability";
import { providerResponseDueAt } from "../lib/bookingResponse";
import { patientCancelOutcome, patientCancelTier, type CancelMoney } from "../lib/cancellationPolicy";
import { hasPriorAssessment } from "./helpers/rehabifyPricing";
import { awaitingConfirmationFrom, isOpenAppointment } from "./helpers/appointmentStatus";
import { emailAboutAppointment, notifyAboutAppointment, personName, syncGoogleCalendarEvent } from "./helpers/appointmentNotify";
import { formatKobo, getService, isBookableServiceId } from "../lib/rehabify-services";
import { isRehabifyCareInvoice } from "./helpers/marketplaceInvoices";
import { lagosDate, lagosDateTime, lagosTimeRange } from "./helpers/lagosTime";
import { queueJoyAppointmentScheduled, queueJoyBookingCancelled } from "./helpers/joyEvents";

const REHABIFY_SOURCES = new Set(["marketplace", "joy_whatsapp", "booking_link"]);

/**
 * Whether sessions between this patient and physio are Rehabify-priced (pay to confirm).
 * The rule follows the patient: one Rehabify sent (website, Joy, the physio's Rehabify booking
 * link) stays a Rehabify Care patient even if the physio later switches to independent or joins
 * a clinic. Otherwise either switch would let them bill Rehabify's patients with no Rehabify share.
 */
export async function isRehabifyCare(
  ctx: QueryCtx,
  patientId: Id<"users">,
  physiotherapistId: Id<"users">
): Promise<boolean> {
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
  // Only Rehabify's own invoices: a physio's own invoice (perhaps marked paid by hand) never pays for
  // a Rehabify Care visit
  return paidInvoices.some((invoice) => isRehabifyCareInvoice(invoice) && invoice.relatedAppointmentIds?.includes(appointment._id));
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
    await insertNotification(ctx, {
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
    // A patient on Joy hears about it on WhatsApp too (they pay in the app to confirm)
    await queueJoyAppointmentScheduled(ctx, patient, {
      appointmentId: String(result.bookingId),
      startTime: args.slotStart,
      endTime: args.slotStart + (result.durationMinutes ?? 60) * 60_000,
      online: service?.mode !== "home",
      physioName,
      payToConfirm: true,
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
    await insertNotification(ctx, {
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

// ─────────────────────────────────────────────────────────────────────────────
// Paid website requests waiting for the physio (Consultation and Booking Policy 5.4-5.5)
// The patient pays, then the physio has 2 hours to accept (lib/bookingResponse.ts).
// Declined or unanswered: the patient picks another physio free at the same time, asks for a
// full refund (an admin approves it), or asks the care team to sort it out.
// Joy bookings follow the same rules through the Joy integration.
// ─────────────────────────────────────────────────────────────────────────────

const PATIENT_BOOKINGS = "/dashboard/patient/appointments";

function bookingPatientName(booking: Doc<"marketplaceBookings">, patient: Doc<"users"> | null) {
  return booking.guestName || personName(patient, "Your patient");
}

/** Paid requests this physio still has to answer, soonest deadline first. */
export const getMyBookingRequests = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject)).unique();
    if (!user || user.role !== "physiotherapist") return [];
    const rows = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id))
      .order("desc")
      .take(200);
    const now = Date.now();
    const waiting = rows.filter(
      (b) => b.bookingStatus === "awaiting_physio" && b.providerResponse === "pending" && (b.providerResponseDueAt ?? 0) > now
    );
    const out = await Promise.all(
      waiting.map(async (b) => {
        const patient = await ctx.db.get(b.patientId);
        const service = b.serviceId ? getService(b.serviceId) : undefined;
        return {
          bookingId: b._id,
          patientName: bookingPatientName(b, patient),
          serviceName: service?.name ?? "Physiotherapy session",
          mode: b.isOnline ? ("virtual" as const) : ("home" as const),
          area: b.travelArea ?? b.travelZoneName ?? null,
          sessionDate: b.sessionDate ?? null,
          durationMinutes: b.sessionDuration,
          // What the physio is paid: never the patient's price
          payoutKobo: b.payoutKobo ?? b.physiotherapistEarnings,
          travelShareKobo: b.travelPhysioShareKobo ?? 0,
          patientNote: b.patientNotes ?? null,
          dueAt: b.providerResponseDueAt ?? now,
        };
      })
    );
    return out.sort((a, b) => a.dueAt - b.dueAt);
  },
});

/** The physio accepts (the visit is confirmed) or declines (the patient is offered other options). */
export const respondToBookingRequest = mutation({
  args: { bookingId: v.id("marketplaceBookings"), accept: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const physio = await getAuthenticatedUser(ctx);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.physiotherapistId !== physio._id) throw new ConvexError("Booking not found.");
    if (booking.bookingStatus !== "awaiting_physio" || booking.providerResponse !== "pending") {
      throw new ConvexError("This booking isn't waiting for your answer any more.");
    }
    if ((booking.providerResponseDueAt ?? 0) < Date.now()) {
      throw new ConvexError("The time to answer has passed, so we've offered the patient other options.");
    }
    if (args.accept) {
      await ctx.db.patch(booking._id, { providerResponse: "accepted", updatedAt: Date.now() });
      const paid = booking.paidAmountKobo ?? booking.totalAmount;
      await activatePaidBooking(
        ctx,
        booking,
        { bookingId: booking._id, paymentReference: booking.paymentReference ?? `MKT_${booking._id}` },
        {
          paymentReference: booking.paymentReference ?? `MKT_${booking._id}`,
          paymentMethod: booking.paymentMethod === "bank_transfer" ? "bank_transfer" : paid === 0 ? "free" : "paystack",
          paidAmountKobo: paid,
        },
        booking.paystackFeeActualKobo
      );
      return { accepted: true };
    }
    await releaseToPatient(ctx, booking, args.reason?.trim().slice(0, 300) || "declined");
    return { accepted: false };
  },
});

/** Declined or unanswered: free the physio's time and give the patient their choices. */
async function releaseToPatient(ctx: MutationCtx, booking: Doc<"marketplaceBookings">, reason: string) {
  const now = Date.now();
  const previous = [...new Set([...(booking.previousPhysioIds ?? []), ...(booking.physiotherapistId ? [booking.physiotherapistId] : [])])];
  await ctx.db.patch(booking._id, {
    providerResponse: "rejected",
    replacementStatus: "awaiting_patient_slot",
    previousPhysioIds: previous,
    providerDeclineReason: reason,
    updatedAt: now,
  });
  const patient = await ctx.db.get(booking.patientId);
  const physio = booking.physiotherapistId ? await ctx.db.get(booking.physiotherapistId) : null;
  const physioName = personName(physio, "Your physiotherapist");
  const when = booking.sessionDate ? lagosDateTime(booking.sessionDate) : "your chosen time";
  await insertNotification(ctx, {
    userId: booking.patientId,
    type: "appointment_cancelled",
    priority: "high",
    status: "pending",
    payload: {
      title: "Choose another physiotherapist or a refund",
      body: `${physioName} can't take your booking for ${when}. Pick another physiotherapist, or get a full refund.`,
      data: { entityType: "marketplace_booking", entityId: booking._id, actionUrl: PATIENT_BOOKINGS },
    },
    createdAt: now,
  });
  await emailAboutAppointment(ctx, {
    to: booking.guestEmail || patient?.email,
    audience: "patient",
    subject: "Your booking needs a new physiotherapist",
    greetingName: booking.guestName?.split(" ")[0] || patient?.firstName,
    heading: "Your physiotherapist can't make it",
    paragraphs: [
      `${physioName} can't take your booking for ${when}. You haven't lost anything: your payment is safe.`,
      "Choose another physiotherapist who's free at the same time, or ask for a full refund (including any travel charge).",
    ],
    buttonLabel: "See your options",
    buttonPath: PATIENT_BOOKINGS,
  });
}

/** Every few minutes: requests nobody answered in time go back to the patient. */
export const expireBookingRequests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const waiting = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_booking_status", (q) => q.eq("bookingStatus", "awaiting_physio"))
      .take(500);
    const now = Date.now();
    let expired = 0;
    for (const booking of waiting) {
      if (booking.providerResponse !== "pending" || (booking.providerResponseDueAt ?? Infinity) > now) continue;
      await releaseToPatient(ctx, booking, "no_response");
      if (booking.physiotherapistId) {
        await insertNotification(ctx, {
          userId: booking.physiotherapistId,
          type: "appointment_cancelled",
          priority: "medium",
          status: "pending",
          payload: {
            title: "A booking request expired",
            body: `You didn't answer a booking request for ${booking.sessionDate ? lagosDateTime(booking.sessionDate) : "a session"} in time, so we offered the patient someone else.`,
            data: { entityType: "marketplace_booking", entityId: booking._id, actionUrl: "/dashboard/physiotherapist/appointments" },
          },
          createdAt: now,
        });
      }
      expired++;
    }
    return { expired };
  },
});

/** Up to three physios who offer this service (and area) and are free at the booking's time. */
async function replacementOptions(ctx: QueryCtx, booking: Doc<"marketplaceBookings">) {
  if (!booking.sessionDate || !booking.serviceId || !isBookableServiceId(booking.serviceId)) return [];
  const start = booking.sessionDate;
  const end = start + booking.sessionDuration * 60_000;
  if (start < Date.now() + 30 * 60_000) return [];
  const exclude = new Set<string>([...(booking.previousPhysioIds ?? []), ...(booking.physiotherapistId ? [booking.physiotherapistId] : [])]);
  const profiles = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_marketplace_availability", (q) => q.eq("isAvailableOnMarketplace", true))
    .take(150);
  const options: { physiotherapistId: Id<"users">; name: string; imageUrl: string | null; yearsOfExperience: number | null }[] = [];
  for (const profile of profiles) {
    if (options.length >= 3) break;
    if (exclude.has(profile.userId) || !isWithinWorkingHours(profile.availabilitySchedule, start, end)) continue;
    const eligible = await isPhysioNetworkEligible(ctx, profile.userId, {
      serviceId: booking.serviceId,
      zoneId: booking.travelZoneId ?? null,
      access: booking.accessAwardId ? { payoutKobo: booking.payoutKobo ?? booking.physiotherapistEarnings } : undefined,
    });
    if (!eligible || (await findSlotClash(ctx, profile.userId, { start, end }, { excludeBookingId: booking._id }))) continue;
    const user = await ctx.db.get(profile.userId);
    options.push({
      physiotherapistId: profile.userId,
      name: personName(user, "Physiotherapist"),
      imageUrl: user?.imageUrl ?? null,
      yearsOfExperience: profile.yearsOfExperience ?? null,
    });
  }
  return options;
}

/** The patient's paid bookings waiting for a physio's answer, or for the patient's choice. */
export const getMyBookingsAwaitingPhysio = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject)).unique();
    if (!user) return [];
    const rows = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .order("desc")
      .take(50);
    const open = rows.filter((b) => b.bookingStatus === "awaiting_physio" && b.paymentStatus === "completed");
    return Promise.all(
      open.map(async (b) => {
        const physio = b.physiotherapistId ? await ctx.db.get(b.physiotherapistId) : null;
        const service = b.serviceId ? getService(b.serviceId) : undefined;
        const refunds = await ctx.db
          .query("refundRequests")
          .withIndex("by_related", (q) => q.eq("relatedType", "marketplace_booking").eq("relatedId", b._id))
          .collect();
        const choosing = b.replacementStatus === "awaiting_patient_slot";
        return {
          bookingId: b._id,
          serviceName: service?.name ?? "Physiotherapy session",
          physiotherapistName: personName(physio, "Your physiotherapist"),
          sessionDate: b.sessionDate ?? null,
          isOnline: b.isOnline,
          paidKobo: b.paidAmountKobo ?? b.totalAmount,
          state: choosing ? ("choose" as const) : b.replacementStatus === "admin_follow_up" ? ("care_team" as const) : ("waiting" as const),
          dueAt: b.providerResponseDueAt ?? null,
          declinedForNoResponse: b.providerDeclineReason === "no_response",
          refundRequested: refunds.some((r) => r.status !== "declined" && r.status !== "failed"),
          options: choosing ? await replacementOptions(ctx, b) : [],
        };
      })
    );
  },
});

async function patientBooking(ctx: MutationCtx, bookingId: Id<"marketplaceBookings">) {
  const user = await getAuthenticatedUser(ctx);
  const booking = await ctx.db.get(bookingId);
  if (!booking || booking.patientId !== user._id) throw new ConvexError("Booking not found.");
  if (booking.bookingStatus !== "awaiting_physio" || booking.paymentStatus !== "completed") {
    throw new ConvexError("This booking doesn't need a decision any more.");
  }
  return { user, booking };
}

/** The patient picks one of the offered physios; they now have their own time to accept. */
export const chooseReplacementPhysio = mutation({
  args: { bookingId: v.id("marketplaceBookings"), physiotherapistId: v.id("users") },
  handler: async (ctx, args) => {
    const { booking } = await patientBooking(ctx, args.bookingId);
    if (booking.replacementStatus !== "awaiting_patient_slot") throw new ConvexError("This booking isn't looking for a new physiotherapist.");
    const options = await replacementOptions(ctx, booking);
    if (!options.some((o) => o.physiotherapistId === args.physiotherapistId)) {
      throw new ConvexError("That physiotherapist is no longer free at this time. Please choose another.");
    }
    const now = Date.now();
    const dueAt = providerResponseDueAt(now, booking.sessionDate);
    await ctx.db.patch(booking._id, {
      physiotherapistId: args.physiotherapistId,
      providerResponse: "pending",
      providerResponseDueAt: dueAt,
      replacementStatus: "not_needed",
      providerDeclineReason: undefined,
      updatedAt: now,
    });
    const updated = await ctx.db.get(booking._id);
    if (updated) await askPhysioToRespond(ctx, updated, dueAt);
    return { dueAt };
  },
});

/** Full refund, including any travel charge (an admin approves it). The booking is cancelled. */
export const requestRefundForUntakenBooking = mutation({
  args: { bookingId: v.id("marketplaceBookings") },
  handler: async (ctx, args) => {
    const { user, booking } = await patientBooking(ctx, args.bookingId);
    if (booking.providerResponse === "pending") throw new ConvexError("Your physiotherapist can still accept this booking.");
    if (!booking.paymentReference) throw new ConvexError("We couldn't find the payment for this booking. Please contact support.");
    const amountKobo = booking.paidAmountKobo ?? booking.totalAmount;
    await createRefundRequest(ctx, {
      relatedType: "marketplace_booking",
      relatedId: booking._id,
      reference: booking.paymentReference,
      amountKobo,
      reason: booking.providerDeclineReason === "no_response" ? "physio_no_response" : "physio_declined",
      reasonText:
        booking.providerDeclineReason === "no_response"
          ? "The physiotherapist didn't answer in time. Full refund, including travel."
          : booking.providerDeclineReason === "physio_cancelled"
            ? "The physiotherapist cancelled. Full refund, including travel."
            : "The physiotherapist declined. Full refund, including travel.",
      requestedBy: "patient",
      payerUserId: user._id,
    });
    await ctx.db.patch(booking._id, {
      bookingStatus: "cancelled",
      cancellationReason: "Refund requested: the physiotherapist couldn't take the booking",
      updatedAt: Date.now(),
    });
    await queueJoyBookingCancelled(ctx, booking, { cancelledBy: "physiotherapist", refundStatus: "pending" });
    return { amountKobo };
  },
});

/** "Please sort it out for me": the care team contacts the patient within a business day (5.5). */
export const askCareTeamAboutBooking = mutation({
  args: { bookingId: v.id("marketplaceBookings") },
  handler: async (ctx, args) => {
    const { booking } = await patientBooking(ctx, args.bookingId);
    await ctx.db.patch(booking._id, {
      replacementStatus: "admin_follow_up",
      adminAttentionReason: "The patient asked the care team to find another physiotherapist or time.",
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Cancelling paid Rehabify Care visits (Payment Policy 4, lib/cancellationPolicy.ts)
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** The paid, standard-priced booking behind a visit, if it's Rehabify Care. */
async function paidCareBooking(ctx: QueryCtx, appointmentId: Id<"appointments">) {
  const booking = await ctx.db
    .query("marketplaceBookings")
    .withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId))
    .first();
  if (!booking || booking.paymentStatus !== "completed" || !booking.pricingModel || booking.bookingStatus === "cancelled") return null;
  return booking;
}

function cancelMoney(booking: Doc<"marketplaceBookings">): CancelMoney {
  return {
    paidKobo: booking.paidAmountKobo ?? booking.totalAmount,
    travelKobo: booking.travelSurchargeKobo ?? 0,
    payoutKobo: booking.payoutKobo ?? booking.physiotherapistEarnings,
    travelShareKobo: booking.travelPhysioShareKobo ?? 0,
  };
}

/** What cancelling now would mean for the patient, shown before they confirm. */
export const getCancellationQuote = query({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject)).unique();
    const appointment = await ctx.db.get(args.appointmentId);
    if (!user || !appointment || appointment.patientId !== user._id) return null;
    const booking = await paidCareBooking(ctx, args.appointmentId);
    if (!booking) return null;
    const money = cancelMoney(booking);
    const outcome = patientCancelOutcome(money, patientCancelTier(appointment.startTime, Date.now()), Boolean(booking.freeRescheduleUsedAt));
    return {
      tier: outcome.tier,
      refundKobo: outcome.refundKobo,
      paidKobo: money.paidKobo,
      canReschedule: outcome.canReschedule,
      rescheduleBy: appointment.startTime + 14 * DAY_MS,
    };
  },
});

async function addPolicyPayout(
  ctx: MutationCtx,
  booking: Doc<"marketplaceBookings">,
  appointment: Doc<"appointments">,
  amount: number,
  reason: "late_cancellation" | "no_show"
) {
  if (amount <= 0 || !booking.physiotherapistId) return;
  const invoiceId = booking.invoiceId;
  if (!invoiceId) {
    await ctx.db.insert("systemLogs", {
      type: "payment",
      timestamp: Date.now(),
      action: "policy_payout_without_invoice",
      targetEntityType: "marketplace_booking",
      targetEntityId: String(booking._id),
      details: { amount, reason },
    });
    return;
  }
  const existing = await ctx.db
    .query("payouts")
    .withIndex("by_payout_invoice_id", (q) => q.eq("invoiceId", invoiceId))
    .first();
  if (existing) return;
  const now = Date.now();
  await ctx.db.insert("payouts", {
    invoiceId,
    amount,
    status: "pending",
    type: "physiotherapist_earning",
    userId: booking.physiotherapistId,
    reason,
    bookingId: booking._id,
    appointmentId: appointment._id,
    sessionAt: appointment.startTime,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * The patient cancelled a paid Rehabify Care visit: file the refund the policy gives them (an
 * admin approves it) and owe the physio their share. Returns what happened, or null if the visit
 * isn't Rehabify Care.
 */
export async function settlePatientCancellation(ctx: MutationCtx, appointment: Doc<"appointments">) {
  const booking = await paidCareBooking(ctx, appointment._id);
  if (!booking) return null;
  const now = Date.now();
  const outcome = patientCancelOutcome(cancelMoney(booking), patientCancelTier(appointment.startTime, now), Boolean(booking.freeRescheduleUsedAt));
  if (outcome.refundKobo > 0 && booking.paymentReference) {
    await createRefundRequest(ctx, {
      relatedType: "marketplace_booking",
      relatedId: booking._id,
      reference: booking.paymentReference,
      amountKobo: outcome.refundKobo,
      reason: outcome.tier === "early" ? "patient_cancel_24h" : "patient_cancel_late_50",
      reasonText:
        outcome.tier === "early"
          ? "The patient cancelled 24 hours or more before. Full refund, including travel."
          : "The patient cancelled 2 to 24 hours before. 50% of the session fee, plus travel.",
      requestedBy: "patient",
      payerUserId: booking.patientId,
    });
  }
  await addPolicyPayout(ctx, booking, appointment, outcome.physioPayoutKobo, "late_cancellation");
  await ctx.db.patch(booking._id, {
    bookingStatus: "cancelled",
    cancellationReason: "Cancelled by the patient",
    cancellationOutcome: { tier: outcome.tier, refundKobo: outcome.refundKobo, physioPayoutKobo: outcome.physioPayoutKobo, at: now },
    updatedAt: now,
  });
  await queueJoyBookingCancelled(ctx, booking, { cancelledBy: "patient", refundStatus: outcome.refundKobo > 0 ? "pending" : "none" });
  return outcome;
}

/**
 * The physio cancelled a paid Rehabify Care visit: no payout, and the patient chooses another
 * physio at the same time or a full refund (Payment Policy 4.5). False if it isn't Rehabify Care.
 */
export async function releaseCancelledVisit(ctx: MutationCtx, appointment: Doc<"appointments">) {
  const booking = await paidCareBooking(ctx, appointment._id);
  if (!booking) return false;
  await ctx.db.patch(booking._id, { bookingStatus: "awaiting_physio", updatedAt: Date.now() });
  const updated = await ctx.db.get(booking._id);
  if (updated) await releaseToPatient(ctx, updated, "physio_cancelled");
  return true;
}

/** The patient didn't attend: no refund, and the physio is paid in full, travel too. */
export async function settleNoShow(ctx: MutationCtx, appointment: Doc<"appointments">) {
  const booking = await paidCareBooking(ctx, appointment._id);
  if (!booking) return;
  const money = cancelMoney(booking);
  await addPolicyPayout(ctx, booking, appointment, money.payoutKobo + money.travelShareKobo, "no_show");
  await ctx.db.patch(booking._id, { bookingStatus: "no_show", updatedAt: Date.now() });
}

/**
 * Moving a paid visit within 24 hours of its start: once only, to a time within 14 days of the
 * original (Payment Policy 4.3). Earlier moves are free and unlimited. Throws when not allowed.
 */
export async function useFreeReschedule(ctx: MutationCtx, appointment: Doc<"appointments">, newStart: number) {
  const booking = await paidCareBooking(ctx, appointment._id);
  if (!booking || appointment.startTime - Date.now() >= DAY_MS) return;
  if (booking.freeRescheduleUsedAt) {
    throw new ConvexError("You've already moved this visit once at short notice. You can still cancel it.");
  }
  if (newStart > appointment.startTime + 14 * DAY_MS) {
    throw new ConvexError("Please choose a time within 14 days of the original visit.");
  }
  await ctx.db.patch(booking._id, { freeRescheduleUsedAt: Date.now(), updatedAt: Date.now() });
}

// ─────────────────────────────────────────────────────────────────────────────
// Rebooking a paid visit that didn't happen
// ─────────────────────────────────────────────────────────────────────────────

/** How long after a missed paid visit the physio can still rebook it for free. */
const REBOOK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Why a visit can't be rebooked for free, or null when it can. It must be the physio's own, paid
 * through Rehabify, in the past (within 30 days), and not have happened: still open, marked a
 * no-show, or marked done without a session note. Its payout must not have been sent yet.
 */
async function whyNotRebookable(ctx: QueryCtx, appointment: Doc<"appointments">, physioId: Id<"users">): Promise<string | null> {
  if (appointment.physiotherapistId !== physioId) return "This visit isn't yours.";
  if (appointment.isRecordOnly) return "This is a note, not a visit.";
  const now = Date.now();
  if (appointment.startTime > now) return "This visit hasn't happened yet. Use Suggest another time instead.";
  if (appointment.startTime < now - REBOOK_WINDOW_MS) return "Visits can be rebooked free within 30 days.";
  const closed = appointment.status === "no_show" || appointment.status === "completed";
  if (!closed && !isOpenAppointment(appointment.status)) return "This visit was cancelled.";
  if (!(await isVisitPaid(ctx, appointment))) return "Only visits paid through Rehabify are rebooked free. Book a new session instead.";
  if (appointment.status === "completed") {
    const note = await ctx.db
      .query("sessionLogs")
      .withIndex("by_appointment_id", (q) => q.eq("appointmentId", appointment._id))
      .first();
    if (note) return "This visit has a session note, so it happened. Book a new session instead.";
  }
  const payouts = await ctx.db
    .query("payouts")
    .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
    .take(20);
  if (payouts.some((payout) => payout.status === "processing" || payout.status === "completed" || payout.runId)) {
    return "You've already been paid for this visit, so it can't be rebooked free. Contact Rehabify support.";
  }
  return null;
}

/** For the booking drawer: this patient's paid visits with me that didn't happen and can be rebooked free. */
export const getRebookableVisits = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const me = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!me || me.role !== "physiotherapist") return [];
    const now = Date.now();
    const visits = await ctx.db
      .query("appointments")
      .withIndex("by_patient_id_and_time", (q) =>
        q.eq("patientId", args.patientId).gte("startTime", now - REBOOK_WINDOW_MS).lt("startTime", now)
      )
      .take(50);
    const out: {
      appointmentId: Id<"appointments">;
      startTime: number;
      endTime: number;
      serviceType: string;
      status: string;
      video: boolean;
    }[] = [];
    for (const visit of visits) {
      if (visit.physiotherapistId !== me._id) continue;
      if (await whyNotRebookable(ctx, visit, me._id)) continue;
      out.push({
        appointmentId: visit._id,
        startTime: visit.startTime,
        endTime: visit.endTime,
        serviceType: visit.serviceType ?? "Session",
        status: visit.status,
        video: visit.appointmentType === "telehealth" || visit.isOnline === true,
      });
    }
    return out.sort((a, b) => b.startTime - a.startTime);
  },
});

/**
 * Physio rebooks a paid visit that didn't happen. The same visit (and its payment) moves straight
 * to the new time, confirmed, and the patient is told; they don't pay again and can still change
 * the time from their appointments. A visit already marked a no-show or done is reopened, and any
 * payout queued for it is withdrawn; the physio is paid when the rebooked session is done.
 */
export const rebookMissedVisit = mutation({
  args: {
    appointmentId: v.id("appointments"),
    startTime: v.number(),
    endTime: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const physio = await getAuthenticatedUser(ctx);
    if (physio.role !== "physiotherapist") throw new ConvexError("Only physiotherapists can rebook visits.");
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) throw new ConvexError("Visit not found.");
    const why = await whyNotRebookable(ctx, appointment, physio._id);
    if (why) throw new ConvexError(why);
    if (args.endTime <= args.startTime || args.endTime - args.startTime > 4 * 60 * 60_000) {
      throw new ConvexError("Please choose a valid session length.");
    }
    if (args.startTime < Date.now()) throw new ConvexError("Pick a time in the future.");
    if (await findSlotClash(ctx, physio._id, { start: args.startTime, end: args.endTime }, { excludeAppointmentId: appointment._id })) {
      throw new ConvexError("That time overlaps another booking. Pick another time.");
    }

    const now = Date.now();
    const note = args.note?.trim().slice(0, 500) || undefined;
    // Reopen a visit that was closed as a no-show or done; the payout queued for it is withdrawn
    if (appointment.status === "no_show" || appointment.status === "completed") {
      const payouts = await ctx.db
        .query("payouts")
        .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
        .take(20);
      let withdrawn = 0;
      for (const payout of payouts) {
        if (payout.status === "pending" && !payout.runId) {
          await ctx.db.delete(payout._id);
          withdrawn++;
        }
      }
      const booking = await ctx.db
        .query("marketplaceBookings")
        .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
        .first();
      if (booking && (booking.bookingStatus === "no_show" || booking.bookingStatus === "completed")) {
        await ctx.db.patch(booking._id, { bookingStatus: "confirmed", updatedAt: now });
      }
      await ctx.db.insert("systemLogs", {
        type: "payment",
        timestamp: now,
        action: "missed_visit_reopened",
        targetEntityType: "appointment",
        targetEntityId: String(appointment._id),
        details: { previousStatus: appointment.status, payoutsWithdrawn: withdrawn },
      });
    }
    // The same visit moves to the new time, confirmed (no new payment, no acceptance step)
    await ctx.db.patch(appointment._id, {
      status: "confirmed",
      startTime: args.startTime,
      endTime: args.endTime,
      requestedBy: "provider",
      rescheduledFromAppointmentId: appointment._id,
      proposedStartTime: undefined,
      proposedEndTime: undefined,
      proposedBy: undefined,
      proposedAt: undefined,
      proposalNote: undefined,
    });
    const paidBooking = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
      .first();
    if (paidBooking) await ctx.db.patch(paidBooking._id, { sessionDate: args.startTime, updatedAt: now });
    await syncGoogleCalendarEvent(ctx, appointment._id, { startTime: args.startTime, endTime: args.endTime });

    const patient = await ctx.db.get(appointment.patientId);
    const physioName = personName(physio, "Your physiotherapist");
    const when = `${lagosDate(args.startTime)}, ${lagosTimeRange(args.startTime, args.endTime)}`;
    await notifyAboutAppointment(ctx, {
      userId: appointment.patientId,
      type: "appointment_rescheduled",
      title: "Your missed visit is rebooked",
      body: `${physioName} rebooked the visit that didn't happen on ${lagosDateTime(appointment.startTime)} for ${lagosDateTime(args.startTime)}. It's already paid, so you don't pay again.${note ? ` "${note}"` : ""}`,
      appointmentId: appointment._id,
      actionUrl: "/dashboard/patient/appointments",
    });
    await emailAboutAppointment(ctx, {
      to: patient?.email,
      audience: "patient",
      subject: `Your visit with ${physioName} is rebooked for ${lagosDate(args.startTime)}`,
      greetingName: patient?.firstName,
      heading: "Your visit is rebooked",
      paragraphs: [
        `Your ${appointment.serviceType ?? "visit"} on ${lagosDate(appointment.startTime)} didn't go ahead, so ${physioName} has rebooked it for ${when} (Lagos time).`,
        "You've already paid, so there's nothing more to pay. Your video link stays on your appointments page.",
        ...(note ? [`Their note: "${note}"`] : []),
        "Can't make this time? Change it from your appointments.",
      ],
      buttonLabel: "View my appointments",
      buttonPath: "/dashboard/patient/appointments",
    });
    return { success: true, startTime: args.startTime };
  },
});
