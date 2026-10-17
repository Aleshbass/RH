/**
 * Writes the sign-in events shown on /dashboard/admin/activity. Role changes are logged
 * where roles change (users.ts, clinicTools.ts) via helpers/securityLog.ts.
 */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertServerCaller } from "./helpers/serverSecret";
import { logSecurityEvent } from "./helpers/securityLog";

/**
 * Called by the app once a Clerk session is active (components/auth/SyncUserWithConvex).
 * Recorded once per session, so reloading the page doesn't count as another sign-in.
 */
export const recordSignIn = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { recorded: false };
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return { recorded: false };

    const sessionId = args.sessionId.slice(0, 100);
    const recent = await ctx.db
      .query("analytics_events")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
    if (recent.some((e) => e.type === "user_login" && e.metadata.details?.sessionId === sessionId)) {
      return { recorded: false };
    }

    await logSecurityEvent(ctx, "user_login", {
      userId: user._id,
      details: { sessionId, role: user.role ?? null },
    });
    return { recorded: true };
  },
});

/**
 * A rejected sign-in attempt. Only our Next.js route (/api/security/failed-sign-in, which
 * rate-limits by IP) may call this; the email is stored masked.
 */
export const recordFailedSignIn = mutation({
  args: {
    serverSecret: v.string(),
    reason: v.string(),
    identifier: v.optional(v.string()),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServerCaller(args.serverSecret);
    const identifier = args.identifier?.trim().toLowerCase().slice(0, 200);
    const user = identifier?.includes("@")
      ? await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", identifier))
          .first()
      : null;

    await logSecurityEvent(ctx, "failed_authentication", {
      userId: user?._id,
      status: args.reason.slice(0, 80),
      details: { identifier: identifier ? maskIdentifier(identifier) : null, ip: args.ip?.slice(0, 64) ?? null },
    });
    return { recorded: true };
  },
});

function maskIdentifier(identifier: string) {
  const [name, domain] = identifier.split("@");
  if (!domain) return `${identifier.slice(0, 2)}***`;
  return `${name.slice(0, 2)}***@${domain}`;
}
