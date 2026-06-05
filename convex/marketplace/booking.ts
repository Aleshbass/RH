// @ts-nocheck
/**
 * Marketplace Booking & Payment System
 * Handles booking creation, payment processing, and commission splits
 */

import { v } from "convex/values";
import { mutation, action, internalMutation } from "../_generated/server";
import { api, internal } from "../_generated/api";

/**
 * Calculate fees for marketplace booking
 * Platform: 20% + Paystack: 1.5% + ₦100
 */
function calculateMarketplaceFees(serviceAmount: number) {
    // serviceAmount is in kobo
    const platformFee = 1000 * 100; // Fixed ₦1,000 in kobo
    const paystackPercentage = 0.015; // 1.5%
    const paystackFlat = 100 * 100; // ₦100 in kobo

    // Paystack fee on (service + platform fee)
    const chargeableAmount = serviceAmount + platformFee;
    const paystackFee = Math.round(
        chargeableAmount * paystackPercentage + paystackFlat
    );

    // Total amount to charge patient
    const totalAmount = chargeableAmount + paystackFee;

    // Physiotherapist earnings (service amount)
    const physiotherapistEarnings = serviceAmount;

    return {
        serviceAmount,
        platformFee,
        paystackFee,
        totalAmount,
        physiotherapistEarnings,
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

        if (
            !physioProfile ||
            !physioProfile.isAvailableOnMarketplace
        ) {
            throw new Error("Physiotherapist not available for booking");
        }

        // Calculate fees
        const fees = calculateMarketplaceFees(args.serviceAmount);

        // Determine effective session type
        const effectiveSessionType =
            args.packageSessions && args.packageSessions > 1 ? "package" : args.sessionType;

        // Create booking
        const bookingId = await ctx.db.insert("marketplaceBookings", {
            physiotherapistId: args.physiotherapistId,
            patientId: patient._id,
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
            // Package fields
            packageSessions: args.packageSessions ?? 1,
            packageDiscountPercent: args.packageDiscountPercent ?? 0,
            sessionsRemaining: args.packageSessions ?? 1,
            conditionLabel: args.conditionLabel,
            conditionLevel: args.conditionLevel,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        return {
            bookingId,
            fees,
        };
    },
});

/**
 * Guest Booking — no Clerk auth required.
 * Used when patients check out without creating an account.
 * Stores guestEmail + guestPhone on the booking record.
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
    },

    handler: async (ctx, args) => {
        // No auth check — guests are allowed
        const physioProfile = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", args.physiotherapistId))
            .first();

        if (!physioProfile || !physioProfile.isAvailableOnMarketplace) {
            throw new Error("Physiotherapist not available for booking");
        }

        const fees = calculateMarketplaceFees(args.serviceAmount);
        const effectiveSessionType =
            args.packageSessions && args.packageSessions > 1 ? "package" : args.sessionType;

        // Guest users don't have a patientId — use physiotherapistId as placeholder
        // The booking will be linked to a real patient after they sign up (future enhancement)
        const bookingId = await ctx.db.insert("marketplaceBookings", {
            physiotherapistId: args.physiotherapistId,
            patientId: args.physiotherapistId, // placeholder — overridden on account creation
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

        return { bookingId, fees };
    },
});

/**
 * Get marketplace booking by ID (for server-side use by payment API)
 */
export const getMarketplaceBooking = query({
    args: { bookingId: v.id("marketplaceBookings") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.bookingId);
    },
});

/**
 * Complete marketplace booking after payment
 * Called by Paystack webhook or payment confirmation
 */
export const completeMarketplaceBooking = mutation({
    args: {
        bookingId: v.id("marketplaceBookings"),
        paymentReference: v.string(),
    },

    handler: async (ctx, args) => {
        const booking = await ctx.db.get(args.bookingId);
        if (!booking) {
            throw new Error("Booking not found");
        }

        // Update booking
        await ctx.db.patch(args.bookingId, {
            paymentStatus: "completed",
            bookingStatus: "confirmed",
            paymentReference: args.paymentReference,
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

        // Auto-onboard patient if necessary (ensure dashboard access)
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
                    const appBase = process.env.NEXT_PUBLIC_APP_URL || 'https://physioaroundme.com';
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
        // Video call creation is now handled earlier in the function

        return {
            success: true,
            appointmentId,
            relationshipId,
        };
    },
});

/**
 * Get booking details
 */
export const getBookingDetails = mutation({
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

        // Verify user is part of the booking
        if (
            booking.patientId !== user._id &&
            booking.physiotherapistId !== user._id
        ) {
            throw new Error("Access denied");
        }

        // Get physiotherapist and patient details
        const physio = await ctx.db.get(booking.physiotherapistId);
        const patient = await ctx.db.get(booking.patientId);

        return {
            ...booking,
            physiotherapist: physio
                ? {
                    id: physio._id,
                    fullName: `${physio.firstName} ${physio.lastName}`,
                    imageUrl: physio.imageUrl,
                }
                : null,
            patient: patient
                ? {
                    id: patient._id,
                    fullName: `${patient.firstName} ${patient.lastName}`,
                    imageUrl: patient.imageUrl,
                }
                : null,
            serviceAmount: booking.serviceAmount / 100, // Convert to Naira
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

        // Verify user is part of the booking
        if (
            booking.patientId !== user._id &&
            booking.physiotherapistId !== user._id
        ) {
            throw new Error("Access denied");
        }

        // Only allow cancellation if payment is completed
        if (booking.paymentStatus !== "completed") {
            throw new Error("Cannot cancel unpaid booking");
        }

        await ctx.db.patch(args.bookingId, {
            bookingStatus: "cancelled",
            cancellationReason: args.cancellationReason,
            updatedAt: Date.now(),
        });

        // If appointment exists, cancel it too
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
