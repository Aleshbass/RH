/**
 * Who may work with a patient's care records. Shared by physioCare.ts (the patient workspace)
 * and exercisePrograms.ts (home exercise programmes).
 */
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

export async function currentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function isApproved(ctx: Ctx, userId: Id<"users">) {
  const approval = await ctx.db
    .query("accountApprovalStatus")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .first();
  return approval?.status === "approved";
}

/** The signed-in, approved physiotherapist, or null (queries return empty instead of throwing). */
export async function physioOrNull(ctx: Ctx) {
  const user = await currentUser(ctx);
  if (!user || user.role !== "physiotherapist") return null;
  return (await isApproved(ctx, user._id)) ? user : null;
}

export async function requirePhysio(ctx: Ctx) {
  const user = await currentUser(ctx);
  if (!user || user.role !== "physiotherapist") {
    throw new ConvexError("Only physiotherapists can do this.");
  }
  if (!(await isApproved(ctx, user._id))) {
    throw new ConvexError("Your account needs to be approved before you can work with patients.");
  }
  return user;
}

/** The physio's relationship with a patient: the active one if there is one, else the latest. */
export async function findRelationship(ctx: Ctx, physioId: Id<"users">, patientId: Id<"users">) {
  const rows = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", patientId).eq("physiotherapistId", physioId))
    .collect();
  if (rows.length === 0) return null;
  return rows.find((r) => r.status === "active") ?? rows.sort((a, b) => (b.endDate ?? b.startDate) - (a.endDate ?? a.startDate))[0];
}

export async function requireActiveRelationship(ctx: Ctx, physioId: Id<"users">, patientId: Id<"users">) {
  const relationship = await findRelationship(ctx, physioId, patientId);
  if (!relationship) throw new ConvexError("This patient isn't on your list.");
  if (relationship.status !== "active") {
    throw new ConvexError("Care with this patient has ended. Start a new course of care first.");
  }
  return relationship;
}
