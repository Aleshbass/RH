"use node";

import { action } from "../../_generated/server";
import { v } from "convex/values";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Sends an email notification to Rehabify administrators when a new healthcare
 * organization submits an application on the Partner Portal.
 */
export const sendPartnerApplicationSubmittedAdminEmail = action({
  args: {
    adminEmail: v.string(),
    organizationName: v.string(),
    organizationType: v.string(),
    contactName: v.optional(v.string()),
    contactEmail: v.string(),
    contactPhone: v.optional(v.string()),
    coverageStates: v.optional(v.array(v.string())),
    reviewLink: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://rehabify.com";
      const reviewLink = args.reviewLink || `${siteUrl}/dashboard/admin/partnerships`;

      const result = await sendEmail({
        to: args.adminEmail,
        template: "PARTNER_APPLICATION_SUBMITTED",
        data: {
          organizationName: args.organizationName,
          organizationType: args.organizationType,
          contactName: args.contactName,
          contactEmail: args.contactEmail,
          contactPhone: args.contactPhone,
          coverageStates: args.coverageStates,
          reviewLink,
        },
      });

      if (!result.success) {
        console.error("Failed to send partner application admin alert:", result.error);
        return { success: false, error: result.error };
      }

      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error("Error in sendPartnerApplicationSubmittedAdminEmail:", error);
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Sends a welcome & activation email to the partner liaison upon admin approval.
 */
export const sendPartnerApplicationApprovedEmail = action({
  args: {
    partnerEmail: v.string(),
    organizationName: v.string(),
    partnerCode: v.string(),
    contactName: v.optional(v.string()),
    portalLink: v.optional(v.string()),
    approvedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://rehabify.com";
      const portalLink = args.portalLink || `${siteUrl}/partners/portal`;

      const result = await sendEmail({
        to: args.partnerEmail,
        template: "PARTNER_APPLICATION_APPROVED",
        data: {
          organizationName: args.organizationName,
          partnerCode: args.partnerCode,
          contactName: args.contactName,
          dashboardLink: portalLink,
          portalLink,
          approvedBy: args.approvedBy,
        },
      });

      if (!result.success) {
        console.error("Failed to send partner approval email:", result.error);
        return { success: false, error: result.error };
      }

      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error("Error in sendPartnerApplicationApprovedEmail:", error);
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Sends an update email if an application is declined or requires additional compliance info.
 */
export const sendPartnerApplicationDeclinedEmail = action({
  args: {
    partnerEmail: v.string(),
    organizationName: v.string(),
    contactName: v.optional(v.string()),
    reason: v.optional(v.string()),
    supportLink: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const supportLink = args.supportLink || "mailto:partners@physioaroundme.com";

      const result = await sendEmail({
        to: args.partnerEmail,
        template: "PARTNER_APPLICATION_DECLINED",
        data: {
          organizationName: args.organizationName,
          contactName: args.contactName,
          reason: args.reason,
          supportLink,
        },
      });

      if (!result.success) {
        console.error("Failed to send partner decline email:", result.error);
        return { success: false, error: result.error };
      }

      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error("Error in sendPartnerApplicationDeclinedEmail:", error);
      return { success: false, error: String(error) };
    }
  },
});
