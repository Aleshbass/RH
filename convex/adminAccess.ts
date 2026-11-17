/**
 * Admin access (owner 2026-11-17): full admins choose, per admin, "everything" or a checklist of
 * admin pages. The console shows only those pages and Convex refuses the rest
 * (helpers/adminAccess.ts + the generated helpers/adminFunctionPages.ts).
 *
 * Changing anyone's access (and roles, team access, Learn super admins) needs a full admin, and
 * nobody can limit themselves, so there is always at least one full admin.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getViewer } from "./helpers/partnerAccess";
import { adminAccessOf, requireFullAdmin } from "./helpers/adminAccess";
import { ADMIN_PAGES } from "./helpers/adminFunctionPages";

/** The signed-in admin's own access (the console reads this to show and gate pages). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = (await getViewer(ctx))?.user ?? null;
    if (!user || user.role !== "admin") return null;
    const access = await adminAccessOf(ctx, user._id);
    const prefs = await ctx.db
      .query("adminHomePrefs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return { full: access.full, pages: access.pages, widgets: prefs?.widgets ?? null };
  },
});

/** Every admin and what they can open (Admin › Admin access). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireFullAdmin(ctx);
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .take(100);
    const rows = [];
    for (const admin of admins) {
      if (admin.deletedAt) continue;
      const row = await ctx.db
        .query("adminAccess")
        .withIndex("by_user", (q) => q.eq("userId", admin._id))
        .unique();
      const updater = row?.updatedBy ? await ctx.db.get(row.updatedBy) : null;
      rows.push({
        userId: admin._id,
        name: [admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email || "Admin",
        email: admin.email ?? null,
        imageUrl: admin.imageUrl ?? null,
        isMe: admin._id === me._id,
        full: !row || row.full,
        pages: row && !row.full ? row.pages : [],
        updatedAt: row?.updatedAt ?? null,
        updatedBy: updater ? [updater.firstName, updater.lastName].filter(Boolean).join(" ") || updater.email || null : null,
      });
    }
    // Me first, then everything, then by name
    return rows.sort((a, b) => Number(b.isMe) - Number(a.isMe) || Number(b.full) - Number(a.full) || a.name.localeCompare(b.name));
  },
});

/** Give an admin everything, or only the ticked pages. */
export const setAccess = mutation({
  args: { userId: v.id("users"), full: v.boolean(), pages: v.array(v.string()) },
  handler: async (ctx, args) => {
    const me = await requireFullAdmin(ctx);
    if (args.userId === me._id) throw new ConvexError("You can't change your own access. Ask another full admin.");
    const target = await ctx.db.get(args.userId);
    if (!target || target.role !== "admin") throw new ConvexError("That person isn't an admin.");
    const known = new Set(ADMIN_PAGES);
    const pages = [...new Set(args.pages)].filter((p) => known.has(p));
    if (!args.full && pages.length === 0) throw new ConvexError("Tick at least one page, or give them everything.");
    const now = Date.now();
    const row = await ctx.db
      .query("adminAccess")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const patch = { full: args.full, pages: args.full ? [] : pages, updatedBy: me._id, updatedAt: now };
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert("adminAccess", { userId: args.userId, ...patch });
    await ctx.db.insert("auditLogs", {
      actorUserId: me._id,
      action: "admin_access_changed",
      targetEntityType: "user",
      targetEntityId: args.userId,
      timestamp: now,
      details: { full: args.full, pages: patch.pages },
    });
    return null;
  },
});

/** "My page": the widgets this admin chose, in their order. */
export const saveMyWidgets = mutation({
  args: { widgets: v.array(v.string()) },
  handler: async (ctx, args) => {
    const user = (await getViewer(ctx))?.user ?? null;
    if (!user || user.role !== "admin") throw new ConvexError("Administrator access required.");
    const widgets = [...new Set(args.widgets)].slice(0, 40).map((w) => w.slice(0, 60));
    const row = await ctx.db
      .query("adminHomePrefs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (row) await ctx.db.patch(row._id, { widgets, updatedAt: Date.now() });
    else await ctx.db.insert("adminHomePrefs", { userId: user._id, widgets, updatedAt: Date.now() });
    return null;
  },
});
