import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const HOUR_MS = 60 * 60 * 1000;
const BOOKING_HOLD_MS = 30 * 60 * 1000;
const encoder = new TextEncoder();
export const AMBER_SPECIALIST_REVIEW_PRICE_KOBO = 600_000;
export const AMBER_SPECIALIST_REVIEW_DURATION_MINUTES = 5;

const LEGACY_SPECIALTY_TAGS: Record<string, string> = {
  musculoskeletal: "MSK_GENERAL",
  orthopedic: "MSK_ORTHOPAEDIC",
  orthopaedic: "MSK_ORTHOPAEDIC",
  sports: "MSK_SPORTS",
  neurological: "NEURO_REHAB",
  pediatric: "PAEDIATRIC_PHYSIO",
  paediatric: "PAEDIATRIC_PHYSIO",
  geriatric: "GERIATRIC_REHAB",
};

function controlledTags(profile: { joySpecialtyTags?: string[]; specializations?: string[] }): string[] {
  if (profile.joySpecialtyTags?.length) return [...new Set(profile.joySpecialtyTags)];
  return [...new Set((profile.specializations ?? [])
    .map((label) => LEGACY_SPECIALTY_TAGS[label.trim().toLowerCase()])
    .filter((tag): tag is string => Boolean(tag)))];
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function displayName(user: { firstName?: string; lastName?: string }): string | undefined {
  const value = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return value || undefined;
}

function calculateMarketplaceFees(serviceAmount: number) {
  const platformFee = 1000 * 100;
  const paystackFee = Math.round((serviceAmount + platformFee) * 0.015 + 100 * 100);
  return { serviceAmount, platformFee, paystackFee, totalAmount: serviceAmount + platformFee + paystackFee, physiotherapistEarnings: serviceAmount };
}

export const resolvePatientByPhone = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const matches = await ctx.db.query("users").filter((q) => q.eq(q.field("phoneNumber"), phone)).collect();
    const patients = matches.filter((user) => user.role === "patient");
    if (patients.length !== 1) return { resolution: patients.length ? "AMBIGUOUS" : "NOT_FOUND" };
    const user = patients[0];
    return { resolution: "MATCH", patient_id: user._id, display_name: displayName(user) };
  },
});

/**
 * Joy may provision a minimal patient record, but never a Clerk account. The
 * normalized WhatsApp number is the idempotency key for this integration path.
 */
export const resolveOrCreatePatientByPhone = internalMutation({
  args: {
    phone: v.string(),
    joyPersonId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const phone = args.phone.trim();
    const matches = await ctx.db.query("users").filter((q) => q.eq(q.field("phoneNumber"), phone)).collect();
    const patients = matches.filter((user) => user.role === "patient");
    if (patients.length > 1) return { resolution: "AMBIGUOUS" as const };

    let resolvedPatientId: Id<"users">;
    let resultResolution: "EXISTING" | "CREATED";
    let resultDisplayName: string | undefined;

    if (patients.length === 1) {
      const user = patients[0];
      resolvedPatientId = user._id;
      resultResolution = "EXISTING";
      resultDisplayName = displayName(user);
    } else {
      const [firstName, ...remainingNames] = (args.name ?? "").trim().split(/\s+/).filter(Boolean);
      resolvedPatientId = await ctx.db.insert("users", {
        // This is intentionally not a Clerk ID. It identifies a service-created
        // WhatsApp patient until the person later links a Clerk account.
        clerkId: `joy-whatsapp:${args.joyPersonId}`,
        email: args.email,
        firstName: firstName || "Patient",
        lastName: remainingNames.join(" "),
        phoneNumber: phone,
        role: "patient",
        onboarded: false,
      });
      await ctx.db.insert("patientProfiles", { userId: resolvedPatientId });
      resultResolution = "CREATED";
      resultDisplayName = [firstName, ...remainingNames].filter(Boolean).join(" ") || undefined;
    }

    // Automatically link any pending partner referral for this patient phone
    const cleanDigits = phone.replace(/\D/g, "");
    if (cleanDigits.length >= 7) {
      const recentReferrals = await ctx.db.query("inboundReferrals").order("desc").take(50);
      const matched = recentReferrals.find((r) => {
        const rDigits = (r.patientPhone || "").replace(/\D/g, "");
        return rDigits && (rDigits.endsWith(cleanDigits.slice(-10)) || cleanDigits.endsWith(rDigits.slice(-10)));
      });

      if (matched && !matched.patientId) {
        await ctx.db.patch(matched._id, {
          patientId: resolvedPatientId,
          status: (matched.status === "received" || matched.status === "pending") ? "intake_started" : matched.status,
          updatedAt: Date.now(),
        });
        await ctx.db.insert("referralEvents", {
          referralId: matched._id,
          eventName: "patient.whatsapp_intake_started",
          occurredAt: Date.now(),
          actorType: "system",
          actorId: "joy_ai",
          metadata: {
            joyPersonId: args.joyPersonId,
            channel: "whatsapp",
          },
        });
      }
    }

    return { resolution: resultResolution, patient_id: resolvedPatientId, display_name: resultDisplayName };
  },
});

export const recordExternalRequest = internalMutation({
  args: { requestId: v.string(), expiresAt: v.number() },
  handler: async (ctx, { requestId, expiresAt }) => {
    const existing = await ctx.db.query("joyIntegrationRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", requestId))
      .first();
    if (existing && existing.expiresAt > Date.now()) return { accepted: false };
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("joyIntegrationRequests", { requestId, expiresAt, createdAt: Date.now() });
    return { accepted: true };
  },
});

export const recordGatewayNonce = internalMutation({
  args: { nonce: v.string(), expiresAt: v.number() },
  handler: async (ctx, { nonce, expiresAt }) => {
    const existing = await ctx.db.query("joyIntegrationGatewayNonces")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .first();
    if (existing && existing.expiresAt > Date.now()) return { accepted: false };
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("joyIntegrationGatewayNonces", { nonce, expiresAt, createdAt: Date.now() });
    return { accepted: true };
  },
});

export const resolvePhysiotherapistByPhone = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const matches = await ctx.db.query("users").filter((q) => q.eq(q.field("phoneNumber"), phone)).collect();
    const providers = matches.filter((user) => user.role === "physiotherapist");
    if (providers.length !== 1) return { resolution: providers.length ? "AMBIGUOUS" : "NO_MATCH" };
    const user = providers[0];
    const profile = await ctx.db.query("physiotherapistProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first();
    const approval = await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first();
    if (!profile || approval?.status !== "approved") return { resolution: "INELIGIBLE" };
    return { resolution: "MATCH", physiotherapist_id: profile._id, display_name: displayName(user), capabilities: { specialties: profile.specializations ?? [], service_modes: [ ...(profile.offersOnlineSessions ? ["online"] : []), ...(profile.offersInPersonSessions ? ["in_person"] : []) ] } };
  },
});

/**
 * Read-only, conservative provider matching for Joy. It never reads a bio to
 * infer eligibility and excludes unapproved, unmodeled, or incomplete data.
 */
export const findMatches = internalQuery({
  args: {
    patientId: v.id("users"),
    requiredSpecialties: v.array(v.string()),
    serviceMode: v.union(v.literal("home_visit"), v.literal("clinic"), v.literal("online")),
    city: v.optional(v.string()),
    area: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new Error("Patient not found");
    const profiles = await ctx.db.query("physiotherapistProfiles")
      .withIndex("by_marketplace_availability", (q) => q.eq("isAvailableOnMarketplace", true))
      .collect();
    const requestedCity = args.city ? normalized(args.city) : "";
    const requestedArea = args.area ? normalized(args.area) : "";
    const results = [];
    for (const profile of profiles) {
      const approval = await ctx.db.query("accountApprovalStatus")
        .withIndex("by_user_id", (q) => q.eq("userId", profile.userId))
        .first();
      if (approval?.status !== "approved") continue;
      const modes = profile.joyServiceModes ?? [];
      if (!modes.includes(args.serviceMode)) continue;
      const tags = controlledTags(profile);
      if (!args.requiredSpecialties.every((tag) => tags.includes(tag))) continue;
      if (args.serviceMode === "home_visit") {
        const areas = (profile.joyServiceAreas ?? []).map(normalized);
        const coverage = areas.includes(requestedArea) ? requestedArea : areas.includes(requestedCity) ? requestedCity : null;
        if (!requestedCity || !requestedArea || !coverage) continue;
      }
      if (!profile.availabilitySchedule) continue;
      const user = await ctx.db.get(profile.userId);
      if (!user) continue;
      const rate = profile.initialConsultRate ?? profile.hourlyRate;
      if (!Number.isFinite(rate) || !rate || rate <= 0) continue;
      results.push({
        physiotherapist_id: profile._id,
        physiotherapist_user_id: profile.userId,
        display_name: displayName(user),
        specialties: tags,
        service_modes: modes,
        amount_kobo: rate,
        match_reasons: ["verified specialty", "approved marketplace provider", "configured service mode", ...(args.serviceMode === "home_visit" ? ["serves your city or area"] : [])],
      });
    }
    return results.slice(0, Math.min(Math.max(args.limit, 1), 3));
  },
});

export const resolveProfileForAvailability = internalQuery({
  args: { physiotherapistId: v.id("physiotherapistProfiles"), serviceMode: v.union(v.literal("home_visit"), v.literal("clinic"), v.literal("online")) },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.physiotherapistId);
    if (!profile || !profile.joyServiceModes?.includes(args.serviceMode) || !profile.availabilitySchedule) {
      return null;
    }
    const approval = await ctx.db.query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", profile.userId)).first();
    if (approval?.status !== "approved") return null;
    return { physiotherapistUserId: profile.userId, amountKobo: profile.initialConsultRate ?? profile.hourlyRate ?? null };
  },
});

/**
 * Creates the RH-owned Joy booking hold. The Next integration route has
 * already validated a scoped, current eligibility reference directly with
 * Joy. Callers cannot supply their own price or a confirmed status.
 */
export const createPendingJoyBooking = internalMutation({
  args: {
    patientId: v.id("users"),
    physiotherapistId: v.id("physiotherapistProfiles"),
    slotStart: v.number(),
    durationMinutes: v.number(),
    serviceMode: v.union(v.literal("home_visit"), v.literal("clinic"), v.literal("online")),
    sessionType: v.string(),
    patientAddress: v.optional(v.string()),
    triageSummaryReference: v.string(), requiredSpecialties: v.array(v.string()),
    assessmentId: v.string(),
    assessmentRevision: v.number(),
    protocolVersion: v.string(),
    eligibilityReference: v.string(),
    policyVersion: v.string(),
    policyAcceptanceReference: v.string(),
    conversationId: v.string(),
    requestId: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.slotStart < Date.now() + 2 * HOUR_MS) throw new Error("Booking slots require at least two hours' notice");
    if (!Number.isInteger(args.durationMinutes) || args.durationMinutes < 5 || args.durationMinutes > 180) throw new Error("Invalid session duration");

    const existing = await ctx.db.query("marketplaceBookings")
      .withIndex("by_origin_idempotency", (q) => q.eq("originIdempotencyKey", args.idempotencyKey)).first();
    if (existing) {
      if (existing.patientId !== args.patientId || existing.sourceSystem !== "joy_ai") throw new Error("Idempotency key already belongs to another request");
      return { booking_id: existing._id, booking_status: existing.bookingStatus, payment_status: existing.paymentStatus, amount_kobo: existing.totalAmount, hold_expires_at: existing.holdExpiresAt };
    }

    const patient = await ctx.db.get(args.patientId);
    const profile = await ctx.db.get(args.physiotherapistId);
    if (!patient || patient.role !== "patient" || !profile) throw new Error("Patient or physiotherapist not found");
    const approval = await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", (q) => q.eq("userId", profile.userId)).first();
    if (approval?.status !== "approved" || !profile.isAvailableOnMarketplace || !profile.joyServiceModes?.includes(args.serviceMode)) throw new Error("Physiotherapist is not eligible for this service");
    const authoritativeRate = profile.initialConsultRate ?? profile.hourlyRate;
    if (!authoritativeRate || authoritativeRate <= 0) throw new Error("Physiotherapist has no authoritative price");

    const slotEnd = args.slotStart + args.durationMinutes * 60_000;
    const appointments = await ctx.db.query("appointments").withIndex("by_physiotherapist_id_and_time", (q) => q.eq("physiotherapistId", profile.userId)).collect();
    const conflictingAppointment = appointments.some((appointment) =>
      appointment.status !== "cancelled_by_patient" && appointment.status !== "cancelled_by_therapist" &&
      appointment.startTime < slotEnd && appointment.endTime > args.slotStart
    );
    if (conflictingAppointment) throw new Error("Selected slot is no longer available");
    const activeHolds = await ctx.db.query("marketplaceBookings").withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", profile.userId)).collect();
    const conflictingHold = activeHolds.some((booking) => booking.bookingStatus === "pending_payment" && (booking.holdExpiresAt ?? 0) > Date.now() && (booking.sessionDate ?? 0) < slotEnd && ((booking.sessionDate ?? 0) + booking.sessionDuration * 60_000) > args.slotStart);
    if (conflictingHold) throw new Error("Selected slot is temporarily held");

    const fees = calculateMarketplaceFees(authoritativeRate);
    const now = Date.now();
    const bookingId = await ctx.db.insert("marketplaceBookings", {
      physiotherapistId: profile.userId, patientId: args.patientId, sessionType: args.sessionType,
      sessionDate: args.slotStart, sessionDuration: args.durationMinutes, isOnline: args.serviceMode === "online", joyServiceMode: args.serviceMode, joyRequiredSpecialties: args.requiredSpecialties,
      patientAddress: args.patientAddress, ...fees, paymentStatus: "pending", bookingStatus: "pending_payment",
      patientNotes: `Joy triage summary reference: ${args.triageSummaryReference}`,
      sourceSystem: "joy_ai", sourceChannel: "whatsapp", sourceEntryPoint: "patient_booking",
      joyConversationId: args.conversationId, joyAssessmentId: args.assessmentId, joyAssessmentRevision: args.assessmentRevision,
      joyEligibilityReference: args.eligibilityReference, joyPolicyVersion: args.policyVersion,
      joyPolicyAcceptanceReference: args.policyAcceptanceReference, originRequestId: args.requestId,
      originIdempotencyKey: args.idempotencyKey, originatedAt: now, holdExpiresAt: now + BOOKING_HOLD_MS,
      providerResponse: "pending", replacementStatus: "not_needed", createdAt: now, updatedAt: now,
    });
    return { booking_id: bookingId, booking_status: "pending_payment", payment_status: "pending", amount_kobo: fees.totalAmount, hold_expires_at: now + BOOKING_HOLD_MS };
  },
});

export const getJoyBooking = internalQuery({
  args: { bookingId: v.id("marketplaceBookings"), patientId: v.id("users") },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.patientId !== args.patientId || booking.sourceSystem !== "joy_ai") return null;
    const provider = await ctx.db.get(booking.physiotherapistId);
    return {
      booking_id: booking._id, booking_status: booking.bookingStatus, payment_status: booking.paymentStatus,
      amount_kobo: booking.totalAmount, currency: "NGN", session_start: booking.sessionDate,
      duration_minutes: booking.sessionDuration, hold_expires_at: booking.holdExpiresAt,
      provider: provider ? { display_name: displayName(provider) } : null, updated_at: booking.updatedAt,
    };
  },
});

export const cancelJoyBooking = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), patientId: v.id("users"), reason: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.patientId !== args.patientId || booking.sourceSystem !== "joy_ai") throw new Error("Joy booking not found");
    if (booking.bookingStatus === "cancelled") return { booking_id: booking._id, booking_status: booking.bookingStatus, payment_status: booking.paymentStatus };
    // This route deliberately handles only an unpaid hold. Paid cancellation is
    // an operational/refund workflow and must not erase payment evidence.
    if (booking.paymentStatus !== "pending" || booking.bookingStatus !== "pending_payment") throw new Error("Paid bookings require the approved cancellation workflow");
    await ctx.db.patch(booking._id, { bookingStatus: "cancelled", cancellationReason: args.reason, holdExpiresAt: Date.now(), updatedAt: Date.now() });
    return { booking_id: booking._id, booking_status: "cancelled", payment_status: booking.paymentStatus };
  },
});

export const prepareJoyPaymentAttempt = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), patientId: v.id("users"), requestId: v.string(), idempotencyKey: v.string(), reference: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("joyPaymentAttempts").withIndex("by_origin_idempotency", (q) => q.eq("originIdempotencyKey", args.idempotencyKey)).first();
    if (existing) return { attempt_id: existing._id, booking_id: existing.bookingId, reference: existing.reference, amount_kobo: existing.amountKobo, status: existing.status, authorization_url: existing.authorizationUrl };
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.patientId !== args.patientId || booking.sourceSystem !== "joy_ai") throw new Error("Joy booking not found");
    if (booking.bookingStatus !== "pending_payment" || booking.paymentStatus !== "pending" || (booking.holdExpiresAt ?? 0) <= Date.now()) throw new Error("Booking is not available for payment");
    const now = Date.now();
    const attemptId = await ctx.db.insert("joyPaymentAttempts", { bookingId: booking._id, reference: args.reference, amountKobo: booking.totalAmount, currency: "NGN", status: "initializing", sourceSystem: "joy_ai", sourceChannel: "whatsapp", originRequestId: args.requestId, originIdempotencyKey: args.idempotencyKey, createdAt: now, updatedAt: now });
    await ctx.db.patch(booking._id, { paymentReference: args.reference, updatedAt: now });
    return { attempt_id: attemptId, booking_id: booking._id, reference: args.reference, amount_kobo: booking.totalAmount, status: "initializing" };
  },
});

export const recordJoyPaymentInitialization = internalMutation({
  args: { attemptId: v.id("joyPaymentAttempts"), authorizationUrl: v.optional(v.string()), safeAccessCode: v.optional(v.string()), failureCategory: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Payment attempt not found");
    const success = Boolean(args.authorizationUrl);
    await ctx.db.patch(attempt._id, { status: success ? "initialized" : "failed", authorizationUrl: args.authorizationUrl, safeAccessCode: args.safeAccessCode, failureCategory: args.failureCategory, updatedAt: Date.now() });
    return { status: success ? "initialized" : "failed" };
  },
});

/** Webhook-only payment evidence. It deliberately does not confirm an appointment. */
export const recordJoyPaymentWebhook = internalMutation({
  args: { reference: v.string(), amountKobo: v.number(), currency: v.string(), paystackEventId: v.string() },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.query("joyPaymentAttempts").withIndex("by_reference", (q) => q.eq("reference", args.reference)).first();
    if (!attempt) return { handled: false };
    if (args.currency !== "NGN" || args.amountKobo !== attempt.amountKobo) throw new Error("Paystack amount or currency mismatch");
    if (attempt.status === "verified") return { handled: true, duplicate: true, booking_id: attempt.bookingId };
    const booking = await ctx.db.get(attempt.bookingId);
    if (!booking) throw new Error("Payment booking not found");
    await ctx.db.patch(attempt._id, { status: "verified", verifiedAt: Date.now(), updatedAt: Date.now() });
    // Payment evidence is deliberately separate from allocation/provider
    // acceptance. A later authorized workflow may create the appointment.
    await ctx.db.patch(booking._id, { paymentStatus: "completed", paidAt: Date.now(), paymentReference: args.reference, updatedAt: Date.now(), providerResponse: "pending", providerResponseDueAt: Date.now() + 5 * HOUR_MS });
    return { handled: true, duplicate: false, booking_id: booking._id, patient_id: booking.patientId, physiotherapist_id: booking.physiotherapistId, provider_response_due_at: Date.now() + 5 * HOUR_MS, event_id: args.paystackEventId };
  },
});

/** Persist the minimal, patient-supplied service area used for Joy home visits. */
export const updateJoyPatientLocation = internalMutation({
  args: { patientId: v.id("users"), city: v.string(), area: v.string() },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new Error("Patient not found");
    const city = args.city.trim();
    const area = args.area.trim();
    if (!city || !area) throw new Error("City and area are required");
    const profile = await ctx.db.query("patientProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", args.patientId)).first();
    if (profile) await ctx.db.patch(profile._id, { city, area, address: `${area}, ${city}` });
    else await ctx.db.insert("patientProfiles", { userId: args.patientId, city, area, address: `${area}, ${city}` });
    return { patient_id: args.patientId, city, area };
  },
});

/** A paid AMBER review is a distinct service, not a routine consultation. */
export const createJoySpecialistReview = internalMutation({
  args: {
    patientId: v.id("users"), assessmentId: v.string(), assessmentRevision: v.number(),
    protocolVersion: v.string(), eligibilityReference: v.string(), policyVersion: v.string(),
    policyAcceptanceReference: v.string(), conversationId: v.string(), requestId: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("joySpecialistReviews").withIndex("by_origin_idempotency", q => q.eq("originIdempotencyKey", args.idempotencyKey)).first();
    if (existing) return { review_id: existing._id, payment_status: existing.paymentStatus, review_status: existing.reviewStatus, amount_kobo: existing.priceKobo };
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new Error("Patient not found");
    const now = Date.now();
    const reviewId = await ctx.db.insert("joySpecialistReviews", {
      patientId: args.patientId, assessmentId: args.assessmentId, assessmentRevision: args.assessmentRevision,
      protocolVersion: args.protocolVersion, eligibilityReference: args.eligibilityReference,
      policyVersion: args.policyVersion, policyAcceptanceReference: args.policyAcceptanceReference,
      priceKobo: AMBER_SPECIALIST_REVIEW_PRICE_KOBO, durationMinutes: AMBER_SPECIALIST_REVIEW_DURATION_MINUTES,
      paymentStatus: "pending", reviewStatus: "pending_payment", sourceSystem: "joy_ai", sourceChannel: "whatsapp",
      sourceEntryPoint: "specialist_review", joyConversationId: args.conversationId, originRequestId: args.requestId,
      originIdempotencyKey: args.idempotencyKey, originatedAt: now, createdAt: now, updatedAt: now,
    });
    return { review_id: reviewId, payment_status: "pending", review_status: "pending_payment", amount_kobo: AMBER_SPECIALIST_REVIEW_PRICE_KOBO };
  },
});

export const prepareJoySpecialistReviewPayment = internalMutation({
  args: { reviewId: v.id("joySpecialistReviews"), patientId: v.id("users"), requestId: v.string(), idempotencyKey: v.string(), reference: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("joySpecialistReviewPaymentAttempts").withIndex("by_origin_idempotency", q => q.eq("originIdempotencyKey", args.idempotencyKey)).first();
    if (existing) return { attempt_id: existing._id, review_id: existing.reviewId, reference: existing.reference, amount_kobo: existing.amountKobo, authorization_url: existing.authorizationUrl };
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.patientId !== args.patientId || review.reviewStatus !== "pending_payment" || review.paymentStatus !== "pending") throw new Error("Review is not available for payment");
    const now = Date.now();
    const attemptId = await ctx.db.insert("joySpecialistReviewPaymentAttempts", { reviewId: review._id, reference: args.reference, amountKobo: AMBER_SPECIALIST_REVIEW_PRICE_KOBO, status: "initializing", originRequestId: args.requestId, originIdempotencyKey: args.idempotencyKey, createdAt: now, updatedAt: now });
    await ctx.db.patch(review._id, { paymentReference: args.reference, updatedAt: now });
    return { attempt_id: attemptId, review_id: review._id, reference: args.reference, amount_kobo: AMBER_SPECIALIST_REVIEW_PRICE_KOBO };
  },
});

export const recordJoySpecialistReviewPaymentInitialization = internalMutation({
  args: { attemptId: v.id("joySpecialistReviewPaymentAttempts"), authorizationUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Review payment attempt not found");
    await ctx.db.patch(attempt._id, { status: args.authorizationUrl ? "initialized" : "failed", authorizationUrl: args.authorizationUrl, updatedAt: Date.now() });
    return { status: args.authorizationUrl ? "initialized" : "failed" };
  },
});

export const recordJoySpecialistReviewPaymentWebhook = internalMutation({
  args: { reference: v.string(), amountKobo: v.number(), currency: v.string(), paystackEventId: v.string() },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.query("joySpecialistReviewPaymentAttempts").withIndex("by_reference", q => q.eq("reference", args.reference)).first();
    if (!attempt) return { handled: false };
    if (args.currency !== "NGN" || args.amountKobo !== AMBER_SPECIALIST_REVIEW_PRICE_KOBO) throw new Error("Paystack amount or currency mismatch");
    if (attempt.status === "verified") return { handled: true, duplicate: true, review_id: attempt.reviewId };
    const review = await ctx.db.get(attempt.reviewId);
    if (!review) throw new Error("Review not found");
    const now = Date.now();
    await ctx.db.patch(attempt._id, { status: "verified", updatedAt: now });
    // Only profiles explicitly tagged by RH as AMBER reviewers can be allocated.
    // Absence of such a roster is a visible admin queue, never a fallback to an
    // unrelated general physio or a fabricated appointment.
    const profiles = await ctx.db.query("physiotherapistProfiles").withIndex("by_marketplace_availability", q => q.eq("isAvailableOnMarketplace", true)).collect();
    let reviewerId: Id<"users"> | undefined;
    for (const profile of profiles) {
      if (!profile.joySpecialtyTags?.includes("AMBER_REVIEWER")) continue;
      const approval = await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", q => q.eq("userId", profile.userId)).first();
      if (approval?.status === "approved") { reviewerId = profile.userId; break; }
    }
    const reviewStatus = reviewerId ? "assigned" : "awaiting_assignment";
    await ctx.db.patch(review._id, { paymentStatus: "completed", paidAt: now, paymentReference: args.reference, reviewerId, reviewStatus, updatedAt: now });
    return { handled: true, duplicate: false, review_id: review._id, patient_id: review.patientId, reviewer_id: reviewerId, review_status: reviewStatus, event_id: args.paystackEventId };
  },
});

export const enqueueJoyEvent = internalMutation({
  args: { eventId: v.string(), eventType: v.string(), payload: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("joyEventOutbox").withIndex("by_event_id", (q) => q.eq("eventId", args.eventId)).first();
    if (existing) return { event_id: existing.eventId, status: existing.status };
    const now = Date.now();
    await ctx.db.insert("joyEventOutbox", { eventId: args.eventId, eventType: args.eventType, payload: args.payload, status: "pending", attempts: 0, createdAt: now, updatedAt: now });
    return { event_id: args.eventId, status: "pending" };
  },
});

export const markJoyEventDelivery = internalMutation({
  args: { eventId: v.string(), delivered: v.boolean(), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const event = await ctx.db.query("joyEventOutbox").withIndex("by_event_id", (q) => q.eq("eventId", args.eventId)).first();
    if (!event) throw new Error("Joy event not found");
    await ctx.db.patch(event._id, { status: args.delivered ? "delivered" : "failed", attempts: event.attempts + 1, lastError: args.error, deliveredAt: args.delivered ? Date.now() : undefined, updatedAt: Date.now() });
    return { status: args.delivered ? "delivered" : "failed" };
  },
});

export const respondToJoyBooking = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), physiotherapistId: v.id("users"), response: v.union(v.literal("accept"), v.literal("reject")) },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.sourceSystem !== "joy_ai" || booking.physiotherapistId !== args.physiotherapistId) throw new Error("Booking not found");
    if (booking.paymentStatus !== "completed" || booking.providerResponse !== "pending") throw new Error("Booking cannot be responded to");
    if ((booking.providerResponseDueAt ?? 0) < Date.now()) throw new Error("Provider response has expired");
    if (args.response === "reject") {
      await ctx.db.patch(booking._id, { providerResponse: "rejected", replacementStatus: "awaiting_patient_slot", updatedAt: Date.now() });
      return { outcome: "replacement_required", booking_id: booking._id, patient_id: booking.patientId };
    }
    if (!booking.sessionDate) throw new Error("Validated booking slot missing");
    const appointmentId = await ctx.db.insert("appointments", {
      patientId: booking.patientId, physiotherapistId: booking.physiotherapistId,
      startTime: booking.sessionDate, endTime: booking.sessionDate + booking.sessionDuration * 60_000,
      serviceType: booking.sessionType, status: "confirmed", appointmentType: booking.isOnline ? "telehealth" : "in-person",
      isOnline: booking.isOnline, location: booking.patientAddress,
    });
    await ctx.db.patch(booking._id, { providerResponse: "accepted", bookingStatus: "confirmed", appointmentId, updatedAt: Date.now() });
    if (booking.isOnline) {
      await ctx.scheduler.runAfter(0, internal.joyIntegration.createJoyOnlineMeeting, {
        bookingId: booking._id, appointmentId, patientId: booking.patientId, physiotherapistId: booking.physiotherapistId,
        startTime: booking.sessionDate, endTime: booking.sessionDate + booking.sessionDuration * 60_000,
      });
    }
    return { outcome: "confirmed", booking_id: booking._id, appointment_id: appointmentId, patient_id: booking.patientId };
  },
});

export const storeJoyStreamMeeting = internalMutation({
  args: { appointmentId: v.id("appointments"), meetingLink: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.appointmentId, { meetingLink: args.meetingLink, isOnline: true });
  },
});

async function signEvent(timestamp: string, eventId: string, body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode([timestamp, eventId, body].join("\n")));
  return Array.from(new Uint8Array(signature)).map(value => value.toString(16).padStart(2, "0")).join("");
}

/** Durable, signed RH-to-Joy event delivery for asynchronous operations. */
export const deliverJoyEvent = internalAction({
  args: { eventId: v.string(), eventType: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    const payload = { event_id: args.eventId, event_type: args.eventType, api_version: "1", occurred_at: new Date().toISOString(), data: args.data };
    await ctx.runMutation(internal.joyIntegration.enqueueJoyEvent, { eventId: args.eventId, eventType: args.eventType, payload });
    const url = process.env.JOY_EVENT_URL;
    const secret = process.env.JOY_EVENT_HMAC_SECRET;
    if (!url || !secret) return { delivered: false, reason: "event_receiver_not_configured" };
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-RH-Event-Timestamp": timestamp, "X-RH-Event-Signature": await signEvent(timestamp, args.eventId, body, secret) }, body });
      if (!response.ok) throw new Error(`Joy event receiver returned ${response.status}`);
      await ctx.runMutation(internal.joyIntegration.markJoyEventDelivery, { eventId: args.eventId, delivered: true });
      return { delivered: true };
    } catch (error) {
      await ctx.runMutation(internal.joyIntegration.markJoyEventDelivery, { eventId: args.eventId, delivered: false, error: error instanceof Error ? error.message : "delivery failed" });
      return { delivered: false };
    }
  },
});

/** Creates the configured online room after a paid Joy booking is accepted. */
export const createJoyOnlineMeeting = internalAction({
  args: {
    bookingId: v.id("marketplaceBookings"), appointmentId: v.id("appointments"), patientId: v.id("users"), physiotherapistId: v.id("users"),
    startTime: v.number(), endTime: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      // Joy online appointments always use the approved Stream workflow. Do
      // not silently switch to Google Meet: its OAuth approval is not part of
      // the supported Joy operational path.
      const platform = "stream" as const;
      const appBase = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://physioaroundme.com";
      const roomId = `joy-${args.appointmentId}`;
      const meetingUrl = `${appBase.replace(/\/$/, "")}/video-call/${roomId}`;
      await ctx.runMutation(internal.videoCalls.createVideoCallRecord, {
        roomId, streamCallId: roomId, meetingLink: meetingUrl, platform, appointmentId: args.appointmentId,
        initiatorId: args.physiotherapistId, participants: [args.patientId, args.physiotherapistId], callType: "appointment",
        title: "Rehabify online physiotherapy appointment",
        settings: { recordingEnabled: false, chatEnabled: true, maxParticipants: 2, waitingRoomEnabled: true, screenShareEnabled: true, prejoinUiEnabled: true, ejectAtRoomExp: true, language: "en", geo: "us-west" },
        streamConfig: { callId: roomId, createdAt: new Date().toISOString() },
      });
      await ctx.runMutation(internal.joyIntegration.storeJoyStreamMeeting, { appointmentId: args.appointmentId, meetingLink: meetingUrl });
      await ctx.runAction(internal.joyIntegration.deliverJoyEvent, {
        eventId: `booking-meeting-link-${args.bookingId}`, eventType: "booking.meeting_link_ready",
        data: { booking_id: args.bookingId, appointment_id: args.appointmentId, patient_id: args.patientId, meeting_url: meetingUrl, platform, start_time: args.startTime },
      });
    } catch (error) {
      await ctx.runMutation(internal.joyIntegration.createJoyOnlineMeetingFollowUp, {
        bookingId: args.bookingId, reason: "online_meeting_link_generation_failed",
      });
      await ctx.runAction(internal.joyIntegration.deliverJoyEvent, {
        eventId: `booking-meeting-link-failed-${args.bookingId}`, eventType: "booking.meeting_link_failed",
        data: { booking_id: args.bookingId, appointment_id: args.appointmentId, patient_id: args.patientId, reason: "meeting_link_generation_failed" },
      });
    }
  },
});

export const expireJoyProviderResponses = internalMutation({
  args: {}, handler: async (ctx) => {
    const paid = await ctx.db.query("marketplaceBookings").withIndex("by_payment_status", q => q.eq("paymentStatus", "completed")).collect();
    const due = paid.filter(b => b.sourceSystem === "joy_ai" && b.providerResponse === "pending" && (b.providerResponseDueAt ?? Infinity) <= Date.now());
    for (const booking of due) {
      const now = Date.now();
      await ctx.db.patch(booking._id, { providerResponse: "rejected", replacementStatus: "awaiting_patient_slot", updatedAt: now });
      await ctx.db.insert("joyEventOutbox", {
        eventId: `booking-provider-timeout-${booking._id}`,
        eventType: "booking.provider_rejected",
        payload: { booking_id: booking._id, patient_id: booking.patientId, reason: "provider_response_timeout" },
        status: "pending", attempts: 0, createdAt: now, updatedAt: now,
      });
    }
    return { expired: due.map(b => ({ booking_id: b._id, patient_id: b.patientId })) };
  },
});

async function eventSignature(timestamp: string, eventId: string, body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode([timestamp, eventId, body].join("\n"))));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Five-hour provider timeout path. It fails safely: the booking is never confirmed
 * by a timeout; Joy receives the same replacement-selection event as a rejection. */
export const dispatchExpiredJoyProviderResponses = internalAction({
  args: {},
  handler: async (ctx): Promise<{ expired: number; delivered: number; configuration_missing?: boolean }> => {
    const res: any = await ctx.runMutation(internal.joyIntegration.expireJoyProviderResponses, {});
    const expired: Array<{ booking_id: string; patient_id: any }> = res.expired || [];
    const url = process.env.JOY_EVENT_URL;
    const secret = process.env.JOY_EVENT_HMAC_SECRET;
    if (!url || !secret) return { expired: expired.length, delivered: 0, configuration_missing: true };
    let delivered = 0;
    for (const booking of expired) {
      const eventId = `booking-provider-timeout-${booking.booking_id}`;
      const envelope = { event_id: eventId, event_type: "booking.provider_rejected", api_version: "1", occurred_at: new Date().toISOString(), data: { booking_id: booking.booking_id, patient_id: booking.patient_id, reason: "provider_response_timeout" } };
      const body = JSON.stringify(envelope);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      try {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-RH-Event-Timestamp": timestamp, "X-RH-Event-Signature": await eventSignature(timestamp, eventId, body, secret) }, body });
        await ctx.runMutation(internal.joyIntegration.markJoyEventDelivery, { eventId, delivered: response.ok, error: response.ok ? undefined : `HTTP ${response.status}` });
        if (response.ok) delivered += 1;
      } catch (error) {
        await ctx.runMutation(internal.joyIntegration.markJoyEventDelivery, { eventId, delivered: false, error: error instanceof Error ? error.message : "delivery failed" });
      }
    }
    return { expired: expired.length, delivered };
  },
});

export const replacementCandidates = internalQuery({
  args: { bookingId: v.id("marketplaceBookings") },
  handler: async (ctx, { bookingId }) => {
    const booking = await ctx.db.get(bookingId);
    if (!booking || booking.sourceSystem !== "joy_ai" || booking.replacementStatus !== "awaiting_patient_slot") return [];
    const tags = booking.joyRequiredSpecialties ?? [];
    const mode = booking.joyServiceMode;
    if (!mode || !tags.length) return [];
    const profiles = await ctx.db.query("physiotherapistProfiles").withIndex("by_marketplace_availability", q => q.eq("isAvailableOnMarketplace", true)).collect();
    const results = [];
    for (const profile of profiles) {
      if (profile.userId === booking.physiotherapistId || !profile.joyServiceModes?.includes(mode)) continue;
      if (!tags.every(tag => controlledTags(profile).includes(tag))) continue;
      const approval = await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", q => q.eq("userId", profile.userId)).first();
      const rate = profile.initialConsultRate ?? profile.hourlyRate;
      if (approval?.status !== "approved" || !rate || !profile.availabilitySchedule) continue;
      const user = await ctx.db.get(profile.userId);
      results.push({ physiotherapist_id: profile._id, display_name: user ? displayName(user) : undefined, amount_kobo: rate, specialties: controlledTags(profile), service_modes: profile.joyServiceModes });
    }
    return results.slice(0, 3);
  },
});

export const createJoyAdminFollowUp = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), reason: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("joyAdminFollowUps").withIndex("by_booking", q => q.eq("bookingId", args.bookingId)).first();
    if (existing) return { follow_up_id: existing._id, duplicate: true };
    const now = Date.now();
    const id = await ctx.db.insert("joyAdminFollowUps", { bookingId: args.bookingId, recipientEmail: "admin@physioaroundme.com", reason: args.reason, status: "open", createdAt: now, updatedAt: now });
    await ctx.db.patch(args.bookingId, { replacementStatus: "admin_follow_up", updatedAt: now });
    return { follow_up_id: id, duplicate: false };
  },
});

/** Meeting-link failures need operations attention without changing rematch state. */
export const createJoyOnlineMeetingFollowUp = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), reason: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("joyAdminFollowUps").withIndex("by_booking", q => q.eq("bookingId", args.bookingId)).first();
    if (existing) return { follow_up_id: existing._id, duplicate: true };
    const now = Date.now();
    const id = await ctx.db.insert("joyAdminFollowUps", { bookingId: args.bookingId, recipientEmail: "admin@physioaroundme.com", reason: args.reason, status: "open", createdAt: now, updatedAt: now });
    return { follow_up_id: id, duplicate: false };
  },
});

export const reassignPaidJoyBooking = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), physiotherapistId: v.id("physiotherapistProfiles"), slotStart: v.number() },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    const profile = await ctx.db.get(args.physiotherapistId);
    if (!booking || !profile || booking.sourceSystem !== "joy_ai" || booking.replacementStatus !== "awaiting_patient_slot" || booking.paymentStatus !== "completed") throw new Error("Booking is not eligible for reassignment");
    if (!profile.joyServiceModes?.includes(booking.joyServiceMode as any) || !(booking.joyRequiredSpecialties ?? []).every(tag => controlledTags(profile).includes(tag))) throw new Error("Replacement provider is not eligible");
    const approval = await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", q => q.eq("userId", profile.userId)).first();
    if (approval?.status !== "approved") throw new Error("Replacement provider is not approved");
    const proposedEnd = args.slotStart + booking.sessionDuration * 60_000;
    const conflicts = await ctx.db.query("appointments").withIndex("by_physiotherapist_id_and_time", q => q.eq("physiotherapistId", profile.userId)).filter(q => q.and(
      q.lt(q.field("startTime"), proposedEnd), q.gt(q.field("endTime"), args.slotStart),
      q.neq(q.field("status"), "cancelled_by_patient"), q.neq(q.field("status"), "cancelled_by_therapist"),
    )).collect();
    if (conflicts.length) throw new Error("Replacement slot is no longer available");
    const now = Date.now();
    await ctx.db.patch(booking._id, { physiotherapistId: profile.userId, sessionDate: args.slotStart, providerResponse: "pending", providerResponseDueAt: now + 5 * HOUR_MS, replacementStatus: "not_needed", updatedAt: now });
    return { booking_id: booking._id, physiotherapist_id: profile.userId, provider_response_due_at: now + 5 * HOUR_MS };
  },
});
