/**
 * Licences for organisations outside physiotherapy (gyms, HMOs, hospitals, insurers…) to use the
 * 3D exercise library. Admin-managed for now; Paystack subscriptions come later.
 *
 * Members of an active licence can browse and watch the whole 3D library, watermarked with the
 * licence's label. Suspending or expiring a licence cuts access at the member's next key
 * request, because keys are handed out per view (exerciseLibrary.requestViewerGrant).
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureUserRole } from "./auth";
import { displayName } from "./helpers/exerciseAccess";

const DAY = 86_400_000;
const planV = v.union(v.literal("trial"), v.literal("standard"), v.literal("enterprise"));
const statusV = v.union(v.literal("active"), v.literal("suspended"), v.literal("expired"));

export const listLicences = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const licences = await ctx.db.query("libraryLicences").order("desc").collect();
    const since = Date.now() - 30 * DAY;
    return await Promise.all(
      licences.map(async (licence) => {
        const members = await ctx.db.query("libraryLicenceMembers").withIndex("by_licence", (q) => q.eq("licenceId", licence._id)).collect();
        const grants = await ctx.db
          .query("exerciseViewGrants")
          .withIndex("by_licence", (q) => q.eq("licenceId", licence._id).gt("createdAt", since))
          .collect();
        return {
          ...licence,
          members: await Promise.all(
            members.map(async (m) => {
              const user = await ctx.db.get(m.userId);
              return { _id: m._id, userId: m.userId, name: displayName(user, "Unknown user"), email: user?.email ?? null, addedAt: m.createdAt };
            })
          ),
          viewsLast30Days: grants.reduce((n, g) => n + g.clipCount, 0),
        };
      })
    );
  },
});

export const createLicence = mutation({
  args: {
    orgName: v.string(),
    sector: v.string(),
    plan: planV,
    seats: v.number(),
    expiresAt: v.optional(v.number()),
    watermarkLabel: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const orgName = args.orgName.trim().slice(0, 120);
    if (!orgName) throw new ConvexError("Enter the organisation's name.");
    if (!Number.isInteger(args.seats) || args.seats < 1 || args.seats > 10_000) throw new ConvexError("Seats must be from 1 to 10,000.");
    const now = Date.now();
    return await ctx.db.insert("libraryLicences", {
      orgName,
      sector: args.sector.trim().slice(0, 60) || "Other",
      plan: args.plan,
      seats: args.seats,
      status: "active",
      expiresAt: args.expiresAt,
      watermarkLabel: (args.watermarkLabel?.trim() || orgName).slice(0, 60),
      allowedOrigins: [],
      notes: args.notes?.trim().slice(0, 1000) || undefined,
      createdBy: admin._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateLicence = mutation({
  args: {
    licenceId: v.id("libraryLicences"),
    status: v.optional(statusV),
    seats: v.optional(v.number()),
    expiresAt: v.optional(v.union(v.number(), v.null())),
    watermarkLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const licence = await ctx.db.get(args.licenceId);
    if (!licence) throw new ConvexError("Licence not found.");
    if (args.seats !== undefined && (!Number.isInteger(args.seats) || args.seats < 1)) throw new ConvexError("Seats must be at least 1.");
    await ctx.db.patch(args.licenceId, {
      ...(args.status ? { status: args.status } : {}),
      ...(args.seats !== undefined ? { seats: args.seats } : {}),
      ...(args.expiresAt !== undefined ? { expiresAt: args.expiresAt ?? undefined } : {}),
      ...(args.watermarkLabel?.trim() ? { watermarkLabel: args.watermarkLabel.trim().slice(0, 60) } : {}),
      updatedAt: Date.now(),
    });
  },
});

/** Adds an existing Rehabify account to a licence by email. */
export const addLicenceMember = mutation({
  args: { licenceId: v.id("libraryLicences"), email: v.string() },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const licence = await ctx.db.get(args.licenceId);
    if (!licence) throw new ConvexError("Licence not found.");
    const email = args.email.trim().toLowerCase();
    const user = (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).first())
      ?? (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", args.email.trim())).first());
    if (!user) throw new ConvexError("No Rehabify account uses that email. Ask them to sign up first.");
    const members = await ctx.db.query("libraryLicenceMembers").withIndex("by_licence", (q) => q.eq("licenceId", args.licenceId)).collect();
    if (members.some((m) => m.userId === user._id)) throw new ConvexError("They're already on this licence.");
    if (members.length >= licence.seats) throw new ConvexError(`All ${licence.seats} seats are in use. Add seats first.`);
    await ctx.db.insert("libraryLicenceMembers", { licenceId: args.licenceId, userId: user._id, addedBy: admin._id, createdAt: Date.now() });
  },
});

export const removeLicenceMember = mutation({
  args: { memberId: v.id("libraryLicenceMembers") },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    await ctx.db.delete(args.memberId);
  },
});
