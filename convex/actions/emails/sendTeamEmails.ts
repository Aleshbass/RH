"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { sendEmail } from "../../../lib/email/emailService";
import { publicAppUrl } from "../../helpers/appUrl";

/**
 * Emails for blog writer and Learn instructor access (convex/teamAccess.ts). The PARTNER_NOTICE
 * template escapes every field.
 *  invite  → an email with no account yet: sign up with this address to get the access
 *  granted → an existing account that was just given the access
 */
const ROLE = {
  blog_editor: {
    label: "Blog writer",
    path: "/dashboard/admin/blog",
    what: "write articles for the Rehabify blog. You write and send each post for review; our team publishes it.",
  },
  learn_instructor: {
    label: "Learn instructor",
    path: "/dashboard/admin/learn/courses",
    what: "build video courses on Rehabify Learn. You create a course, add its lessons and send it for review; our team sets who can watch and publishes it.",
  },
} as const;

export const sendTeamEmail = internalAction({
  args: {
    kind: v.union(v.literal("invite"), v.literal("granted")),
    to: v.string(),
    role: v.union(v.literal("blog_editor"), v.literal("learn_instructor")),
    name: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean(), error: v.optional(v.string()) }),
  handler: async (_ctx, args) => {
    const role = ROLE[args.role];
    const base = publicAppUrl();
    const data =
      args.kind === "invite"
        ? {
            badge: role.label,
            heading: `You're invited to ${args.role === "blog_editor" ? "write for" : "teach on"} Rehabify`,
            paragraphs: [
              `The Rehabify team has invited you to ${role.what}`,
              `To start, create your Rehabify account with this email address (${args.to}). You'll go straight to your ${role.label.toLowerCase()} space once you're signed in.`,
            ],
            calloutTitle: "Use this same email",
            calloutText: "The access is linked to this address. Signing up with a different email won't include it.",
            ctaLabel: "Create my account",
            ctaUrl: `${base}/sign-up`,
          }
        : {
            badge: role.label,
            heading: `You're now a ${role.label}`,
            greetingName: args.name,
            paragraphs: [`You can now ${role.what}`, "Sign in with your usual Rehabify account to get started."],
            ctaLabel: args.role === "blog_editor" ? "Open the blog" : "Open my courses",
            ctaUrl: `${base}${role.path}`,
          };
    try {
      const result = await sendEmail({
        to: args.to,
        subject: args.kind === "invite" ? `You're invited to Rehabify as a ${role.label}` : `You're now a ${role.label} on Rehabify`,
        template: "PARTNER_NOTICE",
        data: { ...data, footerNote: "Rehabify Health" },
      });
      if (!result.success) {
        console.error("Team access email failed:", args.kind, result.error);
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (error) {
      console.error("Team access email error:", args.kind, error instanceof Error ? error.message : "unknown");
      return { success: false, error: "Could not send the email" };
    }
  },
});
