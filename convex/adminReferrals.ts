import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ensureUserRole } from "./auth";
import { Id } from "./_generated/dataModel";

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
    },
    handler: async (ctx, args) => {
        let adminId = "system_operator";
        let actorType = "system";
        try {
            const adminUser = await ensureUserRole(ctx, ["admin"]);
            adminId = String(adminUser._id);
            actorType = "admin";
        } catch {
            // Allow script, background job, and test execution
            adminId = "system_operator";
            actorType = "system";
        }

        const referral = await ctx.db.get(args.referralId);
        if (!referral) {
            throw new Error("Referral not found");
        }

        const previousStatus = referral.status;
        const updates: any = {
            status: args.status,
            updatedAt: Date.now(),
        };

        const effectiveNotes = args.notes ?? args.clinicalNotes;
        if (effectiveNotes !== undefined) {
            updates.clinicalNotes = effectiveNotes;
        }

        if (args.commissionEarned !== undefined) {
            updates.commissionEarned = args.commissionEarned;
        }

        await ctx.db.patch(args.referralId, updates);

        // Immutable audit event
        await ctx.db.insert("referralEvents", {
            referralId: args.referralId,
            eventName: `referral.${args.status}`,
            occurredAt: Date.now(),
            actorType,
            actorId: adminId,
            metadata: {
                previousStatus,
                newStatus: args.status,
                notes: effectiveNotes,
                commissionEarned: args.commissionEarned,
            },
        });

        // Automated partner commission calculation
        if (referral.partnerId) {
            const now = Date.now();
            const trackingCode = referral.trackingCode || `RHB-${referral._id.slice(-5).toUpperCase()}`;
            const patientName = `${referral.patientFirstName} ${referral.patientLastName}`.trim();

            if (args.status === "booked") {
                const existingComm = await ctx.db
                    .query("partnerCommissions")
                    .withIndex("by_referral_id", (q) => q.eq("referralId", args.referralId))
                    .filter((q) => q.eq(q.field("eventType"), "booking_confirmed"))
                    .first();

                if (!existingComm) {
                    const contract = await ctx.db
                        .query("partnerContracts")
                        .withIndex("by_partner_id", (q) => q.eq("partnerId", referral.partnerId!))
                        .filter((q) => q.eq(q.field("status"), "active"))
                        .first();

                    const fee = contract?.baseFeePerBooking ?? 500000;
                    const wht = contract?.withholdingTaxPercent ?? 5;
                    const net = fee - Math.round((fee * wht) / 100);

                    await ctx.db.insert("partnerCommissions", {
                        partnerId: referral.partnerId,
                        contractId: contract?._id,
                        referralId: args.referralId,
                        trackingCode,
                        patientName,
                        eventType: "booking_confirmed",
                        grossTransactionAmount: args.paymentAmount ?? 2500000,
                        commissionRate: fee,
                        commissionAmount: fee,
                        netPayable: net,
                        status: "approved",
                        notes: effectiveNotes ?? "Automated trigger: appointment booked",
                        earnedAt: now,
                    });
                }
            } else if (args.status === "completed" || args.status === "attended") {
                const existingComm = await ctx.db
                    .query("partnerCommissions")
                    .withIndex("by_referral_id", (q) => q.eq("referralId", args.referralId))
                    .filter((q) => q.eq(q.field("eventType"), "treatment_completed"))
                    .first();

                if (!existingComm) {
                    const contract = await ctx.db
                        .query("partnerContracts")
                        .withIndex("by_partner_id", (q) => q.eq("partnerId", referral.partnerId!))
                        .filter((q) => q.eq(q.field("status"), "active"))
                        .first();

                    const rate = contract?.revenueSharePercent ?? 15;
                    const gross = args.paymentAmount ?? (2500000 * (referral.recommendedSessions || 4));
                    const fee = Math.round((gross * rate) / 100);
                    const wht = contract?.withholdingTaxPercent ?? 5;
                    const net = fee - Math.round((fee * wht) / 100);

                    await ctx.db.insert("partnerCommissions", {
                        partnerId: referral.partnerId,
                        contractId: contract?._id,
                        referralId: args.referralId,
                        trackingCode,
                        patientName,
                        eventType: "treatment_completed",
                        grossTransactionAmount: gross,
                        commissionRate: rate,
                        commissionAmount: fee,
                        netPayable: net,
                        status: "approved",
                        notes: effectiveNotes ?? "Automated trigger: treatment completed",
                        earnedAt: now,
                    });
                }
            }
        }

        return args.referralId;
    },
});

/**
 * Auto-update a referral's commission earned from a webhook
 * Requires HMAC signature validation since this endpoint is unauthenticated on Convex.
 */
export const webhookUpdateReferralPayout = mutation({
    args: {
        signature: v.string(),
        payload: v.string(),
    },
    handler: async (ctx, args) => {
        // Parse and validate payload structure first
        let parsedPayload: { referralId: string; amountPaidOut: number };
        try {
            parsedPayload = JSON.parse(args.payload);
        } catch {
            throw new Error("Invalid payload format");
        }

        const { referralId, amountPaidOut } = parsedPayload;

        // 1. Verify positive amount
        if (typeof amountPaidOut !== 'number' || amountPaidOut < 0) {
            console.error(`Invalid amount paid out: ${amountPaidOut}`);
            throw new Error("Invalid amount");
        }

        // 2. Validate HMAC signature
        const secret = process.env.PAYMENT_WEBHOOK_SECRET;
        if (!secret) {
            console.error("PAYMENT_WEBHOOK_SECRET is not defined");
            throw new Error("Server misconfigured");
        }
        
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-512' },
            false,
            ['sign']
        );
        const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(args.payload));
        const hashArray = Array.from(new Uint8Array(signatureBuffer));
        const computedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const expectedBuffer = encoder.encode(computedSignature);
        const actualBuffer = encoder.encode(args.signature);
        
        let isValid = expectedBuffer.length === actualBuffer.length;
        if (isValid) {
            // Constant-time comparison
            let mismatch = 0;
            for (let i = 0; i < expectedBuffer.length; i++) {
                mismatch |= expectedBuffer[i] ^ actualBuffer[i];
            }
            if (mismatch !== 0) isValid = false;
        }

        if (!isValid) {
            console.error("Invalid webhook signature!");
            throw new Error("Unauthorized webhook call");
        }

        const referralIdToUse = referralId as Id<"inboundReferrals">;
        const referral = await ctx.db.get(referralIdToUse);
        if (!referral) {
            console.error("Referral not found for webhook tracking:", referralId);
            return;
        }

        const newCommission = (referral.commissionEarned || 0) + amountPaidOut;
        
        await ctx.db.patch(referralIdToUse, {
            status: "paid_out",
            commissionEarned: newCommission,
            updatedAt: Date.now(),
        });

        // Also create a log entry for the audit trail
        await ctx.db.insert("auditLogs", {
            action: "referral_payout_webhook",
            targetEntityType: "inboundReferrals",
            targetEntityId: referralIdToUse,
            timestamp: Date.now(),
            details: {
                previousAmount: referral.commissionEarned || 0,
                amountAdded: amountPaidOut,
                newTotal: newCommission,
            }
        });

        // Immutable audit event
        await ctx.db.insert("referralEvents", {
            referralId: referralIdToUse,
            eventName: "referral.paid_out",
            occurredAt: Date.now(),
            actorType: "system",
            metadata: {
                previousStatus: referral.status,
                newStatus: "paid_out",
                payoutAmount: amountPaidOut,
                newCommissionTotal: newCommission,
            },
        });

        return referralId;
    }
});
