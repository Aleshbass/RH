/**
 * Which Joy actor persona may run each operational call. Shared by the Next route
 * (app/api/v1/joy/operations) and the direct Convex gateway (convex/joyOperations.ts),
 * so both paths enforce the same rule.
 *
 * Granting, changing or revoking family access is the patient's decision (Convex checks
 * actor.rh_user_id === patient_id), so those three run as "patient" despite the prefix.
 */
const PATIENT_OWNED_FAMILY_OPERATIONS = new Set(["family_grant", "family_update_grant", "family_revoke_grant"]);

export type JoyActorPersona = "patient" | "physiotherapist" | "family" | "admin";

export function expectedJoyActorPersona(operation: string): JoyActorPersona {
  if (operation.startsWith("physio_")) return "physiotherapist";
  if (operation.startsWith("admin_")) return "admin";
  if (operation.startsWith("family_") && !PATIENT_OWNED_FAMILY_OPERATIONS.has(operation)) return "family";
  return "patient";
}

export function assertJoyActorPersona(operation: string, actor: unknown): void {
  const persona = actor && typeof actor === "object" ? (actor as { persona?: unknown }).persona : undefined;
  if (persona !== expectedJoyActorPersona(operation)) throw new Error("Actor is not authorized for this operation");
}
