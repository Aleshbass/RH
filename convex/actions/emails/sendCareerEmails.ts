"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { sendEmail } from "../../../lib/email/emailService";
import { publicAppUrl } from "../../helpers/appUrl";
import { plainSubject } from "../../helpers/escapeHtml";

const FOOTER = "Rehabify Health · Careers";

/**
 * Careers emails, scheduled by convex/careers.ts. The PARTNER_NOTICE template escapes every
 * field, so applicant text is safe to pass straight through.
 *  received → the applicant, right after they apply
 *  admin_new → each admin, for a new application
 *  accepted  → the applicant, when an admin accepts the application
 *  declined  → the applicant, only when the admin chose to tell them
 */
export const sendCareerEmail = internalAction({
  args: {
    kind: v.union(v.literal("received"), v.literal("admin_new"), v.literal("accepted"), v.literal("declined")),
    to: v.string(),
    applicantName: v.string(),
    jobTitle: v.string(),
    applicantEmail: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean(), error: v.optional(v.string()) }),
  handler: async (_ctx, args) => {
    const firstName = args.applicantName.trim().split(/\s+/)[0] || args.applicantName;
    const careersUrl = `${publicAppUrl()}/careers`;

    const content = {
      received: {
        subject: `We've received your application for ${args.jobTitle}`,
        data: {
          badge: "Application received",
          heading: "Thanks for applying",
          greetingName: firstName,
          paragraphs: [
            `Thank you for applying for the ${args.jobTitle} role at Rehabify. Your application is with our team.`,
            "We read every application and will email you about the next steps.",
          ],
          ctaLabel: "See other open roles",
          ctaUrl: careersUrl,
        },
      },
      admin_new: {
        subject: `New application: ${args.jobTitle}`,
        data: {
          badge: "Careers",
          heading: `New application for ${args.jobTitle}`,
          paragraphs: [
            `${args.applicantName}${args.applicantEmail ? ` (${args.applicantEmail})` : ""} applied for ${args.jobTitle}.`,
            "Their CV and details are in the admin console.",
          ],
          ctaLabel: "Review the application",
          ctaUrl: `${publicAppUrl()}/dashboard/admin/careers?tab=applications`,
        },
      },
      accepted: {
        subject: `Good news about your ${args.jobTitle} application`,
        data: {
          badge: "Application accepted",
          heading: "Your application has been accepted",
          greetingName: firstName,
          paragraphs: [
            `We're pleased to tell you that your application for the ${args.jobTitle} role at Rehabify has been accepted.`,
            "Someone from our team will contact you at this email address within the next few days with the next steps.",
          ],
          calloutTitle: "What happens next",
          calloutText: "Keep an eye on your inbox. Reply to this email if you have any questions in the meantime.",
        },
      },
      declined: {
        subject: `Your ${args.jobTitle} application`,
        data: {
          badge: "Your application",
          heading: "Thank you for applying",
          greetingName: firstName,
          paragraphs: [
            `Thank you for your interest in the ${args.jobTitle} role and for the time you put into your application.`,
            "We've decided not to move forward with your application this time. We'd be glad to see you apply for future roles.",
          ],
          ctaLabel: "See open roles",
          ctaUrl: careersUrl,
        },
      },
    }[args.kind];

    try {
      const result = await sendEmail({
        to: args.to,
        subject: plainSubject(content.subject),
        template: "PARTNER_NOTICE",
        data: { ...content.data, footerNote: FOOTER },
      });
      if (!result.success) {
        console.error("Careers email failed:", args.kind, result.error);
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (error) {
      console.error("Careers email error:", args.kind, error);
      return { success: false, error: "Could not send the email" };
    }
  },
});
