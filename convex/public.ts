import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const submitPartnershipInquiry = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    organization: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    // Insert the inquiry into the database
    const inquiryId = await ctx.db.insert("partnershipInquiries", {
      name: args.name,
      email: args.email,
      organization: args.organization,
      message: args.message,
      status: "new",
      createdAt: Date.now(),
    });

    // Notify all admins
    const admins = await ctx.db.query("users")
      .withIndex("by_role", q => q.eq("role", "admin"))
      .collect();

    for (const admin of admins) {
      // 1. Create an in-app notification
      await ctx.db.insert("notifications", {
        userId: admin._id,
        type: "system_alert",
        title: "New Partnership Inquiry",
        message: `${args.name} from ${args.organization} has submitted a new partnership inquiry.`,
        data: { 
          inquiryId,
          organization: args.organization
        },
        status: "pending",
        priority: "high",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // 2. Schedule an email to the admin
      if (admin.email) {
        await ctx.scheduler.runAfter(0, api.actions.emails.sendPartnershipInquiryEmail.sendPartnershipInquiryEmail, {
          adminEmail: admin.email,
          name: args.name,
          email: args.email,
          organization: args.organization,
          message: args.message,
        });
      }
    }
    
    return { success: true, inquiryId };
  },
});
