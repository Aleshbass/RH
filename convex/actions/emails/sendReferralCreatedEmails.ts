"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { sendEmail } from "../../../lib/email/emailService";
import { publicAppUrl } from "../../helpers/appUrl";

/** Patient/partner-supplied text is escaped before it is placed into email HTML. */
function esc(value: string | undefined | null): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const result = v.object({ success: v.boolean(), messageId: v.optional(v.string()), error: v.optional(v.string()) });

/**
 * Confirmation to the partner's contact that a live referral was received.
 * Internal only — scheduled by the referral core, never callable from clients.
 */
export const sendPartnerReferralCreatedEmail = internalAction({
  args: {
    partnerEmail: v.string(),
    partnerName: v.string(),
    contactName: v.optional(v.string()),
    patientName: v.string(),
    trackingCode: v.string(),
    trackingUrl: v.string(),
    whatsappIntakeUrl: v.string(),
    whatsappPhone: v.string(),
    condition: v.optional(v.string()),
    priority: v.string(),
    createdAt: v.number(),
  },
  returns: result,
  handler: async (_ctx, args) => {
    try {
      const sent = await sendEmail({
        to: args.partnerEmail,
        template: "PARTNER_REFERRAL_CREATED",
        data: {
          partnerName: esc(args.partnerName),
          contactName: esc(args.contactName),
          patientName: esc(args.patientName),
          trackingCode: esc(args.trackingCode),
          trackingUrl: encodeURI(args.trackingUrl),
          whatsappIntakeUrl: encodeURI(args.whatsappIntakeUrl),
          whatsappPhone: esc(args.whatsappPhone),
          condition: esc(args.condition || "Not specified"),
          priority: esc(args.priority),
          createdAt: args.createdAt,
        } as any,
      });
      return sent.success ? { success: true, messageId: sent.messageId } : { success: false, error: sent.error };
    } catch (error) {
      console.error("sendPartnerReferralCreatedEmail failed:", error);
      return { success: false, error: String(error) };
    }
  },
});

/** Operations alert for a new live referral (contact the patient). Internal only. */
export const sendAdminReferralCreatedEmail = internalAction({
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
    condition: v.optional(v.string()),
    priority: v.string(),
    city: v.optional(v.string()),
    recommendedSessions: v.optional(v.number()),
    createdAt: v.number(),
  },
  returns: result,
  handler: async (_ctx, args) => {
    try {
      const patientWhatsApp = `https://wa.me/${args.patientPhone.replace(/\D/g, "")}`;
      const sent = await sendEmail({
        to: args.adminEmail,
        template: "ADMIN_REFERRAL_CREATED",
        data: {
          partnerName: esc(args.partnerName),
          patientName: esc(args.patientName),
          patientPhone: esc(args.patientPhone),
          patientEmail: args.patientEmail ? esc(args.patientEmail) : undefined,
          trackingCode: esc(args.trackingCode),
          trackingUrl: encodeURI(args.trackingUrl),
          // The care team contacts the patient directly on WhatsApp.
          whatsappIntakeUrl: patientWhatsApp,
          whatsappPhone: esc(args.whatsappPhone),
          condition: esc(args.condition || "Not specified"),
          priority: esc(args.priority),
          city: args.city ? esc(args.city) : undefined,
          recommendedSessions: args.recommendedSessions,
          adminDashboardLink: `${publicAppUrl()}/dashboard/admin/referrals`,
          createdAt: args.createdAt,
        },
      });
      return sent.success ? { success: true, messageId: sent.messageId } : { success: false, error: sent.error };
    } catch (error) {
      console.error("sendAdminReferralCreatedEmail failed:", error);
      return { success: false, error: String(error) };
    }
  },
});
