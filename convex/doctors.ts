import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ── User Management & Profiles ──────────────────────────

/**
 * Get the current doctor user profile.
 */
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

/**
 * Create or update a doctor profile. Used during onboarding.
 */
export const setupDoctorProfile = mutation({
    args: {
        title: v.optional(v.string()),
        medicalLicenseNumber: v.optional(v.string()),
        specialty: v.optional(v.string()),
        hospitalAffiliation: v.optional(v.string()),
        bio: v.optional(v.string()),
        bankName: v.optional(v.string()),
        accountNumber: v.optional(v.string()),
        accountName: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Unauthenticated");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user) {
            throw new Error("User not found");
        }

        // If user already has a doctor profile, update it
        if (user.doctorProfileId) {
            // Filter out keys with undefined values to avoid overwriting existing data
            const filtered = Object.fromEntries(
                Object.entries(args).filter(([, v]) => v !== undefined)
            );
            if (Object.keys(filtered).length > 0) {
                await ctx.db.patch(user.doctorProfileId, filtered);
            }
            return user.doctorProfileId;
        }

        // Create new profile
        const profileId = await ctx.db.insert("referringDoctorProfiles", {
            userId: user._id,
            title: args.title,
            medicalLicenseNumber: args.medicalLicenseNumber,
            specialty: args.specialty,
            hospitalAffiliation: args.hospitalAffiliation,
            bio: args.bio,
            bankName: args.bankName,
            accountNumber: args.accountNumber,
            accountName: args.accountName,
        });

        // Update user record with role and profile link
        await ctx.db.patch(user._id, {
            role: "doctor",
            doctorProfileId: profileId,
            onboarded: true,
        });

        return profileId;
    },
});

// ── Referrals ──────────────────────────────────────────

/**
 * Submit a new patient referral.
 */
export const submitReferral = mutation({
    args: {
        patientFirstName: v.string(),
        patientLastName: v.string(),
        patientEmail: v.optional(v.string()),
        patientPhone: v.string(),
        hospitalClinic: v.optional(v.string()),
        condition: v.optional(v.string()),
        clinicalNotes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user || user.role !== "doctor") {
            throw new Error("Unauthorized: Only doctors can submit referrals");
        }

        const now = Date.now();
        const referralId = await ctx.db.insert("inboundReferrals", {
            referringDoctorId: user._id,
            patientFirstName: args.patientFirstName,
            patientLastName: args.patientLastName,
            patientEmail: args.patientEmail,
            patientPhone: args.patientPhone,
            hospitalClinic: args.hospitalClinic,
            condition: args.condition,
            clinicalNotes: args.clinicalNotes,
            status: "pending",
            createdAt: now,
            updatedAt: now,
        });

        return referralId;
    },
});

/**
 * Get all referrals made by the logged-in doctor.
 */
export const getMyReferrals = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user || user.role !== "doctor") return [];

        const referrals = await ctx.db
            .query("inboundReferrals")
            .withIndex("by_referring_doctor", (q) => q.eq("referringDoctorId", user._id))
            .order("desc") // newest first
            .collect();

        // Enhance with session counts
        const enhancedReferrals = await Promise.all(
            referrals.map(async (referral) => {
                let sessionCount = 0;

                if (referral.patientId) {
                    const sessions = await ctx.db
                        .query("sessionLogs")
                        .withIndex("by_patient", (q) => q.eq("patientId", referral.patientId!))
                        .collect();

                    // We can count all created logs, or filter by a specific status if sessionLogs had one
                    sessionCount = sessions.length;
                }

                return {
                    ...referral,
                    sessionCount,
                };
            })
        );

        return enhancedReferrals;
    },
});

/**
 * Get a specific referral by ID.
 */
export const getReferralDetails = query({
    args: {
        referralId: v.id("inboundReferrals"),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user) return null;

        const referral = await ctx.db.get(args.referralId);

        // Ensure they can only view their own referrals or if they are admin
        if (!referral || (referral.referringDoctorId !== user._id && user.role !== "admin")) {
            return null;
        }

        return referral;
    },
});

/**
 * Get aggregated dashboard statistics for the logged-in doctor.
 */
export const getDashboardStats = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user || user.role !== "doctor") return null;

        const allReferrals = await ctx.db
            .query("inboundReferrals")
            .withIndex("by_referring_doctor", (q) => q.eq("referringDoctorId", user._id))
            .collect();

        let totalSessionsAttended = 0;

        await Promise.all(allReferrals.map(async (referral) => {
            if (referral.patientId) {
                const sessions = await ctx.db
                    .query("sessionLogs")
                    .withIndex("by_patient", (q) => q.eq("patientId", referral.patientId!))
                    .collect();
                totalSessionsAttended += sessions.length;
            }
        }));

        const totalReferrals = allReferrals.length;
        const booked = allReferrals.filter(r => r.status === "booked" || r.status === "completed" || r.status === "paid_out").length;
        const completed = allReferrals.filter(r => r.status === "completed" || r.status === "paid_out").length;
        const totalEarned = allReferrals.reduce((sum, r) => sum + (r.commissionEarned ?? 0), 0);

        return {
            totalReferrals,
            booked,
            completed,
            totalEarned,
            totalSessionsAttended,
        };
    },
});
