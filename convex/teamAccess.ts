/**
 * Blog writer and Learn instructor access, given by an admin with just an email address
 * (Admin › Platform › Blog & Learn access).
 *
 *  - The email has an account: it becomes the role straight away (after the admin confirms, when
 *    the account already has another role). The old role is kept on the invite row and put back
 *    if the access is removed.
 *  - No account yet: a "pending" invite and an email. When that person signs up with the same
 *    verified email, claimTeamInvite (called from both sign-up paths in users.ts) gives them the
 *    role, so they land straight in their area of the admin console.
 *
 * Blog writers see only the blog (convex/blog.ts); Learn instructors only Learn › Video courses
 * (convex/learn.ts). Both need an admin to publish.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";
import { insertNotification } from "./helpers/pushNotify";
import { logSecurityEvent } from "./helpers/securityLog";
import { isJoyLoginEmail } from "../lib/auth/joyLoginEmail";

export const TEAM_ROLES = ["blog_editor", "learn_instructor"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
const teamRole = v.union(v.literal("blog_editor"), v.literal("learn_instructor"));

const ROLE_LABEL: Record<TeamRole, string> = { blog_editor: "Blog writer", learn_instructor: "Learn instructor" };
const ROLE_HOME: Record<TeamRole, string> = { blog_editor: "/dashboard/admin/blog", learn_instructor: "/dashboard/admin/learn/courses" };
const isTeamRole = (role: unknown): role is TeamRole => role === "blog_editor" || role === "learn_instructor";

/** Roles that can be put back when access is removed (never admin or another team role). */
const RESTORABLE = new Set(["physiotherapist", "clinic_owner", "patient", "family_member", "doctor", "partner", "clinic_staff"]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sendTeamEmailRef = makeFunctionReference<
  "action",
  { kind: "invite" | "granted"; to: string; role: TeamRole; name?: string },
  { success: boolean; error?: string }
>("actions/emails/sendTeamEmails:sendTeamEmail");

const personName = (u: Doc<"users"> | null) =>
  u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Someone" : "Someone";

async function userByEmail(ctx: MutationCtx, email: string) {
  for (const candidate of new Set([email, email.toLowerCase()])) {
    const rows = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", candidate)).take(5);
    const real = rows.filter((u) => !u.deletedAt);
    if (real.length > 0) return real.sort((a, b) => b._creationTime - a._creationTime)[0];
  }
  return null;
}

async function latestInvite(ctx: MutationCtx, email: string) {
  const rows = await ctx.db.query("teamInvites").withIndex("by_email", (q) => q.eq("email", email)).take(50);
  return rows.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

async function notify(ctx: MutationCtx, userId: Id<"users">, title: string, message: string, actionUrl: string) {
  const now = Date.now();
  await insertNotification(ctx, {
    userId,
    type: "system_alert",
    title,
    message,
    data: { actionUrl },
    status: "pending",
    priority: "medium",
    createdAt: now,
    updatedAt: now,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────────────────────────────────────

/** Everyone with blog or Learn access now, and the invites still waiting for a sign-up. */
export const adminTeamAccess = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const members = [];
    for (const role of TEAM_ROLES) {
      const users = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", role)).take(300);
      for (const u of users) {
        if (u.deletedAt) continue;
        const invites = u.email
          ? await ctx.db.query("teamInvites").withIndex("by_email", (q) => q.eq("email", u.email!.toLowerCase())).take(20)
          : [];
        const accepted = invites.filter((i) => i.status === "accepted" && i.role === role).sort((a, b) => b.updatedAt - a.updatedAt)[0];
        members.push({
          userId: u._id,
          name: personName(u),
          email: u.email ?? null,
          role,
          since: accepted?.acceptedAt ?? null,
          previousRole: accepted?.previousRole ?? null,
        });
      }
    }
    const pendingRows = await ctx.db.query("teamInvites").withIndex("by_status", (q) => q.eq("status", "pending")).order("desc").take(300);
    const pending = [];
    for (const invite of pendingRows) {
      pending.push({
        inviteId: invite._id,
        email: invite.email,
        role: invite.role,
        invitedBy: personName(await ctx.db.get(invite.invitedBy)),
        createdAt: invite.createdAt,
        emailedAt: invite.emailedAt ?? null,
      });
    }
    return { members: members.sort((a, b) => a.name.localeCompare(b.name)), pending };
  },
});

/**
 * Give someone blog or Learn access by email. Returns "confirm" (with their current role) instead
 * of switching an account that already has another role, until the admin confirms.
 */
export const adminGrantTeamRole = mutation({
  args: { email: v.string(), role: teamRole, confirm: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ status: "granted" | "invited" | "already" | "confirm"; name?: string; currentRole?: string }> => {
    const { user: admin } = await requireAdmin(ctx);
    const email = args.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 200) throw new ConvexError("Enter a valid email address.");
    if (isJoyLoginEmail(email)) throw new ConvexError("That is an internal WhatsApp login address. Use the person's real email.");
    const now = Date.now();
    const target = await userByEmail(ctx, email);

    if (target) {
      if (target.role === "admin") throw new ConvexError(`${personName(target)} is an administrator and can already use the blog and Learn.`);
      if (target.role === args.role) return { status: "already", name: personName(target) };
      if (target.role && !args.confirm) return { status: "confirm", name: personName(target), currentRole: target.role };

      await ctx.db.patch(target._id, { role: args.role, onboarded: true });
      await logSecurityEvent(ctx, "role_changed", {
        userId: target._id,
        details: { from: target.role ?? null, to: args.role, by: admin._id, via: "team_access" },
      });
      const open = await latestInvite(ctx, email);
      if (open && open.status === "pending") await ctx.db.patch(open._id, { status: "revoked", revokedAt: now, updatedAt: now });
      await ctx.db.insert("teamInvites", {
        email,
        role: args.role,
        status: "accepted",
        invitedBy: admin._id,
        userId: target._id,
        // A previous team role is not worth restoring; the account's original role is
        previousRole: isTeamRole(target.role) ? open?.previousRole : target.role,
        acceptedAt: now,
        emailedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await notify(ctx, target._id, `You're now a ${ROLE_LABEL[args.role]}`, `${personName(admin)} gave you ${ROLE_LABEL[args.role].toLowerCase()} access on Rehabify.`, ROLE_HOME[args.role]);
      await ctx.scheduler.runAfter(0, sendTeamEmailRef, { kind: "granted", to: email, role: args.role, name: target.firstName });
      return { status: "granted", name: personName(target) };
    }

    const open = await latestInvite(ctx, email);
    if (open && open.status === "pending") {
      await ctx.db.patch(open._id, { role: args.role, invitedBy: admin._id, emailedAt: now, updatedAt: now });
    } else {
      await ctx.db.insert("teamInvites", { email, role: args.role, status: "pending", invitedBy: admin._id, emailedAt: now, createdAt: now, updatedAt: now });
    }
    await ctx.scheduler.runAfter(0, sendTeamEmailRef, { kind: "invite", to: email, role: args.role });
    return { status: "invited" };
  },
});

/** Send the invite email again. */
export const adminResendTeamInvite = mutation({
  args: { inviteId: v.id("teamInvites") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.status !== "pending") throw new ConvexError("That invite is no longer waiting.");
    await ctx.db.patch(invite._id, { emailedAt: Date.now(), updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, sendTeamEmailRef, { kind: "invite", to: invite.email, role: invite.role });
    return null;
  },
});

/** Cancel an invite, or take the access away from an account (its old role comes back). */
export const adminRemoveTeamAccess = mutation({
  args: { inviteId: v.optional(v.id("teamInvites")), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx);
    const now = Date.now();
    if (args.inviteId) {
      const invite = await ctx.db.get(args.inviteId);
      if (invite && invite.status === "pending") await ctx.db.patch(invite._id, { status: "revoked", revokedAt: now, updatedAt: now });
      return null;
    }
    if (!args.userId) throw new ConvexError("Choose who to remove.");
    const target = await ctx.db.get(args.userId);
    if (!target || !isTeamRole(target.role)) throw new ConvexError("That account doesn't have blog or Learn access.");
    const email = (target.email ?? "").toLowerCase();
    const accepted = email
      ? (await ctx.db.query("teamInvites").withIndex("by_email", (q) => q.eq("email", email)).take(50))
          .filter((i) => i.status === "accepted")
          .sort((a, b) => b.updatedAt - a.updatedAt)
      : [];
    const restore = accepted.find((i) => i.previousRole && RESTORABLE.has(i.previousRole))?.previousRole;
    // With no earlier role they choose one again the next time they sign in
    await ctx.db.patch(target._id, restore ? { role: restore as Doc<"users">["role"] } : { role: undefined, onboarded: false });
    for (const row of accepted) await ctx.db.patch(row._id, { status: "revoked", revokedAt: now, updatedAt: now });
    await logSecurityEvent(ctx, "role_changed", {
      userId: target._id,
      details: { from: target.role, to: restore ?? null, by: admin._id, via: "team_access" },
    });
    return { restoredRole: restore ?? null };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Sign-up
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A new account whose verified email has a pending invite becomes that role. Called from both
 * places an account is first stored (the Clerk webhook and the browser's first sign-in), and only
 * for an account that has no role yet, so it never overrides one someone already chose.
 */
export async function claimTeamInvite(ctx: MutationCtx, userId: Id<"users">, verifiedEmail: string | null | undefined) {
  const email = verifiedEmail?.trim().toLowerCase();
  if (!email) return false;
  const invite = await latestInvite(ctx, email);
  if (!invite || invite.status !== "pending") return false;
  const user = await ctx.db.get(userId);
  if (!user || user.role) return false;
  const now = Date.now();
  await ctx.db.patch(user._id, { role: invite.role, onboarded: true });
  await ctx.db.patch(invite._id, { status: "accepted", userId: user._id, acceptedAt: now, updatedAt: now });
  await logSecurityEvent(ctx, "role_changed", { userId: user._id, details: { from: null, to: invite.role, via: "team_invite" } });
  await notify(
    ctx,
    invite.invitedBy,
    `${ROLE_LABEL[invite.role]} joined`,
    `${personName(user)} (${email}) signed up and now has ${ROLE_LABEL[invite.role].toLowerCase()} access.`,
    "/dashboard/admin/team-access"
  );
  return true;
}
