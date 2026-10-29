/**
 * Care circle access (family members and caregivers looking after a patient), shared by
 * convex/careCircle.ts and the places a caregiver acts for the patient (paying an invoice).
 *
 * Permissions on familyAccessGrants: "view_progress" always; "book" and "pay" (book visits and pay
 * for them); "message" (write to the care team). Joy on WhatsApp writes the same words.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { insertNotification } from "./pushNotify";

type Ctx = QueryCtx | MutationCtx;

export const CARE_ACCESS = {
  view: ["view_progress"],
  book_pay: ["view_progress", "book", "pay"],
  full: ["view_progress", "book", "pay", "message"],
} as const;

export type CareAccessLevel = keyof typeof CARE_ACCESS;

/** The level shown to people for a grant's permission list. */
export function careAccessLevel(permissions: string[]): CareAccessLevel {
  if (permissions.includes("message")) return "full";
  if (permissions.includes("book") || permissions.includes("pay")) return "book_pay";
  return "view";
}

function isLive(grant: Doc<"familyAccessGrants">, now = Date.now()) {
  return grant.status === "active" && (!grant.expiresAt || grant.expiresAt > now);
}

/** This caregiver's live grant for the patient, or null. */
export async function activeCareGrant(ctx: Ctx, caregiverId: Id<"users">, patientId: Id<"users">) {
  const grant = await ctx.db
    .query("familyAccessGrants")
    .withIndex("by_patient_and_family_member", (q) => q.eq("patientUserId", patientId).eq("familyMemberUserId", caregiverId))
    .first();
  return grant && isLive(grant) ? grant : null;
}

/** Whether this person may do `permission` for the patient as their caregiver. */
export async function caregiverCan(ctx: Ctx, caregiverId: Id<"users">, patientId: Id<"users">, permission: "view_progress" | "book" | "pay" | "message") {
  const grant = await activeCareGrant(ctx, caregiverId, patientId);
  if (!grant) return false;
  return permission === "view_progress" || grant.permissions.includes(permission);
}

/**
 * Someone a caregiver set up has signed up with their own login (users.claimPlaceholderPatient).
 * They now run their own care circle; the caregivers keep their access and are told.
 */
export async function handOverManagedProfile(ctx: MutationCtx, patientId: Id<"users">) {
  const patient = await ctx.db.get(patientId);
  const name = patient?.firstName?.trim() || "They";
  const now = Date.now();
  for (const grant of await liveCareGrantsFor(ctx, patientId)) {
    if (!grant.managed) continue;
    await ctx.db.patch(grant._id, { managed: false, updatedAt: now });
    await insertNotification(ctx, {
      userId: grant.familyMemberUserId,
      type: "care_circle_handover",
      priority: "medium",
      status: "pending",
      payload: {
        title: `${name} now has their own Rehabify login`,
        body: `${name} can see their own care and manage who helps. You still have full access.`,
        link: `/dashboard/family?person=${patientId}`,
        data: { actionUrl: `/dashboard/family?person=${patientId}` },
      },
      createdAt: now,
    });
  }
}

/** Everyone looking after this patient right now. */
export async function liveCareGrantsFor(ctx: Ctx, patientId: Id<"users">) {
  const grants = await ctx.db
    .query("familyAccessGrants")
    .withIndex("by_patient_user_id", (q) => q.eq("patientUserId", patientId))
    .take(50);
  const now = Date.now();
  return grants.filter((g) => isLive(g, now));
}
