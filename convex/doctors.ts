import { insertNotification } from "./helpers/pushNotify";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { assertSelfRoleChangeAllowed } from "./helpers/roleLock";
import { generateTrackingCode, normalizePhone, partnerApprovalStatus } from "./helpers/partnerShared";
import { attributeUserToReferral } from "./helpers/partnerAttribution";
import { doctorSignupsOpen } from "./platformSettings";

const DOCTOR_SIGNUPS_PAUSED_MESSAGE =
    "We're not taking new referring doctors right now. Please try again soon, or email partners@physioaroundme.com and we'll let you know when we open again.";

/** A doctor who already has a referral account (any status) is never a "new" sign-up. */
async function ownsDoctorPartner(ctx: { db: QueryCtx["db"] }, clerkId: string) {
    const partner = await ctx.db
        .query("partners")
        .withIndex("by_owner_clerk_id", (q) => q.eq("ownerClerkId", clerkId))
        .first();
    return Boolean(partner);
}

/**
 * Whether the signed-in person can send the doctor profile form. Closed only while an admin has
 * paused new doctor sign-ups and this person has no referral account yet (existing doctors can
 * always update their details).
 */
export const getDoctorSignupStatus = query({
    args: {},
    handler: async (ctx) => {
        const open = await doctorSignupsOpen(ctx);
        if (open) return { open: true };
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return { open: false };
        return { open: await ownsDoctorPartner(ctx, identity.subject) };
    },
});

/**
 * Referring doctors.
 *
 * A doctor is a partner of type "doctor" (convex/partners.ts). Everything after sign-up runs on
 * the partner programme: the doctor refers patients and shares a referral link from the Partner
 * Portal, Rehabify attributes the patient's bookings and invoice payments to them, commissions
 * follow the contract an admin sets (or the platform default share), and payouts are the
 * monthly partner payouts. An admin approves each doctor (checking their licence) before they
 * can refer; approval also makes them live.
 */

// ── Profile ──────────────────────────────────────────────

/** The signed-in doctor's profile, or null. */
export const getMyDoctorProfile = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user || user.role !== "doctor") return null;

        if (!user.doctorProfileId) return null;

        const profile = await ctx.db.get(user.doctorProfileId);
        return { user, profile };
    },
});

function doctorDisplayName(user: Doc<"users">, title?: string) {
    const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Doctor";
    const prefix = (title ?? "Dr.").trim();
    return prefix && !name.toLowerCase().startsWith(prefix.toLowerCase().replace(/\.$/, "")) ? `${prefix} ${name}` : name;
}

async function uniquePartnerCode(ctx: MutationCtx, user: Doc<"users">) {
    const slug = `${user.lastName ?? ""}_${user.firstName ?? ""}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 20);
    const base = `dr_${slug || "doctor"}`;
    let code = base;
    for (let counter = 2; ; counter++) {
        const match = await ctx.db
            .query("partners")
            .withIndex("by_code", (q) => q.eq("code", code))
            .first();
        if (!match) return code;
        code = `${base}_${counter}`;
    }
}

/**
 * The doctor's partner record, created (pending approval) if they don't have one. Admins are
 * told there is a doctor to verify.
 */
async function ensureDoctorPartner(
    ctx: MutationCtx,
    user: Doc<"users">,
    ownerClerkId: string,
    profile: { title?: string; specialty?: string; hospitalAffiliation?: string },
    options: { approve?: boolean; notifyAdmins?: boolean } = {}
): Promise<Doc<"partners">> {
    const existing = await ctx.db
        .query("partners")
        .withIndex("by_owner_clerk_id", (q) => q.eq("ownerClerkId", ownerClerkId))
        .first();
    const now = Date.now();
    const name = doctorDisplayName(user, profile.title);
    const email = user.email?.trim().toLowerCase();

    let partnerId: Id<"partners">;
    if (existing) {
        if (existing.type !== "doctor") {
            throw new ConvexError("This account already manages a partner organisation. Use a separate account to refer as a doctor.");
        }
        // A declined doctor who updates their details goes back for review
        if (!(options.notifyAdmins && partnerApprovalStatus(existing) === "rejected")) return existing;
        await ctx.db.patch(existing._id, {
            name,
            contactName: name,
            approvalStatus: "pending",
            isActive: false,
            rejectionReason: undefined,
            updatedAt: now,
        });
        partnerId = existing._id;
    } else {
        if (!email) throw new ConvexError("Add an email address to your account first.");
        partnerId = await insertDoctorPartner(ctx, user, ownerClerkId, name, email, options.approve);
    }

    if (options.notifyAdmins) {
        await notifyAdminsOfDoctor(ctx, user, partnerId, name, email ?? "", profile, Boolean(existing));
    }
    return (await ctx.db.get(partnerId))!;
}

async function insertDoctorPartner(
    ctx: MutationCtx,
    user: Doc<"users">,
    ownerClerkId: string,
    name: string,
    email: string,
    approve?: boolean
) {
    const now = Date.now();
    const code = await uniquePartnerCode(ctx, user);
    return ctx.db.insert("partners", {
        name,
        code,
        type: "doctor",
        contactName: name,
        contactEmail: email,
        contactPhone: user.phoneNumber || undefined,
        ownerClerkId,
        ownerEmail: email,
        supportedCareModes: ["remote", "face_to_face"],
        isActive: Boolean(approve),
        approvalStatus: approve ? "approved" : "pending",
        productionStatus: approve ? "approved" : "not_requested",
        ...(approve ? { approvedAt: now, approvedBy: "Rehabify (migrated doctor account)" } : {}),
        tier: "standard",
        createdAt: now,
        updatedAt: now,
    });
}

/** Tells admins there is a doctor to verify (in-app and by email). */
async function notifyAdminsOfDoctor(
    ctx: MutationCtx,
    user: Doc<"users">,
    partnerId: Id<"partners">,
    name: string,
    email: string,
    profile: { specialty?: string; hospitalAffiliation?: string },
    resubmitted: boolean
) {
    const now = Date.now();
    const admins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .collect();
    const details = [profile.specialty, profile.hospitalAffiliation].filter(Boolean).join(", ");
    for (const admin of admins) {
        await insertNotification(ctx, {
            userId: admin._id,
            type: "system_alert",
            title: resubmitted ? "Referring doctor resubmitted for review" : "New referring doctor to verify",
            message: `${name}${details ? ` (${details})` : ""} ${resubmitted ? "updated their details" : "signed up to refer patients"}. Check their licence, then approve them in Partnerships.`,
            data: { partnerId, name, type: "doctor", contactEmail: email, actionUrl: "/dashboard/admin/partnerships" },
            status: "pending",
            priority: "high",
            createdAt: now,
            updatedAt: now,
        });
        if (admin.email && email) {
            await ctx.scheduler.runAfter(0, internal.actions.emails.sendPartnerApplicationEmails.sendPartnerApplicationSubmittedAdminEmail, {
                adminEmail: admin.email,
                organizationName: name,
                organizationType: "doctor",
                contactName: name,
                contactEmail: email,
                contactPhone: user.phoneNumber || undefined,
            });
        }
    }
}

/**
 * Create or update the doctor's profile (onboarding), and their partner record so an admin can
 * approve them. Bank details are added in the Partner Portal, where payouts happen.
 */
export const setupDoctorProfile = mutation({
    args: {
        title: v.optional(v.string()),
        medicalLicenseNumber: v.optional(v.string()),
        specialty: v.optional(v.string()),
        hospitalAffiliation: v.optional(v.string()),
        bio: v.optional(v.string()),
        // Older onboarding screens sent these; kept so they still work
        bankName: v.optional(v.string()),
        accountNumber: v.optional(v.string()),
        accountName: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new ConvexError("Please sign in to continue.");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user) {
            throw new ConvexError("We couldn't find your account. Please sign in again.");
        }
        assertSelfRoleChangeAllowed(user, "doctor");
        // Admin Settings can pause new referring doctors; existing ones can still update their details
        if (!(await doctorSignupsOpen(ctx)) && !(await ownsDoctorPartner(ctx, identity.subject))) {
            throw new ConvexError(DOCTOR_SIGNUPS_PAUSED_MESSAGE);
        }
        if (!args.medicalLicenseNumber?.trim()) {
            throw new ConvexError("Enter your MDCN folio or licence number so we can verify you.");
        }

        const fields = Object.fromEntries(
            Object.entries(args)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
        ) as typeof args;

        let profileId = user.doctorProfileId;
        if (profileId) {
            if (Object.keys(fields).length > 0) await ctx.db.patch(profileId, fields);
        } else {
            profileId = await ctx.db.insert("referringDoctorProfiles", { userId: user._id, ...fields });
        }

        await ctx.db.patch(user._id, {
            role: "doctor",
            doctorProfileId: profileId,
            onboarded: true,
        });

        const fresh = (await ctx.db.get(user._id))!;
        const partner = await ensureDoctorPartner(ctx, fresh, identity.subject, fields, { notifyAdmins: true });
        return { profileId, partnerCode: partner.code };
    },
});

// ── One-off migration ────────────────────────────────────

/**
 * Moves doctors who signed up before referrals ran on the partner programme onto it:
 * a partner record for each doctor, their verified bank account copied to the partner payout
 * accounts, and their referrals given the doctor's partner code, a tracking code and a
 * normalised phone (so Joy and bookings can find them). Patients already linked to a referral
 * are attributed to the doctor.
 *
 * Run once after deploy:  npx convex run doctors:migrateDoctorsToPartners '{"dryRun":true}'
 * then without dryRun. `approveExisting` approves (and makes live) doctors who already had
 * an account; leave it off to have an admin verify each one in Partnerships.
 */
export const migrateDoctorsToPartners = internalMutation({
    args: { approveExisting: v.optional(v.boolean()), dryRun: v.optional(v.boolean()) },
    handler: async (ctx, args) => {
        const dryRun = Boolean(args.dryRun);
        const doctors = await ctx.db
            .query("users")
            .withIndex("by_role", (q) => q.eq("role", "doctor"))
            .collect();
        const report = {
            dryRun,
            doctors: doctors.length,
            partnersCreated: 0,
            bankAccountsCopied: 0,
            referralsUpdated: 0,
            patientsAttributed: 0,
            skipped: [] as string[],
        };

        for (const user of doctors) {
            if (!user.clerkId) {
                report.skipped.push(`${user._id}: no sign-in account`);
                continue;
            }
            const profile = user.doctorProfileId ? await ctx.db.get(user.doctorProfileId) : null;
            let partner = await ctx.db
                .query("partners")
                .withIndex("by_owner_clerk_id", (q) => q.eq("ownerClerkId", user.clerkId))
                .first();
            if (partner && partner.type !== "doctor") {
                report.skipped.push(`${user._id}: already owns partner ${partner.code}`);
                continue;
            }
            if (!partner) {
                report.partnersCreated++;
                if (!dryRun) {
                    if (!user.email) {
                        report.skipped.push(`${user._id}: no email address`);
                        continue;
                    }
                    partner = await ensureDoctorPartner(
                        ctx,
                        user,
                        user.clerkId,
                        {
                            title: profile?.title,
                            specialty: profile?.specialty,
                            hospitalAffiliation: profile?.hospitalAffiliation,
                        },
                        { approve: args.approveExisting }
                    );
                }
            }

            if (partner && !dryRun) {
                const hasBank = await ctx.db
                    .query("partnerBankAccounts")
                    .withIndex("by_partner_code", (q) => q.eq("partnerCode", partner!.code))
                    .first();
                if (!hasBank) {
                    const banks = await ctx.db
                        .query("doctorBankAccounts")
                        .withIndex("by_doctor_id", (q) => q.eq("doctorId", user._id))
                        .collect();
                    const bank = banks.find((b) => b.isDefault && b.isVerified) ?? banks.find((b) => b.isVerified);
                    if (bank) {
                        const now = Date.now();
                        await ctx.db.insert("partnerBankAccounts", {
                            partnerCode: partner.code,
                            bankCode: bank.bankCode,
                            bankName: bank.bankName,
                            accountNumber: bank.accountNumber,
                            accountName: bank.accountName,
                            isVerified: true,
                            isDefault: true,
                            addedBy: "migration from doctor payout account",
                            createdAt: now,
                            updatedAt: now,
                        });
                        report.bankAccountsCopied++;
                    }
                }
            }

            const referrals = await ctx.db
                .query("inboundReferrals")
                .withIndex("by_referring_doctor", (q) => q.eq("referringDoctorId", user._id))
                .collect();
            for (const referral of referrals) {
                if (referral.partnerId) continue;
                report.referralsUpdated++;
                if (dryRun || !partner) continue;
                const patch: Partial<Doc<"inboundReferrals">> = {
                    partnerId: partner.code,
                    environment: "live",
                    trackingCode: referral.trackingCode ?? (await generateTrackingCode(ctx)),
                    patientPhoneNormalized: referral.patientPhoneNormalized ?? normalizePhone(referral.patientPhone) ?? undefined,
                    conversionSource: referral.conversionSource ?? "doctor_referral",
                    updatedAt: Date.now(),
                };
                await ctx.db.patch(referral._id, patch);
                if (referral.patientId) {
                    await attributeUserToReferral(ctx, referral.patientId, { ...referral, ...patch } as Doc<"inboundReferrals">);
                    report.patientsAttributed++;
                }
            }
        }
        return report;
    },
});
