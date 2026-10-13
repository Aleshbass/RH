/**
 * Authorization for partner-facing Convex functions.
 *
 * Every public query/mutation that touches partner data must call one of these.
 * The partner is always resolved from the signed-in Clerk identity — a client-supplied
 * partner code is only a selector, never a credential.
 */
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { UserIdentity } from "convex/server";
import { hasProductionAccess, isPartnerApproved } from "./partnerShared";

type Ctx = QueryCtx | MutationCtx;

export type Viewer = {
  identity: UserIdentity;
  user: Doc<"users"> | null;
  isAdmin: boolean;
};

export async function getViewer(ctx: Ctx): Promise<Viewer | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  return { identity, user, isAdmin: user?.role === "admin" };
}

export async function requireViewer(ctx: Ctx): Promise<Viewer> {
  const viewer = await getViewer(ctx);
  if (!viewer) throw new ConvexError("Please sign in to continue.");
  return viewer;
}

export async function requireAdmin(ctx: Ctx): Promise<Viewer & { user: Doc<"users"> }> {
  const viewer = await requireViewer(ctx);
  if (!viewer.isAdmin || !viewer.user) throw new ConvexError("Administrator access required.");
  return viewer as Viewer & { user: Doc<"users"> };
}

export function adminDisplayName(user: Doc<"users"> | null): string {
  if (!user) return "Rehabify Admin";
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Rehabify Admin";
}

function verifiedEmail(identity: UserIdentity): string | null {
  return identity.emailVerified && typeof identity.email === "string" ? identity.email.toLowerCase().trim() : null;
}

/**
 * Partner organisation owned by this identity. Admin-created organisations (no Clerk
 * owner yet) are matched by the owner email that Rehabify set, and only for a
 * verified Clerk email — never by the editable contact email.
 */
export async function findOwnedPartner(ctx: Ctx, identity: UserIdentity): Promise<Doc<"partners"> | null> {
  const owned = await ctx.db
    .query("partners")
    .withIndex("by_owner_clerk_id", (q) => q.eq("ownerClerkId", identity.subject))
    .first();
  if (owned) return owned;
  const email = verifiedEmail(identity);
  if (!email) return null;
  const unclaimed = await ctx.db
    .query("partners")
    .withIndex("by_owner_clerk_id", (q) => q.eq("ownerClerkId", undefined))
    .collect();
  return unclaimed.find((p) => p.ownerEmail?.toLowerCase().trim() === email) ?? null;
}

export type PartnerAccess = {
  partner: Doc<"partners">;
  viewer: Viewer;
  isAdmin: boolean;
  actor: string; // for audit logs
};

export async function requirePartnerAccess(
  ctx: Ctx,
  partnerCode: string,
  options: { requireApproved?: boolean; requireProduction?: boolean } = {}
): Promise<PartnerAccess> {
  const viewer = await requireViewer(ctx);
  const partner = await ctx.db
    .query("partners")
    .withIndex("by_code", (q) => q.eq("code", partnerCode))
    .first();
  if (!partner) throw new ConvexError("Partner organisation not found.");

  let isOwner = partner.ownerClerkId === viewer.identity.subject;
  if (!isOwner && !partner.ownerClerkId) {
    const email = verifiedEmail(viewer.identity);
    isOwner = Boolean(email && partner.ownerEmail?.toLowerCase().trim() === email);
  }
  if (!isOwner && !viewer.isAdmin) {
    throw new ConvexError("You do not have access to this partner organisation.");
  }
  if (options.requireApproved && !viewer.isAdmin && !isPartnerApproved(partner)) {
    throw new ConvexError("Your organisation must be approved by Rehabify before using this feature.");
  }
  if (options.requireProduction && !hasProductionAccess(partner)) {
    throw new ConvexError("Production access has not been approved yet. Request go-live from the Partner Portal.");
  }
  const actor = viewer.isAdmin && !isOwner ? `admin:${viewer.user?._id ?? viewer.identity.subject}` : `owner:${viewer.identity.subject}`;
  return { partner, viewer, isAdmin: viewer.isAdmin, actor };
}

/** Environment-aware access: live requires production approval. */
export async function requirePartnerEnvAccess(
  ctx: Ctx,
  partnerCode: string,
  env: "sandbox" | "live",
  options: { forWrite?: boolean } = {}
): Promise<PartnerAccess> {
  return requirePartnerAccess(ctx, partnerCode, {
    requireApproved: true,
    requireProduction: env === "live" && Boolean(options.forWrite),
  });
}
