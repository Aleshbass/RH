import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ensureUserRole } from "./auth";
import { api } from "./_generated/api";

export const getPartnershipInquiries = query({
  args: {},
  handler: async (ctx) => {
    // Authenticate admin
    await ensureUserRole(ctx as any, ["admin"]);

    const inquiries = await ctx.db
      .query("partnershipInquiries")
      .withIndex("by_created")
      .order("desc")
      .collect();

    return inquiries;
  },
});

export const updatePartnershipInquiryStatus = mutation({
  args: {
    id: v.id("partnershipInquiries"),
    status: v.union(v.literal("new"), v.literal("contacted"), v.literal("closed")),
  },
  handler: async (ctx, args) => {
    // Authenticate admin
    await ensureUserRole(ctx as any, ["admin"]);

    await ctx.db.patch(args.id, {
      status: args.status,
    });

    return { success: true };
  },
});

/**
 * Admin query to get all partner portal registration applications.
 */
export const getPartnerApplications = query({
  args: {
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx as any, ["admin"]);

    const partners = await ctx.db
      .query("partners")
      .order("desc")
      .collect();

    const formatted = partners.map((p) => {
      const approvalStatus = p.approvalStatus || (p.isActive ? "approved" : "pending");
      return {
        _id: p._id,
        name: p.name,
        code: p.code,
        type: p.type,
        logoUrl: p.logoUrl,
        contactEmail: p.contactEmail,
        contactPhone: p.contactPhone,
        ownerClerkId: p.ownerClerkId,
        ownerEmail: p.ownerEmail,
        approvalStatus,
        isActive: p.isActive,
        tier: p.tier,
        rejectionReason: p.rejectionReason,
        approvedAt: p.approvedAt,
        approvedBy: p.approvedBy,
        createdAt: p.createdAt,
      };
    });

    if (args.status && args.status !== "all") {
      return formatted.filter((p) => p.approvalStatus === args.status);
    }

    return formatted;
  },
});

/**
 * Admin mutation to approve or reject a partner organization application.
 */
export const reviewPartnerApplication = mutation({
  args: {
    partnerId: v.id("partners"),
    action: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx as any, ["admin"]);

    const partner = await ctx.db.get(args.partnerId);
    if (!partner) {
      throw new Error("Partner not found");
    }

    const now = Date.now();

    if (args.action === "approve") {
      // If partner doesn't have an API key or webhook secret, generate them
      let apiKey = partner.apiKey;
      if (!apiKey || apiKey.startsWith("sk_test_rehabify_sandbox")) {
        const randomKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        apiKey = `sk_live_${randomKey}`;
      }

      let webhookSecret = partner.webhookSecret;
      if (!webhookSecret) {
        const randomSecret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        webhookSecret = `whsec_${randomSecret}`;
      }

      await ctx.db.patch(partner._id, {
        approvalStatus: "approved",
        isActive: true,
        apiKey,
        webhookSecret,
        approvedAt: now,
        approvedBy: `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || "Admin",
        updatedAt: now,
      });

      // Notify the partner owner and update their role
      if (partner.ownerClerkId) {
        const ownerUser = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", partner.ownerClerkId!))
          .first();

        if (ownerUser) {
          await ctx.db.patch(ownerUser._id, { role: "partner" });

          await ctx.db.insert("notifications", {
            userId: ownerUser._id,
            type: "system_alert",
            title: "Partner Application Approved!",
            message: `Your organization "${partner.name}" has been approved by Rehabify administrators. You now have full access to your Partner Portal, API keys, and referral links.`,
            data: {
              partnerId: partner._id,
              partnerCode: partner.code,
              status: "approved",
            },
            status: "pending",
            priority: "high",
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      // Dispatch automated approval email to Partner Liaison
      const recipientEmail = partner.contactEmail || partner.ownerEmail;
      if (recipientEmail) {
        await ctx.scheduler.runAfter(
          0,
          (api as any).actions.emails.sendPartnerApplicationEmails.sendPartnerApplicationApprovedEmail,
          {
            partnerEmail: recipientEmail,
            organizationName: partner.name,
            partnerCode: partner.code,
            approvedBy: `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || "Rehabify Clinical Operations",
          }
        );
      }

      return {
        success: true,
        status: "approved",
        partnerId: partner._id,
        partnerCode: partner.code,
      };
    } else {
      await ctx.db.patch(partner._id, {
        approvalStatus: "rejected",
        isActive: false,
        rejectionReason: args.reason || "Application did not meet compliance criteria.",
        updatedAt: now,
      });

      // Notify the partner owner
      if (partner.ownerClerkId) {
        const ownerUser = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", partner.ownerClerkId!))
          .first();

        if (ownerUser) {
          await ctx.db.insert("notifications", {
            userId: ownerUser._id,
            type: "system_alert",
            title: "Partner Application Update",
            message: `Your application for "${partner.name}" was not approved: ${args.reason || "Application did not meet clinical compliance criteria."}`,
            data: {
              partnerId: partner._id,
              status: "rejected",
            },
            status: "pending",
            priority: "medium",
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      // Dispatch rejection / update email to Partner Liaison
      const recipientEmail = partner.contactEmail || partner.ownerEmail;
      if (recipientEmail) {
        await ctx.scheduler.runAfter(
          0,
          (api as any).actions.emails.sendPartnerApplicationEmails.sendPartnerApplicationDeclinedEmail,
          {
            partnerEmail: recipientEmail,
            organizationName: partner.name,
            reason: args.reason || "Application did not meet compliance criteria.",
          }
        );
      }

      return {
        success: true,
        status: "rejected",
        partnerId: partner._id,
      };
    }
  },
});

