// @ts-nocheck
/**
 * Admin Marketplace Bookings
 * - List all bookings with full guest/patient info
 * - Reassign a specific patient's booking to a different physiotherapist
 * - List all approved physios for reassignment dropdown
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { ensureUserRole } from "../auth";

/**
 * Get all marketplace bookings for the admin view.
 * Properly resolves guest info (name/email/phone) even for non-authed bookings.
 */
export const adminGetAllMarketplaceBookings = query({
  args: {
    status: v.optional(v.string()),   // "all" | "confirmed" | "pending_payment" | "cancelled"
    search: v.optional(v.string()),   // patient name or email search
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    let bookingsQuery = ctx.db.query("marketplaceBookings").order("desc");

    const allBookings = await bookingsQuery.collect();

    // Enrich bookings with patient and physio details
    const enriched = await Promise.all(
      allBookings.map(async (booking) => {
        // ── Patient Info ──
        let patientName = "Guest";
        let patientEmail = booking.guestEmail || "";
        let patientPhone = booking.guestPhone || "";
        let isGuest = Boolean(booking.isGuestBooking);

        if (!booking.isGuestBooking) {
          const patient = await ctx.db.get(booking.patientId);
          if (patient) {
            patientName =
              `${patient.firstName || ""} ${patient.lastName || ""}`.trim() ||
              patient.email ||
              "Patient";
            patientEmail = patient.email || "";
            patientPhone = patient.phoneNumber || "";
          }
        } else {
          // Guest: use stored guest fields
          patientName = booking.guestName || booking.guestEmail || "Guest";
          isGuest = true;
        }

        // ── Physio Info ──
        const physio = booking.physiotherapistId ? await ctx.db.get(booking.physiotherapistId) : null;
        let physioName = booking.adminSchedulingStatus === "awaiting_schedule" ? "Awaiting admin assignment" : "Unassigned";
        let physioEmail = "";
        let physioLocation = "";
        let physioOffersOnline = false;
        let physioOffersInPerson = false;

        if (physio) {
          physioName =
            `${physio.firstName || ""} ${physio.lastName || ""}`.trim() ||
            "Physiotherapist";
          physioEmail = physio.email || "";

          const physioProfile = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", booking.physiotherapistId))
            .first();

          if (physioProfile) {
            physioLocation = physioProfile.location || "";
            physioOffersOnline = physioProfile.offersOnlineSessions ?? false;
            physioOffersInPerson = physioProfile.offersInPersonSessions ?? false;
          }
        }

        return {
          _id: booking._id,
          createdAt: booking.createdAt,
          paidAt: booking.paidAt,
          sessionDate: booking.sessionDate,
          sessionType: booking.sessionType,
          sessionDuration: booking.sessionDuration,
          isOnline: booking.isOnline,
          packageSessions: booking.packageSessions,
          conditionLabel: booking.conditionLabel,

          // Status
          bookingStatus: booking.bookingStatus,
          paymentStatus: booking.paymentStatus,
          paymentReference: booking.paymentReference,

          // Amounts (in kobo — client divides by 100)
          totalAmount: booking.totalAmount,
          platformFee: booking.platformFee,
          physiotherapistEarnings: booking.physiotherapistEarnings,
          // Older Joy virtual bookings were created before their 100%
          // Rehabify allocation was recorded. Derive it here so reporting is
          // historically accurate while new bookings persist the value.
          rehabifyEarnings: booking.rehabifyEarnings ?? (
            booking.joyBookingRoute === "admin_scheduled_virtual" ? booking.totalAmount : booking.platformFee
          ),

          // Patient
          patientId: booking.patientId,
          patientName,
          patientEmail,
          patientPhone,
          isGuest,

          // Physio
          physiotherapistId: booking.physiotherapistId,
          physioName,
          physioEmail,
          physioLocation,
          physioOffersOnline,
          physioOffersInPerson,

          // Linked records
          appointmentId: booking.appointmentId,
          joyBookingRoute: booking.joyBookingRoute,
          joyConsultationType: booking.joyConsultationType,
          adminSchedulingStatus: booking.adminSchedulingStatus,
          patientPhysioRelationshipId: booking.patientPhysioRelationshipId,
          treatmentPlanId: booking.treatmentPlanId,
        };
      })
    );

    // Apply status filter
    let filtered = enriched;
    if (args.status && args.status !== "all") {
      filtered = filtered.filter((b) => (
        args.status === "payment_failed"
          ? b.paymentStatus === "failed"
          : b.bookingStatus === args.status
      ));
    }

    // Apply search filter (patient name or email)
    if (args.search && args.search.trim()) {
      const q = args.search.toLowerCase();
      filtered = filtered.filter(
        (b) =>
          b.patientName.toLowerCase().includes(q) ||
          b.patientEmail.toLowerCase().includes(q) ||
          b.physioName.toLowerCase().includes(q) ||
          b.paymentReference?.toLowerCase().includes(q)
      );
    }

    const total = filtered.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;
    const page = filtered.slice(offset, offset + limit);

    return { bookings: page, total };
  },
});

/**
 * Get all approved physiotherapists for the reassignment dropdown.
 * Returns id, name, location, online/in-person flags.
 */
export const adminGetAllPhysiosForSelect = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);

    // Only approved physios (those with approval status "approved")
    const approvedStatuses = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();

    const physioUsers = await Promise.all(
      approvedStatuses.map(async (s) => {
        const user = await ctx.db.get(s.userId);
        if (!user || user.role !== "physiotherapist") return null;

        const profile = await ctx.db
          .query("physiotherapistProfiles")
          .withIndex("by_user_id", (q) => q.eq("userId", user._id))
          .first();

        return {
          id: user._id,
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Physiotherapist",
          email: user.email || "",
          location: profile?.location || "",
          offersOnline: profile?.offersOnlineSessions ?? false,
          offersInPerson: profile?.offersInPersonSessions ?? false,
        };
      })
    );

    return physioUsers.filter(Boolean);
  },
});

/**
 * Reassign a specific booking (and all linked records) to a new physiotherapist.
 * Scope: transfers this patient's booking, appointment, relationship, and treatment plan only.
 */
export const adminReassignBookingPhysio = mutation({
  args: {
    bookingId: v.id("marketplaceBookings"),
    newPhysiotherapistId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");

    const oldPhysioId = booking.physiotherapistId;
    const newPhysioId = args.newPhysiotherapistId;

    if (oldPhysioId === newPhysioId) {
      throw new Error("New physiotherapist is the same as current one");
    }

    // Verify new physio exists and is a physiotherapist
    const newPhysio = await ctx.db.get(newPhysioId);
    if (!newPhysio || newPhysio.role !== "physiotherapist") {
      throw new Error("Target user is not a physiotherapist");
    }

    // 1. Update the booking
    await ctx.db.patch(args.bookingId, {
      physiotherapistId: newPhysioId,
      updatedAt: Date.now(),
    });

    // 2. Update the linked appointment
    if (booking.appointmentId) {
      await ctx.db.patch(booking.appointmentId, {
        physiotherapistId: newPhysioId,
      });
    }

    // 3. Update the patient-physio relationship
    if (booking.patientPhysioRelationshipId) {
      await ctx.db.patch(booking.patientPhysioRelationshipId, {
        physiotherapistId: newPhysioId,
        notes: `Reassigned by admin${args.reason ? `: ${args.reason}` : ""}. Previous physio: ${oldPhysioId}`,
      });
    } else {
      // Create a new relationship with the new physio if none existed
      const existingRel = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient_and_physiotherapist", (q) =>
          q.eq("patientId", booking.patientId).eq("physiotherapistId", newPhysioId)
        )
        .first();

      if (!existingRel) {
        await ctx.db.insert("patientPhysiotherapistRelationships", {
          patientId: booking.patientId,
          physiotherapistId: newPhysioId,
          status: "active",
          isPrimaryPhysiotherapist: true,
          startDate: Date.now(),
          notes: `Created via admin reassignment${args.reason ? `: ${args.reason}` : ""}`,
        });
      }
    }

    // 4. Update treatment plan if exists
    if (booking.treatmentPlanId) {
      await ctx.db.patch(booking.treatmentPlanId as any, {
        physiotherapistId: newPhysioId,
        updatedAt: Date.now(),
      });
    }

    // 5. Update physio earnings stats (deduct from old, add to new)
    if (booking.paymentStatus === "completed") {
      const oldProfile = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", oldPhysioId))
        .first();
      const newProfile = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", newPhysioId))
        .first();

      if (oldProfile) {
        await ctx.db.patch(oldProfile._id, {
          bookingsThroughMarketplace: Math.max(0, (oldProfile.bookingsThroughMarketplace || 0) - 1),
          totalMarketplaceEarnings: Math.max(0, (oldProfile.totalMarketplaceEarnings || 0) - booking.physiotherapistEarnings),
        });
      }
      if (newProfile) {
        await ctx.db.patch(newProfile._id, {
          bookingsThroughMarketplace: (newProfile.bookingsThroughMarketplace || 0) + 1,
          totalMarketplaceEarnings: (newProfile.totalMarketplaceEarnings || 0) + booking.physiotherapistEarnings,
        });
      }
    }

    // 6. Insert in-app notification for new physio
    await ctx.db.insert("notifications", {
      userId: newPhysioId,
      type: "appointment_scheduled",
      priority: "high",
      status: "pending",
      payload: {
        title: "Patient Assigned to You",
        body: `A booking has been reassigned to you by an admin.${args.reason ? ` Reason: ${args.reason}` : ""}`,
        data: {
          entityId: args.bookingId,
          entityType: "booking",
          actionUrl: "/dashboard/physiotherapist/appointments",
        },
      },
      createdAt: Date.now(),
    } as any);

    return { success: true, bookingId: args.bookingId, newPhysiotherapistId: newPhysioId };
  },
});
