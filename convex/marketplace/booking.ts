// @ts-nocheck
/**
 * Marketplace bookings and payments under Rehabify standard pricing (Oct 2026).
 *
 * A patient books a Rehabify service (lib/rehabify-services.ts) with an eligible physio:
 *  - the price is quoted on the server (helpers/rehabifyPricing.ts), never taken from the browser;
 *  - the booking is "scheduled" and holds its slot while the patient pays (helpers/slotHolds.ts);
 *  - it is confirmed only from verified payment evidence (Paystack webhook / verification,
 *    or an admin-confirmed bank transfer).
 * The price is all-inclusive: Rehabify absorbs Paystack's fee, holds the funds, and pays the
 * physio their fixed payout once the session is completed (appointments.updateAppointmentStatus).
 */

import { tagPaidRehabifyRelationship } from "../helpers/rehabifySources";
import { insertNotification } from "../helpers/pushNotify";
import { scheduleAcceptReminder } from "../pushAlerts";
import { v, ConvexError } from "convex/values";
import { mutation, action, internalMutation, internalQuery, query } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { publicAppUrl } from "../helpers/appUrl";
import { attributionForBooking, bumpLinkCounter } from "../helpers/partnerAttribution";
import { recordPartnerCommission } from "../helpers/partnerLedger";
import { isIndependentPractice, isPhysioNetworkEligible } from "../physioSetup";
import { markProviderMatched, transitionReferral } from "../helpers/partnerEvents";
import { referralEnv, toPublicStatus } from "../helpers/partnerShared";
import { verifyPaystackSignature } from "../helpers/paystackSignature";
import { hasPriorAssessment, quoteBooking, quoteSnapshot } from "../helpers/rehabifyPricing";
import { assertSlotFree, findSlotClash, isLiveHold, WEB_HOLD_MS } from "../helpers/slotHolds";
import { ensureMarketplaceInvoice, bookingDescription } from "../helpers/marketplaceInvoices";
import { assertAwardUsable, useAwardSession } from "../helpers/accessAwards";
import { applyPaystackRefund } from "../helpers/paymentRefunds";
import { adoptGuestPatientNumber, ensureUserNumbers } from "../helpers/rehabifyIds";
import { getService, isBookableServiceId } from "../../lib/rehabify-services";
import type { Doc, Id } from "../_generated/dataModel";
import { lagosDateTime, lagosTimeRange } from "../helpers/lagosTime";
import { assertServerCaller } from "../helpers/serverSecret";
import { recordPolicyAcceptances } from "../helpers/policyAcceptance";
import { CHECKOUT_POLICIES } from "../../lib/policies";
import { providerResponseDueAt } from "../../lib/bookingResponse";
import { issueReceipt } from "../helpers/receipts";
import { makeFunctionReference } from "convex/server";
import { queueJoyBookingCancelled } from "../helpers/joyEvents";

const sendCareEmail = makeFunctionReference<
    "action",
    { to: string; subject: string; greetingName?: string; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string; footnote?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

const MIN_NOTICE_MS = 30 * 60 * 1000;

const serviceBookingArgs = {
    physiotherapistId: v.id("users"),
    serviceId: v.string(), // lib/rehabify-services.ts BookableServiceId
    slotStart: v.number(),
    zoneId: v.optional(v.id("travelZones")), // home services
    area: v.optional(v.string()), // the patient's area within the zone
    patientAddress: v.optional(v.string()), // home services
    accessAwardId: v.optional(v.id("accessAwards")),
    patientNotes: v.optional(v.string()),
    referralPublicCode: v.optional(v.string()), // partner referral-link code from the attribution cookie
    // The Booking and Payment Policy versions the patient ticked "I agree" to (lib/policies.ts)
    acceptedPolicies: v.optional(v.record(v.string(), v.string())),
};

type ServiceBookingInput = {
    patient: Doc<"users">;
    physiotherapistId: Id<"users">;
    serviceId: string;
    slotStart: number;
    zoneId?: Id<"travelZones">;
    area?: string;
    patientAddress?: string;
    accessAwardId?: Id<"accessAwards">;
    patientNotes?: string;
    referralPublicCode?: string;
    guest?: { email: string; phone?: string; name?: string };
    sourceSystem: "rh_marketplace_web" | "rh_patient_dashboard";
    scheduledBy: "patient" | "physiotherapist";
    holdMs: number;
    /** The physio is accepting the patient's own request (patientNotes is then the patient's note). */
    fromPatientRequest?: boolean;
};

/**
 * Creates a scheduled, unpaid booking that holds its slot. Shared by the signed-in, guest and
 * dashboard booking paths (and physio-scheduled follow-ups) so they apply the same rules.
 */
export async function insertServiceBooking(ctx: any, input: ServiceBookingInput) {
    const service = getService(input.serviceId);
    if (!service || !isBookableServiceId(input.serviceId)) throw new ConvexError("This service can't be booked.");
    if (!Number.isFinite(input.slotStart) || input.slotStart < Date.now() + MIN_NOTICE_MS) {
        throw new ConvexError("Please pick a time at least 30 minutes from now.");
    }
    const address = input.patientAddress?.trim().slice(0, 500);
    if (service.mode === "home" && !address) throw new ConvexError("Please add your address for the home visit.");

    if (service.requiresPriorAssessment) {
        if (input.guest) throw new ConvexError("Please sign in to book treatment sessions.");
        if (!(await hasPriorAssessment(ctx, input.patient._id))) {
            throw new ConvexError(`${service.name} follows an assessment. Please book an assessment first.`);
        }
    }

    const award = input.accessAwardId
        ? await assertAwardUsable(ctx, await ctx.db.get(input.accessAwardId), {
              patientId: input.patient._id,
              physiotherapistId: input.physiotherapistId,
              serviceId: input.serviceId,
          })
        : null;

    const quote = await quoteBooking(ctx, { serviceId: input.serviceId, zoneId: input.zoneId, assisted: Boolean(award) });
    const area = quote.zone ? input.area?.trim() : undefined;
    if (quote.zone && area && !quote.zone.areas.some((a: string) => a.toLowerCase() === area.toLowerCase())) {
        throw new ConvexError("That area isn't in the travel zone you picked. Please choose your area again.");
    }
    const eligible = await isPhysioNetworkEligible(ctx, input.physiotherapistId, {
        serviceId: input.serviceId,
        zoneId: quote.zone?._id ?? null,
        access: award ? { payoutKobo: quote.payoutKobo } : undefined,
    });
    if (!eligible) {
        throw new ConvexError(
            service.mode === "home"
                ? "This physiotherapist doesn't cover your area for home visits. Please choose another physiotherapist."
                : "This physiotherapist isn't taking bookings for this service right now."
        );
    }

    const slot = { start: input.slotStart, end: input.slotStart + quote.durationMinutes * 60_000 };
    await assertSlotFree(ctx, input.physiotherapistId, slot);

    const attribution = await attributionForBooking(ctx, input.patient, input.referralPublicCode);
    const now = Date.now();
    const bookingId = await ctx.db.insert("marketplaceBookings", {
        physiotherapistId: input.physiotherapistId,
        patientId: input.patient._id,
        sessionType: input.serviceId,
        sessionDate: input.slotStart,
        sessionDuration: quote.durationMinutes,
        isOnline: service.mode === "virtual",
        careMode: service.mode === "virtual" ? "virtual" : "in_person",
        patientAddress: service.mode === "home" ? address : undefined,
        ...quoteSnapshot(quote, area),
        accessAwardId: award?._id,
        partnerId: attribution.partnerId,
        referralId: attribution.referralId,
        referralLinkId: attribution.referralLinkId,
        sourceSystem: input.sourceSystem,
        scheduledBy: input.scheduledBy,
        fromPatientRequest: input.fromPatientRequest || undefined,
        paymentStatus: "pending",
        bookingStatus: "pending_payment",
        holdExpiresAt: now + input.holdMs,
        patientNotes: input.patientNotes?.trim().slice(0, 2000) || undefined,
        packageSessions: 1,
        sessionsRemaining: 1,
        ...(input.guest
            ? { isGuestBooking: true, guestEmail: input.guest.email, guestPhone: input.guest.phone, guestName: input.guest.name }
            : {}),
        createdAt: now,
        updatedAt: now,
    });
    await bumpLinkCounter(ctx, attribution.referralLinkId, "bookings");
    return { bookingId, chargeKobo: quote.chargeKobo, holdExpiresAt: now + input.holdMs, durationMinutes: quote.durationMinutes };
}

async function signedInUser(ctx: any): Promise<Doc<"users"> | null> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject)).first();
}

/** Book a Rehabify service (signed in). The amount is quoted on the server. */
export const createServiceBooking = mutation({
    args: serviceBookingArgs,
    handler: async (ctx, args) => {
        const patient = await signedInUser(ctx);
        if (!patient) throw new ConvexError("Please sign in to book.");
        const { acceptedPolicies, ...booking } = args;
        const created = await insertServiceBooking(ctx, {
            ...booking,
            patient,
            sourceSystem: "rh_marketplace_web",
            scheduledBy: "patient",
            holdMs: WEB_HOLD_MS,
        });
        await recordPolicyAcceptances(ctx, {
            user: patient,
            documents: CHECKOUT_POLICIES,
            accepted: acceptedPolicies,
            channel: "web",
            contextType: "marketplace_booking",
            contextId: created.bookingId,
        });
        return created;
    },
});

/**
 * Book as a guest (no account): consultations and assessments only. A lightweight guest user
 * record (clerkId "guest-…") keeps patientId a real reference; claimGuestBookings re-links
 * everything when the guest signs up with the same email.
 */
export const guestCreateServiceBooking = mutation({
    args: {
        ...serviceBookingArgs,
        guestEmail: v.string(),
        guestPhone: v.optional(v.string()),
        guestName: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { guestEmail, guestPhone, guestName, acceptedPolicies, ...booking } = args;
        const email = guestEmail.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("Please enter a valid email address.");
        const patient = await findOrCreateGuestPatient(ctx, email, guestPhone, guestName);
        const created = await insertServiceBooking(ctx, {
            ...booking,
            patient,
            guest: { email, phone: guestPhone?.slice(0, 32), name: guestName?.slice(0, 120) },
            sourceSystem: "rh_marketplace_web",
            scheduledBy: "patient",
            holdMs: WEB_HOLD_MS,
        });
        await recordPolicyAcceptances(ctx, {
            user: patient,
            name: guestName,
            email,
            documents: CHECKOUT_POLICIES,
            accepted: acceptedPolicies,
            channel: "web",
            contextType: "marketplace_booking",
            contextId: created.bookingId,
        });
        return created;
    },
});

async function findOrCreateGuestPatient(ctx: any, email: string, phone?: string, name?: string): Promise<Doc<"users">> {
    const existing = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).first();
    if (existing) {
        // Only reuse earlier guest records. A registered account must sign in, otherwise
        // anyone could attach bookings to someone else's account by typing their email.
        if (!String(existing.clerkId ?? "").startsWith("guest-")) {
            throw new ConvexError("An account already exists for this email. Please sign in to book.");
        }
        return existing;
    }
    const nameParts = (name || "").split(" ").filter(Boolean);
    const guestUserId = await ctx.db.insert("users", {
        clerkId: `guest-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
        email,
        phoneNumber: phone,
        firstName: nameParts[0] || "Guest",
        lastName: nameParts.slice(1).join(" ") || "",
        role: "patient",
        onboarded: false, // Not onboarded — no Clerk session yet
    });
    await ensureUserNumbers(ctx, guestUserId);
    return await ctx.db.get(guestUserId);
}

/**
 * Before standard pricing, the booking page sent its own amount. A page loaded before the
 * change still calls these, so they ask the patient to refresh instead of booking at an old price.
 */
const legacyBookingArgs = {
    physiotherapistId: v.id("users"),
    sessionType: v.string(),
    sessionDate: v.optional(v.number()),
    sessionDuration: v.number(),
    isOnline: v.boolean(),
    serviceAmount: v.number(),
    patientNotes: v.optional(v.string()),
    packageSessions: v.optional(v.number()),
    packageDiscountPercent: v.optional(v.number()),
    conditionLabel: v.optional(v.string()),
    conditionLevel: v.optional(v.string()),
    patientAddress: v.optional(v.string()),
    referralPublicCode: v.optional(v.string()),
};
const PRICES_CHANGED = "Our prices have been updated. Please refresh the page to book.";

export const createMarketplaceBooking = mutation({
    args: legacyBookingArgs,
    handler: async () => {
        throw new ConvexError(PRICES_CHANGED);
    },
});

export const guestCreateMarketplaceBooking = mutation({
    args: { ...legacyBookingArgs, guestEmail: v.string(), guestPhone: v.optional(v.string()), guestName: v.optional(v.string()) },
    handler: async () => {
        throw new ConvexError(PRICES_CHANGED);
    },
});

/**
 * Public price for one session, for the booking page and the /pricing chooser. The same quote
 * the booking mutation will store (payouts are not exposed).
 */
export const getServiceQuote = query({
    args: { serviceId: v.string(), zoneId: v.optional(v.id("travelZones")), accessAwardId: v.optional(v.id("accessAwards")) },
    handler: async (ctx, args) => {
        let assisted = false;
        if (args.accessAwardId) {
            const user = await signedInUser(ctx);
            const award = await ctx.db.get(args.accessAwardId);
            assisted = Boolean(user && award && award.patientId === user._id && award.status === "active");
        }
        try {
            const quote = await quoteBooking(ctx, { serviceId: args.serviceId, zoneId: args.zoneId, assisted });
            return {
                ok: true as const,
                serviceId: quote.serviceId,
                durationMinutes: quote.durationMinutes,
                basePriceKobo: quote.basePriceKobo,
                travelSurchargeKobo: quote.travelSurchargeKobo,
                chargeKobo: quote.chargeKobo,
                zoneName: quote.zone?.name ?? null,
                assisted,
            };
        } catch (error) {
            return { ok: false as const, message: error instanceof ConvexError ? String(error.data) : "This service can't be quoted right now." };
        }
    },
});

/**
 * Called before Paystack checkout (and by "Pay now"): keeps the slot held while the patient
 * pays. If the hold lapsed, re-holds the slot when it is still free.
 */
export const refreshMarketplaceHold = mutation({
    args: {
        bookingId: v.id("marketplaceBookings"),
        // The MKT_ reference about to be sent to Paystack, kept so a missed webhook can be reconciled
        checkoutReference: v.optional(v.string()),
        serverSecret: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Only our checkout route (app/api/payments/marketplace) holds slots and records references:
        // a reference attached by anyone else could be used to confirm a booking with another payment
        assertServerCaller(args.serverSecret);
        const booking = await ctx.db.get(args.bookingId);
        if (!booking || booking.sourceSystem === "joy_ai") return { ok: false as const, reason: "not_found" as const };
        if (booking.paymentStatus === "completed") return { ok: false as const, reason: "already_paid" as const };
        if (booking.bookingStatus !== "pending_payment") return { ok: false as const, reason: "cancelled" as const };
        if (!booking.physiotherapistId || !booking.sessionDate) return { ok: true as const, holdExpiresAt: booking.holdExpiresAt ?? null };
        if (booking.sessionDate < Date.now() + 10 * 60_000) return { ok: false as const, reason: "too_late" as const };
        if (args.checkoutReference && /^MKT_[A-Za-z0-9_]+$/.test(args.checkoutReference)) {
            const refs = [...(booking.checkoutReferences ?? []).filter((r) => r !== args.checkoutReference), args.checkoutReference].slice(-5);
            await ctx.db.patch(booking._id, { checkoutReferences: refs });
        }
        const now = Date.now();
        const minimum = now + 20 * 60_000; // long enough to finish Paystack checkout
        if (isLiveHold(booking, now) && (booking.holdExpiresAt ?? 0) >= minimum) {
            return { ok: true as const, holdExpiresAt: booking.holdExpiresAt };
        }
        const clash = await findSlotClash(
            ctx,
            booking.physiotherapistId,
            { start: booking.sessionDate, end: booking.sessionDate + booking.sessionDuration * 60_000 },
            { excludeBookingId: booking._id }
        );
        if (clash) return { ok: false as const, reason: "slot_taken" as const };
        const holdExpiresAt = Math.max(booking.holdExpiresAt ?? 0, now + WEB_HOLD_MS);
        await ctx.db.patch(booking._id, { holdExpiresAt, updatedAt: now });
        return { ok: true as const, holdExpiresAt };
    },
});

/** The patient's scheduled-but-unpaid bookings, and paid ones waiting for a new time. */
export const getMyOpenBookings = query({
    args: {},
    handler: async (ctx) => {
        const user = await signedInUser(ctx);
        if (!user) return [];
        const bookings = await ctx.db
            .query("marketplaceBookings")
            .withIndex("by_patient", (q) => q.eq("patientId", user._id))
            .order("desc")
            .take(50);
        const now = Date.now();
        const open = bookings.filter(
            (b) =>
                b.sourceSystem !== "joy_ai" &&
                ((b.bookingStatus === "pending_payment" && b.paymentStatus === "pending" && (b.sessionDate ?? now + 1) > now) ||
                    (b.bookingStatus === "awaiting_admin_schedule" && b.paymentStatus === "completed"))
        );
        return Promise.all(
            open.map(async (b) => {
                const physio = b.physiotherapistId ? await ctx.db.get(b.physiotherapistId) : null;
                const loan = (
                    await ctx.db.query("loanApplications").withIndex("by_booking", (q: any) => q.eq("bookingId", b._id)).order("desc").take(1)
                )[0];
                return {
                    /** The latest MediLoan for this booking, if the patient chose to pay with one. */
                    mediloan: loan ? { status: loan.status, updatedAt: loan.updatedAt } : null,
                    id: b._id,
                    serviceId: b.serviceId ?? null,
                    serviceName: b.serviceId ? getService(b.serviceId)?.name ?? "Physiotherapy session" : "Physiotherapy session",
                    physiotherapistId: b.physiotherapistId ?? null,
                    physiotherapistName: physio ? `${physio.firstName ?? ""} ${physio.lastName ?? ""}`.trim() : null,
                    sessionDate: b.sessionDate ?? null,
                    durationMinutes: b.sessionDuration,
                    isOnline: b.isOnline,
                    travelZoneName: b.travelZoneName ?? null,
                    chargeKobo: b.serviceAmount,
                    status: b.bookingStatus === "awaiting_admin_schedule" ? ("needs_new_time" as const) : isLiveHold(b, now) ? ("held" as const) : ("hold_lapsed" as const),
                    holdExpiresAt: b.holdExpiresAt ?? null,
                    scheduledBy: b.scheduledBy ?? "patient",
                    fromPatientRequest: Boolean(b.fromPatientRequest),
                    isAccess: Boolean(b.accessAwardId),
                };
            })
        );
    },
});

/**
 * The physio's Rehabify sessions that are waiting for the patient to pay (a held time), so their
 * schedule shows them before they become appointments. Carries the physio's payout, never what
 * the patient is charged.
 */
export const getMyHeldBookingsAsPhysio = query({
    args: {},
    handler: async (ctx) => {
        const user = await signedInUser(ctx);
        if (!user || user.role !== "physiotherapist") return [];
        // Own patients only: no Rehabify Care bookings or payouts are shown to them
        const profile = user.physiotherapistProfileId ? await ctx.db.get(user.physiotherapistProfileId) : null;
        if (isIndependentPractice(profile)) return [];
        const bookings = await ctx.db
            .query("marketplaceBookings")
            .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id))
            .order("desc")
            .take(100);
        const now = Date.now();
        const waiting = bookings.filter(
            (b) =>
                b.sourceSystem !== "joy_ai" &&
                b.bookingStatus === "pending_payment" &&
                b.paymentStatus === "pending" &&
                (b.sessionDate ?? 0) > now
        );
        return Promise.all(
            waiting.map(async (b) => {
                const patient = await ctx.db.get(b.patientId);
                return {
                    id: b._id,
                    patientId: b.patientId,
                    patientName: patient ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() || "Patient" : "Patient",
                    serviceName: b.serviceId ? getService(b.serviceId)?.name ?? "Physiotherapy session" : "Physiotherapy session",
                    sessionDate: b.sessionDate ?? 0,
                    durationMinutes: b.sessionDuration,
                    isOnline: b.isOnline,
                    travelZoneName: b.travelZoneName ?? null,
                    // Payout plus travel share: what the physio is paid once the session is done
                    payoutKobo: (b.physiotherapistEarnings ?? 0) as number,
                    held: isLiveHold(b, now),
                    holdExpiresAt: b.holdExpiresAt ?? null,
                    scheduledBy: b.scheduledBy ?? "patient",
                    fromPatientRequest: Boolean(b.fromPatientRequest),
                };
            })
        );
    },
});

/** Patient (or the physio who scheduled it) cancels a booking that hasn't been paid. */
export const cancelUnpaidMarketplaceBooking = mutation({
    args: { bookingId: v.id("marketplaceBookings") },
    handler: async (ctx, args) => {
        const user = await signedInUser(ctx);
        if (!user) throw new ConvexError("Please sign in.");
        const booking = await ctx.db.get(args.bookingId);
        if (!booking || booking.sourceSystem === "joy_ai") throw new ConvexError("Booking not found.");
        if (booking.patientId !== user._id && booking.physiotherapistId !== user._id) throw new ConvexError("Booking not found.");
        if (booking.paymentStatus === "completed") throw new ConvexError("This booking is paid. Cancel it from your appointments.");
        if (booking.bookingStatus !== "pending_payment") return { success: true };
        if (await hasOpenMediLoan(ctx, booking._id)) {
            throw new ConvexError("A MediLoan is being decided for this booking. Contact Rehabify to cancel it.");
        }
        await ctx.db.patch(booking._id, {
            bookingStatus: "cancelled",
            cancellationReason: user._id === booking.patientId ? "Cancelled by patient before payment" : "Withdrawn by physiotherapist before payment",
            holdExpiresAt: Date.now(),
            updatedAt: Date.now(),
        });
        return { success: true };
    },
});

/** A MediLoan that may still pay for this booking. */
async function hasOpenMediLoan(ctx: any, bookingId: Id<"marketplaceBookings">) {
    const loans = await ctx.db
        .query("loanApplications")
        .withIndex("by_booking", (q: any) => q.eq("bookingId", bookingId))
        .collect();
    return loans.some((loan: Doc<"loanApplications">) => ["initiated", "pending", "approved", "offer_accepted"].includes(loan.status));
}

/** Hourly: closes web bookings left unpaid for a day (Joy manages its own holds). */
export const expireUnpaidBookings = internalMutation({
    args: {},
    handler: async (ctx) => {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const pending = await ctx.db
            .query("marketplaceBookings")
            .withIndex("by_booking_status", (q) => q.eq("bookingStatus", "pending_payment"))
            .take(500);
        let expired = 0;
        for (const booking of pending) {
            if (booking.sourceSystem === "joy_ai" || booking.paymentStatus !== "pending") continue;
            const holdLapsed = (booking.holdExpiresAt ?? booking.createdAt) < Date.now();
            const stale = booking.createdAt < cutoff || (booking.sessionDate !== undefined && booking.sessionDate < Date.now());
            if (holdLapsed && stale) {
                // A MediLoan is being decided for it: the payout will complete (or flag) the booking
                if (await hasOpenMediLoan(ctx, booking._id)) continue;
                await ctx.db.patch(booking._id, { bookingStatus: "cancelled", cancellationReason: "Not paid in time", updatedAt: Date.now() });
                expired++;
            }
        }
        return { expired };
    },
});

/**
 * Full booking record — internal only (it contains guest contact details).
 */
export const getMarketplaceBooking = internalQuery({
    args: { bookingId: v.id("marketplaceBookings") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.bookingId);
    },
});

/**
 * Non-sensitive payment quote used by the payment-initialisation route, so Paystack is
 * always initialised with the booking's own amount (never a browser-supplied one).
 */
export const getMarketplacePaymentQuote = query({
    args: { bookingId: v.id("marketplaceBookings") },
    handler: async (ctx, args) => {
        const booking = await ctx.db.get(args.bookingId);
        if (!booking || booking.sourceSystem === "joy_ai") return null;
        return {
            amountKobo: booking.serviceAmount,
            paymentStatus: booking.paymentStatus,
            bookingStatus: booking.bookingStatus,
            physiotherapistId: booking.physiotherapistId ?? null,
            serviceName: booking.serviceId ? getService(booking.serviceId)?.name ?? null : null,
        };
    },
});

type CompletionOptions = {
    paymentReference: string;
    paymentMethod: "paystack" | "bank_transfer" | "free";
    paidAmountKobo: number;
    /** Paystack's actual fee from the webhook, when known (Rehabify absorbs it). */
    paystackFeeKobo?: number;
};

/**
 * Completes a marketplace booking from VERIFIED payment evidence only (Paystack webhook,
 * server-side Paystack verification, admin bank-transfer confirmation, or a genuinely
 * free session). Idempotent: a booking is completed at most once.
 */
export async function completeMarketplaceBookingCore(ctx: any, bookingId: any, options: CompletionOptions) {
        const args = { bookingId, paymentReference: options.paymentReference };
        const booking = await ctx.db.get(args.bookingId);
        if (!booking) {
            throw new Error("Booking not found");
        }
        if (booking.paymentStatus === "completed") {
            return { success: true, alreadyCompleted: true, appointmentId: booking.appointmentId };
        }
        if (!booking.physiotherapistId) {
            throw new Error("Booking has no physiotherapist assigned");
        }
        // One payment confirms one booking: a reference already used elsewhere is refused
        const usedElsewhere = await ctx.db
            .query("marketplaceBookings")
            .withIndex("by_payment_reference", (q: any) => q.eq("paymentReference", args.paymentReference))
            .first();
        if (usedElsewhere && usedElsewhere._id !== booking._id) {
            console.error("marketplace_payment_reference_reused", { bookingId: String(bookingId) });
            return { success: false, reason: "reference_already_used" as const };
        }
        if (options.paymentMethod !== "free" && options.paidAmountKobo < booking.serviceAmount) {
            console.error("marketplace_payment_amount_mismatch", {
                bookingId: String(bookingId),
                expected: booking.serviceAmount,
                paid: options.paidAmountKobo,
                reference: options.paymentReference,
            });
            return { success: false, reason: "amount_mismatch" as const };
        }
        if (booking.bookingStatus === "cancelled") {
            // Money arrived for a cancelled booking: record it for the refund workflow.
            await ctx.db.patch(args.bookingId, {
                paymentStatus: "completed",
                paymentReference: args.paymentReference,
                paidAmountKobo: options.paidAmountKobo,
                adminAttentionReason: "Paid after the booking was cancelled (unpaid hold expired). Rebook the patient or refund them.",
                paidAt: Date.now(),
                updatedAt: Date.now(),
            });
            await ctx.db.insert("systemLogs", {
                type: "payment",
                timestamp: Date.now(),
                action: "marketplace_paid_after_cancel",
                targetEntityType: "marketplace_booking",
                targetEntityId: String(args.bookingId),
                details: { reference: args.paymentReference, paidKobo: options.paidAmountKobo },
            });
            return { success: true, cancelled: true };
        }

        const paystackFeeActual =
            typeof options.paystackFeeKobo === "number" && options.paystackFeeKobo >= 0 ? Math.round(options.paystackFeeKobo) : undefined;

        // Paid after the hold lapsed and someone else has since taken the slot: keep the payment,
        // and ask an admin to agree a new time with the patient instead of double-booking.
        if (booking.sessionDate && !isLiveHold(booking, Date.now())) {
            const clash = await findSlotClash(
                ctx,
                booking.physiotherapistId,
                { start: booking.sessionDate, end: booking.sessionDate + booking.sessionDuration * 60_000 },
                { excludeBookingId: booking._id }
            );
            if (clash) {
                await ctx.db.patch(args.bookingId, {
                    paymentStatus: "completed",
                    paymentMethod: options.paymentMethod === "bank_transfer" ? "bank_transfer" : "paystack",
                    bookingStatus: "awaiting_admin_schedule",
                    adminAttentionReason: "Paid after the hold lapsed; the slot was taken. Agree a new time with the patient.",
                    paymentReference: args.paymentReference,
                    paidAmountKobo: options.paidAmountKobo,
                    paystackFeeActualKobo: paystackFeeActual,
                    paidAt: Date.now(),
                    updatedAt: Date.now(),
                });
                if (booking.accessAwardId) await useAwardSession(ctx, booking.accessAwardId);
                console.warn("marketplace_paid_slot_taken", { bookingId: String(bookingId), reference: args.paymentReference });
                return { success: true, needsNewTime: true };
            }
        }

        // A patient's own request waits for the physio to accept (Booking Policy 5.4); a session
        // the physio scheduled is confirmed by paying
        const needsAccept = needsProviderAcceptance(booking);
        const paidAt = Date.now();
        const responseDueAt = needsAccept ? providerResponseDueAt(paidAt, booking.sessionDate) : undefined;
        await ctx.db.patch(args.bookingId, {
            paymentStatus: "completed",
            paymentMethod: options.paymentMethod === "bank_transfer" ? "bank_transfer" : "paystack",
            bookingStatus: needsAccept ? "awaiting_physio" : "confirmed",
            paymentReference: args.paymentReference,
            paidAmountKobo: options.paidAmountKobo,
            paystackFeeActualKobo: paystackFeeActual,
            careMode: booking.isOnline ? "virtual" : "in_person",
            paidAt,
            updatedAt: paidAt,
            ...(needsAccept ? { providerResponse: "pending" as const, providerResponseDueAt: responseDueAt, replacementStatus: "not_needed" as const } : {}),
        });
        if (booking.accessAwardId) await useAwardSession(ctx, booking.accessAwardId);
        await issueBookingReceipt(ctx, { ...booking, paymentReference: args.paymentReference }, options, paidAt);

        if (needsAccept) {
            await askPhysioToRespond(ctx, booking, responseDueAt!);
            await tellPatientBookingReceived(ctx, booking, responseDueAt!);
            return { success: true, awaitingPhysio: true };
        }
        return activatePaidBooking(ctx, booking, args, options, paystackFeeActual);
}

/** Patient-made Rehabify Care requests on the website or dashboard need the physio's acceptance. */
function needsProviderAcceptance(booking: Doc<"marketplaceBookings">) {
    return booking.sourceSystem !== "joy_ai" && booking.scheduledBy === "patient" && Boolean(booking.pricingModel);
}

/** The receipt for what the patient paid (service, travel). Idempotent per payment reference. */
async function issueBookingReceipt(ctx: any, booking: Doc<"marketplaceBookings">, options: CompletionOptions, paidAt: number) {
    if (options.paymentMethod === "free" || !booking.paymentReference) return;
    const patient = (await ctx.db.get(booking.patientId)) as Doc<"users"> | null;
    const physio = booking.physiotherapistId ? ((await ctx.db.get(booking.physiotherapistId)) as Doc<"users"> | null) : null;
    const service = booking.serviceId ? getService(booking.serviceId) : undefined;
    const travel = booking.travelSurchargeKobo ?? 0;
    const paid = options.paidAmountKobo || booking.totalAmount;
    const physioName = physio ? `${physio.firstName ?? ""} ${physio.lastName ?? ""}`.trim() : "";
    await issueReceipt(ctx, {
        kind: "payment",
        payerUserId: booking.patientId,
        email: booking.guestEmail || patient?.email,
        name: booking.guestName || [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") || undefined,
        relatedType: "marketplace_booking",
        relatedId: booking._id,
        relationship: "rehabify_care",
        description: [service?.name ?? "Physiotherapy session", physioName && `with ${physioName}`, booking.sessionDate && lagosDateTime(booking.sessionDate)]
            .filter(Boolean)
            .join(", "),
        lines: travel > 0 && paid > travel ? [{ label: service?.name ?? "Session", amountKobo: paid - travel }, { label: `Travel${booking.travelZoneName ? ` (${booking.travelZoneName})` : ""}`, amountKobo: travel }] : [{ label: service?.name ?? "Session", amountKobo: paid }],
        reference: booking.paymentReference,
        dedupeKey: booking.paymentReference,
        paidAt,
    });
}

/** Straight after payment: the booking is in, and the physio confirms it by `dueAt`. */
async function tellPatientBookingReceived(ctx: any, booking: Doc<"marketplaceBookings">, dueAt: number) {
    const patient = (await ctx.db.get(booking.patientId)) as Doc<"users"> | null;
    const physio = booking.physiotherapistId ? ((await ctx.db.get(booking.physiotherapistId)) as Doc<"users"> | null) : null;
    const physioName = physio ? `${physio.firstName ?? ""} ${physio.lastName ?? ""}`.trim() || "Your physiotherapist" : "Your physiotherapist";
    const service = booking.serviceId ? getService(booking.serviceId) : undefined;
    const when = booking.sessionDate ? lagosDateTime(booking.sessionDate) : "your chosen time";
    await insertNotification(ctx, {
        userId: booking.patientId,
        type: "appointment_scheduled",
        priority: "medium",
        status: "pending",
        payload: {
            title: "Booking received",
            body: `${physioName} will confirm your ${service?.name ?? "session"} on ${when} by ${lagosDateTime(dueAt)}.`,
            data: { entityType: "marketplace_booking", entityId: booking._id, actionUrl: "/dashboard/patient/appointments" },
        },
        createdAt: Date.now(),
    });
    const to = booking.guestEmail || patient?.email;
    if (!to) return;
    await ctx.scheduler.runAfter(0, sendCareEmail, {
        to,
        subject: `We've got your booking with ${physioName}`,
        greetingName: (booking.guestName || patient?.firstName || "").split(" ")[0] || undefined,
        heading: "Your booking is in",
        paragraphs: [
            `Thanks for booking ${service?.name ?? "your session"} with ${physioName} on ${when} (Lagos time). Your payment went through.`,
            `${physioName} will confirm by ${lagosDateTime(dueAt)}. We'll email you as soon as they do${booking.isOnline ? ", with your video link" : ""}.`,
            "If they can't make it, you can choose another physiotherapist at the same time or get a full refund.",
        ],
        buttonLabel: "View your booking",
        buttonUrl: `${publicAppUrl()}/dashboard/patient/appointments`,
    });
}

/** Tells the physio a paid request is waiting, and by when they need to answer. */
export async function askPhysioToRespond(ctx: any, booking: Doc<"marketplaceBookings">, dueAt: number) {
    if (!booking.physiotherapistId) return;
    const service = booking.serviceId ? getService(booking.serviceId) : undefined;
    const patient = (await ctx.db.get(booking.patientId)) as Doc<"users"> | null;
    const patientName = booking.guestName || [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") || "A patient";
    const physio = (await ctx.db.get(booking.physiotherapistId)) as Doc<"users"> | null;
    const body = `${patientName} booked ${service?.name ?? "a session"} for ${booking.sessionDate ? lagosDateTime(booking.sessionDate) : "a time to agree"}. Accept or decline by ${lagosDateTime(dueAt)}.`;
    await insertNotification(ctx, {
        userId: booking.physiotherapistId,
        type: "appointment_scheduled",
        priority: "high",
        status: "pending",
        payload: {
            title: "New booking: please accept",
            body,
            data: { entityType: "marketplace_booking", entityId: booking._id, actionUrl: "/dashboard/physiotherapist/appointments" },
        },
        createdAt: Date.now(),
    });
    // A push 10 minutes before the request goes to someone else
    await scheduleAcceptReminder(ctx, booking, dueAt);
    if (physio?.email) {
        await ctx.scheduler.runAfter(0, sendCareEmail, {
            to: physio.email,
            subject: `New booking from ${patientName}: accept by ${lagosDateTime(dueAt)}`,
            greetingName: physio.firstName ?? undefined,
            heading: "You have a new booking",
            paragraphs: [
                body,
                `Your payout for this session is ₦${Math.round((booking.payoutKobo ?? booking.physiotherapistEarnings) / 100).toLocaleString("en-NG")}${booking.travelPhysioShareKobo ? ` plus ₦${Math.round(booking.travelPhysioShareKobo / 100).toLocaleString("en-NG")} travel` : ""}.`,
                "If you don't answer in time, we'll offer the patient another physiotherapist.",
            ],
            buttonLabel: "Accept or decline",
            buttonUrl: `${publicAppUrl()}/dashboard/physiotherapist/appointments`,
            footnote: "You're receiving this because you're a Rehabify network physiotherapist.",
        });
    }
}

/**
 * Makes a paid booking real: the appointment, the patient–physio link, the invoice that drives
 * the payout, notifications and emails. Runs at payment, or when the physio accepts.
 */
export async function activatePaidBooking(
    ctx: any,
    booking: Doc<"marketplaceBookings">,
    args: { bookingId: Id<"marketplaceBookings">; paymentReference: string },
    options: CompletionOptions,
    paystackFeeActual: number | undefined
) {
        if (!booking.physiotherapistId) throw new Error("Booking has no physiotherapist assigned");
        await ctx.db.patch(args.bookingId, { bookingStatus: "confirmed", updatedAt: Date.now() });

        // Create appointment
        const service = booking.serviceId ? getService(booking.serviceId) : undefined;
        const appointmentId = await ctx.db.insert("appointments", {
            patientId: booking.patientId,
            physiotherapistId: booking.physiotherapistId,
            startTime: booking.sessionDate || Date.now() + 24 * 60 * 60 * 1000, // Tomorrow if not set
            endTime:
                (booking.sessionDate || Date.now() + 24 * 60 * 60 * 1000) +
                booking.sessionDuration * 60 * 1000,
            serviceType: service?.name ?? booking.sessionType,
            status: "confirmed",
            appointmentType: booking.isOnline ? "telehealth" : "in-person",
            isOnline: booking.isOnline,
            location: booking.isOnline ? undefined : booking.patientAddress,
            // A physio-scheduled follow-up's note is for the patient; an accepted request's note is the patient's own
            ...(booking.fromPatientRequest ? { notesForTherapist: booking.patientNotes } : { notesForPatient: booking.patientNotes }),
        });

        // Link appointment to booking
        await ctx.db.patch(args.bookingId, {
            appointmentId,
        });

        // Create or get patient-physio relationship
        const existingRelationship = await ctx.db
            .query("patientPhysiotherapistRelationships")
            .withIndex("by_patient_and_physiotherapist", (q) =>
                q
                    .eq("patientId", booking.patientId)
                    .eq("physiotherapistId", booking.physiotherapistId)
            )
            .first();

        let relationshipId;
        if (!existingRelationship) {
            // Create new relationship
            relationshipId = await ctx.db.insert(
                "patientPhysiotherapistRelationships",
                {
                    patientId: booking.patientId,
                    physiotherapistId: booking.physiotherapistId,
                    status: "active",
                    isPrimaryPhysiotherapist: true,
                    startDate: Date.now(),
                    notes: "Relationship created through marketplace booking",
                    source: "marketplace",
                }
            );

            await ctx.db.patch(args.bookingId, {
                relationshipCreated: true,
                patientPhysioRelationshipId: relationshipId,
            });
        } else {
            relationshipId = existingRelationship._id;
            // Paid through Rehabify: later sessions with this physio are Rehabify Care too
            await tagPaidRehabifyRelationship(ctx, existingRelationship, "marketplace");
            await ctx.db.patch(args.bookingId, {
                relationshipCreated: false, // Already existed
                patientPhysioRelationshipId: relationshipId,
            });
        }

        // ── Auto-create Treatment Plan for package bookings ───────────────
        const isPackage = (booking.packageSessions ?? 1) > 1;
        if (isPackage) {
            const sessions = booking.packageSessions ?? 1;
            const discountPct = booking.packageDiscountPercent ?? 0;
            const condLabel = booking.conditionLabel ?? "General physiotherapy";
            const condLevel = booking.conditionLevel ?? "standard";

            const condLevelLabel: Record<string, string> = {
                standard: "Standard Care",
                moderate: "Advanced Care",
                complex: "Specialized Neurological Care",
            };

            const planId = await ctx.db.insert("treatmentPlans", {
                patientId: booking.patientId,
                physiotherapistId: booking.physiotherapistId,
                title: `${condLabel} — ${sessions}-Session Package`,
                description: `${sessions}-session package booked via Rehabify Marketplace. ${discountPct > 0 ? `${discountPct}% package discount applied.` : ""}`,
                startDate: Date.now(),
                status: "active",
                priority: "medium",
                goals: [{
                    description: `Complete all ${sessions} pre-paid sessions`,
                    targetValue: `${sessions} sessions`,
                    timeline: "As scheduled with your physiotherapist",
                    measurable: true,
                }],
                phases: [{
                    name: "Package Sessions",
                    description: `${sessions} pre-paid sessions — ${condLevelLabel[condLevel] ?? condLevel}. Condition: ${condLabel}.`,
                    duration: `${sessions} sessions`,
                    order: 1,
                    exercises: [],
                }],
                notes: `Package booking via marketplace.\nCondition: ${condLabel} (${condLevel})\nSessions: ${sessions}\nDiscount: ${discountPct}%\nPayment ref: ${args.paymentReference}`,
                reviewInterval: 7,
                version: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            } as any);

            // Link treatment plan back to booking
            await ctx.db.patch(args.bookingId, { treatmentPlanId: planId } as any);
        }

        // Record commission transaction
        await ctx.db.insert("marketplaceTransactions", {
            userId: booking.physiotherapistId,
            type: "booking_commission",
            bookingId: args.bookingId,
            commissionRate: 0, // Fixed fee
            amount: booking.platformFee,
            currency: "NGN",
            status: "completed",
            paymentReference: args.paymentReference,
            description: `Marketplace commission for booking #${args.bookingId}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            completedAt: Date.now(),
        });

        // ── Partner commission (from the partner's contract) ───────
        // Under standard pricing the travel charge is excluded (it covers the physio's travel)
        // and the physio's share is their fixed payout, not a percentage.
        const commissionGross = booking.pricingModel
            ? booking.serviceAmount - (booking.travelSurchargeKobo ?? 0)
            : booking.serviceAmount;
        const commissionPhysio = booking.pricingModel ? booking.payoutKobo : undefined;
        const patientUserRecord = await ctx.db.get(booking.patientId);
        const referringPartnerCode = booking.partnerId || patientUserRecord?.referredByPartnerCode;
        if (referringPartnerCode) {
            const now = Date.now();
            const billingPeriod = `${new Date(now).getUTCFullYear()}-${String(new Date(now).getUTCMonth() + 1).padStart(2, "0")}`;
            const physioUserRecord = await ctx.db.get(booking.physiotherapistId);
            const physioName = physioUserRecord ? `${physioUserRecord.firstName || ""} ${physioUserRecord.lastName || ""}`.trim() : "Physiotherapist";
            const patientName = booking.guestName || (patientUserRecord ? `${patientUserRecord.firstName || ""} ${patientUserRecord.lastName || ""}`.trim() : "Patient");
            const careMode: "virtual" | "in_person" = booking.isOnline ? "virtual" : "in_person";

            // The booking's stored attribution was validated when it was created; a
            // linked referral is used only if it belongs to the same partner.
            let referral = booking.referralId ? await ctx.db.get(booking.referralId) : null;
            if (referral && referral.partnerId !== referringPartnerCode) referral = null;
            const environment = referral ? referralEnv(referral) : "live";

            await recordPartnerCommission(ctx, {
                partnerCode: referringPartnerCode,
                environment,
                idempotencyKey: `payment:${args.paymentReference}`,
                grossKobo: options.paymentMethod === "free" ? 0 : commissionGross,
                physiotherapistKobo: commissionPhysio,
                paymentMethod: options.paymentMethod === "bank_transfer" ? "bank_transfer" : "paystack",
                paymentReference: args.paymentReference,
                source: options.paymentMethod === "bank_transfer" ? "bank_transfer" : "marketplace",
                referralId: referral?._id,
                bookingId: booking._id,
                linkId: booking.referralLinkId ?? patientUserRecord?.referralLinkId,
                patientUserId: booking.patientId,
                patientName,
                trackingCode: referral?.trackingCode,
                physiotherapistId: booking.physiotherapistId,
                physiotherapistName: physioName,
                careMode,
                earnedAt: now,
            });
            await bumpLinkCounter(ctx, booking.referralLinkId ?? patientUserRecord?.referralLinkId, "payments");

            if (referral && environment === "live") {
                if (!referral.assignedPhysiotherapistId) {
                    await markProviderMatched(ctx, referral._id, booking.physiotherapistId, { actorType: "system", actorId: "marketplace_payment" });
                }
                const publicStatus = toPublicStatus(referral.status);
                if (publicStatus === "received" || publicStatus === "contacted") {
                    await transitionReferral(ctx, referral._id, "booked", {
                        actorType: "system",
                        actorId: "marketplace_payment",
                        metadata: { bookingId: booking._id, paymentReference: args.paymentReference },
                        extraPatch: { bookingId: booking._id },
                    });
                }
            }
        }

        // Auto-onboard patient if necessary (ensure dashboard access)
        if (!booking.isGuestBooking) {
            const patientUser = await ctx.db.get(booking.patientId);
            // Only an account without a role becomes a patient; a physio or clinic booking care keeps theirs
            if (patientUser && !patientUser.role) {
                await ctx.db.patch(booking.patientId, {
                    role: "patient",
                    onboarded: true,
                } as any);
            }
            await ensureUserNumbers(ctx, booking.patientId);
            // Ensure patient profile exists
            const existingPatientProfile = await ctx.db
                .query("patientProfiles")
                .withIndex("by_user_id", (q: any) => q.eq("userId", booking.patientId))
                .first();
            if (!existingPatientProfile) {
                await ctx.db.insert("patientProfiles", {
                    userId: booking.patientId,
                } as any);
            }
        }

        // Update physiotherapist stats
        const physioProfile = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_user_id", (q) =>
                q.eq("userId", booking.physiotherapistId)
            )
            .first();

        if (physioProfile) {
            await ctx.db.patch(physioProfile._id, {
                bookingsThroughMarketplace:
                    (physioProfile.bookingsThroughMarketplace || 0) + 1,
                totalMarketplaceEarnings:
                    (physioProfile.totalMarketplaceEarnings || 0) +
                    booking.physiotherapistEarnings,
            });
        }

        // Compose names and context for emails/notifications
        const physiotherapistUser = await ctx.db.get(booking.physiotherapistId);
        const patient = await ctx.db.get(booking.patientId);
        const patientName = patient ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim() : "Patient";
        const physiotherapistName = physiotherapistUser ? `${physiotherapistUser.firstName || ""} ${physiotherapistUser.lastName || ""}`.trim() : "Physiotherapist";

        // Initialize clinic info
        let clinicName = "Rehabify Health";
        let clinicAddress = "";
        let meetingLink = "";

        // For ONLINE sessions, create video call FIRST to get meeting link
        if (booking.isOnline) {
            try {
                // For MARKETPLACE bookings, ALWAYS use GetStream (built-in video)
                // Physiotherapist's videoPlatformPreference is ignored for marketplace
                const preferredPlatform = 'stream' as const;

                // Log for debugging

                if (preferredPlatform === 'stream') {
                    // Create Stream video call
                    const streamCallId = `call-${appointmentId}-${Date.now()}`;
                    const appBase = publicAppUrl();
                    meetingLink = `${appBase}/video-call/${streamCallId}`;

                    const callId = await ctx.runMutation(internal.videoCalls.createVideoCallRecord, {
                        roomId: streamCallId,
                        streamCallId: streamCallId,
                        meetingLink: meetingLink,
                        platform: 'stream' as const,
                        appointmentId: appointmentId,
                        initiatorId: booking.physiotherapistId,
                        participants: [booking.patientId, booking.physiotherapistId],
                        callType: "appointment" as const,
                        title: `Appointment: ${patientName}`,
                        settings: {
                            recordingEnabled: false,
                            chatEnabled: true,
                            maxParticipants: 2,
                            waitingRoomEnabled: false,
                            screenShareEnabled: true,
                            prejoinUiEnabled: true,
                            ejectAtRoomExp: true,
                            language: "en",
                            geo: "us-west",
                        },
                    });

                    // Update appointment with meeting link
                    await ctx.db.patch(appointmentId, {
                        meetingLink: meetingLink,
                        videoCallId: callId,
                        isOnline: true,
                    });

                } else if (preferredPlatform === 'google_meet') {
                    // For Google Meet, schedule creation (link will be added later)
                    try {
                        await ctx.scheduler.runAfter(0, api.calendar.nodeActions.createEvent as any, {
                            userId: booking.physiotherapistId,
                            appointmentId: appointmentId,
                            summary: `Appointment with ${patientName}`,
                            description: `Physiotherapy session booked via Rehabify Health Marketplace.\n\nPatient Notes: ${booking.patientNotes || 'None'}`,
                            startTime: booking.sessionDate || Date.now() + 24 * 60 * 60 * 1000,
                            endTime: (booking.sessionDate || Date.now() + 24 * 60 * 60 * 1000) + booking.sessionDuration * 60 * 1000,
                            attendees: patient?.email ? [{ email: patient.email, displayName: patientName }] : undefined,
                            createMeetLink: true,
                            timeZone: 'Africa/Lagos',
                        });
                        await ctx.db.patch(appointmentId, {
                            googleCalendarEventId: 'pending',
                            isOnline: true,
                        } as any);
                        meetingLink = "Google Meet link will be sent separately";
                    } catch (calError) {
                        console.error('Failed to create Google Calendar event:', calError);
                    }
                }

                // For online sessions, use meeting link as the "clinic" info
                clinicName = "Online Video Call";
                clinicAddress = meetingLink; // This will show the actual URL in the email!
            } catch (error) {
                console.error('Failed to create video call for marketplace booking:', error);
                clinicName = "Online Video Call";
                clinicAddress = "Link will be available in your dashboard";
            }
        } else if (booking.patientAddress) {
            // Home visit: the physio comes to the patient
            clinicName = "Home visit";
            clinicAddress = booking.patientAddress;
        } else if (physioProfile && (physioProfile as any).clinicId) {
            const clinic = await ctx.db.get((physioProfile as any).clinicId);
            if (clinic) {
                clinicName = (clinic as any).name || clinicName;
                clinicAddress = (clinic as any).address || "";
            }
        }

        const start = booking.sessionDate || Date.now() + 24 * 60 * 60 * 1000;
        const end = start + booking.sessionDuration * 60 * 1000;
        // Lagos time: the Convex runtime is UTC, which put every time an hour early
        const appointmentTimeStr = lagosTimeRange(start, end);

        // Notifications - patient
        await insertNotification(ctx, {
            userId: booking.patientId,
            type: "appointment_scheduled",
            priority: "medium",
            status: "pending",
            payload: {
                title: "Appointment Scheduled",
                body: `Your appointment has been scheduled for ${lagosDateTime(start)}`,
                data: {
                    entityId: appointmentId,
                    entityType: "appointment",
                    actionUrl: "/dashboard/patient/appointments",
                },
            },
            createdAt: Date.now(),
        } as any);

        // Notifications - provider
        await insertNotification(ctx, {
            userId: booking.physiotherapistId,
            type: "appointment_scheduled",
            priority: "medium",
            status: "pending",
            payload: {
                title: "Appointment Created",
                body: `Appointment scheduled with ${patientName}`,
                data: {
                    entityId: appointmentId,
                    entityType: "appointment",
                    actionUrl: "/dashboard/physiotherapist/appointments",
                },
            },
            createdAt: Date.now(),
        } as any);

        // Schedule emails (best-effort)
        if (patient?.email) {
            await ctx.scheduler.runAfter(0, api["actions/emails/sendAppointmentScheduledEmail"].sendAppointmentScheduledEmail as any, {
                to: patient.email,
                patientName,
                physiotherapistName,
                appointmentDate: start,
                appointmentTime: appointmentTimeStr,
                clinicName,
                clinicAddress,
                calendarLink: "/dashboard/patient/appointments",
                rescheduleLink: "/dashboard/patient/appointments",
            });
        }
        const physioEmail = physiotherapistUser?.email as string | undefined;
        if (physioEmail) {
            await ctx.scheduler.runAfter(0, api["actions/emails/sendAppointmentConfirmedProviderEmail"].sendAppointmentConfirmedProviderEmail as any, {
                to: physioEmail,
                patientName,
                physiotherapistName,
                appointmentDate: start,
                appointmentTime: appointmentTimeStr,
                viewLink: "/dashboard/physiotherapist/appointments",
                subjectOverride: `Appointment confirmed: ${patientName}`,
            });
        }
        
        // --- Billing and Receipts ---
        const actualPatientEmail = (booking as any).guestEmail || patient?.email || "";
        const actualPatientPhone = (booking as any).guestPhone || patient?.phoneNumber || "";
        const actualPatientName = (booking as any).guestName || patientName;

        // The paid invoice: shows in billing dashboards and drives the physio's payout
        await ensureMarketplaceInvoice(ctx, { ...booking, paystackFeeActualKobo: paystackFeeActual ?? booking.paystackFeeActualKobo }, appointmentId, {
            reference: args.paymentReference,
            method: options.paymentMethod,
            paidKobo: options.paidAmountKobo,
        });

        // Send payment receipts: what was actually charged (all-inclusive)
        const chargedKobo = options.paymentMethod === "free" ? 0 : options.paidAmountKobo || booking.serviceAmount;
        const receiptData = {
            patientName: actualPatientName,
            physiotherapistName: physiotherapistName,
            amount: chargedKobo,
            currency: "NGN",
            paymentReference: args.paymentReference,
            date: Date.now(),
            bookingId: args.bookingId,
            patientEmail: actualPatientEmail,
            patientPhone: actualPatientPhone,
        };

        // The patient's receipt was issued when they paid (issueBookingReceipt)
        // The physio's email names their payout (the current tariff figures)
        if (physioEmail) {
            // The physio sees their payout, not what the patient paid Rehabify
            await ctx.scheduler.runAfter(0, api["actions/emails/sendPaymentReceiptEmail"].sendPaymentReceiptEmail as any, {
                ...receiptData,
                amount: booking.physiotherapistEarnings,
                to: physioEmail,
                recipientName: physiotherapistName,
                role: "physiotherapist",
                subjectOverride: `Booking paid: ${actualPatientName}. Your payout after the session: ₦${Math.round(booking.physiotherapistEarnings / 100).toLocaleString("en-NG")}`,
            });
        }
        // The team is told by issueBookingReceipt (helpers/adminPaymentAlerts.ts), at the ADMIN_EMAIL inboxes

        // Video call creation is now handled earlier in the function

        return {
            success: true,
            appointmentId,
            relationshipId,
        };
}

async function paystackVerify(reference: string) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error("Payment service not configured");
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.status || !data.data) return null;
    return data.data as { status: string; amount: number; currency: string; reference: string; fees?: number; metadata?: any };
}

/** Applies verified Paystack evidence to a marketplace booking (internal). */
export const completeVerifiedMarketplacePayment = internalMutation({
    args: {
        bookingId: v.id("marketplaceBookings"),
        reference: v.string(),
        amountKobo: v.number(),
        currency: v.string(),
        feesKobo: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        if (args.currency !== "NGN") return { success: false, reason: "currency_mismatch" };
        const booking = await ctx.db.get(args.bookingId);
        if (!booking || booking.sourceSystem === "joy_ai") return { success: false, reason: "not_a_marketplace_booking" };
        return completeMarketplaceBookingCore(ctx, args.bookingId, {
            paymentReference: args.reference,
            paymentMethod: "paystack",
            paidAmountKobo: args.amountKobo,
            paystackFeeKobo: args.feesKobo,
        });
    },
});

/**
 * Called by the payment callback page: re-verifies the transaction with Paystack
 * server-side and completes the booking it belongs to. Safe to call repeatedly.
 */
export const verifyMarketplacePayment = action({
    args: { reference: v.string() },
    handler: async (ctx, args): Promise<any> => {
        const reference = args.reference.trim();
        if (!/^MKT_[A-Za-z0-9_]+$/.test(reference)) return { success: false, status: "invalid_reference" };
        const tx = await paystackVerify(reference);
        if (!tx) return { success: false, status: "not_found" };
        if (tx.status !== "success") return { success: false, status: tx.status };
        const bookingId = tx.metadata?.bookingId;
        if (typeof bookingId !== "string") return { success: false, status: "missing_booking" };
        const normalized = await ctx.runQuery(internal.marketplace.booking.normalizeBookingId, { bookingId });
        if (!normalized) return { success: false, status: "missing_booking" };
        const result: any = await ctx.runMutation(internal.marketplace.booking.completeVerifiedMarketplacePayment, {
            bookingId: normalized,
            reference,
            amountKobo: tx.amount,
            currency: tx.currency,
            feesKobo: typeof tx.fees === "number" ? tx.fees : undefined,
        });
        const status = result?.cancelled ? "paid_after_cancel" : result?.needsNewTime ? "needs_new_time" : result?.success ? "success" : result?.reason ?? "failed";
        return { success: Boolean(result?.success), status, needsNewTime: Boolean(result?.needsNewTime), bookingId: normalized };
    },
});

export const normalizeBookingId = internalQuery({
    args: { bookingId: v.string() },
    handler: async (ctx, args) => ctx.db.normalizeId("marketplaceBookings", args.bookingId),
});

/**
 * Paystack charge webhook for marketplace bookings (MKT_ references). The signature is
 * verified here, inside Convex, so this public entry point cannot fake a payment.
 */
export const recordMarketplacePaystackWebhook = mutation({
    args: { rawBody: v.string(), signature: v.string() },
    handler: async (ctx, args) => {
        if (!(await verifyPaystackSignature(args.rawBody, args.signature))) throw new Error("Invalid Paystack webhook signature");
        let payload: any;
        try {
            payload = JSON.parse(args.rawBody);
        } catch {
            throw new Error("Invalid webhook payload");
        }
        const data = payload?.data ?? {};
        const reference = typeof data.reference === "string" ? data.reference : "";
        if (!reference.startsWith("MKT_")) return { handled: false };

        if (payload.event === "charge.success") {
            const bookingId = typeof data.metadata?.bookingId === "string" ? ctx.db.normalizeId("marketplaceBookings", data.metadata.bookingId) : null;
            if (!bookingId) return { handled: true, success: false, reason: "missing_booking" };
            if (data.currency !== "NGN") return { handled: true, success: false, reason: "currency_mismatch" };
            const booking = await ctx.db.get(bookingId);
            if (!booking || booking.sourceSystem === "joy_ai") return { handled: true, success: false, reason: "not_a_marketplace_booking" };
            const result = await completeMarketplaceBookingCore(ctx, bookingId, {
                paymentReference: reference,
                paymentMethod: "paystack",
                paidAmountKobo: Number(data.amount) || 0,
                paystackFeeKobo: Number.isFinite(Number(data.fees)) ? Number(data.fees) : undefined,
            });
            return { handled: true, ...result };
        }
        return { handled: false };
    },
});

/**
 * Paystack refund webhook (refund.processed) for every payment type (helpers/paymentRefunds.ts):
 * a full refund undoes the purchase, a partial one is recorded and flagged for the team.
 * Signature verified inside Convex.
 */
export const recordPaystackRefundWebhook = mutation({
    args: { rawBody: v.string(), signature: v.string() },
    handler: async (ctx, args) => {
        if (!(await verifyPaystackSignature(args.rawBody, args.signature))) throw new Error("Invalid Paystack webhook signature");
        let payload: any;
        try {
            payload = JSON.parse(args.rawBody);
        } catch {
            throw new Error("Invalid webhook payload");
        }
        if (payload?.event !== "refund.processed") return { handled: false };
        // Every payment type, idempotent per refund, partial refunds kept partial
        return await applyPaystackRefund(ctx, payload.data ?? {});
    },
});

/**
 * Confirms a genuinely free session (legacy: physios who charged nothing). Every Rehabify
 * service has a price, so standard-priced bookings always go through payment.
 */
export const confirmFreeMarketplaceBooking = mutation({
    args: { bookingId: v.id("marketplaceBookings") },
    handler: async (ctx, args) => {
        const booking = await ctx.db.get(args.bookingId);
        if (!booking || booking.sourceSystem === "joy_ai") throw new ConvexError("Booking not found.");
        if (booking.paymentStatus === "completed") return { success: true, alreadyCompleted: true };
        if (booking.pricingModel || booking.serviceAmount !== 0 || !booking.physiotherapistId) {
            throw new ConvexError("This booking requires payment.");
        }
        const identity = await ctx.auth.getUserIdentity();
        if (!booking.isGuestBooking) {
            const user = identity
                ? await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject)).unique()
                : null;
            if (!user || user._id !== booking.patientId) throw new ConvexError("Only the patient can confirm this booking.");
        }
        const profile = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", booking.physiotherapistId))
            .first();
        const charges = [profile?.initialConsultRate, profile?.hourlyRate, profile?.virtualConsultationRate, profile?.inPersonConsultationRate]
            .some((rate) => typeof rate === "number" && rate > 0);
        if (charges) throw new ConvexError("This physiotherapist charges for sessions — please complete payment.");
        return completeMarketplaceBookingCore(ctx, args.bookingId, {
            paymentReference: `FREE_${args.bookingId}`,
            paymentMethod: "free",
            paidAmountKobo: 0,
        });
    },
});

/**
 * Get booking details
 */
export const getBookingDetails = query({
    args: {
        bookingId: v.id("marketplaceBookings"),
    },

    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .first();

        if (!user) {
            throw new Error("User not found");
        }

        const booking = await ctx.db.get(args.bookingId);
        if (!booking) {
            throw new Error("Booking not found");
        }

        if (
            booking.patientId !== user._id &&
            booking.physiotherapistId !== user._id
        ) {
            throw new Error("Access denied");
        }

        const physio = await ctx.db.get(booking.physiotherapistId);
        const patient = await ctx.db.get(booking.patientId);

        // Physios only ever see their payout, never what the patient paid
        const visible =
            booking.patientId === user._id
                ? booking
                : Object.fromEntries(
                      Object.entries(booking).filter(
                          ([key]) => key === "physiotherapistEarnings" || !/amount|price|charge|fee|quote|refund/i.test(key)
                      )
                  );

        return {
            ...visible,
            physiotherapist: physio
                ? { id: physio._id, fullName: `${physio.firstName} ${physio.lastName}`, imageUrl: physio.imageUrl }
                : null,
            patient: patient
                ? { id: patient._id, fullName: `${patient.firstName} ${patient.lastName}`, imageUrl: patient.imageUrl }
                : null,
            serviceAmount: booking.serviceAmount / 100,
            platformFee: booking.platformFee / 100,
            paystackFee: booking.paystackFee / 100,
            totalAmount: booking.totalAmount / 100,
            physiotherapistEarnings: booking.physiotherapistEarnings / 100,
        };
    },
});

/**
 * Cancel marketplace booking
 */
export const cancelMarketplaceBooking = mutation({
    args: {
        bookingId: v.id("marketplaceBookings"),
        cancellationReason: v.string(),
    },

    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .first();

        if (!user) {
            throw new Error("User not found");
        }

        const booking = await ctx.db.get(args.bookingId);
        if (!booking) {
            throw new Error("Booking not found");
        }

        if (
            booking.patientId !== user._id &&
            booking.physiotherapistId !== user._id
        ) {
            throw new Error("Access denied");
        }

        if (booking.paymentStatus !== "completed") {
            throw new Error("Cannot cancel unpaid booking");
        }

        await ctx.db.patch(args.bookingId, {
            bookingStatus: "cancelled",
            cancellationReason: args.cancellationReason,
            updatedAt: Date.now(),
        });
        await queueJoyBookingCancelled(ctx, booking, {
            cancelledBy: user._id === booking.patientId ? "patient" : "physiotherapist",
        });

        if (booking.appointmentId) {
            await ctx.db.patch(booking.appointmentId, {
                status:
                    user._id === booking.patientId
                        ? "cancelled_by_patient"
                        : "cancelled_by_therapist",
                cancellationReason: args.cancellationReason,
            });
        }

        return { success: true };
    },
});

/**
 * Reconcile guest bookings with a newly created user account
 */
export const claimGuestBookings = internalMutation({
    args: {
        userId: v.id("users"),
        email: v.string(),
    },
    handler: async (ctx, args) => {
        const guestBookings = await ctx.db
            .query("marketplaceBookings")
            .filter((q) => q.eq(q.field("isGuestBooking"), true))
            .filter((q) => q.eq(q.field("guestEmail"), args.email))
            .collect();

        let claimedCount = 0;
        const guestUserIds: Id<"users">[] = [];

        for (const booking of guestBookings) {
            const oldPatientId = booking.patientId;
            guestUserIds.push(oldPatientId);

            await ctx.db.patch(booking._id, {
                patientId: args.userId,
                isGuestBooking: false,
            });

            if (booking.appointmentId) {
                await ctx.db.patch(booking.appointmentId, {
                    patientId: args.userId,
                });
            }

            if (booking.paymentReference) {
                const invoicesToFix = await ctx.db
                    .query("invoices")
                    .withIndex("by_patient", (q) => q.eq("patientId", oldPatientId))
                    .filter(q => q.eq(q.field("paymentReference"), booking.paymentReference))
                    .collect();
                    
                for (const inv of invoicesToFix) {
                    await ctx.db.patch(inv._id, { patientId: args.userId });
                }
            }

            if (booking.patientPhysioRelationshipId) {
                await ctx.db.patch(booking.patientPhysioRelationshipId, {
                    patientId: args.userId,
                });
            }
            
            if (booking.treatmentPlanId) {
                await ctx.db.patch(booking.treatmentPlanId, {
                    patientId: args.userId,
                });
            }

            claimedCount++;
        }

        if (claimedCount > 0) {
            const user = await ctx.db.get(args.userId);
            // Never overwrite a staff role (physio, clinic, doctor) that shares the guest's email
            if (user && !user.role) {
                await ctx.db.patch(args.userId, {
                    role: "patient",
                    onboarded: true,
                });
            }
            const existingPatientProfile = await ctx.db
                .query("patientProfiles")
                .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
                .first();
            if (!existingPatientProfile) {
                await ctx.db.insert("patientProfiles", {
                    userId: args.userId,
                });
            }
            await adoptGuestPatientNumber(ctx, args.userId, guestUserIds);
        }

        return { claimedCount };
    },
});

/**
 * Get recent marketplace bookings for a physiotherapist
 * Used in the Physiotherapist dashboard "New Bookings" widget
 */
export const getRecentBookings = query({
    args: {
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            return [];
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .first();

        if (!user) {
            return [];
        }

        // Get bookings for this physiotherapist, most recent first
        const bookings = await ctx.db
            .query("marketplaceBookings")
            .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id))
            .order("desc")
            .take(args.limit || 5);

        // Fetch patient details for each booking
        return Promise.all(
            bookings.map(async (booking) => {
                let patientName = "Guest User";
                let patientEmail = booking.guestEmail || "";
                
                if (!booking.isGuestBooking) {
                    const patient = await ctx.db.get(booking.patientId);
                    if (patient) {
                        patientName = `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || "Patient";
                        patientEmail = patient.email || patientEmail;
                    }
                } else if (booking.guestName) {
                    patientName = booking.guestName;
                }

                return {
                    ...booking,
                    patientName,
                    patientEmail,
                };
            })
        );
    },
});

