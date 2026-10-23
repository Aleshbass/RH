"use node";

import { randomBytes } from "node:crypto";
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { publicAppUrl } from "../helpers/appUrl";
import { joyLoginEmail } from "../../lib/auth/joyLoginEmail";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
// Long enough that it can't be guessed: the link signs the patient in
const CODE_LENGTH = 32;
const SIGN_IN_TOKEN_TTL_SECONDS = 10 * 60;

function newLinkCode() {
  const bytes = randomBytes(CODE_LENGTH * 2);
  let code = "";
  for (const byte of bytes) {
    // Rejection sampling keeps every character equally likely
    if (byte >= Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length) continue;
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    if (code.length === CODE_LENGTH) return code;
  }
  return newLinkCode();
}

async function clerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  const { createClerkClient } = await import("@clerk/backend");
  return createClerkClient({ secretKey });
}

/** Clerk's error code only; messages can echo the phone number, which must stay out of logs. */
function clerkErrorCode(error: unknown) {
  const errors = (error as { errors?: { code?: string }[] })?.errors;
  return errors?.[0]?.code ?? (error instanceof Error ? error.name : "unknown");
}

type ProvisionResult =
  | { ok: false; reason: "not_found" }
  | { ok: true; dashboard_url: string; expires_at: number; mode: "one_tap" | "claim" | "sign_in" };

/**
 * Gives a Joy patient a way into their dashboard: creates their Clerk account and a
 * /go/<code> link. The account's only identifier is a private placeholder address
 * (lib/auth/joyLoginEmail.ts): phone sign-in is a paid Clerk feature, and the email Joy
 * collected is never used, because Clerk would mark it verified and an address typed into
 * a chat isn't proof of ownership. Without a Clerk account the link falls back to
 * "create your account and claim this record".
 */
export const provisionJoyDashboard = internalAction({
  args: {
    patientId: v.id("users"),
    bookingId: v.optional(v.id("marketplaceBookings")),
    notifyJoy: v.boolean(),
    // Set when Joy asks for a link on the patient's behalf; it must match their number
    senderPhone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ProvisionResult> => {
    const context = await ctx.runQuery(internal.joyAccounts.getProvisioningContext, {
      patientId: args.patientId,
      senderPhone: args.senderPhone,
    });
    if (context.status === "not_found") return { ok: false, reason: "not_found" };

    let clerkUserId = context.clerkUserId;
    if (context.status === "placeholder") {
      const clerk = await clerkClient();
      if (!clerk) {
        console.warn("joy_dashboard_clerk_not_configured");
      } else {
        try {
          const email = joyLoginEmail(args.patientId);
          // A run that created the login but stopped before attaching it left it behind; reuse it
          const { data: existing } = await clerk.users.getUserList({ emailAddress: [email] });
          const created =
            existing.find((user) => user.externalId === args.patientId) ??
            (await clerk.users.createUser({
              emailAddress: [email],
              firstName: context.firstName,
              lastName: context.lastName,
              skipPasswordRequirement: true,
              externalId: args.patientId,
              publicMetadata: { role: "patient", source: "joy_whatsapp" },
            }));
          const { attached } = await ctx.runMutation(internal.joyAccounts.attachClerkUser, {
            patientId: args.patientId,
            clerkUserId: created.id,
            bookingId: args.bookingId,
          });
          if (attached) {
            clerkUserId = created.id;
          } else {
            // The patient claimed the record another way meanwhile; drop the unused login
            await clerk.users.deleteUser(created.id).catch(() => undefined);
          }
        } catch (error) {
          console.warn("joy_dashboard_clerk_user_not_created", { reason: clerkErrorCode(error) });
        }
      }
    }

    const code = newLinkCode();
    const link = await ctx.runMutation(internal.joyAccounts.createAccessLink, {
      patientId: args.patientId,
      code,
      clerkUserId,
      bookingId: args.bookingId,
    });
    const dashboardUrl = `${publicAppUrl()}/go/${code}`;

    if (args.notifyJoy) {
      await ctx.runAction(internal.joyIntegration.deliverJoyEvent, {
        eventId: `patient-dashboard-ready-${args.bookingId ?? args.patientId}`,
        eventType: "patient.dashboard_ready",
        data: {
          patient_id: args.patientId,
          booking_id: args.bookingId ?? null,
          dashboard_url: dashboardUrl,
          expires_at: link.expiresAt,
          mode: link.mode,
        },
      });
    }
    return { ok: true, dashboard_url: dashboardUrl, expires_at: link.expiresAt, mode: link.mode };
  },
});

/**
 * The "Open my dashboard" tap on /go/<code>. Returns a short-lived Clerk sign-in ticket
 * for the patient's account; the page completes sign-in with it. The code is the credential.
 */
export const redeemDashboardLink = action({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; ticket: string } | { ok: false; reason: string }> => {
    const consumed = await ctx.runMutation(internal.joyAccounts.consumeAccessLink, { code: args.code });
    if (!consumed.ok) return { ok: false, reason: consumed.reason };
    try {
      const clerk = await clerkClient();
      if (!clerk) throw Object.assign(new Error("CLERK_SECRET_KEY is not set"), { name: "ClerkNotConfigured" });
      const token = await clerk.signInTokens.createSignInToken({
        userId: consumed.clerkUserId,
        expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS,
      });
      return { ok: true, ticket: token.token };
    } catch (error) {
      console.error("joy_dashboard_sign_in_token_failed", { reason: clerkErrorCode(error) });
      await ctx.runMutation(internal.joyAccounts.releaseAccessLink, { code: args.code });
      return { ok: false, reason: "unavailable" };
    }
  },
});
