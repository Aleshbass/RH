// @ts-nocheck
/**
 * Marketplace Booking & Payment System
 * Handles booking creation, payment processing, and commission splits
 */

import { v } from "convex/values";
import { mutation, action, internalMutation } from "../_generated/server";
import { api } from "../_generated/api";

/**
 * Calculate fees for marketplace booking
 * Platform: 20% + Paystack: 1.5% + ₦100
 */
function calculateMarketplaceFees(serviceAmount: number) {
  // serviceAmount is in kobo
  const platformFeeRate = 0.2; // 20%
  const paystackPercentage = 0.015; // 1.5%
  const paystackFlat = 100 * 100; // ₦100 in kobo
  
  // Platform fee
  const platformFee = Math.round(serviceAmount * platformFeeRate);
  
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
    serviceAmount: v.number(), // in kobo
    patientNotes: v.optional(v.string()),
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
    
    // Create booking
    const bookingId = await ctx.db.insert("marketplaceBookings", {
      physiotherapistId: args.physiotherapistId,
      patientId: patient._id,
      sessionType: args.sessionType,
      sessionDate: args.sessionDate,
      sessionDuration: args.sessionDuration,
      isOnline: args.isOnline,
      serviceAmount: fees.serviceAmount,
      platformFee: fees.platformFee,
      paystackFee: fees.paystackFee,
      totalAmount: fees.totalAmount,
      physiotherapistEarnings: fees.physiotherapistEarnings,
      paymentStatus: "pending",
      bookingStatus: "pending_payment",
      patientNotes: args.patientNotes,
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
    
    // Record commission transaction
    await ctx.db.insert("marketplaceTransactions", {
      userId: booking.physiotherapistId,
      type: "booking_commission",
      bookingId: args.bookingId,
      commissionRate: 20, // 20%
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
    let clinicName = "Rehabify Health";
    let clinicAddress = "";
    if (physioProfile && (physioProfile as any).clinicId) {
      const clinic = await ctx.db.get((physioProfile as any).clinicId);
      if (clinic) {
        clinicName = (clinic as any).name || clinicName;
        clinicAddress = (clinic as any).address || "";
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

    // External calendar sync disabled: no Google Calendar events scheduled

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
