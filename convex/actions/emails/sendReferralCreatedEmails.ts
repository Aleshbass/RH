"use node";

import { action } from "../../_generated/server";
import { v } from "convex/values";
import { sendEmail } from "../../../lib/email/emailService";
import { publicAppUrl } from "../../helpers/appUrl";

/**
 * Sends a professional referral confirmation email to the partner's contact,
 * including the tracking code, WhatsApp intake URL, and patient details.
 */
export const sendPartnerReferralCreatedEmail = action({
  args: {
    partnerEmail: v.string(),
    partnerName: v.string(),
    contactName: v.optional(v.string()),
    patientName: v.string(),
    trackingCode: v.string(),
    trackingUrl: v.string(),
    whatsappIntakeUrl: v.string(),
    whatsappPhone: v.string(),
    condition: v.string(),
    priority: v.string(),
    createdAt: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (_ctx, args) => {
    try {
      const result = await sendEmail({
        to: args.partnerEmail,
        template: "PARTNER_REFERRAL_CREATED",
        data: {
          partnerName: args.partnerName,
          contactName: args.contactName,
          patientName: args.patientName,
          trackingCode: args.trackingCode,
          trackingUrl: args.trackingUrl,
          whatsappIntakeUrl: args.whatsappIntakeUrl,
          whatsappPhone: args.whatsappPhone,
          condition: args.condition,
          priority: args.priority,
          createdAt: args.createdAt,
        },
      });

      if (!result.success) {
        console.error("[REFERRAL EMAIL] Failed to send partner referral email:", result.error);
        return { success: false, error: result.error };
      }

      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error("[REFERRAL EMAIL] Error in sendPartnerReferralCreatedEmail:", error);
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Sends an admin notification email when a new partner referral is created,
 * including the patient's phone number, WhatsApp link, and call button so
 * the admin (or Joy) can proactively reach out to the patient.
 */
export const sendAdminReferralCreatedEmail = action({
  args: {
    adminEmail: v.string(),
    partnerName: v.string(),
    patientName: v.string(),
    patientPhone: v.string(),
    patientEmail: v.optional(v.string()),
    trackingCode: v.string(),
    trackingUrl: v.string(),
    whatsappIntakeUrl: v.string(),
    whatsappPhone: v.string(),
    condition: v.string(),
    priority: v.string(),
    city: v.optional(v.string()),
    recommendedSessions: v.optional(v.number()),
    createdAt: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (_ctx, args) => {
    try {
      const siteUrl = publicAppUrl();
      const adminDashboardLink = `${siteUrl}/dashboard/admin/referrals`;

      const result = await sendEmail({
        to: args.adminEmail,
        template: "ADMIN_REFERRAL_CREATED",
        data: {
          partnerName: args.partnerName,
          patientName: args.patientName,
          patientPhone: args.patientPhone,
          patientEmail: args.patientEmail,
          trackingCode: args.trackingCode,
          trackingUrl: args.trackingUrl,
          whatsappIntakeUrl: args.whatsappIntakeUrl,
          whatsappPhone: args.whatsappPhone,
          condition: args.condition,
          priority: args.priority,
          city: args.city,
          recommendedSessions: args.recommendedSessions,
          adminDashboardLink,
          createdAt: args.createdAt,
        },
      });

      if (!result.success) {
        console.error("[REFERRAL EMAIL] Failed to send admin referral email:", result.error);
        return { success: false, error: result.error };
      }

      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error("[REFERRAL EMAIL] Error in sendAdminReferralCreatedEmail:", error);
      return { success: false, error: String(error) };
    }
  },
});
