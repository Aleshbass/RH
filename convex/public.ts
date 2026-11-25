import { insertNotification } from "./helpers/pushNotify";
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// A pilot request also lands in Admin › Employer outreach as a company at "Replied" (by name, as
// the generated api type is at TypeScript's depth limit)
const pilotToPipelineRef = makeFunctionReference<"mutation", { inquiryId: Id<"partnershipInquiries"> }, null>(
  "employerOutreach:pilotToPipeline"
);

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

/**
 * "Request a pilot" on /platform/employers (Rehabify for Work). Called by /api/employer-pilot,
 * which rate-limits and sends the emails; this keeps the request for the admin
 * Partnerships › Inquiries tab (filter "Employer pilots") and alerts admins in-app.
 */
export const requestEmployerPilot = mutation({
  args: {
    name: v.string(),
    company: v.string(),
    role: v.string(),
    email: v.string(),
    phone: v.string(),
    workerCount: v.number(),
    workType: v.string(),
  },
  handler: async (ctx, args) => {
    // Public form: trim and cap every field
    const clip = (value: string, max: number) => value.trim().slice(0, max);
    const name = clip(args.name, 120);
    const organization = clip(args.company, 160);
    const role = clip(args.role, 120);
    const email = clip(args.email, 200).toLowerCase();
    const phone = clip(args.phone, 40);
    const workType = clip(args.workType, 300);
    const workerCount = Math.round(args.workerCount);
    if (!name || !organization || !role || !email || !phone || !workType) {
      throw new Error("Please fill in every field.");
    }
    if (!Number.isFinite(workerCount) || workerCount < 1 || workerCount > 1_000_000) {
      throw new Error("Enter how many workers you have.");
    }

    const now = Date.now();
    const inquiryId = await ctx.db.insert("partnershipInquiries", {
      kind: "employer_pilot",
      name,
      email,
      phone,
      organization,
      role,
      workerCount,
      workType,
      message: "",
      status: "new",
      createdAt: now,
    });

    // Scheduled, so a problem in the pipeline never loses the request itself
    await ctx.scheduler.runAfter(0, pilotToPipelineRef, { inquiryId });

    const link = "/dashboard/admin/partnerships?tab=inquiries";
    const body = `${organization} (${workerCount.toLocaleString("en-NG")} workers) asked for a Rehabify for Work pilot.`;
    const admins = await ctx.db.query("users")
      .withIndex("by_role", q => q.eq("role", "admin"))
      .collect();
    for (const admin of admins) {
      await insertNotification(ctx, {
        userId: admin._id,
        type: "system_alert",
        title: "New employer pilot request",
        message: body,
        payload: {
          title: "New employer pilot request",
          body,
          link,
          data: { inquiryId, organization, actionUrl: link },
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

/** Employee ranges the wellness check form offers (components/platform/employers/WellnessCheckForm.tsx). */
const EMPLOYEE_RANGES = ["1–20", "21–50", "51–100", "101–500", "501–1,000", "More than 1,000"];

/**
 * "Complimentary Workplace Wellness Check" on /platform/employers: an organisation registers
 * interest in an introductory visit from the physiotherapy team (owner, 25 Nov 2026). Separate
 * from the pilot request; saved as kind "wellness_check" for Admin › Partnerships › Inquiries and
 * added to Employer outreach, like a pilot request.
 */
export const registerWellnessCheck = mutation({
  args: {
    organisation: v.string(),
    industry: v.string(),
    employeeRange: v.string(),
    location: v.string(),
    name: v.string(),
    role: v.string(),
    email: v.string(),
    phone: v.string(),
    interests: v.array(v.string()),
    message: v.string(),
    consent: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Public form: trim and cap every field
    const clip = (value: string, max: number) => value.trim().slice(0, max);
    const organization = clip(args.organisation, 160);
    const industry = clip(args.industry, 120);
    const location = clip(args.location, 160);
    const name = clip(args.name, 120);
    const role = clip(args.role, 120);
    const email = clip(args.email, 200).toLowerCase();
    const phone = clip(args.phone, 40);
    const message = clip(args.message, 2000);
    const interests = [...new Set(args.interests.map((i) => clip(i, 120)).filter(Boolean))].slice(0, 10);
    if (!organization || !industry || !location || !name || !role || !email || !phone) {
      throw new Error("Please fill in every required field.");
    }
    if (!EMPLOYEE_RANGES.includes(args.employeeRange)) throw new Error("Choose roughly how many employees you have.");
    if (!args.consent) throw new Error("Please agree to be contacted about your request.");

    const now = Date.now();
    const inquiryId = await ctx.db.insert("partnershipInquiries", {
      kind: "wellness_check",
      name,
      email,
      phone,
      organization,
      role,
      industry,
      employeeRange: args.employeeRange,
      location,
      interests,
      message,
      consentAt: now,
      status: "new",
      createdAt: now,
    });

    // Into Employer outreach too, as a company that asked us (scheduled, so the request is never lost)
    await ctx.scheduler.runAfter(0, pilotToPipelineRef, { inquiryId });

    const link = "/dashboard/admin/partnerships?tab=inquiries";
    const body = `${organization} (${args.employeeRange} employees, ${location}) registered for a workplace wellness check.`;
    const admins = await ctx.db.query("users")
      .withIndex("by_role", q => q.eq("role", "admin"))
      .collect();
    for (const admin of admins) {
      await insertNotification(ctx, {
        userId: admin._id,
        type: "system_alert",
        title: "New workplace wellness check request",
        message: body,
        payload: {
          title: "New workplace wellness check request",
          body,
          link,
          data: { inquiryId, organization, actionUrl: link },
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
