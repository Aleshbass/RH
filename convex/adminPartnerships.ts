/**
 * Admin: partnership inquiries, partner applications, and production (go-live) access.
 *
 * Approving an application grants SANDBOX access only. Live keys and live webhooks
 * require a separate production-access approval (go-live review).
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { adminDisplayName, requireAdmin } from "./helpers/partnerAccess";
import { partnerApprovalStatus } from "./helpers/partnerShared";

export const getPartnershipInquiries = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.db.query("partnershipInquiries").withIndex("by_created").order("desc").collect();
  },
});

export const updatePartnershipInquiryStatus = mutation({
  args: {
    id: v.id("partnershipInquiries"),
    status: v.union(v.literal("new"), v.literal("contacted"), v.literal("closed")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.id, { status: args.status });
    return { success: true };
  },
});

/** All partner organisations with application and production status (no credentials). */
export const getPartnerApplications = query({
  args: {
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const partners = await ctx.db.query("partners").order("desc").collect();
    const formatted = partners.map((p) => ({
      _id: p._id,
      name: p.name,
      code: p.code,
      type: p.type,
      logoUrl: p.logoUrl,
      website: p.website,
      contactName: p.contactName,
      contactEmail: p.contactEmail,
      contactPhone: p.contactPhone,
      ownerClerkId: p.ownerClerkId,
      ownerEmail: p.ownerEmail,
      approvalStatus: partnerApprovalStatus(p),
      isActive: p.isActive,
      tier: p.tier,
      rejectionReason: p.rejectionReason,
      approvedAt: p.approvedAt,
      approvedBy: p.approvedBy,
      productionStatus: p.productionStatus ?? "not_requested",
      productionRequestedAt: p.productionRequestedAt,
      productionRequestNote: p.productionRequestNote,
      productionReviewedAt: p.productionReviewedAt,
      productionReviewedBy: p.productionReviewedBy,
      productionRejectionReason: p.productionRejectionReason,
      createdAt: p.createdAt,
    }));
    if (args.status && args.status !== "all") return formatted.filter((p) => p.approvalStatus === args.status);
    return formatted;
  },
});

export const reviewPartnerApplication = mutation({
  args: {
    partnerId: v.id("partners"),
    action: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const partner = await ctx.db.get(args.partnerId);
    if (!partner) throw new ConvexError("Partner not found.");
    const now = Date.now();
    const adminName = adminDisplayName(admin.user);
    const ownerUser = partner.ownerClerkId
      ? await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", partner.ownerClerkId!))
          .first()
      : null;
    const recipientEmail = partner.contactEmail || partner.ownerEmail;

    if (args.action === "approve") {
      await ctx.db.patch(partner._id, {
        approvalStatus: "approved",
        isActive: true,
        rejectionReason: undefined,
        productionStatus: partner.productionStatus ?? "not_requested",
        approvedAt: now,
        approvedBy: adminName,
        updatedAt: now,
      });
      if (ownerUser) {
        if (!ownerUser.role || ownerUser.role === "patient") await ctx.db.patch(ownerUser._id, { role: "partner" });
        await ctx.db.insert("notifications", {
          userId: ownerUser._id,
          type: "system_alert",
          title: "Partner application approved",
          message: `"${partner.name}" is approved. Your sandbox is ready: create test keys in the Partner Portal, then request production access when you are ready to go live.`,
          data: { partnerId: partner._id, partnerCode: partner.code, status: "approved" },
          status: "pending",
          priority: "high",
          createdAt: now,
          updatedAt: now,
        });
      }
      if (recipientEmail) {
        await ctx.scheduler.runAfter(0, internal.actions.emails.sendPartnerApplicationEmails.sendPartnerApplicationApprovedEmail, {
          partnerEmail: recipientEmail,
          organizationName: partner.name,
          partnerCode: partner.code,
          contactName: partner.contactName,
          approvedBy: adminName,
        });
      }
      return { success: true, status: "approved" as const, partnerId: partner._id, partnerCode: partner.code };
    }

    const reason = args.reason?.trim() || "Application did not meet our partnership criteria.";
    await ctx.db.patch(partner._id, {
      approvalStatus: "rejected",
      isActive: false,
      rejectionReason: reason,
      updatedAt: now,
    });
    if (ownerUser) {
      await ctx.db.insert("notifications", {
        userId: ownerUser._id,
        type: "system_alert",
        title: "Partner application update",
        message: `Your application for "${partner.name}" was not approved: ${reason}`,
        data: { partnerId: partner._id, status: "rejected" },
        status: "pending",
        priority: "medium",
        createdAt: now,
        updatedAt: now,
      });
    }
    if (recipientEmail) {
      await ctx.scheduler.runAfter(0, internal.actions.emails.sendPartnerApplicationEmails.sendPartnerApplicationDeclinedEmail, {
        partnerEmail: recipientEmail,
        organizationName: partner.name,
        reason,
      });
    }
    return { success: true, status: "rejected" as const, partnerId: partner._id };
  },
});

/**
 * Production (go-live) access review.
 *  approve  → live keys and live webhooks can be created
 *  reject   → request declined with a reason (partner can request again)
 *  suspend  → existing live keys stop working immediately (403 production_access_required)
 *  reinstate→ re-approve a suspended partner
 */
export const reviewProductionAccess = mutation({
  args: {
    partnerId: v.id("partners"),
    action: v.union(v.literal("approve"), v.literal("reject"), v.literal("suspend"), v.literal("reinstate")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const partner = await ctx.db.get(args.partnerId);
    if (!partner) throw new ConvexError("Partner not found.");
    if (partnerApprovalStatus(partner) !== "approved" || !partner.isActive) {
      throw new ConvexError("Approve the partner application before granting production access.");
    }
    const current = partner.productionStatus ?? "not_requested";
    const now = Date.now();
    const reviewer = adminDisplayName(admin.user);
    const reason = args.reason?.trim() || undefined;

    let next: "approved" | "rejected" | "suspended";
    if (args.action === "approve" || args.action === "reinstate") {
      if (args.action === "reinstate" && current !== "suspended") throw new ConvexError("Only suspended partners can be reinstated.");
      next = "approved";
    } else if (args.action === "reject") {
      if (current !== "requested") throw new ConvexError("There is no pending production request to reject.");
      if (!reason) throw new ConvexError("Give the partner a reason for declining.");
      next = "rejected";
    } else {
      if (current !== "approved") throw new ConvexError("Only partners with production access can be suspended.");
      if (!reason) throw new ConvexError("Record a reason for the suspension.");
      next = "suspended";
    }

    await ctx.db.patch(partner._id, {
      productionStatus: next,
      productionReviewedAt: now,
      productionReviewedBy: reviewer,
      productionRejectionReason: next === "approved" ? undefined : reason,
      updatedAt: now,
    });
    await ctx.db.insert("partnerActivityLogs", {
      partnerId: partner.code,
      environment: "live",
      eventId: `evt_prod_${now}`,
      eventType: `production.${next}`,
      direction: "inbound",
      url: "/dashboard/admin/partnerships",
      method: "POST",
      statusCode: 200,
      latencyMs: 0,
      status: "success",
      requestPayload: { reviewer, reason },
      occurredAt: now,
    });

    const owner = partner.ownerClerkId
      ? await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", partner.ownerClerkId!))
          .first()
      : null;
    const messages = {
      approved: "Production access approved. You can now create live API keys and a live webhook endpoint in the Partner Portal.",
      rejected: `Your production access request was declined: ${reason}`,
      suspended: `Production access was suspended: ${reason}. Live API keys are disabled until it is reinstated.`,
    };
    if (owner) {
      await ctx.db.insert("notifications", {
        userId: owner._id,
        type: "system_alert",
        title: next === "approved" ? "You're live!" : "Production access update",
        message: messages[next],
        data: { partnerCode: partner.code, productionStatus: next },
        status: "pending",
        priority: "high",
        createdAt: now,
        updatedAt: now,
      });
    }
    const to = partner.technicalContactEmail || partner.contactEmail || partner.ownerEmail;
    if (to) {
      await ctx.scheduler.runAfter(0, internal.actions.emails.sendPartnerApplicationEmails.sendPartnerGoLiveEmail, {
        to,
        kind: next,
        organizationName: partner.name,
        partnerCode: partner.code,
        note: reason,
      });
    }
    return { success: true, productionStatus: next };
  },
});
