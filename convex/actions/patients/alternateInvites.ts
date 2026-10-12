// @ts-nocheck
"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api } from "../../_generated/api";
import { publicAppUrl } from "../../helpers/appUrl";

// Utility to build invitation link from env
function buildInvitationLink(code: string): string {
  const envBase = publicAppUrl();
  const baseUrl = envBase.replace(/\/$/, "");
  return `${baseUrl}/patient-invite/${code}`;
}

/**
 * Magic-link style invitation using Clerk invitations.
 * Also creates our Convex invitation to preserve code-based linking.
 */
export const createMagicLinkInvitation = action({
  args: {
    patientEmail: v.string(),
    patientName: v.optional(v.string()),
    expirationDays: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    invitationCode: v.optional(v.string()),
    invitationLink: v.optional(v.string()),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      // 1) Create Convex invitation (source of truth for code)
      const result = await ctx.runMutation(api.patientInvitations.createPatientInvitation, {
        patientEmail: args.patientEmail,
        patientName: args.patientName,
        expirationDays: args.expirationDays,
      });

      if (!result?.success || !result?.invitationCode) {
        return { success: false, message: result?.message || "Failed to create invitation" };
      }

      const link = buildInvitationLink(result.invitationCode);

      // 2) Create Clerk invitation (magic link email) if configured
      const secret = process.env.CLERK_SECRET_KEY;
      if (!secret) {
        return {
          success: true,
          invitationCode: result.invitationCode,
          invitationLink: link,
          message: "Clerk secret not set; created app invitation without Clerk magic link.",
        };
      }

      try {
        const { createClerkClient } = await import("@clerk/backend");
        const clerk = createClerkClient({ secretKey: secret });

        await clerk.invitations.createInvitation({
          emailAddress: args.patientEmail,
          redirectUrl: link, // round-trip back to our invite page with code
          publicMetadata: {
            role: "patient",
            inviteCode: result.invitationCode,
          },
        });
      } catch (e) {
        console.error("Failed to create Clerk invitation:", e);
        return {
          success: true,
          invitationCode: result.invitationCode,
          invitationLink: link,
          message: "Created app invitation; Clerk magic link not sent (check dependencies/keys).",
        };
      }

      return {
        success: true,
        invitationCode: result.invitationCode,
        invitationLink: link,
      };
    } catch (error) {
      console.error("Error in createMagicLinkInvitation:", error);
      return { success: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

/**
 * Send patient invitation via SMS using Twilio.
 * Also creates our Convex invitation to generate the link/code.
 */
export const sendPatientInvitationSms = action({
  args: {
    phoneNumber: v.string(),
    patientName: v.optional(v.string()),
    expirationDays: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    invitationCode: v.optional(v.string()),
    invitationLink: v.optional(v.string()),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      // Use the current physiotherapist identity to create an invitation to a phone-only contact
      // We'll store phone number in notes or leave name optional
      const placeholderEmail = `${Date.now()}@placeholder.patient`; // We still need an email for the invitation schema; will be updated on signup
      const result = await ctx.runMutation(api.patientInvitations.createPatientInvitation, {
        patientEmail: placeholderEmail,
        patientName: args.patientName,
        expirationDays: args.expirationDays,
      });

      if (!result?.success || !result?.invitationCode) {
        return { success: false, message: result?.message || "Failed to create invitation" };
      }

      const link = buildInvitationLink(result.invitationCode);

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const apiKeySid = process.env.TWILIO_API_KEY_SID; // optional
      const apiKeySecret = process.env.TWILIO_API_KEY_SECRET; // optional
      const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID; // preferred
      const fromNumber = process.env.TWILIO_FROM_NUMBER; // fallback if no Messaging Service SID

      if (!accountSid || (!authToken && !(apiKeySid && apiKeySecret))) {
        return {
          success: true,
          invitationCode: result.invitationCode,
          invitationLink: link,
          message: "Twilio credentials not configured; SMS not sent.",
        };
      }

      if (!messagingServiceSid && !fromNumber) {
        return {
          success: true,
          invitationCode: result.invitationCode,
          invitationLink: link,
          message: "Twilio sender not configured; set TWILIO_MESSAGING_SERVICE_SID (recommended) or TWILIO_FROM_NUMBER.",
        };
      }

      try {
        const twilioModule = await import("twilio");
        const twilioCtor: any = (twilioModule as any).default || (twilioModule as any);
        // Prefer API Key auth if provided; otherwise use Account SID + Auth Token
        const client = apiKeySid && apiKeySecret
          ? twilioCtor(apiKeySid, apiKeySecret, { accountSid })
          : twilioCtor(accountSid, authToken);

        const body = `You have been invited to Rehabify Health. Tap to join: ${link}`;
        const msgParams: any = { to: args.phoneNumber, body };
        if (messagingServiceSid) {
          msgParams.messagingServiceSid = messagingServiceSid;
        } else {
          msgParams.from = fromNumber;
        }

        await client.messages.create(msgParams);
      } catch (e) {
        console.error("Failed to send SMS via Twilio:", e);
        return {
          success: true,
          invitationCode: result.invitationCode,
          invitationLink: link,
          message: "Created invitation; SMS send failed (check dependencies/keys).",
        };
      }

      return { success: true, invitationCode: result.invitationCode, invitationLink: link };
    } catch (error) {
      console.error("Error in sendPatientInvitationSms:", error);
      return { success: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

/**
 * Directly create a patient user in Clerk and send activation/invitation email.
 * We still create a Convex invitation code for consistent onboarding redirect.
 */
export const directCreatePatient = action({
  args: {
    patientEmail: v.string(),
    patientName: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    invitationCode: v.optional(v.string()),
    invitationLink: v.optional(v.string()),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      // Split name
      const [firstName, ...rest] = (args.patientName || "").split(" ");
      const lastName = rest.join(" ") || undefined;

      // Create a Convex invitation for consistent onboarding redirection
      const invite = await ctx.runMutation(api.patientInvitations.createPatientInvitation, {
        patientEmail: args.patientEmail,
        patientName: args.patientName,
        expirationDays: 14,
      });
      if (!invite?.success || !invite?.invitationCode) {
        return { success: false, message: invite?.message || "Failed to create invitation" };
      }
      const link = buildInvitationLink(invite.invitationCode);

      // Create Clerk user and send invitation if configured
      const secret = process.env.CLERK_SECRET_KEY;
      if (!secret) {
        return {
          success: true,
          invitationCode: invite.invitationCode,
          invitationLink: link,
          message: "CLERK_SECRET_KEY not set; created app invitation only.",
        };
      }

      try {
        const { createClerkClient } = await import("@clerk/backend");
        const clerk = createClerkClient({ secretKey: secret });

        // Create or find user
        try {
          await clerk.users.createUser({
            emailAddress: [args.patientEmail],
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            phoneNumbers: args.phoneNumber ? [args.phoneNumber] : undefined,
            skipPasswordRequirement: true,
            publicMetadata: { role: "patient" },
          });
        } catch (createErr) {
          console.warn("Create user failed, attempting to send invitation anyway:", createErr);
        }

        // Send invitation (activation) email via Clerk
        await clerk.invitations.createInvitation({
          emailAddress: args.patientEmail,
          redirectUrl: link,
          publicMetadata: { role: "patient", inviteCode: invite.invitationCode },
        });
      } catch (e) {
        console.error("Failed to create Clerk user/invitation:", e);
        return {
          success: true,
          invitationCode: invite.invitationCode,
          invitationLink: link,
          message: "Created app invitation; Clerk user/invitation not sent (check dependencies/keys).",
        };
      }

      return { success: true, invitationCode: invite.invitationCode, invitationLink: link };
    } catch (error) {
      console.error("Error in directCreatePatient:", error);
      return { success: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});
