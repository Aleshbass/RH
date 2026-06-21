import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./helpers/auth";

export const getPartnershipInquiries = query({
  args: {},
  handler: async (ctx) => {
    // Authenticate admin
    await requireAdmin(ctx);

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
    await requireAdmin(ctx);

    await ctx.db.patch(args.id, {
      status: args.status,
    });

    return { success: true };
  },
});
