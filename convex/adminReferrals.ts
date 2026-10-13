import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ensureUserRole } from "./auth";
import { Id } from "./_generated/dataModel";
import { markProviderMatched, transitionReferral } from "./helpers/partnerEvents";
import { referralEnv } from "./helpers/partnerShared";

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
                const doctor = referral.referringDoctorId
                    ? await ctx.db.get(referral.referringDoctorId)
                    : null;
                let doctorProfile = null;
                if (doctor && "doctorProfileId" in doctor && doctor.doctorProfileId) {
                    doctorProfile = await ctx.db.get(doctor.doctorProfileId);
                }
                
                // Fetch doctor's verified bank accounts for payouts
                const bankAccounts = referral.referringDoctorId
                    ? await ctx.db
                        .query("doctorBankAccounts")
                        .withIndex("by_doctor_id", (q) => q.eq("doctorId", referral.referringDoctorId!))
                        .collect()
                    : [];
                const defaultBankAccount = bankAccounts.find((a: any) => a.isDefault) || bankAccounts[0] || null;
                
                // Fetch partner details if referral is partner-attributed
                let partner: any = null;
                if (referral.partnerId) {
                    partner = await ctx.db
                        .query("partners")
                        .withIndex("by_code", (q) => q.eq("code", referral.partnerId!))
                        .first();

                    if (!partner) {
                        try {
                            partner = await ctx.db.get(referral.partnerId as any);
                        } catch {
                            // ignore if not a valid Convex Id
                        }
                    }
                }

                const resolvedPartnerName = partner?.name || (referral.partnerId ? referral.partnerId : null);
                const resolvedPartnerCode = partner?.code || referral.partnerId || null;

                const docName = doctor && "firstName" in doctor
                    ? `${doctor.firstName || ""} ${doctor.lastName || ""}`.trim()
                    : (resolvedPartnerName || referral.hospitalClinic || "Partner Referral");

                const docEmail = doctor && "email" in doctor ? doctor.email : undefined;

                return {
                    ...referral,
                    doctorName: docName || "Unknown",
                    doctorEmail: docEmail,
                    doctorProfile,
                    doctorBankAccount: defaultBankAccount,
                    partnerName: resolvedPartnerName,
                    partnerCode: resolvedPartnerCode,
                    partnerType: partner?.type || null,
                    partnerLogoUrl: partner?.logoUrl || null,
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
            // Spec-compliant statuses
            v.literal("received"),
            v.literal("consent_pending"),
            v.literal("contacted"),
            v.literal("intake_started"),
            v.literal("intake_completed"),
            v.literal("qualified"),
            v.literal("redirected_for_safety"),
            v.literal("booked"),
            v.literal("attended"),
            v.literal("treatment_active"),
            v.literal("completed"),
            v.literal("cancelled"),
            v.literal("not_suitable"),
            v.literal("refunded"),
            v.literal("closed"),
            // Legacy statuses
            v.literal("pending"),
            v.literal("in_treatment"),
            v.literal("paid_out")
        ),
        clinicalNotes: v.optional(v.string()), // Optionally append admin notes
        notes: v.optional(v.string()),
        paymentAmount: v.optional(v.number()),
        commissionEarned: v.optional(v.number()),
        assignedPhysiotherapistId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        // Admins only: this changes referral state and notifies the partner (webhook).
        const adminUser = await ensureUserRole(ctx, ["admin"]);
        const adminId = String(adminUser._id);
        const actorType = "admin";

        const referral = await ctx.db.get(args.referralId);
        if (!referral) {
            throw new Error("Referral not found");
        }

        // Admin notes are recorded on the audit event; the partner's clinical notes are
        // never overwritten.
        const effectiveNotes = args.notes ?? args.clinicalNotes;
        const extraPatch: Record<string, unknown> = {};
        if (args.commissionEarned !== undefined) extraPatch.commissionEarned = args.commissionEarned;

        if (args.assignedPhysiotherapistId !== undefined) {
            await markProviderMatched(ctx, args.referralId, args.assignedPhysiotherapistId, {
                actorType,
                actorId: adminId,
            });
        }

        // Every status change goes through the shared lifecycle so the partner's
        // webhook (referral.<status>) and milestone timestamps stay consistent.
        // Commissions are NOT created here: they are earned only from verified payments.
        await transitionReferral(ctx, args.referralId, args.status, {
            actorType,
            actorId: adminId,
            metadata: { notes: effectiveNotes, environment: referralEnv(referral) },
            extraPatch: extraPatch as any,
        });

        return args.referralId;
    },
});

/**
 * Clinics a referral can be routed to (approved clinic owners only), for the admin routing picker.
 */
export const listClinicsForReferralRouting = query({
    args: {},
    handler: async (ctx) => {
        await ensureUserRole(ctx, ["admin"]);

        const clinics = await ctx.db.query("clinics").collect();
        const rows = await Promise.all(
            clinics.map(async (clinic) => {
                const approval = await ctx.db
                    .query("accountApprovalStatus")
                    .withIndex("by_user_id", (q) => q.eq("userId", clinic.ownerId))
                    .unique();
                if (approval?.status !== "approved") return null;
                return { _id: clinic._id, name: clinic.name, city: clinic.city || "" };
            })
        );
        return rows
            .filter((row): row is NonNullable<typeof row> => row !== null)
            .sort((a, b) => a.name.localeCompare(b.name));
    },
});

/**
 * Route a referral to a specific clinic. Only the assigned clinic can see the referral in its
 * dashboard; passing no clinicId removes the assignment.
 */
export const assignReferralToClinic = mutation({
    args: {
        referralId: v.id("inboundReferrals"),
        clinicId: v.optional(v.id("clinics")),
    },
    handler: async (ctx, args) => {
        const admin = await ensureUserRole(ctx, ["admin"]);

        const referral = await ctx.db.get(args.referralId);
        if (!referral) {
            throw new Error("Referral not found");
        }

        if (args.clinicId) {
            const clinic = await ctx.db.get(args.clinicId);
            if (!clinic) {
                throw new Error("Clinic not found");
            }
            const approval = await ctx.db
                .query("accountApprovalStatus")
                .withIndex("by_user_id", (q) => q.eq("userId", clinic.ownerId))
                .unique();
            if (approval?.status !== "approved") {
                throw new Error("Referrals can only be routed to approved clinics");
            }
        }

        const now = Date.now();
        await ctx.db.patch(args.referralId, {
            assignedClinicId: args.clinicId,
            updatedAt: now,
        });

        await ctx.db.insert("referralEvents", {
            referralId: args.referralId,
            eventName: args.clinicId ? "clinic.assigned" : "clinic.unassigned",
            occurredAt: now,
            actorType: "admin",
            actorId: String(admin._id),
            metadata: {
                previousClinicId: referral.assignedClinicId,
                clinicId: args.clinicId,
            },
        });

        return { success: true };
    },
});

/**
 * Directly assign an MRTBN-verified physiotherapist to an inbound referral.
 * Automatically transitions status to 'booked' and dispatches provider.matched webhook.
 */
export const assignPhysiotherapistToReferral = mutation({
    args: {
        referralId: v.id("inboundReferrals"),
        physiotherapistUserId: v.id("users"),
        clinicalNotes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const adminUser = await ensureUserRole(ctx, ["admin"]);
        const adminId = String(adminUser._id);

        const referral = await ctx.db.get(args.referralId);
        if (!referral) {
            throw new Error("Referral not found");
        }

        const physioUser = await ctx.db.get(args.physiotherapistUserId);
        if (!physioUser || physioUser.role !== "physiotherapist") {
            throw new Error("Assigned user must be a registered physiotherapist");
        }
        const approval = await ctx.db
            .query("accountApprovalStatus")
            .withIndex("by_user_id", (q) => q.eq("userId", args.physiotherapistUserId))
            .first();
        if (approval?.status !== "approved") {
            throw new Error("Assigned physiotherapist must have approved clinical credentials");
        }

        await markProviderMatched(ctx, args.referralId, args.physiotherapistUserId, {
            actorType: "admin",
            actorId: adminId,
            metadata: { notes: args.clinicalNotes },
        });

        const fresh = await ctx.db.get(args.referralId);
        return {
            success: true,
            referralId: args.referralId,
            assignedPhysiotherapistId: args.physiotherapistUserId,
            status: fresh?.status ?? referral.status,
        };
    },
});

// Referring-doctor payout webhooks are handled by monthlySettlements.recordPaystackTransferWebhook,
// which verifies the Paystack signature inside Convex.
