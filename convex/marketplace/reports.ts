// @ts-nocheck
/**
 * Patient Report/Flag System for Physiotherapists
 * Allows patients to report concerns to admins
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { api } from "../_generated/api";

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
    severity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
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
      .filter((q) => q.eq(q.field("role"), "admin"))
      .collect();

    for (const admin of admins) {
      await ctx.db.insert("notifications", {
        userId: admin._id,
        type: "physiotherapist_report",
        priority: args.severity === "critical" || args.severity === "high" ? "urgent" : "high",
        status: "pending",
        payload: {
          title: "New Physiotherapist Report",
          body: `${user.firstName} ${user.lastName} reported ${physiotherapist.firstName} ${physiotherapist.lastName} for ${args.reason}`,
          data: {
            entityId: reportId,
            entityType: "report",
            actionUrl: "/dashboard/admin/reports",
          },
        },
        createdAt: Date.now(),
      });
    }

    return { reportId, success: true };
  },
});

/**
 * Get all reports (admin only)
 */
export const getAllReports = query({
  args: {
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("under_review"),
      v.literal("resolved"),
      v.literal("dismissed")
    )),
    severity: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    )),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },

  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "admin") {
      throw new Error("Only admins can view reports");
    }

    let query = ctx.db.query("physiotherapistReports");

    // Apply filters
    let reports = await query.collect();

    if (args.status) {
      reports = reports.filter((r) => r.status === args.status);
    }

    if (args.severity) {
      reports = reports.filter((r) => r.severity === args.severity);
    }

    // Sort by createdAt desc
    reports.sort((a, b) => b.createdAt - a.createdAt);

    // Pagination
    const limit = args.limit || 50;
    const offset = args.offset || 0;
    const total = reports.length;
    const paginatedReports = reports.slice(offset, offset + limit);

    // Enrich with user details
    const enrichedReports = await Promise.all(
      paginatedReports.map(async (report) => {
        const physiotherapist = await ctx.db.get(report.physiotherapistId);
        const reporter = await ctx.db.get(report.reporterId);
        const appointment = report.appointmentId ? await ctx.db.get(report.appointmentId) : null;
        const booking = report.bookingId ? await ctx.db.get(report.bookingId) : null;

        return {
          ...report,
          physiotherapist: physiotherapist ? {
            id: physiotherapist._id,
            name: `${physiotherapist.firstName} ${physiotherapist.lastName}`,
            email: physiotherapist.email,
            imageUrl: physiotherapist.imageUrl,
          } : null,
          reporter: reporter ? {
            id: reporter._id,
            name: `${reporter.firstName} ${reporter.lastName}`,
            email: reporter.email,
            role: reporter.role,
          } : null,
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
    };
  },
});

/**
 * Update report status (admin only)
 */
export const updateReportStatus = mutation({
  args: {
    reportId: v.id("physiotherapistReports"),
    status: v.union(
      v.literal("pending"),
      v.literal("under_review"),
      v.literal("resolved"),
      v.literal("dismissed")
    ),
    adminNotes: v.optional(v.string()),
    actionTaken: v.optional(v.string()),
  },

  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "admin") {
      throw new Error("Only admins can update reports");
    }

    const report = await ctx.db.get(args.reportId);
    if (!report) {
      throw new Error("Report not found");
    }

    await ctx.db.patch(args.reportId, {
      status: args.status,
      adminNotes: args.adminNotes,
      actionTaken: args.actionTaken,
      reviewedBy: user._id,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Notify reporter of update
    await ctx.db.insert("notifications", {
      userId: report.reporterId,
      type: "report_update",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Report Update",
        body: `Your report has been ${args.status}`,
        data: {
          entityId: args.reportId,
          entityType: "report",
        },
      },
      createdAt: Date.now(),
    });

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "admin") {
      throw new Error("Only admins can view reports");
    }

    const reports = await ctx.db
      .query("physiotherapistReports")
      .filter((q) => q.eq(q.field("physiotherapistId"), args.physiotherapistId))
      .collect();

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
