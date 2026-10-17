/**
 * Security events for the admin Activity & audit log (convex/admin.ts getSecurityEvents).
 * They live in analytics_events under these types:
 *   user_login            – a new signed-in session (recorded once per Clerk session)
 *   failed_authentication – a sign-in attempt rejected by Clerk (wrong password or code)
 *   role_changed          – an account's platform role changed
 *   permission_updated    – a clinic team member's dashboard role changed
 */
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type SecurityEventType = "user_login" | "failed_authentication" | "role_changed" | "permission_updated";

export async function logSecurityEvent(
  ctx: MutationCtx,
  type: SecurityEventType,
  event: { userId?: Id<"users">; clinicId?: Id<"clinics">; status?: string; details?: Record<string, unknown> }
) {
  await ctx.db.insert("analytics_events", {
    type,
    userId: event.userId,
    clinicId: event.clinicId,
    metadata: { status: event.status, details: event.details },
    timestamp: Date.now(),
  });
}
