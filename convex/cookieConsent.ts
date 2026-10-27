/**
 * Cookie consent records: proof of what each visitor agreed to and when (Nigeria Data
 * Protection Act: consent must be demonstrable), and the signed-in person's latest choice so
 * it follows them to other devices. The browser cookie (lib/consent.ts) does the enforcing.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getViewer } from "./helpers/partnerAccess";

const CONSENT_ID = /^[a-z0-9-]{8,64}$/i;
const MAX_HISTORY = 20;
const actionValidator = v.union(v.literal("accept_all"), v.literal("reject_all"), v.literal("custom"), v.literal("gpc"));

/** Saves a choice. Repeats of the same choice are ignored, so syncing can't pile up rows. */
export const record = mutation({
  args: {
    consentId: v.string(),
    version: v.number(),
    analytics: v.boolean(),
    action: actionValidator,
    decidedAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (!CONSENT_ID.test(args.consentId) || !Number.isInteger(args.version) || args.version < 1 || args.version > 1000) return null;
    const now = Date.now();
    // The browser's clock can be off; never store a time in the future or years back
    const decidedAt = Math.min(now, Math.max(now - 366 * 86_400_000, Math.round(args.decidedAt)));
    const viewer = await getViewer(ctx);
    const userId = viewer?.user?._id;

    const existing = await ctx.db
      .query("cookieConsents")
      .withIndex("by_consent_id", (q) => q.eq("consentId", args.consentId))
      .first();
    if (!existing) {
      await ctx.db.insert("cookieConsents", {
        consentId: args.consentId,
        version: args.version,
        analytics: args.analytics,
        action: args.action,
        decidedAt,
        userId,
        history: [],
        createdAt: now,
        updatedAt: now,
      });
      return null;
    }

    const changed = existing.analytics !== args.analytics || existing.version !== args.version || existing.action !== args.action;
    if (!changed) {
      // Same choice: only link the account if they've since signed in
      if (userId && !existing.userId) await ctx.db.patch(existing._id, { userId, updatedAt: now });
      return null;
    }
    const previous = { analytics: existing.analytics, action: existing.action, version: existing.version, decidedAt: existing.decidedAt };
    await ctx.db.patch(existing._id, {
      version: args.version,
      analytics: args.analytics,
      action: args.action,
      decidedAt,
      userId: existing.userId ?? userId,
      history: [...existing.history, previous].slice(-MAX_HISTORY),
      updatedAt: now,
    });
    return null;
  },
});

/** The signed-in person's latest choice on any device (null when signed out or none yet). */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.user) return null;
    const latest = await ctx.db
      .query("cookieConsents")
      .withIndex("by_user", (q) => q.eq("userId", viewer.user!._id))
      .order("desc")
      .first();
    if (!latest) return null;
    return {
      consentId: latest.consentId,
      version: latest.version,
      analytics: latest.analytics,
      action: latest.action,
      decidedAt: latest.decidedAt,
    };
  },
});

