import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getViewer, type Viewer } from "./partnerAccess";

type Ctx = QueryCtx | MutationCtx;

/**
 * Learn admins (Mary 2026-11-14): platform admins, plus Learn super admins (a learnAdmins row).
 * Super admins get every Learn power (courses, cohorts, certificates, community, Spaces,
 * simulations, groups) and nothing else on the platform. Only platform admins add or remove them.
 */
export async function isLearnAdminUser(ctx: Ctx, user: Doc<"users"> | null | undefined): Promise<boolean> {
  if (!user || user.deletedAt) return false;
  if (user.role === "admin") return true;
  const row = await ctx.db
    .query("learnAdmins")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();
  return Boolean(row);
}

/** Drop-in for requireAdmin in Learn functions: a platform admin or a Learn super admin. */
export async function requireLearnAdmin(ctx: Ctx): Promise<Viewer & { user: Doc<"users"> }> {
  const viewer = await getViewer(ctx);
  if (!viewer) throw new ConvexError("Please sign in to continue.");
  if (!viewer.user || !(await isLearnAdminUser(ctx, viewer.user))) throw new ConvexError("Learn admin access required.");
  return { ...viewer, user: viewer.user, isAdmin: true };
}

/** This person's place in a Learn group ("lead" or "member"), or null. */
export async function groupRoleOf(ctx: Ctx, groupId: Id<"learnGroups">, userId: Id<"users">) {
  const row = await ctx.db
    .query("learnGroupMembers")
    .withIndex("by_group_user", (q) => q.eq("groupId", groupId).eq("userId", userId))
    .first();
  return row?.role ?? null;
}
