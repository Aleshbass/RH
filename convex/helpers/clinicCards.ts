/**
 * Clinics' saved cards (clinicBillingCards). Paystack keeps the card itself; Rehabify keeps only
 * the authorization code (a token that works with Rehabify's secret key alone), plus the brand,
 * last 4 digits and expiry so the clinic recognises it. The code never leaves the server.
 */
import { makeFunctionReference } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

/** The "CLINICSUB_" prefix routes Paystack's webhook to clinic billing; "CARD_" marks a card check. */
export const CARD_CHECK_PREFIX = "CLINICSUB_CARD_";
export const CARD_CHECK_REFERENCE = /^CLINICSUB_CARD_([a-z0-9]+)_\d+$/;

const refundCardCheckRef = makeFunctionReference<"action", { cardId: Id<"clinicBillingCards"> }, unknown>(
  "clinicSelfServe:refundCardCheck"
);
export const chargeSavedCardRef = makeFunctionReference<"action", { invoiceId: Id<"clinicSubscriptionInvoices"> }, unknown>(
  "clinicSelfServe:chargeSavedCard"
);

/** A declined card is tried 3 times in all, 2 days apart. */
export const MAX_AUTO_CHARGES = 3;
const RETRY_AFTER_MS = 2 * 86_400_000;

/** For the daily run: should this open invoice be charged again now? (The first try is at issue.) */
export function wantsAutoChargeRetry(invoice: Doc<"clinicSubscriptionInvoices">, now: number) {
  if (invoice.status !== "open") return false;
  const attempts = invoice.autoChargeAttempts ?? 0;
  if (attempts === 0 || attempts >= MAX_AUTO_CHARGES) return false;
  if (invoice.lastAutoChargeStatus === "pending" || invoice.lastAutoChargeStatus === "success") return false;
  return now - (invoice.lastAutoChargeAt ?? 0) >= RETRY_AFTER_MS;
}

/** The subscription a card-check reference was made for (only Rehabify issues these references). */
export async function subscriptionForCardCheck(ctx: MutationCtx, reference: string) {
  const match = CARD_CHECK_REFERENCE.exec(reference);
  const id = match ? ctx.db.normalizeId("clinicSubscriptions", match[1]) : null;
  return id ? await ctx.db.get(id) : null;
}

export async function activeClinicCard(ctx: Ctx, clinicId: Id<"clinics">) {
  return await ctx.db
    .query("clinicBillingCards")
    .withIndex("by_clinic_status", (q) => q.eq("clinicId", clinicId).eq("status", "active"))
    .order("desc")
    .first();
}

/** What a page may see: never the authorization code. */
export function cardView(card: Doc<"clinicBillingCards"> | null) {
  if (!card) return null;
  const brand = (card.brand ?? "card").trim();
  return {
    brand: brand ? brand[0].toUpperCase() + brand.slice(1) : "Card",
    last4: card.last4 ?? null,
    expiry: card.expMonth && card.expYear ? `${card.expMonth}/${card.expYear.slice(-2)}` : null,
    bank: card.bank ?? null,
    addedAt: card.addedAt,
  };
}

export function cardLabel(card: Doc<"clinicBillingCards"> | null) {
  const view = cardView(card);
  return view ? `${view.brand}${view.last4 ? ` ending ${view.last4}` : ""}` : "your card";
}

/** Paystack metadata arrives as an object, or as a JSON string on some channels. */
export function paystackMetadata(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export type PaystackAuthorization = {
  authorization_code?: unknown;
  reusable?: unknown;
  channel?: unknown;
  signature?: unknown;
  brand?: unknown;
  card_type?: unknown;
  last4?: unknown;
  exp_month?: unknown;
  exp_year?: unknown;
  bank?: unknown;
};

const str = (value: unknown, max = 80) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);

/**
 * Saves the card from a successful Paystack card payment the clinic made to save it (a card check,
 * or paying an invoice with "save this card"). Replaces any earlier card. Returns null when the
 * payment can't be reused (not a card, or Paystack says it isn't reusable).
 */
export async function saveClinicCard(
  ctx: MutationCtx,
  input: {
    clinicId: Id<"clinics">;
    authorization: PaystackAuthorization | null | undefined;
    email: string | undefined;
    reference: string;
    amountKobo: number;
    isCardCheck: boolean;
    addedBy?: Id<"users">;
  }
): Promise<Id<"clinicBillingCards"> | null> {
  const auth = input.authorization ?? {};
  const code = str(auth.authorization_code, 200);
  const email = str(input.email, 200)?.toLowerCase();
  if (!code || !email || auth.reusable !== true || (auth.channel !== undefined && auth.channel !== "card")) return null;

  // The same payment seen twice (browser return and webhook): keep the first save
  const seen = await ctx.db
    .query("clinicBillingCards")
    .withIndex("by_clinic_status", (q) => q.eq("clinicId", input.clinicId))
    .order("desc")
    .take(20);
  const already = seen.find((card) => card.checkReference === input.reference);
  if (already) return already._id;

  const now = Date.now();
  for (const old of seen.filter((card) => card.status === "active")) {
    await ctx.db.patch(old._id, { status: "removed", removedAt: now });
  }
  const cardId = await ctx.db.insert("clinicBillingCards", {
    clinicId: input.clinicId,
    status: "active",
    authorizationCode: code,
    email,
    signature: str(auth.signature, 200),
    brand: str(auth.brand) ?? str(auth.card_type),
    last4: str(auth.last4, 4),
    expMonth: str(auth.exp_month, 2),
    expYear: str(auth.exp_year, 4),
    bank: str(auth.bank),
    checkReference: input.reference,
    checkAmountKobo: input.isCardCheck ? input.amountKobo : undefined,
    addedBy: input.addedBy,
    addedAt: now,
  });
  await ctx.db.insert("systemLogs", {
    type: "billing",
    action: "clinic_card_saved",
    timestamp: now,
    clinicId: input.clinicId,
    targetEntityType: "clinic_billing_card",
    targetEntityId: String(cardId),
    details: { reference: input.reference, last4: str(auth.last4, 4), cardCheck: input.isCardCheck },
  });
  // The card check was only to save the card: give it straight back
  if (input.isCardCheck && input.amountKobo > 0) await ctx.scheduler.runAfter(0, refundCardCheckRef, { cardId });
  return cardId;
}
