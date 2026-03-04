/**
 * AwaDoc Convex Backend Functions
 *
 * Mutations and queries to support the AwaDoc marketplace integration.
 * These handle session tracking, physio availability lookups, and
 * dashboard statistics for AwaDoc-sourced bookings.
 */

import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ── Log an AwaDoc event ─────────────────────────────────

export const logEvent = mutation({
    args: {
        eventId: v.string(),
        eventType: v.string(),
        direction: v.union(v.literal("inbound"), v.literal("outbound")),
        payload: v.any(),
        responsePayload: v.optional(v.any()),
        status: v.union(v.literal("success"), v.literal("error")),
        errorMessage: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("awadocEventLog", {
            ...args,
            processedAt: Date.now(),
        });
    },
});

// ── Get available physios for an AwaDoc availability query ──

export const getAvailablePhysios = query({
    args: {
        serviceArea: v.optional(v.string()),
        preferredMode: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Query all marketplace-available physios
        let physios = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_marketplace_availability", (q) =>
                q.eq("isAvailableOnMarketplace", true)
            )
            .collect();

        // Filter by service area (location) if provided and not "ALL"
        if (args.serviceArea && args.serviceArea !== "ALL") {
            const area = args.serviceArea.toLowerCase();
            physios = physios.filter((p) => {
                const loc = (p.location ?? "").toLowerCase();
                return loc.includes(area) || area.includes(loc);
            });
        }

        // Filter by mode if specified
        if (args.preferredMode === "virtual") {
            physios = physios.filter((p) => p.offersOnlineSessions);
        } else if (args.preferredMode === "physical") {
            physios = physios.filter((p) => p.offersInPersonSessions);
        }

        // Enrich with user data
        const enriched = await Promise.all(
            physios.map(async (profile) => {
                const user = await ctx.db.get(profile.userId);
                return {
                    profileId: profile._id,
                    userId: profile.userId,
                    firstName: user?.firstName ?? "",
                    lastName: user?.lastName ?? "",
                    email: user?.email ?? "",
                    imageUrl: user?.imageUrl,
                    specializations: profile.specializations ?? [],
                    location: profile.location ?? "",
                    hourlyRate: profile.hourlyRate ?? 15000,
                    offersOnlineSessions: profile.offersOnlineSessions ?? false,
                    offersInPersonSessions: profile.offersInPersonSessions ?? true,
                    yearsOfExperience: profile.yearsOfExperience ?? 0,
                    averageRating: profile.averageRating ?? 0,
                    availabilitySchedule: profile.availabilitySchedule,
                };
            })
        );

        return enriched;
    },
});

// ── Create an AwaDoc session record ─────────────────────

export const createSession = mutation({
    args: {
        consultationId: v.string(),
        queryId: v.optional(v.string()),
        requestId: v.optional(v.string()),
        eventId: v.optional(v.string()),
        awadocUserId: v.string(),
        awadocUserName: v.string(),
        status: v.union(
            v.literal("queried"),
            v.literal("requested"),
            v.literal("confirmed")
        ),
        mode: v.optional(v.union(v.literal("virtual"), v.literal("physical"))),
        specialistType: v.optional(v.string()),
        scheduledTime: v.optional(v.number()),
        endTime: v.optional(v.number()),
        serviceArea: v.optional(v.string()),
        preferredLang: v.optional(v.string()),
        grossAmount: v.optional(v.number()),
        currency: v.optional(v.string()),
        physiotherapistId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        const now = Date.now();

        // Calculate commission split: AwaDoc takes 20%
        const grossAmount = args.grossAmount ?? 0;
        const awadocCommission = Math.round(grossAmount * 0.2);
        const netAmount = grossAmount - awadocCommission;

        const sessionId = await ctx.db.insert("awadocSessions", {
            consultationId: args.consultationId,
            queryId: args.queryId,
            requestId: args.requestId,
            eventId: args.eventId,
            awadocUserId: args.awadocUserId,
            awadocUserName: args.awadocUserName,
            status: args.status,
            mode: args.mode,
            specialistType: args.specialistType,
            scheduledTime: args.scheduledTime,
            endTime: args.endTime,
            serviceArea: args.serviceArea,
            preferredLang: args.preferredLang,
            grossAmount: grossAmount || undefined,
            awadocCommission: awadocCommission || undefined,
            netAmount: netAmount || undefined,
            currency: args.currency ?? "NGN",
            physiotherapistId: args.physiotherapistId,
            createdAt: now,
            updatedAt: now,
        });

        return { sessionId, consultationId: args.consultationId };
    },
});

// ── Update AwaDoc session status ────────────────────────

export const updateSessionStatus = mutation({
    args: {
        consultationId: v.string(),
        status: v.union(
            v.literal("queried"),
            v.literal("requested"),
            v.literal("confirmed"),
            v.literal("doctor_assigned"),
            v.literal("scheduled"),
            v.literal("completed"),
            v.literal("cancelled"),
            v.literal("failed")
        ),
        appointmentId: v.optional(v.id("appointments")),
        physiotherapistId: v.optional(v.id("users")),
        grossAmount: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("awadocSessions")
            .withIndex("by_consultation_id", (q) =>
                q.eq("consultationId", args.consultationId)
            )
            .unique();

        if (!session) {
            throw new Error(`AwaDoc session not found: ${args.consultationId}`);
        }

        const updates: Record<string, unknown> = {
            status: args.status,
            updatedAt: Date.now(),
        };

        if (args.appointmentId) updates.appointmentId = args.appointmentId;
        if (args.physiotherapistId) updates.physiotherapistId = args.physiotherapistId;

        if (args.status === "confirmed") {
            updates.confirmedAt = Date.now();
        }
        if (args.status === "completed") {
            updates.completedAt = Date.now();
        }

        // Update financial fields if gross amount provided
        if (args.grossAmount) {
            updates.grossAmount = args.grossAmount;
            updates.awadocCommission = Math.round(args.grossAmount * 0.2);
            updates.netAmount = args.grossAmount - Math.round(args.grossAmount * 0.2);
        }

        await ctx.db.patch(session._id, updates);
        return { success: true };
    },
});

// ── Find session by request ID ──────────────────────────

export const getSessionByRequestId = query({
    args: { requestId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("awadocSessions")
            .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
            .unique();
    },
});

// ── Find session by consultation ID ─────────────────────

export const getSessionByConsultationId = query({
    args: { consultationId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("awadocSessions")
            .withIndex("by_consultation_id", (q) =>
                q.eq("consultationId", args.consultationId)
            )
            .unique();
    },
});

// ── Dashboard stats for AwaDoc ──────────────────────────

export const getDashboardStats = query({
    args: {},
    handler: async (ctx) => {
        const allSessions = await ctx.db.query("awadocSessions").collect();

        const totalSessions = allSessions.length;
        const confirmed = allSessions.filter((s) => s.status === "confirmed" || s.status === "completed" || s.status === "scheduled" || s.status === "doctor_assigned").length;
        const completed = allSessions.filter((s) => s.status === "completed").length;

        const totalGross = allSessions.reduce((sum, s) => sum + (s.grossAmount ?? 0), 0);
        const totalCommission = allSessions.reduce((sum, s) => sum + (s.awadocCommission ?? 0), 0);
        const totalNet = allSessions.reduce((sum, s) => sum + (s.netAmount ?? 0), 0);

        // Recent events
        const recentEvents = await ctx.db
            .query("awadocEventLog")
            .withIndex("by_processed_at")
            .order("desc")
            .take(20);

        return {
            totalSessions,
            confirmed,
            completed,
            totalGross,
            totalCommission,
            totalNet,
            recentEvents,
        };
    },
});
