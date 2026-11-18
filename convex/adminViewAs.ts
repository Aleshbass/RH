/**
 * Admin "View as" (owner, 18 Nov 2026): when something isn't working for a physio, patient,
 * partner or clinic, a full admin can see Rehabify exactly as that person does.
 *
 * It makes a one-time Clerk sign-in link (10 minutes) for that person, to open in a private
 * window (app/support/view-as). Everything done there is done as them, so: full admins only
 * (FULL_ONLY in scripts/admin-access/gen-function-pages.mjs), never another team member, a bar
 * stays on screen the whole time (components/auth/ViewAsBanner.tsx), and every link made is in
 * the Activity & audit log (admin_view_as).
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";
import { logSecurityEvent } from "./helpers/securityLog";
import { personName } from "./helpers/patientFacts";
import { publicAppUrl } from "./helpers/appUrl";

const TEAM_ROLES = new Set(["admin", "blog_editor", "learn_instructor"]);
const LINK_SECONDS = 600;

type Authorized = { clerkId: string; name: string; adminName: string };
const authorizeRef = makeFunctionReference<"mutation", { userId: Id<"users"> }, Authorized>("adminViewAs:authorizeViewAs");

/** Checks the admin may view as this person, and logs it. Runs with the admin's own login. */
export const authorizeViewAs = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<Authorized> => {
    const { user: admin } = await requireAdmin(ctx, "adminViewAs:createViewAsLink");
    const target = await ctx.db.get(args.userId);
    if (!target || target.deletedAt) throw new ConvexError("That account no longer exists.");
    if (target._id === admin._id) throw new ConvexError("That's your own account.");
    if (TEAM_ROLES.has(target.role ?? "")) throw new ConvexError("You can't view as another member of the Rehabify team.");
    if (!String(target.clerkId ?? "").startsWith("user_")) {
      throw new ConvexError("This person has no sign-in yet (they joined through WhatsApp or were added by their physio), so there's no account view to open.");
    }
    const name = personName(target, target.email ?? "this person");
    const adminName = personName(admin, "An admin");
    await logSecurityEvent(ctx, "admin_view_as", {
      userId: target._id,
      status: "link_created",
      details: { adminId: admin._id, adminName, role: target.role ?? null },
    });
    return { clerkId: target.clerkId, name, adminName };
  },
});

/** A one-time, 10-minute link that opens Rehabify as this person (open it in a private window). */
export const createViewAsLink = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<{ url: string; name: string; minutes: number }> => {
    const target = await ctx.runMutation(authorizeRef, args);
    const key = process.env.CLERK_SECRET_KEY;
    if (!key) throw new ConvexError("Sign-in links aren't set up yet.");
    const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: target.clerkId, expires_in_seconds: LINK_SECONDS }),
    });
    if (!res.ok) throw new ConvexError("The sign-in link couldn't be made. Try again in a moment.");
    const { token } = (await res.json()) as { token?: string };
    if (!token) throw new ConvexError("The sign-in link couldn't be made. Try again in a moment.");
    // In the #fragment, so the one-time token never reaches a server log
    const hash = new URLSearchParams({ t: token, n: target.name, a: target.adminName }).toString();
    return { url: `${publicAppUrl()}/support/view-as#${hash}`, name: target.name, minutes: LINK_SECONDS / 60 };
  },
});
