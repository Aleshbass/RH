import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ensureUserRole } from "./auth";

/**
 * Get all inbound referrals for admin processing
 */
export const getInboundReferrals = query({
    args: {},
    handler: async (ctx) => {
        await ensureUserRole(ctx, ["admin"]);

        const referrals = await ctx.db
            .query("inboundReferrals")
            .order("desc")
            .collect();

        // Join with doctor profiles to get referring doctor details
        const enrichedReferrals = await Promise.all(
            referrals.map(async (referral) => {
                const doctor = await ctx.db.get(referral.referringDoctorId);
                let doctorProfile = null;
                if (doctor && doctor.doctorProfileId) {
                    doctorProfile = await ctx.db.get(doctor.doctorProfileId);
                }

                return {
                    ...referral,
                    doctorName: doctor ? `${doctor.firstName} ${doctor.lastName}` : "Unknown",
                    doctorEmail: doctor?.email,
                    doctorProfile,
                };
            })
        );

        return enrichedReferrals;
    },
});

/**
 * Update the status of an inbound referral
 */
export const updateReferralStatus = mutation({
    args: {
        referralId: v.id("inboundReferrals"),
        status: v.union(
            v.literal("pending"),
            v.literal("contacted"),
            v.literal("booked"),
            v.literal("completed"),
            v.literal("paid_out"),
            v.literal("cancelled")
        ),
        clinicalNotes: v.optional(v.string()), // Optionally append admin notes
        commissionEarned: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        await ensureUserRole(ctx, ["admin"]);

        const referral = await ctx.db.get(args.referralId);
        if (!referral) {
            throw new Error("Referral not found");
        }

        const updates: any = {
            status: args.status,
            updatedAt: Date.now(),
        };

        if (args.clinicalNotes !== undefined) {
            updates.clinicalNotes = args.clinicalNotes;
        }

        if (args.commissionEarned !== undefined) {
            updates.commissionEarned = args.commissionEarned;
        }

        await ctx.db.patch(args.referralId, updates);
        return args.referralId;
    },
});
