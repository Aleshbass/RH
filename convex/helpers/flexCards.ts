/**
 * Flex and Flex Max that renew by themselves (owner, 16 Nov 2026). Opt-in at checkout ("Renew
 * automatically"): the card payment saves a Paystack token (patientPlanCards), and 24 hours before
 * a period ends the same plan is charged to it (flexRenewal.chargeFlexRenewal), so the next 30
 * days follow on. One retry 12 hours later; then the patient is emailed to renew by hand. They can
 * turn it off any time (the card is forgotten). Paystack keeps the card; Rehabify keeps the token,
 * brand and last 4 only, and never sends the token to a page.
 */
import { makeFunctionReference } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { paystackMetadata, type PaystackAuthorization } from "./clinicCards";

type Ctx = QueryCtx | MutationCtx;

/** Charged this long before a period ends, so the next one follows on without a gap */
export const RENEW_BEFORE_MS = 24 * 3_600_000;
export const RENEW_RETRY_AFTER_MS = 12 * 3_600_000;
export const MAX_RENEW_ATTEMPTS = 2;
const STALE_PENDING_MS = 6 * 3_600_000;

export const chargeFlexRenewalRef = makeFunctionReference<"action", { entitlementId: Id<"patientPlanEntitlements"> }, unknown>(
  "flexRenewal:chargeFlexRenewal"
);

export async function activeFlexCard(ctx: Ctx, patientId: Id<"users">) {
  return await ctx.db
    .query("patientPlanCards")
    .withIndex("by_patient_status", (q) => q.eq("patientId", patientId).eq("status", "active"))
    .order("desc")
    .first();
}

/** What the patient's page may see: never the token. */
export function flexCardView(card: Doc<"patientPlanCards"> | null) {
  if (!card) return null;
  const brand = (card.brand ?? "card").trim();
  return {
    label: `${brand ? brand[0].toUpperCase() + brand.slice(1) : "Card"}${card.last4 ? ` ending ${card.last4}` : ""}`,
    expiry: card.expMonth && card.expYear ? `${card.expMonth}/${card.expYear.slice(-2)}` : null,
    lastStatus: card.lastStatus ?? null,
  };
}

const str = (value: unknown, max = 80) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);

/**
 * After a Paystack-verified Flex payment: saves the card when the patient ticked "Renew
 * automatically" (metadata.autoRenew) and Paystack says the card can be charged again.
 */
export async function saveFlexCardFromPayment(
  ctx: MutationCtx,
  patientId: Id<"users">,
  reference: string,
  tx: { metadata: unknown; authorization?: PaystackAuthorization | null; email?: string }
): Promise<boolean> {
  if (paystackMetadata(tx.metadata).autoRenew !== true) return false;
  const auth = tx.authorization ?? {};
  const code = str(auth.authorization_code, 200);
  const email = str(tx.email, 200)?.toLowerCase();
  if (!code || !email || auth.reusable !== true || (auth.channel !== undefined && auth.channel !== "card")) return false;
  const existing = await ctx.db
    .query("patientPlanCards")
    .withIndex("by_patient_status", (q) => q.eq("patientId", patientId))
    .order("desc")
    .take(10);
  if (existing.some((card) => card.reference === reference)) return true;
  const now = Date.now();
  for (const old of existing.filter((card) => card.status === "active")) await ctx.db.patch(old._id, { status: "removed", removedAt: now });
  await ctx.db.insert("patientPlanCards", {
    patientId,
    status: "active",
    authorizationCode: code,
    email,
    signature: str(auth.signature, 200),
    brand: str(auth.brand) ?? str(auth.card_type),
    last4: str(auth.last4, 4),
    expMonth: str(auth.exp_month, 2),
    expYear: str(auth.exp_year, 4),
    bank: str(auth.bank),
    reference,
    addedAt: now,
  });
  await ctx.db.insert("systemLogs", {
    type: "payment",
    action: "flex_card_saved",
    timestamp: now,
    userId: String(patientId),
    targetEntityType: "payment_reference",
    targetEntityId: reference,
    details: { last4: str(auth.last4, 4) },
  });
  return true;
}

/** For the hourly sweep: should this ending period be renewed (again) now? */
export function wantsRenewalCharge(card: Doc<"patientPlanCards">, entitlementId: Id<"patientPlanEntitlements">, now: number) {
  if (card.renewingEntitlementId !== entitlementId) return true;
  if (card.lastStatus === "success") return false;
  // Still going through: wait. Pending for hours means it never went through (the 10-minute check
  // would have applied it, and renewalInfo refuses a period that's already renewed)
  if (card.lastStatus === "pending") return now - (card.lastAttemptAt ?? 0) >= STALE_PENDING_MS && (card.attempts ?? 0) < MAX_RENEW_ATTEMPTS;
  if ((card.attempts ?? 0) >= MAX_RENEW_ATTEMPTS) return false;
  return now - (card.lastAttemptAt ?? 0) >= RENEW_RETRY_AFTER_MS;
}
