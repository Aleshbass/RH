/**
 * Patient Report/Flag System for Physiotherapists
 * Allows patients to report concerns to admins. Admins review them at
 * /dashboard/admin/marketplace-reports.
 */

import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ensureUserRole } from "../auth";

const reportStatusV = v.union(
  v.literal("pending"),
  v.literal("under_review"),
  v.literal("resolved"),
  v.literal("dismissed")
);

const reportSeverityV = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical")
);

/** Hard cap on rows read by one admin list query. */
const READ_CAP = 1000;
/** Cap per status for the filter-chip counts. */
const COUNT_CAP = 500;

const REPORTS_URL = "/dashboard/admin/marketplace-reports";

/**
 * Submit a report against a physiotherapist
 */
export const reportPhysiotherapist = mutation({
  args: {
    physiotherapistId: v.id("users"),
    reason: v.union(
      v.literal("unprofessional_behavior"),
      v.literal("poor_treatment_quality"),
      v.literal("safety_concern"),
      v.literal("billing_issue"),
      v.literal("harassment"),
      v.literal("breach_of_confidentiality"),
      v.literal("other")
    ),
    description: v.string(),
    appointmentId: v.optional(v.id("appointments")),
    bookingId: v.optional(v.id("marketplaceBookings")),
    severity: reportSeverityV,
  },

  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("You must be logged in to submit a report");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Verify physiotherapist exists
    const physiotherapist = await ctx.db.get(args.physiotherapistId);
    if (!physiotherapist || physiotherapist.role !== "physiotherapist") {
      throw new Error("Physiotherapist not found");
    }

    // Create report
    const reportId = await ctx.db.insert("physiotherapistReports", {
      physiotherapistId: args.physiotherapistId,
      reporterId: user._id,
      reporterRole: user.role,
      reason: args.reason,
      description: args.description,
      appointmentId: args.appointmentId,
      bookingId: args.bookingId,
      severity: args.severity,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create notification for admins
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .take(50);

    for (const admin of admins) {
      await ctx.db.insert("notifications", {
        userId: admin._id,
        type: "physiotherapist_report",
        priority: args.severity === "critical" || args.severity === "high" ? "urgent" : "high",
        status: "pending",
        payload: {
          title: "New Physiotherapist Report",
          body: `${user.firstName ?? ""} ${user.lastName ?? ""} reported ${physiotherapist.firstName ?? ""} ${physiotherapist.lastName ?? ""} for ${args.reason.replace(/_/g, " ")}`,
          data: {
            entityId: reportId,
            entityType: "report",
            actionUrl: REPORTS_URL,
          },
        },
        createdAt: Date.now(),
      });
    }

    return { reportId, success: true };
  },
});

function displayName(u: Doc<"users"> | null) {
  if (!u) return "Unknown";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Unknown";
}

/**
 * Get all reports (admin only). Reads through the status (or severity) index and caps
 * how many rows it reads, so the cost stays flat as the table grows.
 */
export const getAllReports = query({
  args: {
    status: v.optional(reportStatusV),
    severity: v.optional(reportSeverityV),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },

  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    let reports: Doc<"physiotherapistReports">[];
    if (args.status) {
      const status = args.status;
      reports = await ctx.db
        .query("physiotherapistReports")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(READ_CAP);
      if (args.severity) reports = reports.filter((r) => r.severity === args.severity);
    } else if (args.severity) {
      const severity = args.severity;
      reports = await ctx.db
        .query("physiotherapistReports")
        .withIndex("by_severity", (q) => q.eq("severity", severity))
        .order("desc")
        .take(READ_CAP);
    } else {
      reports = await ctx.db.query("physiotherapistReports").withIndex("by_created_at").order("desc").take(READ_CAP);
    }

    // Sort by createdAt desc
    reports.sort((a, b) => b.createdAt - a.createdAt);

    // Pagination
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 50), 1), 200);
    const offset = Math.max(Math.floor(args.offset ?? 0), 0);
    const total = reports.length;
    const paginatedReports = reports.slice(offset, offset + limit);

    // Enrich with user details
    const enrichedReports = await Promise.all(
      paginatedReports.map(async (report) => {
        // Separate awaits: one Promise.all over five different tables is too deep for TypeScript (TS2589)
        const [physiotherapist, reporter, reviewer] = await Promise.all([
          ctx.db.get(report.physiotherapistId),
          ctx.db.get(report.reporterId),
          report.reviewedBy ? ctx.db.get(report.reviewedBy) : null,
        ]);
        const appointment = report.appointmentId ? await ctx.db.get(report.appointmentId) : null;
        const booking = report.bookingId ? await ctx.db.get(report.bookingId) : null;

        return {
          ...report,
          physiotherapist: physiotherapist ? {
            id: physiotherapist._id,
            name: displayName(physiotherapist),
            email: physiotherapist.email,
            imageUrl: physiotherapist.imageUrl,
          } : null,
          reporter: reporter ? {
            id: reporter._id,
            name: displayName(reporter),
            email: reporter.email,
            role: reporter.role,
          } : null,
          reviewer: reviewer ? { id: reviewer._id, name: displayName(reviewer) } : null,
          appointment,
          booking,
        };
      })
    );

    return {
      reports: enrichedReports,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
      // True when the index held more rows than we read
      capped: total >= READ_CAP,
    };
  },
});

/** Report counts per status for the admin filter chips (each capped at COUNT_CAP). */
export const getReportCounts = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const count = async (status: Doc<"physiotherapistReports">["status"]) =>
      (
        await ctx.db
          .query("physiotherapistReports")
          .withIndex("by_status", (q) => q.eq("status", status))
          .take(COUNT_CAP)
      ).length;
    const [pending, under_review, resolved, dismissed] = await Promise.all([
      count("pending"),
      count("under_review"),
      count("resolved"),
      count("dismissed"),
    ]);
    return { pending, under_review, resolved, dismissed, cap: COUNT_CAP };
  },
});

/**
 * Update report status (admin only). Notes and action are only changed when sent, so
 * moving a report along doesn't wipe what an earlier reviewer wrote.
 */
export const updateReportStatus = mutation({
  args: {
    reportId: v.id("physiotherapistReports"),
    status: reportStatusV,
    adminNotes: v.optional(v.string()),
    actionTaken: v.optional(v.string()),
  },

  handler: async (ctx, args) => {
    const user = await ensureUserRole(ctx, ["admin"]);

    const report = await ctx.db.get(args.reportId);
    if (!report) {
      throw new ConvexError("Report not found");
    }

    const now = Date.now();
    await ctx.db.patch(args.reportId, {
      status: args.status,
      ...(args.adminNotes !== undefined ? { adminNotes: args.adminNotes.trim().slice(0, 4000) || undefined } : {}),
      ...(args.actionTaken !== undefined ? { actionTaken: args.actionTaken.trim().slice(0, 2000) || undefined } : {}),
      reviewedBy: user._id,
      reviewedAt: now,
      updatedAt: now,
    });

    // Tell the reporter when the outcome changes (not for note-only edits)
    if (args.status !== report.status) {
      const label = args.status === "under_review" ? "is being reviewed" : `has been ${args.status}`;
      await ctx.db.insert("notifications", {
        userId: report.reporterId,
        type: "report_update",
        priority: "medium",
        status: "pending",
        payload: {
          title: "Report Update",
          body: `Your report ${label}`,
          data: {
            entityId: args.reportId,
            entityType: "report",
          },
        },
        createdAt: now,
      });
    }

    return { success: true };
  },
});

/**
 * Get reports for a specific physiotherapist (for admin review)
 */
export const getPhysiotherapistReports = query({
  args: {
    physiotherapistId: v.id("users"),
  },

  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const reports = (
      await ctx.db
        .query("physiotherapistReports")
        .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", args.physiotherapistId))
        .order("desc")
        .take(200)
    ).sort((a, b) => b.createdAt - a.createdAt);

    // Count by status
    const statusCounts = {
      pending: reports.filter((r) => r.status === "pending").length,
      under_review: reports.filter((r) => r.status === "under_review").length,
      resolved: reports.filter((r) => r.status === "resolved").length,
      dismissed: reports.filter((r) => r.status === "dismissed").length,
    };

    // Count by severity
    const severityCounts = {
      low: reports.filter((r) => r.severity === "low").length,
      medium: reports.filter((r) => r.severity === "medium").length,
      high: reports.filter((r) => r.severity === "high").length,
      critical: reports.filter((r) => r.severity === "critical").length,
    };

    return {
      reports,
      totalReports: reports.length,
      statusCounts,
      severityCounts,
    };
  },
});
