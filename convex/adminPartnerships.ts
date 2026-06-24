import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ensureUserRole } from "./auth";

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
