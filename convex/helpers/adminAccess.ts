/**
 * Admin access (owner 2026-11-17): every admin has the whole console unless a full admin limits
 * them to ticked pages (adminAccess row, full: false). The console hides the other pages, and the
 * admin checks (ensureUserRole / requireAdmin with a function name) refuse their functions:
 * adminFunctionPages.ts says which pages use each function.
 */
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ADMIN_FUNCTION_PAGES, ADMIN_PAGES } from "./adminFunctionPages";

type Ctx = QueryCtx | MutationCtx;

export type AdminAccess = { full: boolean; pages: string[] };

/** Pages every admin can open, whatever is ticked. */
export const ALWAYS_OPEN_PAGES = ["/dashboard/admin/me"];

export async function adminAccessOf(ctx: Ctx, userId: Id<"users">): Promise<AdminAccess> {
  const row = await ctx.db
    .query("adminAccess")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  return !row || row.full ? { full: true, pages: [] } : { full: false, pages: row.pages };
}

const NO_ACCESS = "You don't have access to this part of the admin console. Ask a full admin to add it for you.";

/** For an admin: may they call this admin-only function (by its "module:name")? */
export async function adminPageGate(ctx: Ctx, userId: Id<"users">, fn: string) {
  const access = await adminAccessOf(ctx, userId);
  if (access.full) return;
  const rule = ADMIN_FUNCTION_PAGES[fn];
  if (rule === "any") return;
  if (Array.isArray(rule) && rule.some((i) => access.pages.includes(ADMIN_PAGES[i]))) return;
  throw new ConvexError(NO_ACCESS);
}

/** The signed-in admin with the whole console (people, roles and access changes need this). */
export async function requireFullAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Please sign in to continue.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user || user.role !== "admin") throw new ConvexError("Administrator access required.");
  if (!(await adminAccessOf(ctx, user._id)).full) throw new ConvexError("Only admins with access to everything can do this.");
  return user;
}
