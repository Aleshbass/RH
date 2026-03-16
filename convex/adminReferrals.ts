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

/**
 * Auto-update a referral's commission earned from a webhook (no auth required)
 */
export const webhookUpdateReferralPayout = mutation({
    args: {
        referralId: v.id("inboundReferrals"),
        amountPaidOut: v.number(), // Amount in kobo
    },
    handler: async (ctx, args) => {
        const referral = await ctx.db.get(args.referralId);
        if (!referral) {
            console.error("Referral not found for webhook tracking:", args.referralId);
            return;
        }

        const newCommission = (referral.commissionEarned || 0) + args.amountPaidOut;
        
        await ctx.db.patch(args.referralId, {
            status: "paid_out",
            commissionEarned: newCommission,
            updatedAt: Date.now(),
        });

        // Also create a log entry for the audit trail
        await ctx.db.insert("auditLogs", {
            action: "referral_payout_webhook",
            targetEntityType: "inboundReferrals",
            targetEntityId: args.referralId,
            timestamp: Date.now(),
            details: {
                previousAmount: referral.commissionEarned || 0,
                amountAdded: args.amountPaidOut,
                newTotal: newCommission,
            }
        });

        return args.referralId;
    }
});
