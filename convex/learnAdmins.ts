/**
 * Learn super admins (Mary 2026-11-14): people with every Learn admin power (courses, cohorts,
 * certificates, community, Spaces, simulations, groups) and nothing else on the platform.
 * A flag row, not a role, so a physio or a Learn instructor keeps their own account type.
 * Only platform admins add or remove them. Checks live in helpers/learnAccess.ts.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appLink } from "./helpers/appUrl";
import { isLearnAdminUser } from "./helpers/learnAccess";
import { getViewer, requireAdmin } from "./helpers/partnerAccess";
import { insertNotification } from "./helpers/pushNotify";
import { logSecurityEvent } from "./helpers/securityLog";

const nameOf = (u: { firstName?: string; lastName?: string; email?: string } | null) =>
  (u && ([u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email)) || "Former member";

/** The signed-in person's Learn admin standing (admin console gate and Learn UI). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = (await getViewer(ctx))?.user ?? null;
    if (!user) return { learnAdmin: false, platformAdmin: false };
    return { learnAdmin: await isLearnAdminUser(ctx, user), platformAdmin: user.role === "admin" };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("learnAdmins").take(200);
    const out = [];
    for (const r of rows) {
      const user = await ctx.db.get(r.userId);
      if (!user || user.deletedAt) continue;
      const by = await ctx.db.get(r.addedBy);
      out.push({
        userId: user._id,
        name: nameOf(user),
        email: user.email ?? null,
        imageUrl: user.imageUrl ?? null,
        role: user.role ?? null,
        addedBy: nameOf(by),
        addedAt: r.addedAt,
      });
    }
    return out.sort((a, b) => b.addedAt - a.addedAt);
  },
});

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Makes an existing account a Learn super admin (row, security log, notification). False if already one. */
async function grant(ctx: MutationCtx, target: Doc<"users">, byId: Id<"users">) {
  const existing = await ctx.db
    .query("learnAdmins")
    .withIndex("by_user", (q) => q.eq("userId", target._id))
    .first();
  if (existing) return false;
  const now = Date.now();
  await ctx.db.insert("learnAdmins", { userId: target._id, addedBy: byId, addedAt: now });
  await logSecurityEvent(ctx, "role_changed", {
    userId: target._id,
    details: { learnSuperAdmin: true, by: byId, via: "learn_admins" },
  });
  await insertNotification(ctx, {
    userId: target._id,
    type: "learn_admin_added",
    priority: "medium",
    status: "pending",
    payload: {
      title: "You're now a Rehabify Learn super admin",
      body: "You can manage courses, groups, the community and simulations from the Learn admin.",
      link: appLink("/dashboard/admin/learn"),
    },
    createdAt: now,
  });
  return true;
}

/** Adds by email: an existing account becomes a super admin now; anyone else when they first sign in. */
async function addByEmail(ctx: MutationCtx, raw: string, byId: Id<"users">) {
  const email = raw.toLowerCase().trim();
  if (!VALID_EMAIL.test(email)) return { email, result: "invalid" as const, name: email };
  const target = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (!target || target.deletedAt) {
    const waiting = await ctx.db
      .query("learnAdminInvites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!waiting) await ctx.db.insert("learnAdminInvites", { email, addedBy: byId, createdAt: Date.now() });
    return { email, result: "pending" as const, name: email };
  }
  if (target.role === "admin") return { email, result: "platform_admin" as const, name: nameOf(target) };
  return { email, result: (await grant(ctx, target, byId)) ? ("added" as const) : ("already" as const), name: nameOf(target) };
}

/**
 * Called when someone signs in or signs up (users.storeUserFromClerk) with a verified email: if a
 * platform admin added that email before they had an account, they become a super admin now.
 */
export async function claimLearnAdminInvite(ctx: MutationCtx, userId: Id<"users">, verifiedEmail: string | null | undefined) {
  const email = verifiedEmail?.trim().toLowerCase();
  if (!email) return false;
  const invite = await ctx.db
    .query("learnAdminInvites")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (!invite) return false;
  await ctx.db.delete(invite._id);
  const user = await ctx.db.get(userId);
  if (!user || user.deletedAt || user.role === "admin") return false;
  return await grant(ctx, user, invite.addedBy);
}

/** Ops: add several at once (npx convex run learnAdmins:addMany). `byEmail` must be a platform admin's account. */
export const addMany = internalMutation({
  args: { emails: v.array(v.string()), byEmail: v.string() },
  handler: async (ctx, args) => {
    const by = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.byEmail.toLowerCase().trim()))
      .first();
    if (!by || by.role !== "admin") throw new ConvexError("byEmail must be a platform admin's account.");
    const out = [];
    for (const email of new Set(args.emails.map((e) => e.toLowerCase().trim()))) out.push(await addByEmail(ctx, email, by._id));
    return out;
  },
});

/** People added before they had an account, still waiting to sign up (platform admins only). */
export const pending = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.isAdmin) return [];
    const rows = await ctx.db.query("learnAdminInvites").take(200);
    return rows.map((r) => ({ email: r.email, createdAt: r.createdAt })).sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const cancelInvite = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("learnAdminInvites")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase().trim()))
      .take(5);
    for (const r of rows) await ctx.db.delete(r._id);
  },
});

/** From Admin › Blog & Learn access: no account yet means they're added when they sign up. */
export const add = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx);
    const res = await addByEmail(ctx, args.email, admin._id);
    if (res.result === "invalid") throw new ConvexError("Enter a valid email address.");
    if (res.result === "platform_admin") throw new ConvexError("They're a platform admin already, so they have every Learn power.");
    return { name: res.name, already: res.result === "already", pending: res.result === "pending" };
  },
});

export const remove = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx);
    const rows = await ctx.db
      .query("learnAdmins")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(5);
    for (const r of rows) await ctx.db.delete(r._id);
    if (rows.length) {
      await logSecurityEvent(ctx, "role_changed", {
        userId: args.userId,
        details: { learnSuperAdmin: false, by: admin._id, via: "learn_admins" },
      });
    }
  },
});
