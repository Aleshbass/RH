"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { sendEmail } from "../../../lib/email/emailService";
import { publicAppUrl } from "../../helpers/appUrl";

/**
 * Partner onboarding emails. All are internal actions (scheduled by partner/admin
 * mutations), so they cannot be invoked from a browser to send arbitrary mail from the
 * Rehabify domain. Applicant-supplied text is HTML-escaped.
 */

function esc(value: string | undefined | null): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function portalUrl(): string {
  const siteUrl = publicAppUrl();
  return siteUrl.includes("localhost") ? `${siteUrl}/partners/portal` : "https://partners.physioaroundme.com";
}

const result = v.object({ success: v.boolean(), messageId: v.optional(v.string()), error: v.optional(v.string()) });

export const sendPartnerApplicationSubmittedAdminEmail = internalAction({
  args: {
    adminEmail: v.string(),
    organizationName: v.string(),
    organizationType: v.string(),
    contactName: v.optional(v.string()),
    contactEmail: v.string(),
    contactPhone: v.optional(v.string()),
    coverageStates: v.optional(v.array(v.string())),
  },
  returns: result,
  handler: async (_ctx, args) => {
    try {
      const sent = await sendEmail({
        to: args.adminEmail,
        template: "PARTNER_APPLICATION_SUBMITTED",
        data: {
          organizationName: esc(args.organizationName),
          organizationType: esc(args.organizationType),
          contactName: args.contactName ? esc(args.contactName) : undefined,
          contactEmail: esc(args.contactEmail),
          contactPhone: args.contactPhone ? esc(args.contactPhone) : undefined,
          coverageStates: args.coverageStates?.map((s) => esc(s)),
          reviewLink: `${publicAppUrl()}/dashboard/admin/partnerships`,
        },
      });
      return sent.success ? { success: true, messageId: sent.messageId } : { success: false, error: sent.error };
    } catch (error) {
      console.error("sendPartnerApplicationSubmittedAdminEmail failed:", error);
      return { success: false, error: String(error) };
    }
  },
});

export const sendPartnerApplicationApprovedEmail = internalAction({
  args: {
    partnerEmail: v.string(),
    organizationName: v.string(),
    partnerCode: v.string(),
    contactName: v.optional(v.string()),
    approvedBy: v.optional(v.string()),
  },
  returns: result,
  handler: async (_ctx, args) => {
    try {
      const link = portalUrl();
      const sent = await sendEmail({
        to: args.partnerEmail,
        template: "PARTNER_APPLICATION_APPROVED",
        data: {
          organizationName: esc(args.organizationName),
          partnerCode: esc(args.partnerCode),
          contactName: args.contactName ? esc(args.contactName) : undefined,
          dashboardLink: link,
          portalLink: link,
          approvedBy: args.approvedBy ? esc(args.approvedBy) : undefined,
        },
      });
      return sent.success ? { success: true, messageId: sent.messageId } : { success: false, error: sent.error };
    } catch (error) {
      console.error("sendPartnerApplicationApprovedEmail failed:", error);
      return { success: false, error: String(error) };
    }
  },
});

export const sendPartnerApplicationDeclinedEmail = internalAction({
  args: {
    partnerEmail: v.string(),
    organizationName: v.string(),
    contactName: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  returns: result,
  handler: async (_ctx, args) => {
    try {
      const sent = await sendEmail({
        to: args.partnerEmail,
        template: "PARTNER_APPLICATION_DECLINED",
        data: {
          organizationName: esc(args.organizationName),
          contactName: args.contactName ? esc(args.contactName) : undefined,
          reason: args.reason ? esc(args.reason) : undefined,
          supportLink: "mailto:partners@physioaroundme.com",
        },
      });
      return sent.success ? { success: true, messageId: sent.messageId } : { success: false, error: sent.error };
    } catch (error) {
      console.error("sendPartnerApplicationDeclinedEmail failed:", error);
      return { success: false, error: String(error) };
    }
  },
});

/** Go-live (production access) lifecycle emails and credential-rotation notices. */
export const sendPartnerGoLiveEmail = internalAction({
  args: {
    to: v.string(),
    kind: v.union(
      v.literal("requested"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("suspended"),
      v.literal("credentials_rotated")
    ),
    organizationName: v.string(),
    partnerCode: v.string(),
    note: v.optional(v.string()),
  },
  returns: result,
  handler: async (_ctx, args) => {
    const portal = portalUrl();
    const content = {
      requested: {
        subject: `Go-live request: ${args.organizationName}`,
        badge: "Production access request",
        heading: `${args.organizationName} requested production access`,
        paragraphs: [
          `Partner code: ${args.partnerCode}.`,
          "Review the partner's sandbox activity and contract, then approve or decline in the admin Partnerships page.",
        ],
        cta: { label: "Review in admin", url: `${publicAppUrl()}/dashboard/admin/partnerships` },
      },
      approved: {
        subject: "You're approved for production — Rehabify Partner API",
        badge: "Production access approved",
        heading: "You can go live",
        paragraphs: [
          `Production access for ${args.organizationName} has been approved.`,
          "Create live API keys (sk_live_…) and set your live webhook endpoint in the Partner Portal. Live keys are shown once — store them in your secrets manager.",
        ],
        cta: { label: "Open the Partner Portal", url: portal },
      },
      rejected: {
        subject: "Update on your production access request",
        badge: "Production access",
        heading: "Your go-live request needs changes",
        paragraphs: [
          `We could not approve production access for ${args.organizationName} yet. You can address the points below and request again from the Partner Portal.`,
        ],
        cta: { label: "Open the Partner Portal", url: portal },
      },
      suspended: {
        subject: "Production access suspended — Rehabify Partner API",
        badge: "Production access suspended",
        heading: "Live API access is suspended",
        paragraphs: [
          `Production access for ${args.organizationName} has been suspended. Live API keys return 403 production_access_required until access is reinstated.`,
          "Contact partners@physioaroundme.com to resolve this.",
        ],
        cta: { label: "Open the Partner Portal", url: portal },
      },
      credentials_rotated: {
        subject: "Action required: create new Rehabify API keys",
        badge: "Security update",
        heading: "Your API credentials were rotated",
        paragraphs: [
          `As part of a security upgrade, all API keys and webhook signing secrets issued to ${args.organizationName} before this change have been revoked.`,
          "Sign in to the Partner Portal to create new API keys (they are now shown once and stored only as a hash) and to copy your new webhook signing secret. Update your servers before your next API call.",
        ],
        cta: { label: "Create new keys", url: portal },
      },
    }[args.kind];
    try {
      const sent = await sendEmail({
        to: args.to,
        subject: content.subject,
        template: "PARTNER_NOTICE",
        data: {
          badge: content.badge,
          heading: content.heading,
          subheading: args.organizationName,
          paragraphs: content.paragraphs,
          calloutTitle: args.note ? (args.kind === "requested" ? "Partner's note" : "Details") : undefined,
          calloutText: args.note,
          ctaLabel: content.cta.label,
          ctaUrl: content.cta.url,
        },
      });
      return sent.success ? { success: true, messageId: sent.messageId } : { success: false, error: sent.error };
    } catch (error) {
      console.error("sendPartnerGoLiveEmail failed:", error);
      return { success: false, error: String(error) };
    }
  },
});
