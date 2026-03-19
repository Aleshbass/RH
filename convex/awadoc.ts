/**
 * AwaDoc Convex Backend Functions
 *
 * Mutations and queries to support the AwaDoc marketplace integration.
 * These handle session tracking, physio availability lookups, and
 * dashboard statistics for AwaDoc-sourced bookings.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ── Shared constants ────────────────────────────────────

/** AwaDoc merchant commission rate (20%). Single source of truth. */
export const AWADOC_COMMISSION_RATE = 0.2;

/** Calculate commission split from a gross amount. */
export function calculateCommission(grossAmount: number) {
    const awadocCommission = Math.round(grossAmount * AWADOC_COMMISSION_RATE);
    const netAmount = grossAmount - awadocCommission;
    return { awadocCommission, netAmount };
}

// ── Sanitize webhook payloads ───────────────────────────

/**
 * Redact sensitive fields from webhook payloads before storing.
 * Retention policy: event logs should be purged after 90 days.
 */
function sanitizeWebhookPayload(payload: unknown): unknown {
    if (!payload || typeof payload !== "object") return payload;
    const obj = { ...(payload as Record<string, unknown>) };
    // Redact known PII / secret fields
    const redactKeys = ["authorization", "token", "secret", "password", "credit_card"];
    for (const key of Object.keys(obj)) {
        if (redactKeys.some((r) => key.toLowerCase().includes(r))) {
            obj[key] = "[REDACTED]";
        }
        // Truncate very long string values
        if (typeof obj[key] === "string" && (obj[key] as string).length > 2000) {
            obj[key] = (obj[key] as string).slice(0, 2000) + "...[TRUNCATED]";
        }
    }
    // Redact nested user PII if present
    if (obj.user && typeof obj.user === "object") {
        const user = { ...(obj.user as Record<string, unknown>) };
        delete user.email;
        delete user.phone;
        obj.user = user;
    }
    return obj;
}

// ── Log an AwaDoc event (idempotent) ────────────────────

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
        // Idempotency: skip if event already logged
        const existing = await ctx.db
            .query("awadocEventLog")
            .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
            .unique();

        if (existing) {
            // Update existing record instead of inserting a duplicate
            await ctx.db.patch(existing._id, {
                status: args.status,
                errorMessage: args.errorMessage,
                responsePayload: args.responsePayload
                    ? sanitizeWebhookPayload(args.responsePayload)
                    : undefined,
                processedAt: Date.now(),
            });
            return;
        }

        const now = Date.now();
        await ctx.db.insert("awadocEventLog", {
            eventId: args.eventId,
            eventType: args.eventType,
            direction: args.direction,
            payload: sanitizeWebhookPayload(args.payload),
            responsePayload: args.responsePayload
                ? sanitizeWebhookPayload(args.responsePayload)
                : undefined,
            status: args.status,
            errorMessage: args.errorMessage,
            createdAt: now,
            processedAt: now,
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

        // Filter by service area (location) — single-direction normalized match
        if (args.serviceArea && args.serviceArea !== "ALL") {
            const area = args.serviceArea.toLowerCase().trim();
            physios = physios.filter((p) => {
                const loc = (p.location ?? "").toLowerCase().trim();
                return loc.includes(area);
            });
        }

        // Filter by mode if specified
        if (args.preferredMode === "virtual") {
            physios = physios.filter((p) => p.offersOnlineSessions);
        } else if (args.preferredMode === "physical") {
            physios = physios.filter((p) => p.offersInPersonSessions);
        }

        // Enrich with user data (no email exposed — PII protection)
        const enriched = await Promise.all(
            physios.map(async (profile) => {
                const user = await ctx.db.get(profile.userId);
                return {
                    profileId: profile._id,
                    userId: profile.userId,
                    firstName: user?.firstName ?? "",
                    lastName: user?.lastName ?? "",
                    imageUrl: user?.imageUrl,
                    specializations: profile.specializations ?? [],
                    location: profile.location ?? "",
                    hourlyRate: profile.hourlyRate ?? 1500000, // ₦15,000 base rate per 60-min session
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

// ── Look up a user by ID (for doctor details in callbacks) ──

export const getUserById = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const user = await ctx.db.get(args.userId);
        if (!user) return null;
        return {
            id: user._id,
            firstName: user.firstName ?? "",
            lastName: user.lastName ?? "",
            email: user.email ?? "",
            imageUrl: user.imageUrl,
        };
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

        // Calculate commission split using shared helper
        const grossAmount = args.grossAmount ?? 0;
        const { awadocCommission, netAmount } = calculateCommission(grossAmount);

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
            // Use nullish check so 0 is preserved (not turned into undefined)
            grossAmount: grossAmount !== undefined ? grossAmount : undefined,
            awadocCommission: awadocCommission !== undefined ? awadocCommission : undefined,
            netAmount: netAmount !== undefined ? netAmount : undefined,
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

        // Update financial fields using shared commission helper
        if (args.grossAmount !== undefined) {
            const { awadocCommission, netAmount } = calculateCommission(args.grossAmount);
            updates.grossAmount = args.grossAmount;
            updates.awadocCommission = awadocCommission;
            updates.netAmount = netAmount;
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
        // Note: For large datasets, add time-range filters and use indexed queries.
        // Currently acceptable for early-stage with low AwaDoc session volume.
        const allSessions = await ctx.db.query("awadocSessions").collect();

        const totalSessions = allSessions.length;
        const confirmed = allSessions.filter(
            (s) =>
                s.status === "confirmed" ||
                s.status === "completed" ||
                s.status === "scheduled" ||
                s.status === "doctor_assigned"
        ).length;
        const completed = allSessions.filter((s) => s.status === "completed").length;

        const totalGross = allSessions.reduce((sum, s) => sum + (s.grossAmount ?? 0), 0);
        const totalCommission = allSessions.reduce(
            (sum, s) => sum + (s.awadocCommission ?? 0),
            0
        );
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
            commissionRate: AWADOC_COMMISSION_RATE,
            recentEvents,
        };
    },
});

// ── Set guest token on an AwaDoc session ────────────────

export const setGuestToken = mutation({
    args: {
        consultationId: v.string(),
        guestToken: v.string(),
        guestTokenExpiresAt: v.number(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("awadocSessions")
            .withIndex("by_consultation_id", (q) =>
                q.eq("consultationId", args.consultationId)
            )
            .unique();

        if (!session) {
            throw new Error(`Session not found: ${args.consultationId}`);
        }

        await ctx.db.patch(session._id, {
            guestToken: args.guestToken,
            guestTokenExpiresAt: args.guestTokenExpiresAt,
            updatedAt: Date.now(),
        });

        return { success: true };
    },
});

// ── Validate a guest token for video call access ────────

export const validateGuestToken = query({
    args: {
        consultationId: v.string(),
        guestToken: v.string(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("awadocSessions")
            .withIndex("by_consultation_id", (q) =>
                q.eq("consultationId", args.consultationId)
            )
            .unique();

        if (!session) {
            return { valid: false, error: "Session not found" };
        }

        if (!session.guestToken || session.guestToken !== args.guestToken) {
            return { valid: false, error: "Invalid token" };
        }

        if (session.guestTokenExpiresAt && Date.now() > session.guestTokenExpiresAt) {
            return { valid: false, error: "Token expired" };
        }

        // Fetch physio details for the guest UI
        let physioName = "Physiotherapist";
        if (session.physiotherapistId) {
            const physio = await ctx.db.get(session.physiotherapistId);
            if (physio) {
                physioName = `${physio.firstName ?? ""} ${physio.lastName ?? ""}`.trim() || "Physiotherapist";
            }
        }

        return {
            valid: true,
            session: {
                consultationId: session.consultationId,
                patientName: session.awadocUserName,
                physioName,
                mode: session.mode ?? "virtual",
                scheduledTime: session.scheduledTime,
                endTime: session.endTime,
                status: session.status,
            },
        };
    },
});

// ── Mark an AwaDoc session as completed ─────────────────

export const completeSession = mutation({
    args: {
        consultationId: v.string(),
        notes: v.optional(v.string()),
        actualDurationMinutes: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("awadocSessions")
            .withIndex("by_consultation_id", (q) =>
                q.eq("consultationId", args.consultationId)
            )
            .unique();

        if (!session) {
            throw new Error(`Session not found: ${args.consultationId}`);
        }

        const now = Date.now();
        await ctx.db.patch(session._id, {
            status: "completed",
            completedAt: now,
            updatedAt: now,
        });

        return {
            success: true,
            consultationId: args.consultationId,
            completedAt: now,
        };
    },
});
