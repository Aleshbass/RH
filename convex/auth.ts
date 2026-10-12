import { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values"; // ConvexError is often here
import { Id } from "./_generated/dataModel";

export type UserRole = "physiotherapist" | "clinic_owner" | "patient" | "family_member" | "doctor" | "admin" | "partner" | "clinic_staff";

/**
 * Gets the currently authenticated user or throws an error if not found
 */
export async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("You must be logged in to perform this action");
  }
  
  // Find the user with the matching clerkId
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .unique();
  
  if (!user) {
    throw new ConvexError("User not found. Please complete registration");
  }
  
  return user;
}

/**
 * Ensures the user has one of the allowed roles or throws an error
 */
export async function ensureUserRole(
  ctx: QueryCtx | MutationCtx,
  allowedRoles: UserRole[]
) {
  const user = await getAuthenticatedUser(ctx);
  
  if (!allowedRoles.includes(user.role as UserRole)) {
    throw new ConvexError(
      `Access denied. Required role: ${allowedRoles.join(" or ")}`
    );
  }
  
  return user;
}

/**
 * Ensures the user is the owner of a clinic or throws an error
 */
export async function ensureClinicOwner(
  ctx: QueryCtx | MutationCtx,
  clinicId: Id<"clinics">
) {
  const user = await ensureUserRole(ctx, ["clinic_owner"]);
  
  const clinic = await ctx.db.get(clinicId);
  if (!clinic || clinic.ownerId !== user._id) {
    throw new ConvexError("You don't have permission to manage this clinic");
  }
  
  return { user, clinic };
}

/**
 * Ensures the user is a clinic owner (without requiring specific clinic ID)
 */
export async function ensureIsClinicOwner(
  ctx: QueryCtx | MutationCtx,
  user: any
) {
  if (user.role !== "clinic_owner") {
    throw new ConvexError("Access denied. Only clinic owners can perform this action");
  }
  
  return user;
}

/**
 * Checks if a user is onboarded
 */
export async function isUserOnboarded(
  ctx: QueryCtx | MutationCtx
) {
  try {
    const user = await getAuthenticatedUser(ctx);
    return !!user.onboarded;
  } catch (error) {
    return false;
  }
}
