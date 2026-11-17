/**
 * One-time pop-ups ("What's new" for admins, and other intros): whether the signed-in person has
 * seen one, and marking it seen. Rows live in featureIntros (userId + key).
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getViewer } from "./helpers/partnerAccess";

const KEY = /^[a-z0-9:_-]{3,80}$/;

export const hasSeen = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const user = (await getViewer(ctx))?.user ?? null;
    if (!user || !KEY.test(args.key)) return true;
    const row = await ctx.db
      .query("featureIntros")
      .withIndex("by_user_and_key", (q) => q.eq("userId", user._id).eq("key", args.key))
      .first();
    return Boolean(row);
  },
});

export const markSeen = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const user = (await getViewer(ctx))?.user ?? null;
    if (!user) throw new ConvexError("Please sign in.");
    if (!KEY.test(args.key)) throw new ConvexError("Unknown intro.");
    const row = await ctx.db
      .query("featureIntros")
      .withIndex("by_user_and_key", (q) => q.eq("userId", user._id).eq("key", args.key))
      .first();
    if (!row) await ctx.db.insert("featureIntros", { userId: user._id, key: args.key, seenAt: Date.now() });
    return null;
  },
});
