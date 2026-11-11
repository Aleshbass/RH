import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";

/** Roles only an administrator assigns; their holders never pick a role for themselves. */
const ADMIN_ASSIGNED_ROLES = new Set(["admin", "partner", "clinic_staff", "blog_editor"]);

const ROLE_LABELS: Record<string, string> = {
  physiotherapist: "physiotherapist",
  clinic_owner: "clinic owner",
  patient: "patient",
  family_member: "family member",
  doctor: "referring doctor",
  admin: "administrator",
  partner: "partner",
  clinic_staff: "clinic team member",
  blog_editor: "blog writer",
};

/**
 * Self-service role changes are allowed only while an account is still being set up.
 * Once onboarded (or holding an admin-assigned role) only an admin can change it, so a
 * stray click on another sign-up flow can't turn a physio into a patient or vice versa.
 */
export function assertSelfRoleChangeAllowed(user: Doc<"users">, nextRole: string) {
  if (!user.role || user.role === nextRole) return;
  if (user.onboarded || ADMIN_ASSIGNED_ROLES.has(user.role)) {
    // ConvexError so the reason reaches the browser (plain errors are redacted in production)
    throw new ConvexError(
      `This account is already set up as a ${ROLE_LABELS[user.role] ?? user.role}. Contact support if you need to change it.`
    );
  }
}
