const fs = require('fs');
const file = 'c:/Users/PC/Downloads/RH-main/RH-main/convex/marketplace/booking.ts';
let code = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const startIdx = code.indexOf('/**\n * Get booking details\n */\nexport const getBookingDetails = query({');
const endStr = '        return { claimedCount };\n    },\n});';
const endIdx = code.indexOf(endStr, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    const before = code.substring(0, startIdx);
    const after = code.substring(endIdx + endStr.length);
    
    const replacement = `/**
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
                ? { id: physio._id, fullName: \`\${physio.firstName} \${physio.lastName}\`, imageUrl: physio.imageUrl }
                : null,
            patient: patient
                ? { id: patient._id, fullName: \`\${patient.firstName} \${patient.lastName}\`, imageUrl: patient.imageUrl }
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
});`;
    
    fs.writeFileSync(file, before + replacement + after, 'utf8');
    console.log("Success");
} else {
    console.log("Failed to find boundaries: startIdx=" + startIdx + " endIdx=" + endIdx);
}
