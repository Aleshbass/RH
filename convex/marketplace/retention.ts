// @ts-nocheck
/**
 * Physiotherapist Retention System
 *
 * Tracks each physio's retention rate:
 * - % of their patients who complete 4+ sessions on platform
 *
 * Rewards for high retention (>60%):
 * - 🏆 ₦500 bonus per patient who completes full program
 * - Priority placement in marketplace
 * - Paid yearly in bulk
 *
 * Penalties for low retention (<30%):
 * - ⚠️ Warning: First time
 * - 📉 Reduced Allocation: 50% fewer referrals
 * - ❌ Suspension: After repeated violations
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";

// ── Constants ──
const RETENTION_THRESHOLD_SESSIONS = 4; // 4+ sessions = retained
const HIGH_RETENTION_RATE = 0.6;  // 60%
const LOW_RETENTION_RATE = 0.3;   // 30%
const BONUS_PER_PATIENT = 500;    // ₦500

// ── Types ──
type RetentionStatus = "excellent" | "good" | "needs_improvement" | "warning" | "restricted" | "suspended";
type PenaltyLevel = "none" | "warning" | "reduced_allocation" | "suspended";

// ── Calculate retention stats for a physio ──
export const getPhysioRetentionStats = query({
    args: {
        physiotherapistId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        let physioId = args.physiotherapistId;

        // If no physio specified, get current user
        if (!physioId) {
            const identity = await ctx.auth.getUserIdentity();
            if (!identity) return null;

            const user = await ctx.db
                .query("users")
                .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
                .first();

            if (!user || user.role !== "physiotherapist") return null;
            physioId = user._id;
        }

        // Get all completed bookings for this physio
        const allBookings = await ctx.db
            .query("marketplaceBookings")
            .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physioId))
            .collect();

        const completedBookings = allBookings.filter(
            (b) => b.bookingStatus === "completed"
        );

        // Group by patient
        const patientSessions: Map<string, number> = new Map();
        completedBookings.forEach((booking) => {
            const patientId = booking.patientId as string;
            patientSessions.set(patientId, (patientSessions.get(patientId) || 0) + 1);
        });

        const totalPatients = patientSessions.size;
        let retainedPatients = 0;
        let completedProgramPatients = 0; // patients who completed 4+ sessions

        patientSessions.forEach((sessionCount) => {
            if (sessionCount >= RETENTION_THRESHOLD_SESSIONS) {
                retainedPatients++;
                completedProgramPatients++;
            }
        });

        const retentionRate = totalPatients > 0 ? retainedPatients / totalPatients : 0;

        // Determine status
        let status: RetentionStatus;
        if (totalPatients < 5) {
            status = "good"; // Not enough data yet
        } else if (retentionRate >= 0.8) {
            status = "excellent";
        } else if (retentionRate >= HIGH_RETENTION_RATE) {
            status = "good";
        } else if (retentionRate >= LOW_RETENTION_RATE) {
            status = "needs_improvement";
        } else {
            status = "warning";
        }

        // Check existing penalty records
        const penaltyRecord = await ctx.db
            .query("physioRetentionPenalties")
            .withIndex("by_physio", (q) => q.eq("physiotherapistId", physioId))
            .order("desc")
            .first();

        const penaltyLevel: PenaltyLevel = penaltyRecord?.currentLevel || "none";

        // Calculate bonus eligibility
        const bonusEligible = retentionRate >= HIGH_RETENTION_RATE && totalPatients >= 5;
        const bonusAmount = bonusEligible ? completedProgramPatients * BONUS_PER_PATIENT : 0;

        // Get pending bonus (not yet paid)
        const pendingBonus = await ctx.db
            .query("physioRetentionBonuses")
            .withIndex("by_physio", (q) => q.eq("physiotherapistId", physioId))
            .filter((q) => q.eq(q.field("status"), "pending"))
            .collect();

        const totalPendingBonus = pendingBonus.reduce((sum, b) => sum + b.amount, 0);

        // Get paid bonuses
        const paidBonuses = await ctx.db
            .query("physioRetentionBonuses")
            .withIndex("by_physio", (q) => q.eq("physiotherapistId", physioId))
            .filter((q) => q.eq(q.field("status"), "paid"))
            .collect();

        const totalPaidBonuses = paidBonuses.reduce((sum, b) => sum + b.amount, 0);

        return {
            physiotherapistId: physioId,
            totalPatients,
            retainedPatients,
            completedProgramPatients,
            retentionRate: Math.round(retentionRate * 1000) / 10, // e.g., 66.7%
            totalCompletedSessions: completedBookings.length,
            status,
            penaltyLevel,
            bonusEligible,
            bonusPerPatient: BONUS_PER_PATIENT,
            currentBonusAmount: bonusAmount,
            totalPendingBonus,
            totalPaidBonuses,
            thresholds: {
                sessionsRequired: RETENTION_THRESHOLD_SESSIONS,
                highRetention: HIGH_RETENTION_RATE * 100,
                lowRetention: LOW_RETENTION_RATE * 100,
            },
            // Per-patient breakdown
            patientBreakdown: Array.from(patientSessions.entries()).map(([patientId, sessions]) => ({
                patientId,
                sessionsCompleted: sessions,
                retained: sessions >= RETENTION_THRESHOLD_SESSIONS,
                progressPercent: Math.min(100, Math.round((sessions / RETENTION_THRESHOLD_SESSIONS) * 100)),
            })),
        };
    },
});

// ── Record a retention bonus ──
export const recordRetentionBonus = internalMutation({
    args: {
        physiotherapistId: v.id("users"),
        amount: v.number(),
        patientsCompleted: v.number(),
        period: v.string(), // e.g., "2026-Q1"
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("physioRetentionBonuses", {
            physiotherapistId: args.physiotherapistId,
            amount: args.amount,
            patientsCompleted: args.patientsCompleted,
            period: args.period,
            status: "pending",
            createdAt: Date.now(),
        });
    },
});

// ── Issue a retention penalty/warning ──
export const issueRetentionPenalty = internalMutation({
    args: {
        physiotherapistId: v.id("users"),
        level: v.union(
            v.literal("warning"),
            v.literal("reduced_allocation"),
            v.literal("suspended")
        ),
        reason: v.string(),
        retentionRate: v.number(),
    },
    handler: async (ctx, args) => {
        // Check if existing record
        const existing = await ctx.db
            .query("physioRetentionPenalties")
            .withIndex("by_physio", (q) => q.eq("physiotherapistId", args.physiotherapistId))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                currentLevel: args.level,
                lastUpdated: Date.now(),
                history: [
                    ...(existing.history || []),
                    {
                        level: args.level,
                        reason: args.reason,
                        retentionRate: args.retentionRate,
                        date: Date.now(),
                    },
                ],
            });
        } else {
            await ctx.db.insert("physioRetentionPenalties", {
                physiotherapistId: args.physiotherapistId,
                currentLevel: args.level,
                lastUpdated: Date.now(),
                history: [
                    {
                        level: args.level,
                        reason: args.reason,
                        retentionRate: args.retentionRate,
                        date: Date.now(),
                    },
                ],
            });
        }
    },
});

// ── Admin: Get all physio retention stats ──
export const getAllRetentionStats = query({
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .first();

        if (!user || user.role !== "admin") return [];

        // Get all physios
        const physios = await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("role"), "physiotherapist"))
            .collect();

        const stats = [];

        for (const physio of physios) {
            const bookings = await ctx.db
                .query("marketplaceBookings")
                .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physio._id))
                .filter((q) => q.eq(q.field("bookingStatus"), "completed"))
                .collect();

            const patientSessions: Map<string, number> = new Map();
            bookings.forEach((b) => {
                const pid = b.patientId as string;
                patientSessions.set(pid, (patientSessions.get(pid) || 0) + 1);
            });

            const total = patientSessions.size;
            let retained = 0;
            patientSessions.forEach((count) => {
                if (count >= RETENTION_THRESHOLD_SESSIONS) retained++;
            });

            const rate = total > 0 ? retained / total : 0;

            stats.push({
                physioId: physio._id,
                name: `${physio.firstName} ${physio.lastName}`,
                totalPatients: total,
                retainedPatients: retained,
                retentionRate: Math.round(rate * 1000) / 10,
                totalSessions: bookings.length,
                bonusEligible: rate >= HIGH_RETENTION_RATE && total >= 5,
                bonusAmount: rate >= HIGH_RETENTION_RATE ? retained * BONUS_PER_PATIENT : 0,
            });
        }

        return stats.sort((a, b) => b.retentionRate - a.retentionRate);
    },
});
