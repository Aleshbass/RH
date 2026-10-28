import { insertNotification } from "./helpers/pushNotify";
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

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
      await insertNotification(ctx, {
        userId: admin._id,
        type: "system_alert",
        title: "New Partnership Inquiry",
        message: `${args.name} from ${args.organization} has submitted a new partnership inquiry.`,
        data: {
          inquiryId,
          organization: args.organization,
          actionUrl: "/dashboard/admin/partnerships?tab=inquiries",
        },
        status: "pending",
        priority: "high",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // 2. Schedule an email to the admin
      if (admin.email) {
        await ctx.scheduler.runAfter(0, internal.actions.emails.sendPartnershipInquiryEmail.sendPartnershipInquiryEmail, {
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

/**
 * "Book a demo" on the partners page. Called by /api/book-demo, which rate-limits and sends the
 * emails; this keeps the request for the admin Partnerships › Inquiries tab and alerts admins in-app.
 */
export const requestDemo = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    organization: v.string(),
    phone: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Public form: trim and cap every field
    const clip = (value: string, max: number) => value.trim().slice(0, max);
    const name = clip(args.name, 120);
    const email = clip(args.email, 200).toLowerCase();
    const organization = clip(args.organization, 160);
    if (!name || !email || !organization) throw new Error("Name, email and organisation are required.");

    const now = Date.now();
    const inquiryId = await ctx.db.insert("partnershipInquiries", {
      kind: "demo",
      name,
      email,
      phone: args.phone ? clip(args.phone, 40) || undefined : undefined,
      organization,
      message: args.message ? clip(args.message, 2000) : "",
      status: "new",
      createdAt: now,
    });

    const admins = await ctx.db.query("users")
      .withIndex("by_role", q => q.eq("role", "admin"))
      .collect();
    for (const admin of admins) {
      await insertNotification(ctx, {
        userId: admin._id,
        type: "system_alert",
        title: "New demo request",
        message: `${name} from ${organization} would like a demo.`,
        // payload is what the bell and the phone show; tapping opens the inquiries list
        payload: {
          title: "New demo request",
          body: `${name} from ${organization} would like a demo.`,
          link: "/dashboard/admin/partnerships?tab=inquiries",
          data: { inquiryId, organization, actionUrl: "/dashboard/admin/partnerships?tab=inquiries" },
        },
        data: { inquiryId, organization },
        status: "pending",
        priority: "high",
        createdAt: now,
        updatedAt: now,
      });
    }

    return { success: true, inquiryId };
  },
});
