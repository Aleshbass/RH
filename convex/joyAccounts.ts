import { v } from "convex/values";
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Dashboard access for patients who booked through Joy on WhatsApp. They have no
 * Clerk account, so after payment Rehabify creates one and Joy sends
 * a /go/<code> link that signs them straight in. The Clerk calls live in
 * actions/joyDashboard.ts; this file holds the records.
 */

const JOY_PLACEHOLDER_PREFIX = "joy-whatsapp:";
export const DASHBOARD_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isJoyPlaceholder(user: Doc<"users">) {
  return user.clerkId.startsWith(JOY_PLACEHOLDER_PREFIX);
}

/** True when this patient's Clerk account is one Rehabify created, so a link may sign into it. */
async function provisionedClerkUserId(ctx: QueryCtx, user: Doc<"users">) {
  if (isJoyPlaceholder(user)) return undefined;
  const links = await ctx.db
    .query("dashboardAccessLinks")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  return links.some((link) => link.clerkUserId === user.clerkId) ? user.clerkId : undefined;
}

/** How a link for this patient behaves when opened. */
type LinkMode = "one_tap" | "claim" | "sign_in";

function linkMode(user: Doc<"users">, linkClerkUserId: string | undefined): LinkMode {
  if (linkClerkUserId && user.clerkId === linkClerkUserId) return "one_tap";
  if (isJoyPlaceholder(user)) return "claim";
  // The patient signed up on their own; they sign in normally
  return "sign_in";
}

function samePhone(left: string, right: string) {
  const a = left.replace(/\D/g, "");
  const b = right.replace(/\D/g, "");
  return a.length >= 7 && b.length >= 7 && a.slice(-10) === b.slice(-10);
}

/** What the provisioning action needs to create (or reuse) the patient's login. */
export const getProvisioningContext = internalQuery({
  args: { patientId: v.id("users"), senderPhone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.patientId);
    if (!user || user.role !== "patient") return { status: "not_found" as const };
    // A link grants account access, so a WhatsApp request must come from the patient's own number
    if (args.senderPhone !== undefined && !(user.phoneNumber && samePhone(user.phoneNumber, args.senderPhone))) {
      return { status: "not_found" as const };
    }
    const existingClerkUserId = await provisionedClerkUserId(ctx, user);
    return {
      status: isJoyPlaceholder(user) ? ("placeholder" as const) : existingClerkUserId ? ("provisioned" as const) : ("own_account" as const),
      clerkUserId: existingClerkUserId,
      // Joy uses "Patient" until it learns a name
      firstName: user.firstName && user.firstName !== "Patient" ? user.firstName : undefined,
      lastName: user.lastName || undefined,
    };
  },
});

/**
 * Points the Joy record at the Clerk user just created for it. Returns false when the
 * patient claimed the record some other way in the meantime; the caller then leaves
 * the new Clerk user unused.
 */
export const attachClerkUser = internalMutation({
  args: { patientId: v.id("users"), clerkUserId: v.string(), bookingId: v.optional(v.id("marketplaceBookings")) },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.patientId);
    if (!user || !isJoyPlaceholder(user)) return { attached: false };
    const clash = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkUserId))
      .first();
    if (clash) return { attached: false };
    await ctx.db.patch(user._id, { clerkId: args.clerkUserId, onboarded: true });
    await copyBookingAddress(ctx, user, args.bookingId);
    return { attached: true };
  },
});

/** Joy only stores "area, city" on the profile; the booking holds the street address. */
async function copyBookingAddress(ctx: MutationCtx, user: Doc<"users">, bookingId?: Id<"marketplaceBookings">) {
  const booking = bookingId ? await ctx.db.get(bookingId) : null;
  const address = booking?.patientId === user._id ? booking.patientAddress?.trim() : undefined;
  if (!address) return;
  const profile = user.patientProfileId
    ? await ctx.db.get(user.patientProfileId)
    : await ctx.db.query("patientProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first();
  if (!profile) return;
  const joyPlaceholderAddress = profile.city && profile.area ? `${profile.area}, ${profile.city}` : undefined;
  if (!profile.address || profile.address === joyPlaceholderAddress) {
    await ctx.db.patch(profile._id, { address });
  }
}

/** Stores a new link (the code is generated in the action) and retires the patient's unused ones. */
export const createAccessLink = internalMutation({
  args: {
    patientId: v.id("users"),
    code: v.string(),
    clerkUserId: v.optional(v.string()),
    bookingId: v.optional(v.id("marketplaceBookings")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const previous = await ctx.db
      .query("dashboardAccessLinks")
      .withIndex("by_user", (q) => q.eq("userId", args.patientId))
      .collect();
    for (const link of previous) {
      if (!link.usedAt && link.expiresAt > now) await ctx.db.patch(link._id, { expiresAt: now });
    }
    const expiresAt = now + DASHBOARD_LINK_TTL_MS;
    await ctx.db.insert("dashboardAccessLinks", {
      code: args.code,
      userId: args.patientId,
      clerkUserId: args.clerkUserId,
      bookingId: args.bookingId,
      createdAt: now,
      expiresAt,
    });
    const user = await ctx.db.get(args.patientId);
    return { expiresAt, mode: user ? linkMode(user, args.clerkUserId) : ("sign_in" as LinkMode) };
  },
});

async function linkByCode(ctx: QueryCtx, code: string) {
  const trimmed = code.trim();
  if (!/^[A-Za-z0-9]{20,64}$/.test(trimmed)) return null;
  return await ctx.db.query("dashboardAccessLinks").withIndex("by_code", (q) => q.eq("code", trimmed)).first();
}

/** What /go/<code> shows before the patient taps. Reveals only their first name. */
export const peekAccessLink = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const link = await linkByCode(ctx, args.code);
    const user = link ? await ctx.db.get(link.userId) : null;
    if (!link || !user || user.role !== "patient") return { state: "not_found" as const };
    const identity = await ctx.auth.getUserIdentity();
    const viewerIsPatient = !!identity && identity.subject === user.clerkId;
    const firstName = user.firstName && user.firstName !== "Patient" ? user.firstName : null;
    if (viewerIsPatient) return { state: "signed_in" as const, firstName };
    if (link.usedAt) return { state: "used" as const, firstName };
    if (link.expiresAt <= Date.now()) return { state: "expired" as const, firstName };
    return { state: linkMode(user, link.clerkUserId), firstName };
  },
});

/**
 * Marks a one-tap link used and returns the Clerk user to mint a sign-in token for.
 * Used up front so two taps can't both sign in; releaseAccessLink undoes it if minting fails.
 */
export const consumeAccessLink = internalMutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const link = await linkByCode(ctx, args.code);
    const user = link ? await ctx.db.get(link.userId) : null;
    if (!link || !user || user.role !== "patient") return { ok: false as const, reason: "not_found" as const };
    if (link.usedAt) return { ok: false as const, reason: "used" as const };
    if (link.expiresAt <= Date.now()) return { ok: false as const, reason: "expired" as const };
    const mode = linkMode(user, link.clerkUserId);
    if (mode !== "one_tap") return { ok: false as const, reason: mode };
    await ctx.db.patch(link._id, { usedAt: Date.now() });
    return { ok: true as const, clerkUserId: user.clerkId };
  },
});

export const releaseAccessLink = internalMutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const link = await linkByCode(ctx, args.code);
    if (link?.usedAt) await ctx.db.patch(link._id, { usedAt: undefined });
  },
});

/**
 * Claim mode (Rehabify couldn't create the login): the person signed up themselves after
 * opening a valid link, so hand them the Joy record. Called from storeUserFromClerk
 * before it creates a fresh user. Returns the claimed user id, or null.
 */
export async function claimJoyRecordWithLink(
  ctx: MutationCtx,
  args: { code: string; clerkId: string; firstName?: string; lastName?: string; imageUrl?: string; email?: string }
): Promise<Id<"users"> | null> {
  const link = await linkByCode(ctx, args.code);
  if (!link || link.usedAt || link.expiresAt <= Date.now()) return null;
  const user = await ctx.db.get(link.userId);
  if (!user || user.role !== "patient" || !isJoyPlaceholder(user)) return null;
  await ctx.db.patch(user._id, {
    clerkId: args.clerkId,
    firstName: (user.firstName && user.firstName !== "Patient" ? user.firstName : undefined) || args.firstName || user.firstName,
    lastName: user.lastName || args.lastName,
    imageUrl: user.imageUrl || args.imageUrl,
    email: user.email || args.email,
    onboarded: true,
  });
  await ctx.db.patch(link._id, { usedAt: Date.now() });
  await copyBookingAddress(ctx, user, link.bookingId);
  return user._id;
}
