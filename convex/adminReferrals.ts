import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { ensureUserRole } from "./auth";
import { Doc, Id } from "./_generated/dataModel";
import { markProviderMatched, transitionReferral } from "./helpers/partnerEvents";
import { referralEnv } from "./helpers/partnerShared";

type ReferralStatus = Doc<"inboundReferrals">["status"];

/**
 * Intake-queue stages used by the admin referrals page. Every referral status (spec and
 * legacy) belongs to exactly one stage.
 */
const REFERRAL_STAGES = {
    new: ["received", "pending", "consent_pending"],
    contacted: ["contacted", "intake_started", "intake_completed", "qualified"],
    booked: ["booked", "attended"],
    in_treatment: ["treatment_active", "in_treatment"],
    completed: ["completed", "paid_out"],
    closed: ["closed", "cancelled", "not_suitable", "redirected_for_safety", "refunded"],
} as const satisfies Record<string, readonly ReferralStatus[]>;

type ReferralStage = keyof typeof REFERRAL_STAGES;
const STAGE_NAMES = Object.keys(REFERRAL_STAGES) as ReferralStage[];

const stageV = v.union(
    v.literal("new"),
    v.literal("contacted"),
    v.literal("booked"),
    v.literal("in_treatment"),
    v.literal("completed"),
    v.literal("closed")
);

const inStage = (stage: ReferralStage, status: ReferralStatus) =>
    (REFERRAL_STAGES[stage] as readonly ReferralStatus[]).includes(status);

/** Most rows one queue page returns, and most rows read when filtering one partner. */
const MAX_PAGE = 500;
const PARTNER_SCAN_CAP = 1000;
/** Stage counts stop at this many per stage (the UI shows "500+"). */
const STAGE_COUNT_CAP = 500;

async function loadReferralPage(
    ctx: QueryCtx,
    args: { stage?: ReferralStage; partnerId?: string },
    limit: number
): Promise<{ rows: Doc<"inboundReferrals">[]; hasMore: boolean }> {
    const statuses = args.stage ? (REFERRAL_STAGES[args.stage] as readonly ReferralStatus[]) : null;

    if (args.partnerId) {
        const partnerId = args.partnerId;
        const scanned = await ctx.db
            .query("inboundReferrals")
            .withIndex("by_partner_id", (q) => q.eq("partnerId", partnerId))
            .order("desc")
            .take(statuses ? PARTNER_SCAN_CAP : limit + 1);
        const matching = statuses ? scanned.filter((r) => statuses.includes(r.status)) : scanned;
        return { rows: matching.slice(0, limit), hasMore: matching.length > limit };
    }

    if (statuses) {
        const perStatus = await Promise.all(
            statuses.map((status) =>
                ctx.db
                    .query("inboundReferrals")
                    .withIndex("by_status", (q) => q.eq("status", status))
                    .order("desc")
                    .take(limit + 1)
            )
        );
        const merged = perStatus.flat().sort((a, b) => b._creationTime - a._creationTime);
        return { rows: merged.slice(0, limit), hasMore: merged.length > limit };
    }

    const rows = await ctx.db.query("inboundReferrals").order("desc").take(limit + 1);
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

const personName = (user: Doc<"users"> | null) =>
    user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Physiotherapist" : null;

/**
 * Inbound referrals for the admin intake queue, newest first. Reads are bounded: one page
 * (default 100, max 500), optionally narrowed to one stage or one partner.
 */
export const getInboundReferrals = query({
    args: {
        stage: v.optional(stageV),
        partnerId: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        await ensureUserRole(ctx, ["admin"]);
        const limit = Math.min(Math.max(Math.floor(args.limit ?? 100), 1), MAX_PAGE);
        const { rows: referrals, hasMore } = await loadReferralPage(ctx, args, limit);

        // Many referrals share a partner, doctor, physio or clinic: look each up once
        const partnerCache = new Map<string, Promise<Doc<"partners"> | null>>();
        const loadPartner = (partnerId: string) => {
            let pending = partnerCache.get(partnerId);
            if (!pending) {
                pending = (async () => {
                    const byCode = await ctx.db
                        .query("partners")
                        .withIndex("by_code", (q) => q.eq("code", partnerId))
                        .first();
                    if (byCode) return byCode;
                    // Older referrals stored the partner document id instead of its code
                    const id = ctx.db.normalizeId("partners", partnerId);
                    return id ? await ctx.db.get(id) : null;
                })();
                partnerCache.set(partnerId, pending);
            }
            return pending;
        };
        const userCache = new Map<string, Promise<Doc<"users"> | null>>();
        const loadUser = (id: Id<"users">) => {
            let pending = userCache.get(id);
            if (!pending) {
                pending = ctx.db.get(id);
                userCache.set(id, pending);
            }
            return pending;
        };
        const clinicCache = new Map<string, Promise<Doc<"clinics"> | null>>();
        const loadClinic = (id: Id<"clinics">) => {
            let pending = clinicCache.get(id);
            if (!pending) {
                pending = ctx.db.get(id);
                clinicCache.set(id, pending);
            }
            return pending;
        };

        const enrichedReferrals = await Promise.all(
            referrals.map(async (referral) => {
                const doctor = referral.referringDoctorId ? await loadUser(referral.referringDoctorId) : null;
                let doctorProfile = null;
                if (doctor && "doctorProfileId" in doctor && doctor.doctorProfileId) {
                    doctorProfile = await ctx.db.get(doctor.doctorProfileId);
                }

                // Referring doctor's bank account for payouts
                const bankAccounts = referral.referringDoctorId
                    ? await ctx.db
                        .query("doctorBankAccounts")
                        .withIndex("by_doctor_id", (q) => q.eq("doctorId", referral.referringDoctorId!))
                        .take(20)
                    : [];
                const defaultBankAccount = bankAccounts.find((a) => a.isDefault) || bankAccounts[0] || null;

                const partner = referral.partnerId ? await loadPartner(referral.partnerId) : null;
                const resolvedPartnerName = partner?.name || (referral.partnerId ? referral.partnerId : null);
                const resolvedPartnerCode = partner?.code || referral.partnerId || null;

                const docName = doctor && "firstName" in doctor
                    ? `${doctor.firstName || ""} ${doctor.lastName || ""}`.trim()
                    : (resolvedPartnerName || referral.hospitalClinic || "Partner Referral");
                const docEmail = doctor && "email" in doctor ? doctor.email : undefined;

                const physio = referral.assignedPhysiotherapistId ? await loadUser(referral.assignedPhysiotherapistId) : null;
                const clinic = referral.assignedClinicId ? await loadClinic(referral.assignedClinicId) : null;

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
                    assignedPhysiotherapistName: personName(physio),
                    assignedClinicName: clinic?.name ?? null,
                };
            })
        );

        return { referrals: enrichedReferrals, hasMore, limit };
    },
});

/**
 * How many referrals sit in each intake stage (optionally for one partner). Each stage stops
 * counting at STAGE_COUNT_CAP so the query stays bounded; `capped` marks those stages.
 */
export const getInboundReferralStageCounts = query({
    args: { partnerId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        await ensureUserRole(ctx, ["admin"]);
        const counts = Object.fromEntries(STAGE_NAMES.map((s) => [s, 0])) as Record<ReferralStage, number>;
        const capped = Object.fromEntries(STAGE_NAMES.map((s) => [s, false])) as Record<ReferralStage, boolean>;

        if (args.partnerId) {
            const partnerId = args.partnerId;
            const rows = await ctx.db
                .query("inboundReferrals")
                .withIndex("by_partner_id", (q) => q.eq("partnerId", partnerId))
                .take(PARTNER_SCAN_CAP + 1);
            for (const row of rows.slice(0, PARTNER_SCAN_CAP)) {
                const stage = STAGE_NAMES.find((s) => inStage(s, row.status));
                if (stage) counts[stage] += 1;
            }
            if (rows.length > PARTNER_SCAN_CAP) for (const s of STAGE_NAMES) capped[s] = true;
            return { counts, capped };
        }

        for (const stage of STAGE_NAMES) {
            for (const status of REFERRAL_STAGES[stage]) {
                const room = STAGE_COUNT_CAP + 1 - counts[stage];
                if (room <= 0) break;
                const rows = await ctx.db
                    .query("inboundReferrals")
                    .withIndex("by_status", (q) => q.eq("status", status))
                    .take(room);
                counts[stage] += rows.length;
            }
            if (counts[stage] > STAGE_COUNT_CAP) {
                counts[stage] = STAGE_COUNT_CAP;
                capped[stage] = true;
            }
        }
        return { counts, capped };
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

        const clinics = await ctx.db.query("clinics").take(1000);
        const rows = await Promise.all(
            clinics.map(async (clinic) => {
                if (clinic.status === "suspended") return null;
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
            if (clinic.status === "suspended") throw new Error("This clinic is suspended");
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
 * Directly assign an MRTBN-verified physiotherapist to an inbound referral and dispatch the
 * provider.matched webhook (once per physio). The referral status is not changed.
 * With `unrouteClinic`, any clinic routing is removed in the same transaction, so the
 * referral is handled by Rehabify rather than the clinic.
 */
export const assignPhysiotherapistToReferral = mutation({
    args: {
        referralId: v.id("inboundReferrals"),
        physiotherapistUserId: v.id("users"),
        clinicalNotes: v.optional(v.string()),
        unrouteClinic: v.optional(v.boolean()),
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

        if (args.unrouteClinic && referral.assignedClinicId) {
            const now = Date.now();
            await ctx.db.patch(args.referralId, { assignedClinicId: undefined, updatedAt: now });
            await ctx.db.insert("referralEvents", {
                referralId: args.referralId,
                eventName: "clinic.unassigned",
                occurredAt: now,
                actorType: "admin",
                actorId: adminId,
                metadata: {
                    previousClinicId: referral.assignedClinicId,
                    reason: "assigned_rehabify_physiotherapist",
                },
            });
        }

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
