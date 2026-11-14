/**
 * Learn super admins (Mary 2026-11-14): people with every Learn admin power (courses, cohorts,
 * certificates, community, Spaces, simulations, groups) and nothing else on the platform.
 * A flag row, not a role, so a physio or a Learn instructor keeps their own account type.
 * Only platform admins add or remove them. Checks live in helpers/learnAccess.ts.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
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

export const add = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx);
    const email = args.email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("Enter a valid email address.");
    const target = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!target || target.deletedAt) {
      throw new ConvexError("No Rehabify account uses that email yet. Ask them to sign up on Rehabify Learn first, then add them.");
    }
    if (target.role === "admin") throw new ConvexError("They're a platform admin already, so they have every Learn power.");
    const existing = await ctx.db
      .query("learnAdmins")
      .withIndex("by_user", (q) => q.eq("userId", target._id))
      .first();
    if (existing) return { name: nameOf(target), already: true };
    const now = Date.now();
    await ctx.db.insert("learnAdmins", { userId: target._id, addedBy: admin._id, addedAt: now });
    await logSecurityEvent(ctx, "role_changed", {
      userId: target._id,
      details: { learnSuperAdmin: true, by: admin._id, via: "learn_admins" },
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
    return { name: nameOf(target), already: false };
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
