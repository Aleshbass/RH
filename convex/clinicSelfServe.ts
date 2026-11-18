/**
 * Clinics choose their own plan and save a card (owner, 16 Nov 2026).
 *
 *  - Choosing: Clinic Starter or Growth from the plan page. Chosen before 1 December 2026, the
 *    first charge is on 1 December, then the 1st of each month. From 1 December, the first
 *    charge is on the day they choose, then that date each month (CLINIC_SELF_SERVE).
 *  - The card: Paystack keeps it; Rehabify keeps a token (helpers/clinicCards.ts). Before the
 *    first charge a ₦50 card check saves it and is refunded straight away; once an invoice is
 *    open, paying it by card saves the card instead.
 *  - Charging: each invoice clinicBilling issues is charged to the saved card the same day
 *    (Paystack charge_authorization, a CLINICSUB_<invoice> reference, settled like a checkout).
 *    A failed charge is retried twice, two days apart, and the clinic is emailed a pay link.
 *  - Cancelling: before the first charge it simply stops; afterwards billing ends when the
 *    paid period ends (clinicBilling.processClinicSubscription).
 *
 * Everything else (invoices, overage, receipts, reminders, read-only) is clinicBilling's.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { CLINIC_SELF_SERVE } from "../lib/clinicPlans";
import { emailClinic, paystackRequest } from "./clinicBilling";
import { canUseArea, getClinicMember, getClinicMemberOrNull } from "./clinicTools";
import { appLink, publicAppUrl } from "./helpers/appUrl";
import { platformAdminEmails } from "./helpers/adminRecipients";

const sendCareEmailRef = makeFunctionReference<
  "action",
  { to: string; subject: string; skipGreeting?: boolean; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");
import {
  CARD_CHECK_PREFIX,
  MAX_AUTO_CHARGES,
  activeClinicCard,
  cardLabel,
  cardView,
} from "./helpers/clinicCards";
import { invoiceReferences, withReference } from "./helpers/clinicAdminAlerts";
import {
  CLINIC_PLAN_PAGE,
  billingIsOn,
  lagosDateToMs,
  longDate,
  planName,
  standardPlanNumbers,
  subscriptionForClinic,
} from "./helpers/clinicSubscriptions";
import { startOfZonedDay } from "./helpers/lagosTime";
import { insertNotification } from "./helpers/pushNotify";

const FIRST_CHARGE_MS = lagosDateToMs(CLINIC_SELF_SERVE.firstChargeDate)!;

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const validEmail = (value: string | undefined | null): value is string =>
  Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));

/** Before 1 December 2026: 1 December. From then on: today (Lagos). */
export function selfServeStartsAt(now: number) {
  return now < FIRST_CHARGE_MS ? FIRST_CHARGE_MS : startOfZonedDay(now);
}

// Own functions by name (the generated api type is at TypeScript's depth limit)
const processSubscriptionRef = makeFunctionReference<"mutation", { subscriptionId: Id<"clinicSubscriptions"> }, unknown>(
  "clinicBilling:processClinicSubscription"
);
const completePaymentRef = makeFunctionReference<
  "mutation",
  { reference: string; amountKobo: number; currency: string },
  { success: boolean }
>("clinicBilling:completeVerifiedSubscriptionPayment");
const recordCheckoutRef = makeFunctionReference<
  "mutation",
  { invoiceId: Id<"clinicSubscriptionInvoices">; reference: string; authorizationUrl: string },
  null
>("clinicBilling:recordSubscriptionCheckout");
const cardSetupInfoRef = makeFunctionReference<"query", Record<string, never>, CardSetupInfo>("clinicSelfServe:cardSetupInfo");
const recordCardCheckRef = makeFunctionReference<"mutation", { subscriptionId: Id<"clinicSubscriptions">; reference: string }, null>(
  "clinicSelfServe:recordCardCheckStart"
);
const checkRefundFailedRef = makeFunctionReference<"mutation", { reference: string; clinicId: Id<"clinics">; error: string }, null>(
  "clinicSelfServe:recordCardCheckReferenceRefundFailure"
);
const autoChargeInfoRef = makeFunctionReference<"query", { invoiceId: Id<"clinicSubscriptionInvoices"> }, AutoChargeInfo | null>(
  "clinicSelfServe:autoChargeInfo"
);
const recordAutoChargeRef = makeFunctionReference<
  "mutation",
  { invoiceId: Id<"clinicSubscriptionInvoices">; reference: string; status: string; message?: string },
  null
>("clinicSelfServe:recordAutoCharge");
const cardForRefundRef = makeFunctionReference<"query", { cardId: Id<"clinicBillingCards"> }, { reference: string; refunded: boolean } | null>(
  "clinicSelfServe:cardForRefund"
);
const recordRefundRef = makeFunctionReference<"mutation", { cardId: Id<"clinicBillingCards">; error?: string }, null>(
  "clinicSelfServe:recordCardCheckRefund"
);
export const chargeSavedCardRef = makeFunctionReference<"action", { invoiceId: Id<"clinicSubscriptionInvoices"> }, unknown>(
  "clinicSelfServe:chargeSavedCard"
);

type CardSetupInfo = {
  clinicId: Id<"clinics">;
  clinicName: string;
  subscriptionId: Id<"clinicSubscriptions">;
  email: string | null;
  openInvoice: { _id: Id<"clinicSubscriptionInvoices">; number: string; amountKobo: number } | null;
};
type AutoChargeInfo = {
  status: Doc<"clinicSubscriptionInvoices">["status"];
  amountKobo: number;
  attempts: number;
  authorizationCode: string | null;
  email: string | null;
  clinicId: Id<"clinics">;
  number: string;
};

/** Bell + push for every admin, and an email to the team inboxes (ADMIN_EMAIL), so no one misses it. */
async function alertAdmins(ctx: MutationCtx, title: string, body: string, clinicId: Id<"clinics">) {
  for (const to of platformAdminEmails()) {
    await ctx.scheduler.runAfter(0, sendCareEmailRef, {
      to,
      subject: title,
      skipGreeting: true,
      heading: title,
      paragraphs: [body],
      buttonLabel: "Open the clinic",
      buttonUrl: appLink(`/dashboard/admin/clinics/${clinicId}`),
    });
  }
  const admins = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).take(25);
  const now = Date.now();
  for (const admin of admins) {
    await insertNotification(ctx, {
      userId: admin._id,
      type: "system_alert",
      priority: "medium",
      status: "pending",
      payload: { title, body, data: { entityId: clinicId, entityType: "clinic", actionUrl: `/dashboard/admin/clinics/${clinicId}` } },
      createdAt: now,
    });
  }
}

// ─── The plan page ───────────────────────────────────────────────────────────

/** What "Choose your plan" shows: the two plans, the clinic's choice, its card and the first charge date. */
export const getMyPlanSetup = query({
  args: {},
  handler: async (ctx) => {
    let member;
    try {
      member = await getClinicMemberOrNull(ctx, "billing");
    } catch {
      return null;
    }
    if (!member || !canUseArea(member, "billing")) return null;
    const now = Date.now();
    const sub = await subscriptionForClinic(ctx, member.clinic._id);
    const [starter, growth, card] = await Promise.all([
      standardPlanNumbers(ctx, "starter"),
      standardPlanNumbers(ctx, "growth"),
      activeClinicCard(ctx, member.clinic._id),
    ]);
    const on = billingIsOn(sub);
    const started = on && sub.currentPeriodStart !== undefined;
    const startsAt = on ? sub.billingStartsAt : selfServeStartsAt(now);
    return {
      plans: [
        { id: "starter" as const, name: planName("starter"), monthlyFeeKobo: starter.monthlyFeeKobo, programmeAllowance: starter.programmeAllowance },
        { id: "growth" as const, name: planName("growth"), monthlyFeeKobo: growth.monthlyFeeKobo, programmeAllowance: growth.programmeAllowance },
      ],
      current: on
        ? {
            plan: sub.plan,
            planName: planName(sub.plan),
            started,
            // Enterprise and admin-set custom terms are changed by Rehabify, not from here
            custom: sub.plan === "enterprise",
            cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
            endsAt: sub.cancelAtPeriodEnd ? (sub.currentPeriodEnd ?? null) : null,
          }
        : null,
      firstChargeAt: startsAt,
      firstChargeIsToday: startsAt <= now,
      nextChargeAt: on ? (sub.currentPeriodEnd ?? sub.billingStartsAt) : startsAt,
      card: cardView(card),
      cardCheckKobo: CLINIC_SELF_SERVE.cardCheckKobo,
    };
  },
});

/** The clinic picks Starter or Growth. Free to change until the first charge. */
export const chooseClinicPlan = mutation({
  args: { plan: v.union(v.literal("starter"), v.literal("growth")) },
  handler: async (ctx, args) => {
    const { clinic, user } = await getClinicMember(ctx, "billing", { allowBillingReadOnly: true });
    const now = Date.now();
    const existing = await subscriptionForClinic(ctx, clinic._id);
    const on = billingIsOn(existing);
    if (on && existing.plan === "enterprise") {
      throw new ConvexError("Your clinic is on terms agreed with Rehabify. Write to hello@myrehabifyhealth.com to change them.");
    }
    if (on && existing.currentPeriodStart !== undefined) {
      if (existing.plan === args.plan && !existing.cancelAtPeriodEnd) return { startsAt: existing.billingStartsAt, chargeNow: false };
      throw new ConvexError(
        existing.plan === "starter"
          ? "Your plan has already started. Use “Ask to upgrade” and we'll move you to Growth from today."
          : "Your plan has already started. Write to hello@myrehabifyhealth.com to change it."
      );
    }

    const numbers = await standardPlanNumbers(ctx, args.plan);
    const startsAt = selfServeStartsAt(now);
    const fields = {
      plan: args.plan,
      ...numbers,
      status: "active" as const,
      billingStartsAt: startsAt,
      chosenBy: user._id,
      chosenAt: now,
      cancelAtPeriodEnd: undefined,
      cancelRequestedAt: undefined,
      cancelledAt: undefined,
      upgradeRequestedPlan: undefined,
      upgradeRequestedAt: undefined,
      updatedBy: user._id,
      updatedAt: now,
    };
    let subscriptionId: Id<"clinicSubscriptions">;
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...fields,
        // Back after cancelling: periods, invoices and warnings start again from the new start date
        ...(on
          ? {}
          : {
              switchedOnAt: now,
              switchedOnBy: user._id,
              currentPeriodStart: undefined,
              currentPeriodEnd: undefined,
              periodNumber: undefined,
              warnedAt80: undefined,
              warnedAt100: undefined,
              readOnlySince: undefined,
              endsWhenPaidNoticeAt: undefined,
            }),
      });
      subscriptionId = existing._id;
    } else {
      subscriptionId = await ctx.db.insert("clinicSubscriptions", { clinicId: clinic._id, createdAt: now, switchedOnAt: now, switchedOnBy: user._id, ...fields });
    }
    await ctx.db.insert("systemLogs", {
      type: "billing",
      action: "clinic_plan_chosen",
      timestamp: now,
      clinicId: clinic._id,
      actorUserId: String(user._id),
      targetEntityType: "clinic_subscription",
      targetEntityId: String(subscriptionId),
      details: { plan: args.plan, from: on ? existing.plan : null, startsAt },
    });
    const chargeNow = startsAt <= now;
    // From 1 December: the first invoice now, so the clinic can pay it (and save the card) at once
    if (chargeNow) await ctx.scheduler.runAfter(0, processSubscriptionRef, { subscriptionId });
    if (!on || existing.plan !== args.plan) {
      await alertAdmins(
        ctx,
        `${clinic.name} chose ${planName(args.plan)}`,
        `${naira(numbers.monthlyFeeKobo)} a month, first charge ${longDate(startsAt)}.`,
        clinic._id
      );
      await emailClinic(ctx, clinic, {
        subject: `You're on ${planName(args.plan)}`,
        heading: `Welcome to ${planName(args.plan)}`,
        paragraphs: [
          `${clinic.name} is on ${planName(args.plan)}: ${naira(numbers.monthlyFeeKobo)} a month, with Joy for up to ${numbers.programmeAllowance} of your patients and unlimited clinicians.`,
          chargeNow
            ? `Your first payment is due today, ${longDate(startsAt)}, and your plan renews on that date each month.`
            : `You won't pay anything until ${longDate(startsAt)}. Your plan then renews on the ${startsAt === FIRST_CHARGE_MS ? "1st of each month" : "same date each month"}.`,
          "Add a card on your plan page and we'll charge it automatically, with a receipt each time. You can cancel at any time.",
        ],
        buttonLabel: "Open your plan",
        buttonPath: CLINIC_PLAN_PAGE,
      });
    }
    return { startsAt, chargeNow };
  },
});

/** Cancel: before the first charge it stops now; after it, billing ends with the paid period. */
export const cancelClinicPlan = mutation({
  args: {},
  handler: async (ctx) => {
    const { clinic, user } = await getClinicMember(ctx, "billing", { allowBillingReadOnly: true });
    const sub = await subscriptionForClinic(ctx, clinic._id);
    if (!billingIsOn(sub)) throw new ConvexError("Your clinic isn't on a plan.");
    if (sub.plan === "enterprise") throw new ConvexError("Write to hello@myrehabifyhealth.com to end terms agreed with Rehabify.");
    const now = Date.now();
    const started = sub.currentPeriodStart !== undefined;
    if (started) {
      await ctx.db.patch(sub._id, { cancelAtPeriodEnd: true, cancelRequestedAt: now, updatedBy: user._id, updatedAt: now });
    } else {
      await ctx.db.patch(sub._id, { status: "cancelled", cancelledAt: now, cancelRequestedAt: now, updatedBy: user._id, updatedAt: now });
    }
    await ctx.db.insert("systemLogs", {
      type: "billing",
      action: "clinic_plan_cancelled",
      timestamp: now,
      clinicId: clinic._id,
      actorUserId: String(user._id),
      targetEntityType: "clinic_subscription",
      targetEntityId: String(sub._id),
      details: { plan: sub.plan, endsAt: started ? (sub.currentPeriodEnd ?? null) : now },
    });
    const endsAt = started ? sub.currentPeriodEnd ?? now : now;
    await alertAdmins(ctx, `${clinic.name} cancelled ${planName(sub.plan)}`, started ? `Ends ${longDate(endsAt)}.` : "Before the first charge.", clinic._id);
    return { endsAt, immediate: !started };
  },
});

/** Changed their mind before the period ended. */
export const keepClinicPlan = mutation({
  args: {},
  handler: async (ctx) => {
    const { clinic, user } = await getClinicMember(ctx, "billing", { allowBillingReadOnly: true });
    const sub = await subscriptionForClinic(ctx, clinic._id);
    if (!billingIsOn(sub) || !sub.cancelAtPeriodEnd) return null;
    await ctx.db.patch(sub._id, { cancelAtPeriodEnd: undefined, cancelRequestedAt: undefined, updatedBy: user._id, updatedAt: Date.now() });
    return null;
  },
});

export const removeClinicCard = mutation({
  args: {},
  handler: async (ctx) => {
    const { clinic, user } = await getClinicMember(ctx, "billing", { allowBillingReadOnly: true });
    const card = await activeClinicCard(ctx, clinic._id);
    if (!card) return null;
    const now = Date.now();
    await ctx.db.patch(card._id, { status: "removed", removedAt: now, removedBy: user._id });
    await ctx.db.insert("systemLogs", {
      type: "billing",
      action: "clinic_card_removed",
      timestamp: now,
      clinicId: clinic._id,
      actorUserId: String(user._id),
      targetEntityType: "clinic_billing_card",
      targetEntityId: String(card._id),
      details: { last4: card.last4 },
    });
    return null;
  },
});

// ─── Saving a card ───────────────────────────────────────────────────────────

export const cardSetupInfo = internalQuery({
  args: {},
  handler: async (ctx): Promise<CardSetupInfo> => {
    const { clinic } = await getClinicMember(ctx, "billing");
    const sub = await subscriptionForClinic(ctx, clinic._id);
    if (!billingIsOn(sub)) throw new ConvexError("Choose your plan first.");
    const owner = await ctx.db.get(clinic.ownerId);
    const email = validEmail(owner?.email) ? owner!.email! : validEmail(clinic.contactEmail) ? clinic.contactEmail! : null;
    const open = (
      await ctx.db
        .query("clinicSubscriptionInvoices")
        .withIndex("by_clinic_status", (q) => q.eq("clinicId", clinic._id).eq("status", "open"))
        .collect()
    ).sort((a, b) => a.issuedAt - b.issuedAt)[0];
    return {
      clinicId: clinic._id,
      clinicName: clinic.name,
      subscriptionId: sub._id,
      email,
      openInvoice: open ? { _id: open._id, number: open.number, amountKobo: open.amountKobo } : null,
    };
  },
});

/**
 * Opens Paystack's card checkout. With an unpaid invoice the clinic pays it and the card is saved;
 * before the first charge it's a ₦50 card check, refunded once the card is saved.
 */
export const startCardSetup = action({
  args: {},
  handler: async (ctx): Promise<{ authorizationUrl: string }> => {
    const info = await ctx.runQuery(cardSetupInfoRef, {});
    if (!info.email) throw new ConvexError("Add an email address for your clinic in Clinic settings first.");
    const invoice = info.openInvoice;
    const reference = invoice ? `CLINICSUB_${invoice._id}_${Date.now()}` : `${CARD_CHECK_PREFIX}${info.subscriptionId}_${Date.now()}`;
    // Only references recorded here can save a card (a payment made up elsewhere can't swap it)
    if (!invoice) await ctx.runMutation(recordCardCheckRef, { subscriptionId: info.subscriptionId, reference });
    const data = await paystackRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        reference,
        amount: invoice ? invoice.amountKobo : CLINIC_SELF_SERVE.cardCheckKobo,
        email: info.email,
        currency: "NGN",
        callback_url: `${publicAppUrl()}${CLINIC_PLAN_PAGE}`,
        // Only a card can be charged again later
        channels: ["card"],
        metadata: {
          source: invoice ? "clinic_subscription" : "clinic_card_check",
          saveCard: true,
          clinicId: info.clinicId,
          subscriptionId: info.subscriptionId,
          ...(invoice ? { invoiceId: invoice._id } : {}),
          custom_fields: [
            { display_name: "Clinic", variable_name: "clinic", value: info.clinicName },
            {
              display_name: invoice ? "Invoice" : "Purpose",
              variable_name: invoice ? "invoice_number" : "purpose",
              value: invoice ? invoice.number : "Card check, refunded",
            },
          ],
        },
      }),
    });
    const authorizationUrl = typeof data?.authorization_url === "string" ? data.authorization_url : "";
    if (!authorizationUrl.startsWith("https://")) throw new ConvexError("We couldn't open the card page. Please try again.");
    if (invoice) await ctx.runMutation(recordCheckoutRef, { invoiceId: invoice._id, reference, authorizationUrl });
    return { authorizationUrl };
  },
});

export const recordCardCheckStart = internalMutation({
  args: { subscriptionId: v.id("clinicSubscriptions"), reference: v.string() },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) return null;
    const list = [...(sub.cardCheckReferences ?? []).filter((r) => r !== args.reference), args.reference].slice(-10);
    await ctx.db.patch(sub._id, { cardCheckReferences: list, updatedAt: Date.now() });
    return null;
  },
});

/** A card check that left no reusable card: refunded by its reference (no card row to hang it on). */
export const refundCardCheckReference = internalAction({
  args: { reference: v.string(), clinicId: v.id("clinics") },
  handler: async (ctx, args) => {
    try {
      await paystackRequest("/refund", { method: "POST", body: JSON.stringify({ transaction: args.reference }) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      if (!/already.*refund|fully refunded/i.test(message)) await ctx.runMutation(checkRefundFailedRef, { ...args, error: message });
    }
    return null;
  },
});

export const recordCardCheckReferenceRefundFailure = internalMutation({
  args: { reference: v.string(), clinicId: v.id("clinics"), error: v.string() },
  handler: async (ctx, args) => {
    const clinic = await ctx.db.get(args.clinicId);
    await alertAdmins(
      ctx,
      "Card check refund failed",
      `${clinic?.name ?? "A clinic"}'s card check (${args.reference}) couldn't save the card and wasn't refunded: ${args.error.slice(0, 120)}. Refund it on Paystack.`,
      args.clinicId
    );
    return null;
  },
});

export const cardForRefund = internalQuery({
  args: { cardId: v.id("clinicBillingCards") },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card?.checkReference || !card.checkAmountKobo) return null;
    return { reference: card.checkReference, refunded: card.checkRefundedAt !== undefined };
  },
});

export const recordCardCheckRefund = internalMutation({
  args: { cardId: v.id("clinicBillingCards"), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) return null;
    if (args.error) await ctx.db.patch(card._id, { checkRefundError: args.error.slice(0, 300) });
    else await ctx.db.patch(card._id, { checkRefundedAt: Date.now(), checkRefundError: undefined });
    if (args.error) {
      const clinic = await ctx.db.get(card.clinicId);
      await alertAdmins(
        ctx,
        "Card check refund failed",
        `${clinic?.name ?? "A clinic"}'s ${naira(card.checkAmountKobo ?? 0)} card check (${card.checkReference}) wasn't refunded: ${args.error.slice(0, 120)}. Refund it on Paystack.`,
        card.clinicId
      );
    }
    return null;
  },
});

/** Gives the card check back (scheduled when the card is saved). */
export const refundCardCheck = internalAction({
  args: { cardId: v.id("clinicBillingCards") },
  handler: async (ctx, args) => {
    const card = await ctx.runQuery(cardForRefundRef, args);
    if (!card || card.refunded) return;
    try {
      await paystackRequest("/refund", { method: "POST", body: JSON.stringify({ transaction: card.reference }) });
      await ctx.runMutation(recordRefundRef, { cardId: args.cardId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      // Paystack says it's already refunded: that's the outcome we wanted
      if (/already.*refund|fully refunded/i.test(message)) await ctx.runMutation(recordRefundRef, { cardId: args.cardId });
      else await ctx.runMutation(recordRefundRef, { cardId: args.cardId, error: message });
    }
  },
});

// ─── Charging the saved card ─────────────────────────────────────────────────

export const autoChargeInfo = internalQuery({
  args: { invoiceId: v.id("clinicSubscriptionInvoices") },
  handler: async (ctx, args): Promise<AutoChargeInfo | null> => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    const card = await activeClinicCard(ctx, invoice.clinicId);
    return {
      status: invoice.status,
      amountKobo: invoice.amountKobo,
      attempts: invoice.autoChargeAttempts ?? 0,
      authorizationCode: card?.authorizationCode ?? null,
      email: card?.email ?? null,
      clinicId: invoice.clinicId,
      number: invoice.number,
    };
  },
});

/** Records a charge attempt; tells the clinic when the card was declined. */
export const recordAutoCharge = internalMutation({
  args: { invoiceId: v.id("clinicSubscriptionInvoices"), reference: v.string(), status: v.string(), message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    const now = Date.now();
    const attempts = (invoice.autoChargeAttempts ?? 0) + 1;
    await ctx.db.patch(invoice._id, {
      autoChargeAttempts: attempts,
      lastAutoChargeAt: now,
      lastAutoChargeStatus: args.status,
      lastAutoChargeMessage: args.message?.slice(0, 200),
      lastAutoChargeReference: args.reference,
      // The checks (every 10 minutes and daily) verify these references if Paystack's webhook never arrives
      paystackReferences: withReference(invoiceReferences(invoice), args.reference),
      updatedAt: now,
    });
    if (args.status === "success" || args.status === "pending" || invoice.status !== "open") return null;
    await tellCardDeclined(ctx, invoice, attempts, args.message);
    return null;
  },
});

/**
 * A charge that was still going through (or had no answer) turned out declined, or wasn't confirmed
 * within a day (clinicBilling.runDailyClinicSubscriptions): the clinic hears, and the retry can run.
 */
export const resolveAutoCharge = internalMutation({
  args: { invoiceId: v.id("clinicSubscriptionInvoices"), reference: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.lastAutoChargeReference !== args.reference || invoice.lastAutoChargeStatus !== "pending") return null;
    await ctx.db.patch(invoice._id, { lastAutoChargeStatus: "failed", lastAutoChargeMessage: args.message.slice(0, 200), updatedAt: Date.now() });
    if (invoice.status === "open") await tellCardDeclined(ctx, invoice, invoice.autoChargeAttempts ?? 1, args.message);
    return null;
  },
});

/** Tells the clinic its saved card was declined, and whether we'll try again. */
async function tellCardDeclined(ctx: MutationCtx, invoice: Doc<"clinicSubscriptionInvoices">, attempts: number, message: string | undefined) {
  const clinic = await ctx.db.get(invoice.clinicId);
  if (!clinic) return;
  const card = await activeClinicCard(ctx, clinic._id);
  const retry = attempts < MAX_AUTO_CHARGES;
  await emailClinic(ctx, clinic, {
    subject: `We couldn't charge ${cardLabel(card)} for invoice ${invoice.number}`,
    heading: "Your card payment didn't go through",
    paragraphs: [
      `We tried to charge ${cardLabel(card)} ${naira(invoice.amountKobo)} for invoice ${invoice.number}${message ? `, and the bank said: “${message.slice(0, 120)}”` : ""}.`,
      retry
        ? `We'll try again in 2 days. To sort it now, pay from your plan page or add another card. It's due by ${longDate(invoice.dueAt)}.`
        : `Please pay from your plan page by ${longDate(invoice.dueAt)}, or add another card.`,
    ],
    buttonLabel: "Pay now",
    buttonPath: CLINIC_PLAN_PAGE,
  });
}

/** Charges an open invoice to the clinic's saved card (scheduled when it's issued, and for retries). */
export const chargeSavedCard = internalAction({
  args: { invoiceId: v.id("clinicSubscriptionInvoices") },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(autoChargeInfoRef, args);
    if (!info || info.status !== "open" || !info.authorizationCode || !info.email) return { charged: false };
    if (info.attempts >= MAX_AUTO_CHARGES) return { charged: false };
    const reference = `CLINICSUB_${args.invoiceId}_${Date.now()}`;
    let status = "failed";
    let message: string | undefined;
    try {
      const data = await paystackRequest("/transaction/charge_authorization", {
        method: "POST",
        body: JSON.stringify({
          authorization_code: info.authorizationCode,
          email: info.email,
          amount: info.amountKobo,
          currency: "NGN",
          reference,
          metadata: { source: "clinic_subscription", invoiceId: args.invoiceId, clinicId: info.clinicId, automatic: true },
        }),
      });
      status = typeof data?.status === "string" ? data.status : "failed";
      message = typeof data?.gateway_response === "string" ? data.gateway_response : undefined;
      if (status === "success") {
        await ctx.runMutation(completePaymentRef, {
          reference,
          amountKobo: Number(data.amount) || 0,
          currency: String(data.currency || ""),
        });
      } else if (status !== "failed") {
        // send_otp, pending, ongoing…: Paystack's webhook (or the daily check) settles it
        status = "pending";
      }
    } catch (err) {
      // No clear answer: the money may have gone. The checks settle it either way before any retry
      status = "pending";
      message = err instanceof Error ? err.message : "Paystack didn't answer";
    }
    await ctx.runMutation(recordAutoChargeRef, { invoiceId: args.invoiceId, reference, status, message });
    return { charged: status === "success" };
  },
});

