// @ts-nocheck
/**
 * Marketplace Booking & Payment System
 * Handles booking creation, payment processing, and commission splits
 */

import { v, ConvexError } from "convex/values";
import { mutation, action, internalMutation, internalQuery, query } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { publicAppUrl } from "../helpers/appUrl";
import { attributionForBooking, bumpLinkCounter } from "../helpers/partnerAttribution";
import { recordPartnerCommission, reverseCommissionsForPayment } from "../helpers/partnerLedger";
import { isPhysioBookable } from "../physioSetup";
import { markProviderMatched, transitionReferral } from "../helpers/partnerEvents";
import { referralEnv, toPublicStatus } from "../helpers/partnerShared";
import { verifyPaystackSignature } from "../helpers/paystackSignature";
import { resolveServiceAmountKobo } from "../helpers/marketplacePricing";

async function latestRevenueSettings(ctx: any) {
    return await ctx.db.query("platformRevenueSettings").order("desc").first();
}

/**
 * Calculate fees for marketplace booking
 * Platform Revenue Split: 80% Physiotherapist, 10% Rehabify, 10% Partner Referral
 * Payment Processing: Paystack 1.5% + ₦100
 */
function calculateMarketplaceFees(serviceAmount: number) {
    // serviceAmount is in kobo (e.g. 600,000 for ₦6,000 virtual or 1,000,000 for ₦10,000 in-person)
    const paystackPercentage = 0.015; // 1.5%
    const paystackFlat = 100 * 100; // ₦100 in kobo

    const paystackFee = Math.round(serviceAmount * paystackPercentage + paystackFlat);
    const totalAmount = serviceAmount + paystackFee;

    // 80% to Physiotherapist
    const physiotherapistEarnings = Math.round(serviceAmount * 0.80);
    // 10% to Rehabify
    const platformFee = Math.round(serviceAmount * 0.10);
    // 10% to Referring Partner
    const partnerEarnings = serviceAmount - physiotherapistEarnings - platformFee;

    return {
        serviceAmount,
        platformFee,
        paystackFee,
        totalAmount,
        physiotherapistEarnings,
        partnerEarnings,
    };
}

/**
 * Create a marketplace booking (before payment)
 */
export const createMarketplaceBooking = mutation({
    args: {
        physiotherapistId: v.id("users"),
        sessionType: v.string(), // "initial_consult", "follow_up", "package"
        sessionDate: v.optional(v.number()),
        sessionDuration: v.number(), // minutes
        isOnline: v.boolean(),
        serviceAmount: v.number(), // in kobo — full package total if packageSessions > 1
        patientNotes: v.optional(v.string()),
        // Package fields
        packageSessions: v.optional(v.number()),        // 1 | 4 | 8 | 12
        packageDiscountPercent: v.optional(v.number()), // 0–15
        conditionLabel: v.optional(v.string()),
        conditionLevel: v.optional(v.string()),
        patientAddress: v.optional(v.string()), // For in-person sessions
        referralPublicCode: v.optional(v.string()), // Partner referral-link code from the attribution cookie
    },

    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("You must be logged in to book a session");
        }

        // Get patient user
        const patient = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .first();

        if (!patient) {
            throw new Error("User not found");
        }

        // Verify physiotherapist exists and is available
        const physioProfile = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", args.physiotherapistId))
            .first();

        // Approved by Rehabify, listed, and setup finished (hours, payout, documents)
        if (!physioProfile || !(await isPhysioBookable(ctx, args.physiotherapistId))) {
            throw new ConvexError("This physiotherapist isn't taking bookings right now.");
        }

        // The amount is never taken on trust: it must be a price the booking page can show
        // for this physio and package (physios without a rate get the ₦6k / ₦10k default).
        const effectiveServiceAmount = resolveServiceAmountKobo(
            physioProfile,
            { serviceAmountKobo: args.serviceAmount, packageSessions: args.packageSessions, isOnline: args.isOnline },
            await latestRevenueSettings(ctx)
        );

        // Calculate fees & 80/10/10 split
        const fees = calculateMarketplaceFees(effectiveServiceAmount);
        const careMode: "virtual" | "in_person" = args.isOnline ? "virtual" : "in_person";

        // Determine effective session type
        const effectiveSessionType =
            args.packageSessions && args.packageSessions > 1 ? "package" : args.sessionType;

        // Partner attribution is resolved server-side (validated link / linked referral).
        const attribution = await attributionForBooking(ctx, patient, args.referralPublicCode);

        // Create booking
        const bookingId = await ctx.db.insert("marketplaceBookings", {
            physiotherapistId: args.physiotherapistId,
            patientId: patient._id,
            sessionType: effectiveSessionType,
            sessionDate: args.sessionDate,
            sessionDuration: args.sessionDuration,
            isOnline: args.isOnline,
            careMode,
            patientAddress: args.patientAddress,
            serviceAmount: fees.serviceAmount,
            platformFee: fees.platformFee,
            paystackFee: fees.paystackFee,
            totalAmount: fees.totalAmount,
            physiotherapistEarnings: fees.physiotherapistEarnings,
            rehabifyEarnings: fees.platformFee,
            partnerEarnings: fees.partnerEarnings,
            partnerId: attribution.partnerId,
            referralId: attribution.referralId,
            referralLinkId: attribution.referralLinkId,
            sourceSystem: "rh_marketplace_web",
            paymentStatus: "pending",
            bookingStatus: "pending_payment",
            patientNotes: args.patientNotes,
            // Package fields
            packageSessions: args.packageSessions ?? 1,
            packageDiscountPercent: args.packageDiscountPercent ?? 0,
            sessionsRemaining: args.packageSessions ?? 1,
            conditionLabel: args.conditionLabel,
            conditionLevel: args.conditionLevel,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        await bumpLinkCounter(ctx, attribution.referralLinkId, "bookings");

        return {
            bookingId,
            fees,
        };
    },
});

/**
 * Guest Booking — no Clerk auth required.
 * Used when patients check out without creating an account.
 * Creates a lightweight guest user record (clerkId: "guest-{uuid}") so
 * patientId is a valid FK and admin queries resolve correctly.
 * When the guest later signs up, claimGuestBookings re-links everything.
 */
export const guestCreateMarketplaceBooking = mutation({
    args: {
        physiotherapistId: v.id("users"),
        sessionType: v.string(),
        sessionDate: v.optional(v.number()),
        sessionDuration: v.number(),
        isOnline: v.boolean(),
        serviceAmount: v.number(), // in kobo
        patientNotes: v.optional(v.string()),
        packageSessions: v.optional(v.number()),
        packageDiscountPercent: v.optional(v.number()),
        conditionLabel: v.optional(v.string()),
        conditionLevel: v.optional(v.string()),
        patientAddress: v.optional(v.string()),
        guestEmail: v.string(),
        guestPhone: v.optional(v.string()),
        guestName: v.optional(v.string()),
        referralPublicCode: v.optional(v.string()), // Partner referral-link code from the attribution cookie
    },

    handler: async (ctx, args) => {
        // No auth check — guests are allowed
        const physioProfile = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", args.physiotherapistId))
            .first();

        if (!physioProfile || !(await isPhysioBookable(ctx, args.physiotherapistId))) {
            throw new ConvexError("This physiotherapist isn't taking bookings right now.");
        }

        // ── Create (or reuse) a guest user record so patientId is a real FK ──
        // Check if a guest user already exists with this email
        let guestUserId: typeof args.physiotherapistId;

        const existingGuestUser = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.guestEmail))
            .first();

        if (existingGuestUser) {
            // Only reuse earlier guest records. A registered account must sign in, otherwise
            // anyone could attach bookings to someone else's account by typing their email.
            if (!String(existingGuestUser.clerkId ?? "").startsWith("guest-")) {
                throw new ConvexError("An account already exists for this email. Please sign in to book.");
            }
            guestUserId = existingGuestUser._id;
        } else {
            // Create a minimal guest user record
            const guestClerkId = `guest-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
            const nameParts = (args.guestName || "").split(" ").filter(Boolean);
            guestUserId = await ctx.db.insert("users", {
                clerkId: guestClerkId,
                email: args.guestEmail,
                phoneNumber: args.guestPhone,
                firstName: nameParts[0] || "Guest",
                lastName: nameParts.slice(1).join(" ") || "",
                role: "patient",
                onboarded: false,   // Not onboarded — no Clerk session yet
            });
        }

        const fees = calculateMarketplaceFees(
            resolveServiceAmountKobo(
                physioProfile,
                { serviceAmountKobo: args.serviceAmount, packageSessions: args.packageSessions, isOnline: args.isOnline },
                await latestRevenueSettings(ctx)
            )
        );
        const effectiveSessionType =
            args.packageSessions && args.packageSessions > 1 ? "package" : args.sessionType;

        // Guest checkouts carry partner attribution too (validated link code).
        const guestUser = await ctx.db.get(guestUserId);
        const attribution = guestUser ? await attributionForBooking(ctx, guestUser, args.referralPublicCode) : {};

        const bookingId = await ctx.db.insert("marketplaceBookings", {
            physiotherapistId: args.physiotherapistId,
            patientId: guestUserId,        // ← real FK, not a placeholder
            partnerId: attribution.partnerId,
            referralId: attribution.referralId,
            referralLinkId: attribution.referralLinkId,
            sourceSystem: "rh_marketplace_web",
            careMode: args.isOnline ? "virtual" : "in_person",
            rehabifyEarnings: fees.platformFee,
            partnerEarnings: fees.partnerEarnings,
            sessionType: effectiveSessionType,
            sessionDate: args.sessionDate,
            sessionDuration: args.sessionDuration,
            isOnline: args.isOnline,
            patientAddress: args.patientAddress,
            serviceAmount: fees.serviceAmount,
            platformFee: fees.platformFee,
            paystackFee: fees.paystackFee,
            totalAmount: fees.totalAmount,
            physiotherapistEarnings: fees.physiotherapistEarnings,
            paymentStatus: "pending",
            bookingStatus: "pending_payment",
            patientNotes: args.patientNotes,
            packageSessions: args.packageSessions ?? 1,
            packageDiscountPercent: args.packageDiscountPercent ?? 0,
            sessionsRemaining: args.packageSessions ?? 1,
            conditionLabel: args.conditionLabel,
            conditionLevel: args.conditionLevel,
            guestEmail: args.guestEmail,
            guestPhone: args.guestPhone,
            guestName: args.guestName,
            isGuestBooking: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        } as any);
        await bumpLinkCounter(ctx, attribution.referralLinkId, "bookings");

        return { bookingId, fees };
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
        };
    },
});

type CompletionOptions = {
    paymentReference: string;
    paymentMethod: "paystack" | "bank_transfer" | "free";
    paidAmountKobo: number;
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
                paidAt: Date.now(),
                updatedAt: Date.now(),
            });
            return { success: true, cancelled: true };
        }

        // Update booking
        await ctx.db.patch(args.bookingId, {
            paymentStatus: "completed",
            paymentMethod: options.paymentMethod === "bank_transfer" ? "bank_transfer" : "paystack",
            bookingStatus: "confirmed",
            paymentReference: args.paymentReference,
            paidAmountKobo: options.paidAmountKobo,
            careMode: booking.isOnline ? "virtual" : "in_person",
            paidAt: Date.now(),
            updatedAt: Date.now(),
        });

        // Create appointment
        const appointmentId = await ctx.db.insert("appointments", {
            patientId: booking.patientId,
            physiotherapistId: booking.physiotherapistId,
            startTime: booking.sessionDate || Date.now() + 24 * 60 * 60 * 1000, // Tomorrow if not set
            endTime:
                (booking.sessionDate || Date.now() + 24 * 60 * 60 * 1000) +
                booking.sessionDuration * 60 * 1000,
            serviceType: booking.sessionType,
            status: "confirmed",
            notesForPatient: booking.patientNotes,
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

        // ── Record Transparent Partner Commission (80/10/10 Split) ───────
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
                grossKobo: options.paymentMethod === "free" ? 0 : booking.serviceAmount,
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
            if (patientUser && patientUser.role !== "patient") {
                await ctx.db.patch(booking.patientId, {
                    role: "patient",
                    onboarded: true,
                } as any);
            }
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
                console.log('Creating GetStream video call for online marketplace booking');

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

                    console.log('Successfully created GetStream video call:', {
                        callId,
                        meetingLink,
                        appointmentId,
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
        } else {
            // For in-person sessions, get clinic info
            if (physioProfile && (physioProfile as any).clinicId) {
                const clinic = await ctx.db.get((physioProfile as any).clinicId);
                if (clinic) {
                    clinicName = (clinic as any).name || clinicName;
                    clinicAddress = (clinic as any).address || "";
                }
            }
        }

        const start = booking.sessionDate || Date.now() + 24 * 60 * 60 * 1000;
        const end = start + booking.sessionDuration * 60 * 1000;
        const appointmentTimeStr = `${new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        // Notifications - patient
        await ctx.db.insert("notifications", {
            userId: booking.patientId,
            type: "appointment_scheduled",
            priority: "medium",
            status: "pending",
            payload: {
                title: "Appointment Scheduled",
                body: `Your appointment has been scheduled for ${new Date(start).toLocaleDateString()}`,
                data: {
                    entityId: appointmentId,
                    entityType: "appointment",
                    actionUrl: "/dashboard/patient/appointments",
                },
            },
            createdAt: Date.now(),
        } as any);

        // Notifications - provider
        await ctx.db.insert("notifications", {
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
                rescheduleLink: `/book/${booking.physiotherapistId}/${booking.sessionDuration || 30}`,
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

        // Auto-generate invoice so it shows in billing dashboards
        const invoiceNumber = `INV-MKT-${Date.now()}`;
        await ctx.db.insert("invoices", {
            patientId: booking.patientId,
            physiotherapistId: booking.physiotherapistId,
            invoiceNumber,
            items: [{
                description: `Marketplace Booking: ${booking.sessionType} (${booking.sessionDuration} mins)`,
                quantity: 1,
                unitPrice: booking.serviceAmount,
                totalPrice: booking.serviceAmount
            }],
            subtotalAmount: booking.serviceAmount,
            platformFeeAmount: booking.platformFee,
            paystackFeeAmount: booking.paystackFee,
            totalAmount: booking.totalAmount,
            currency: "NGN",
            issueDate: Date.now(),
            dueDate: Date.now(),
            status: "paid",
            paymentDate: Date.now(),
            paymentMethod: "paystack",
            paymentReference: args.paymentReference,
            physiotherapistShare: booking.physiotherapistEarnings,
            platformShare: booking.platformFee,
            feeBreakdown: {
                subtotal: booking.serviceAmount,
                discount: 0,
                platformFee: booking.platformFee,
                paystackPercentage: 0.015,
                paystackFlat: 10000,
                total: booking.totalAmount,
                physiotherapistEarnings: booking.physiotherapistEarnings,
            },
            notes: `Marketplace booking | Patient: ${actualPatientName} (${actualPatientEmail})${actualPatientPhone ? ` | Phone: ${actualPatientPhone}` : ''}`,
            relatedAppointmentIds: [appointmentId],
        } as any);

        // Send payment receipts
        const receiptData = {
            patientName: actualPatientName,
            physiotherapistName: physiotherapistName,
            amount: booking.totalAmount,
            currency: "NGN",
            paymentReference: args.paymentReference,
            date: Date.now(),
            bookingId: args.bookingId,
            patientEmail: actualPatientEmail,
            patientPhone: actualPatientPhone,
        };

        if (actualPatientEmail) {
            await ctx.scheduler.runAfter(0, api["actions/emails/sendPaymentReceiptEmail"].sendPaymentReceiptEmail as any, {
                ...receiptData,
                to: actualPatientEmail,
                recipientName: actualPatientName,
                role: "patient"
            });
        }
        if (physioEmail) {
            await ctx.scheduler.runAfter(0, api["actions/emails/sendPaymentReceiptEmail"].sendPaymentReceiptEmail as any, {
                ...receiptData,
                to: physioEmail,
                recipientName: physiotherapistName,
                role: "physiotherapist"
            });
        }
        // Send to admin (hello)
        await ctx.scheduler.runAfter(0, api["actions/emails/sendPaymentReceiptEmail"].sendPaymentReceiptEmail as any, {
            ...receiptData,
            to: "hello@physioaroundme.com",
            recipientName: "Admin",
            role: "admin"
        });
        
        // Send to admin (billing)
        await ctx.scheduler.runAfter(0, api["actions/emails/sendPaymentReceiptEmail"].sendPaymentReceiptEmail as any, {
            ...receiptData,
            to: "billing@physioaroundme.com",
            recipientName: "Billing",
            role: "admin"
        });

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
    return data.data as { status: string; amount: number; currency: string; reference: string; metadata?: any };
}

/** Applies verified Paystack evidence to a marketplace booking (internal). */
export const completeVerifiedMarketplacePayment = internalMutation({
    args: { bookingId: v.id("marketplaceBookings"), reference: v.string(), amountKobo: v.number(), currency: v.string() },
    handler: async (ctx, args) => {
        if (args.currency !== "NGN") return { success: false, reason: "currency_mismatch" };
        const booking = await ctx.db.get(args.bookingId);
        if (!booking || booking.sourceSystem === "joy_ai") return { success: false, reason: "not_a_marketplace_booking" };
        return completeMarketplaceBookingCore(ctx, args.bookingId, {
            paymentReference: args.reference,
            paymentMethod: "paystack",
            paidAmountKobo: args.amountKobo,
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
        });
        return { success: Boolean(result?.success), status: result?.success ? "success" : result?.reason ?? "failed", bookingId: normalized };
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
            });
            return { handled: true, ...result };
        }
        return { handled: false };
    },
});

/**
 * Paystack refund webhook (refund.processed): marks the booking refunded and reverses the
 * partner commission earned on that payment. Signature verified inside Convex.
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
        const data = payload.data ?? {};
        const reference: string =
            (typeof data.transaction_reference === "string" && data.transaction_reference) ||
            (typeof data.transaction?.reference === "string" && data.transaction.reference) ||
            "";
        if (!reference) return { handled: false };
        const booking = await ctx.db
            .query("marketplaceBookings")
            .withIndex("by_payment_reference", (q) => q.eq("paymentReference", reference))
            .first();
        if (booking && booking.paymentStatus !== "refunded") {
            await ctx.db.patch(booking._id, { paymentStatus: "refunded", updatedAt: Date.now() });
            if (booking.referralId) {
                const referral = await ctx.db.get(booking.referralId);
                if (referral && toPublicStatus(referral.status) !== "completed" && toPublicStatus(referral.status) !== "cancelled") {
                    await transitionReferral(ctx, referral._id, "refunded", { actorType: "system", actorId: "paystack_refund", metadata: { reference } });
                }
            }
        }
        const reversal = await reverseCommissionsForPayment(ctx, reference, "Patient payment refunded");
        return { handled: true, bookingFound: Boolean(booking), ...reversal };
    },
});

/**
 * Confirms a genuinely free session (the physiotherapist charges nothing). Paid bookings
 * can only be completed from verified Paystack evidence.
 */
export const confirmFreeMarketplaceBooking = mutation({
    args: { bookingId: v.id("marketplaceBookings") },
    handler: async (ctx, args) => {
        const booking = await ctx.db.get(args.bookingId);
        if (!booking || booking.sourceSystem === "joy_ai") throw new ConvexError("Booking not found.");
        if (booking.paymentStatus === "completed") return { success: true, alreadyCompleted: true };
        if (booking.serviceAmount !== 0 || !booking.physiotherapistId) throw new ConvexError("This booking requires payment.");
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

        return {
            ...booking,
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

        for (const booking of guestBookings) {
            const oldPatientId = booking.patientId;

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
            if (user && user.role !== "patient") {
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
