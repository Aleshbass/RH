/**
 * Independent physio plans: Free and Individual Pro (owner spec "Individual pro spec-Rehabify",
 * 17 Nov 2026; defaults in lib/physioPlans.ts, every number editable in Admin › Physio plans).
 *
 *  - Before Pro opens (launchDate), physios "lock in" Pro: a small card check saves the card
 *    (refunded at once) and the first month is charged on the launch day. Founding physios (joined
 *    before foundingCutoff) pay the founding price for their first foundingMonths.
 *  - After launch, "Upgrade" pays the first month by card or bank transfer. Card payments save
 *    the card and renew on the same date each month; transfers renew by hand from the plan page.
 *  - Reminders before each renewal; a failed card is retried for retryDays, then graceDays of
 *    grace (still Pro), then Free. Cancelling keeps Pro to the end of the paid period.
 *  - Physios in a clinic are covered by the clinic; a Pro they had pauses. Physios outside
 *    Nigeria get Pro free as testers. Admins can give free Pro for a while with a reason.
 *  - Usage meters (patients covered this month, Scribe sessions) are shown now; the Free limits
 *    apply from limitsDate (new physios from launchDate) and are enforced where those features live.
 *
 * Payments use PHYSIOPRO_ references (app/api/webhooks/paystack routes them here).
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer, requireAdmin } from "./helpers/partnerAccess";
import { paystackRequest } from "./clinicBilling";
import { verifyPaystackSignature } from "./helpers/paystackSignature";
import { issueReceipt } from "./helpers/receipts";
import { addMonthsLagos } from "./helpers/clinicSubscriptions";
import { zonedDateKey, zonedDateTimeToUtc } from "./helpers/lagosTime";
import { appLink, publicAppUrl } from "./helpers/appUrl";
import { insertNotification } from "./helpers/pushNotify";
import { DEFAULT_PHYSIO_PLAN_SETTINGS, PRO_CARD_CHECK_KOBO, dayLabel, isOutsideNigeria, naira, type PhysioPlanSettings } from "../lib/physioPlans";

type Ctx = QueryCtx | MutationCtx;
type Sub = Doc<"physioSubscriptions">;

const DAY_MS = 24 * 60 * 60 * 1000;
/** The plans pop-up, once per physio (featureIntros) */
const ANNOUNCE_KEY = "plans:announce-2026-11";
export const PLAN_PAGE = "/dashboard/physiotherapist/settings/plan";
const PREFIX = "PHYSIOPRO_";
const REFERENCE = /^PHYSIOPRO_(CARD_|RENEW_|TOPUP_)?([a-z0-9]+)_\d+$/;
const FOOTNOTE = "You're receiving this because you use Rehabify as a physiotherapist. Questions about your plan? Write to hello@myrehabifyhealth.com.";

const sendEmailRef = makeFunctionReference<
  "action",
  { to: string; subject: string; greetingName?: string; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string; footnote?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");
const prepareRef = makeFunctionReference<"mutation", { purpose: Purpose }, Prepared>("physioPlans:prepareCheckout");
const completeRef = makeFunctionReference<"mutation", Settle, SettleResult>("physioPlans:settlePayment");
const chargeInfoRef = makeFunctionReference<"query", { subscriptionId: Id<"physioSubscriptions"> }, ChargeInfo | null>("physioPlans:chargeInfo");
const chargeFailedRef = makeFunctionReference<"mutation", { subscriptionId: Id<"physioSubscriptions">; reference: string; error: string }, null>(
  "physioPlans:recordChargeFailure"
);
const chargeRef = makeFunctionReference<"action", { subscriptionId: Id<"physioSubscriptions"> }, null>("physioPlans:chargeSavedCard");
const refundRef = makeFunctionReference<"action", { cardId: Id<"physioPlanCards"> }, null>("physioPlans:refundCardCheck");
const refundInfoRef = makeFunctionReference<"query", { cardId: Id<"physioPlanCards"> }, { reference: string; refunded: boolean } | null>("physioPlans:refundInfo");
const refundDoneRef = makeFunctionReference<"mutation", { cardId: Id<"physioPlanCards">; error?: string }, null>("physioPlans:recordRefund");

type Purpose = "upgrade" | "card" | "renew" | "topup";
type Prepared = { reference: string; amountKobo: number; email: string; name: string; channels: string[]; label: string; subscriptionId: Id<"physioSubscriptions"> | null };
type Settle = { reference: string; amountKobo: number; currency: string; channel?: string; authorization?: unknown; email?: string };
type SettleResult = { ok: boolean; already?: boolean; reason?: string; kind?: string };
type ChargeInfo = { authorizationCode: string; email: string; amountKobo: number; reference: string; label: string };

// ─── Settings, dates, who the physio is ──────────────────────────────────────

export async function loadPlanSettings(ctx: Ctx): Promise<PhysioPlanSettings> {
  const row = await ctx.db.query("physioPlanSettings").first();
  const out = { ...DEFAULT_PHYSIO_PLAN_SETTINGS };
  if (row) for (const key of Object.keys(out) as (keyof PhysioPlanSettings)[]) if (row[key] !== undefined) (out as Record<string, unknown>)[key] = row[key];
  return out;
}

/** Lagos midnight at the start of "YYYY-MM-DD". */
const dayStart = (key: string) => zonedDateTimeToUtc(key, "00:00");
const monthStart = (now: number) => dayStart(`${zonedDateKey(now).slice(0, 7)}-01`);
const shortDate = (ms: number) => dayLabel(zonedDateKey(ms));

async function physioOf(ctx: Ctx) {
  const viewer = await getViewer(ctx);
  const user = viewer?.user ?? null;
  if (!user || user.role !== "physiotherapist") return null;
  const profile = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .first();
  return { user, profile };
}

async function requirePhysio(ctx: Ctx) {
  const physio = await physioOf(ctx);
  if (!physio) throw new ConvexError("Sign in with your physiotherapist account.");
  return physio;
}

function joinedAt(user: Doc<"users">, profile: Doc<"physiotherapistProfiles"> | null) {
  return Math.min(user._creationTime, profile?._creationTime ?? Number.POSITIVE_INFINITY);
}

function isFoundingPhysio(user: Doc<"users">, profile: Doc<"physiotherapistProfiles"> | null, s: PhysioPlanSettings) {
  return joinedAt(user, profile) < dayStart(s.foundingCutoff) + DAY_MS;
}

async function subscriptionOf(ctx: Ctx, physioId: Id<"users">) {
  const rows = await ctx.db
    .query("physioSubscriptions")
    .withIndex("by_physio", (q) => q.eq("physioId", physioId))
    .take(20);
  // The newest one that's still going, else the newest
  const live = rows.filter((r) => ["scheduled", "active", "past_due", "paused"].includes(r.status));
  return (live.length ? live : rows).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

async function activeCard(ctx: Ctx, physioId: Id<"users">) {
  return await ctx.db
    .query("physioPlanCards")
    .withIndex("by_physio_status", (q) => q.eq("physioId", physioId).eq("status", "active"))
    .first();
}

async function activeGrant(ctx: Ctx, physioId: Id<"users">, now: number) {
  const grants = await ctx.db
    .query("physioPlanGrants")
    .withIndex("by_physio", (q) => q.eq("physioId", physioId))
    .take(20);
  return grants.filter((g) => !g.revokedAt && g.until > now).sort((a, b) => b.until - a.until)[0] ?? null;
}

/** The price of the period starting at `periodStart`: founding while it lasts, then Pro. */
function priceFor(sub: Pick<Sub, "founding" | "foundingUntil">, s: PhysioPlanSettings, periodStart: number) {
  return sub.founding && (sub.foundingUntil === undefined || periodStart < sub.foundingUntil) ? s.foundingPriceKobo : s.proPriceKobo;
}

/** Has paid Pro right now (paid up, or within retries and grace). */
function subGivesPro(sub: Sub | null, now: number) {
  if (!sub) return false;
  if (sub.status === "active") return true;
  return sub.status === "past_due" && (sub.graceUntil ?? 0) > now;
}

export type PlanKind = "free" | "pro" | "clinic" | "granted" | "tester";

/** What the physio is on right now, and why. Used by the plan page, the badge and the limits. */
export async function physioPlanFor(ctx: Ctx, user: Doc<"users">, profile: Doc<"physiotherapistProfiles"> | null, s: PhysioPlanSettings, now: number) {
  const sub = await subscriptionOf(ctx, user._id);
  if (profile?.clinicId) {
    const clinic = await ctx.db.get(profile.clinicId);
    return { kind: "clinic" as PlanKind, sub, clinicName: clinic?.name ?? "your clinic" };
  }
  const grant = await activeGrant(ctx, user._id, now);
  if (grant) return { kind: "granted" as PlanKind, sub, grant };
  if (subGivesPro(sub, now)) return { kind: "pro" as PlanKind, sub };
  if (s.abroadFreePro && isOutsideNigeria(profile?.country)) return { kind: "tester" as PlanKind, sub, country: profile?.country ?? null };
  return { kind: "free" as PlanKind, sub };
}

/** Patients whose programmes the physio's plan covers this month (clinic and patient-paid ones never count). */
async function coveredPatientsThisMonth(ctx: Ctx, physioId: Id<"users">, now: number) {
  const programmes = await ctx.db
    .query("exercisePrograms")
    .withIndex("by_creator", (q) => q.eq("createdBy", physioId).gte("createdAt", monthStart(now)))
    .take(1000);
  return new Set(programmes.filter((p) => !p.clinicId && p.coverage !== "patient").map((p) => p.patientId as string));
}

/** Scribe top-up sessions left (bought minus used; they never expire). */
async function scribeCredits(ctx: Ctx, physioId: Id<"users">) {
  const rows = await ctx.db
    .query("physioScribeCredits")
    .withIndex("by_physio", (q) => q.eq("physioId", physioId))
    .take(2000);
  return Math.max(0, rows.reduce((sum, r) => sum + r.delta, 0));
}

/** When the Free limits apply to this physio: joined after launch → from the day they joined; else the limits date. */
function limitsFromFor(user: Doc<"users">, profile: Doc<"physiotherapistProfiles"> | null, s: PhysioPlanSettings) {
  const joined = joinedAt(user, profile);
  return joined >= dayStart(s.launchDate) ? joined : dayStart(s.limitsDate);
}

/**
 * Who pays for a new programme from an independent physio (exercisePrograms.createProgram):
 * covered by their plan, or over Free's patients a month (then the physio chooses: the patient
 * pays Flex, or they upgrade). A patient already covered this month never counts twice.
 */
export async function programmeCoverage(ctx: Ctx, physio: Doc<"users">, patientId: Id<"users">, now: number) {
  const profile = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", physio._id))
    .first();
  const s = await loadPlanSettings(ctx);
  const plan = await physioPlanFor(ctx, physio, profile, s, now);
  if (plan.kind !== "free" || now < limitsFromFor(physio, profile, s)) return { covered: true as const };
  const covered = await coveredPatientsThisMonth(ctx, physio._id, now);
  if (covered.has(patientId) || covered.size < s.freePatientsPerMonth) return { covered: true as const };
  return { covered: false as const, used: covered.size, limit: s.freePatientsPerMonth };
}

/**
 * May this physio start a Scribe session now (convex/scribe.ts startScribe)? Clinic members are
 * covered by the clinic; others get their plan's sessions a month, then top-ups. Checked when a
 * session starts only, so Scribe never stops mid-session.
 */
export async function scribeAllowance(ctx: Ctx, physio: Doc<"users">, now: number) {
  const profile = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", physio._id))
    .first();
  const s = await loadPlanSettings(ctx);
  const plan = await physioPlanFor(ctx, physio, profile, s, now);
  if (plan.kind === "clinic" || now < limitsFromFor(physio, profile, s)) return { ok: true as const, useCredit: false };
  const included = plan.kind === "free" ? s.freeScribeSessions : s.proScribeSessions;
  const used = (await usageThisMonth(ctx, physio._id, now)).scribe;
  if (used < included) return { ok: true as const, useCredit: false };
  const credits = await scribeCredits(ctx, physio._id);
  if (credits > 0) return { ok: true as const, useCredit: true };
  return { ok: false as const, used, included, onPro: plan.kind !== "free", topUpKobo: s.scribeTopUpKobo, topUpSessions: s.scribeTopUpSessions };
}

/** This month's usage: different patients on programmes the physio covers, and Scribe sessions. */
async function usageThisMonth(ctx: Ctx, physioId: Id<"users">, now: number) {
  const from = monthStart(now);
  const patients = (await coveredPatientsThisMonth(ctx, physioId, now)).size;
  const sessions = await ctx.db
    .query("scribeSessions")
    .withIndex("by_physio_and_created", (q) => q.eq("physiotherapistId", physioId).gte("createdAt", from))
    .take(1000);
  // A session is one encounter up to 30 minutes; longer ones count as 2 (or more)
  const scribe = sessions
    .filter((x) => x.status !== "discarded" || x.audioSeconds > 0)
    .reduce((sum, x) => sum + Math.max(1, Math.ceil(x.audioSeconds / 1800)), 0);
  return { patients, scribe };
}

// ─── The plan page ───────────────────────────────────────────────────────────

/** Everything Settings › Plan & billing (and the plan badge) shows. Live: it updates as a payment lands. */
export const getMyPlan = query({
  args: {},
  handler: async (ctx) => {
    const physio = await physioOf(ctx);
    if (!physio) return null;
    const { user, profile } = physio;
    const now = Date.now();
    const s = await loadPlanSettings(ctx);
    const plan = await physioPlanFor(ctx, user, profile, s, now);
    const sub = plan.sub;
    const card = await activeCard(ctx, user._id);
    const usage = await usageThisMonth(ctx, user._id, now);
    const credits = await scribeCredits(ctx, user._id);
    const founding = sub?.founding ?? isFoundingPhysio(user, profile, s);
    const launchAt = dayStart(s.launchDate);
    const limitsAt = dayStart(s.limitsDate);
    const launched = now >= launchAt;
    const onPro = plan.kind !== "free";
    // New physios (joined after launch) are on the Free limits from the day they join
    void limitsAt;
    const limitsFrom = limitsFromFor(user, profile, s);
    const payments = await ctx.db
      .query("physioPlanPayments")
      .withIndex("by_physio", (q) => q.eq("physioId", user._id))
      .order("desc")
      .take(12);
    const nextPeriodStart = sub?.status === "scheduled" ? (sub.currentPeriodStart ?? launchAt) : (sub?.currentPeriodEnd ?? now);
    const pending = payments.find((p) => p.status === "pending" && now - p.createdAt < 2 * 60 * 60 * 1000 && p.kind !== "renewal");
    // The pop-up: switched on by an admin, for physios on Free who haven't chosen Pro or closed it
    const seen = await ctx.db
      .query("featureIntros")
      .withIndex("by_user_and_key", (q) => q.eq("userId", user._id).eq("key", ANNOUNCE_KEY))
      .first();
    const announce = s.announceOn && plan.kind === "free" && sub?.status !== "scheduled" && !seen;
    return {
      firstName: user.firstName ?? null,
      plan: {
        kind: plan.kind,
        clinicName: "clinicName" in plan ? plan.clinicName : null,
        grantUntil: "grant" in plan && plan.grant ? plan.grant.until : null,
        grantReason: "grant" in plan && plan.grant ? plan.grant.reason : null,
        country: "country" in plan ? plan.country : null,
      },
      subscription: sub
        ? {
            id: sub._id,
            status: sub.status,
            founding: sub.founding,
            foundingUntil: sub.foundingUntil ?? null,
            periodStart: sub.currentPeriodStart ?? null,
            periodEnd: sub.currentPeriodEnd ?? null,
            cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
            graceUntil: sub.graceUntil ?? null,
            lastAttemptError: sub.lastAttemptError ?? null,
            nextChargeAt: ["scheduled", "active"].includes(sub.status) && !sub.cancelAtPeriodEnd ? nextPeriodStart : null,
            nextPriceKobo: priceFor(sub, s, nextPeriodStart),
          }
        : null,
      card: card ? { brand: card.brand, last4: card.last4 ?? null, expiry: card.expMonth && card.expYear ? `${card.expMonth}/${card.expYear.slice(-2)}` : null, bank: card.bank ?? null } : null,
      usage: {
        monthLabel: new Date(now + 3_600_000).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }),
        patients: { used: usage.patients, limit: onPro ? null : s.freePatientsPerMonth },
        scribe: { used: usage.scribe, limit: plan.kind === "clinic" ? null : onPro ? s.proScribeSessions : s.freeScribeSessions, credits },
        limitsFrom,
        limitsActive: now >= limitsFrom,
      },
      offer: {
        founding,
        launched,
        launchDate: s.launchDate,
        limitsDate: s.limitsDate,
        priceKobo: founding ? s.foundingPriceKobo : s.proPriceKobo,
        proPriceKobo: s.proPriceKobo,
        foundingPriceKobo: s.foundingPriceKobo,
        foundingMonths: s.foundingMonths,
        cardCheckKobo: PRO_CARD_CHECK_KOBO,
      },
      settings: s,
      payments: payments.map((p) => ({
        id: p._id,
        kind: p.kind,
        amountKobo: p.amountKobo,
        status: p.status,
        paidAt: p.paidAt ?? null,
        createdAt: p.createdAt,
        periodStart: p.periodStart ?? null,
        periodEnd: p.periodEnd ?? null,
      })),
      confirming: Boolean(pending),
      announce,
    };
  },
});

/** Starts a checkout: upgrade (or lock in before launch), save/replace a card, or pay a renewal by hand. */
export const prepareCheckout = internalMutation({
  args: { purpose: v.union(v.literal("upgrade"), v.literal("card"), v.literal("renew"), v.literal("topup")) },
  handler: async (ctx, args): Promise<Prepared> => {
    const { user, profile } = await requirePhysio(ctx);
    if (profile?.clinicId) throw new ConvexError("You're covered by your clinic's plan, so there's nothing to pay.");
    const email = user.email?.trim().toLowerCase();
    if (!email || email.endsWith("@joy.rehabify")) throw new ConvexError("Add your email address in Settings › Profile first, so we can send your receipts.");
    const s = await loadPlanSettings(ctx);
    const now = Date.now();
    if (args.purpose === "topup") {
      // Scribe top-up: a one-off payment for more sessions, any plan
      const reference = `${PREFIX}TOPUP_${user._id}_${now}`;
      await ctx.db.insert("physioPlanPayments", {
        physioId: user._id,
        reference,
        kind: "topup",
        method: "checkout",
        amountKobo: s.scribeTopUpKobo,
        status: "pending",
        createdAt: now,
      });
      return {
        reference,
        amountKobo: s.scribeTopUpKobo,
        email,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Physiotherapist",
        channels: ["card", "bank_transfer"],
        label: `Rehabify Scribe top-up (${s.scribeTopUpSessions} sessions)`,
        subscriptionId: null,
      };
    }
    const launchAt = dayStart(s.launchDate);
    let sub = await subscriptionOf(ctx, user._id);
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Physiotherapist";
    let purpose = args.purpose;

    if (purpose === "upgrade") {
      if (sub?.status === "active") throw new ConvexError("You're already on Pro.");
      // Pro that didn't renew: upgrading means paying that renewal
      if (sub?.status === "past_due") purpose = "renew";
      else if (sub?.status !== "scheduled") {
        // A fresh Pro (first time, or back after it ended or from a clinic)
        if (sub?.status === "paused") await ctx.db.patch(sub._id, { status: "cancelled", endedAt: now, updatedAt: now });
        // The founding months run from the first Pro ever paid, so coming back doesn't restart them
        const earlier = await ctx.db
          .query("physioSubscriptions")
          .withIndex("by_physio", (q) => q.eq("physioId", user._id))
          .take(20);
        const foundingUntil = earlier.reduce<number | undefined>((max, r) => (r.foundingUntil && (!max || r.foundingUntil > max) ? r.foundingUntil : max), undefined);
        const id = await ctx.db.insert("physioSubscriptions", {
          physioId: user._id,
          status: "scheduled",
          founding: isFoundingPhysio(user, profile, s),
          ...(foundingUntil ? { foundingUntil } : {}),
          currentPeriodStart: now < launchAt ? launchAt : undefined,
          startedAt: now,
          updatedAt: now,
        });
        sub = (await ctx.db.get(id))!;
      }
    }
    if (!sub) throw new ConvexError("Choose Pro first.");
    if (purpose === "renew" && !["active", "past_due"].includes(sub.status)) throw new ConvexError("There's no Pro to renew. Choose Pro instead.");

    // Before launch, and for card changes: a small card check, refunded at once
    const cardOnly = purpose === "card" || (purpose === "upgrade" && now < launchAt);
    const ts = now;
    const reference = cardOnly ? `${PREFIX}CARD_${sub._id}_${ts}` : purpose === "renew" ? `${PREFIX}RENEW_${sub._id}_${ts}` : `${PREFIX}${sub._id}_${ts}`;
    const periodStart = purpose === "renew" ? (sub.currentPeriodEnd ?? now) : now;
    const amountKobo = cardOnly ? PRO_CARD_CHECK_KOBO : priceFor({ founding: sub.founding, foundingUntil: sub.foundingUntil }, s, periodStart);
    await ctx.db.insert("physioPlanPayments", {
      physioId: user._id,
      subscriptionId: sub._id,
      reference,
      kind: cardOnly ? "card_check" : purpose === "renew" ? "renewal" : "first",
      method: "checkout",
      amountKobo,
      status: "pending",
      createdAt: now,
    });
    return {
      reference,
      amountKobo,
      email,
      name,
      // A card renews by itself; a bank transfer is renewed by hand from the plan page
      channels: cardOnly ? ["card"] : ["card", "bank_transfer"],
      label: cardOnly ? "Card check, refunded" : sub.founding ? "Individual Pro (founding price)" : "Individual Pro",
      subscriptionId: sub._id,
    };
  },
});

export const startCheckout = action({
  args: { purpose: v.union(v.literal("upgrade"), v.literal("card"), v.literal("renew"), v.literal("topup")) },
  handler: async (ctx, args): Promise<{ authorizationUrl: string }> => {
    const p = await ctx.runMutation(prepareRef, { purpose: args.purpose });
    const data = await paystackRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        reference: p.reference,
        amount: p.amountKobo,
        email: p.email,
        currency: "NGN",
        callback_url: `${publicAppUrl()}${PLAN_PAGE}?pro=return`,
        channels: p.channels,
        metadata: {
          source: "physio_pro",
          ...(p.subscriptionId ? { subscriptionId: p.subscriptionId } : {}),
          custom_fields: [
            { display_name: "Physiotherapist", variable_name: "physio", value: p.name },
            { display_name: "For", variable_name: "purpose", value: p.label },
          ],
        },
      }),
    });
    const authorizationUrl = typeof data?.authorization_url === "string" ? data.authorization_url : "";
    if (!authorizationUrl.startsWith("https://")) throw new ConvexError("We couldn't open the payment page. Please try again.");
    return { authorizationUrl };
  },
});

/** The plan page calls this when Paystack sends the physio back (the webhook does the same; both are safe). */
export const verifyPayment = action({
  args: { reference: v.string() },
  handler: async (ctx, args): Promise<SettleResult> => {
    if (!REFERENCE.test(args.reference)) return { ok: false, reason: "unknown" };
    let tx: any = null;
    try {
      tx = await paystackRequest(`/transaction/verify/${encodeURIComponent(args.reference)}`, { method: "GET" });
    } catch {
      return { ok: false, reason: "unverified" };
    }
    if (tx?.status !== "success") return { ok: false, reason: String(tx?.status ?? "failed") };
    return await ctx.runMutation(completeRef, {
      reference: args.reference,
      amountKobo: Number(tx.amount) || 0,
      currency: String(tx.currency ?? ""),
      channel: typeof tx.channel === "string" ? tx.channel : undefined,
      authorization: tx.authorization,
      email: typeof tx.customer?.email === "string" ? tx.customer.email : undefined,
    });
  },
});

export const recordProPaystackWebhook = mutation({
  args: { rawBody: v.string(), signature: v.string() },
  handler: async (ctx, args) => {
    if (!(await verifyPaystackSignature(args.rawBody, args.signature))) throw new Error("Invalid Paystack webhook signature");
    let payload: any;
    try {
      payload = JSON.parse(args.rawBody);
    } catch {
      throw new Error("Invalid webhook payload");
    }
    const data = payload?.data ?? {};
    const reference = typeof data.reference === "string" ? data.reference : "";
    if (!reference.startsWith(PREFIX)) return { handled: false };
    if (payload.event !== "charge.success" || (data.status !== undefined && data.status !== "success")) return { handled: true, ignored: String(payload.event) };
    const result = await settle(ctx, {
      reference,
      amountKobo: Number(data.amount) || 0,
      currency: typeof data.currency === "string" ? data.currency : "",
      channel: typeof data.channel === "string" ? data.channel : undefined,
      authorization: data.authorization,
      email: typeof data.customer?.email === "string" ? data.customer.email : undefined,
    });
    return { handled: true, ...result };
  },
});

export const settlePayment = internalMutation({
  args: {
    reference: v.string(),
    amountKobo: v.number(),
    currency: v.string(),
    channel: v.optional(v.string()),
    authorization: v.optional(v.any()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => await settle(ctx, args),
});

const str = (value: unknown, max = 80) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);

/** Saves the card from a successful card payment, replacing any earlier one. */
async function saveCard(ctx: MutationCtx, physioId: Id<"users">, reference: string, input: Settle, checkKobo?: number) {
  const auth = (input.authorization ?? {}) as Record<string, unknown>;
  const code = str(auth.authorization_code, 120);
  if (!code || auth.reusable !== true || (str(auth.channel) && str(auth.channel) !== "card")) return null;
  const already = await ctx.db
    .query("physioPlanCards")
    .withIndex("by_reference", (q) => q.eq("reference", reference))
    .first();
  if (already) return already._id;
  const now = Date.now();
  const old = await ctx.db
    .query("physioPlanCards")
    .withIndex("by_physio_status", (q) => q.eq("physioId", physioId).eq("status", "active"))
    .take(10);
  for (const c of old) await ctx.db.patch(c._id, { status: "replaced", removedAt: now });
  const user = await ctx.db.get(physioId);
  const id = await ctx.db.insert("physioPlanCards", {
    physioId,
    status: "active",
    authorizationCode: code,
    signature: str(auth.signature, 120),
    email: (input.email ?? user?.email ?? "").toLowerCase(),
    brand: (str(auth.brand) ?? str(auth.card_type) ?? "Card").replace(/^\w/, (c) => c.toUpperCase()),
    last4: str(auth.last4, 4),
    expMonth: str(auth.exp_month, 2),
    expYear: str(auth.exp_year, 4),
    bank: str(auth.bank),
    reference,
    checkAmountKobo: checkKobo,
    createdAt: now,
  });
  if (checkKobo) await ctx.scheduler.runAfter(0, refundRef, { cardId: id });
  return id;
}

async function emailPhysio(ctx: MutationCtx, physio: Doc<"users"> | null, m: { subject: string; heading: string; paragraphs: string[]; buttonLabel?: string }) {
  const to = physio?.email?.trim().toLowerCase();
  if (!to || to.endsWith("@joy.rehabify")) return;
  await ctx.scheduler.runAfter(0, sendEmailRef, {
    to,
    subject: m.subject,
    greetingName: physio?.firstName?.trim() || undefined,
    heading: m.heading,
    paragraphs: m.paragraphs,
    buttonLabel: m.buttonLabel ?? "Open your plan",
    buttonUrl: appLink(PLAN_PAGE),
    footnote: FOOTNOTE,
  });
}

async function notifyPhysio(ctx: MutationCtx, physioId: Id<"users">, title: string, body: string) {
  await insertNotification(ctx, {
    userId: physioId,
    type: "physio_plan",
    priority: "medium",
    status: "pending",
    payload: { title, body, link: PLAN_PAGE },
    createdAt: Date.now(),
  });
}

/** Settles one Pro payment (first month, renewal or card check). Idempotent per reference. */
async function settle(ctx: MutationCtx, input: Settle): Promise<SettleResult> {
  const payment = await ctx.db
    .query("physioPlanPayments")
    .withIndex("by_reference", (q) => q.eq("reference", input.reference))
    .first();
  if (!payment) return { ok: false, reason: "unknown_reference" };
  if (payment.status === "paid") return { ok: true, already: true, kind: payment.kind };
  if (input.currency && input.currency !== "NGN") return { ok: false, reason: "currency" };
  if (input.amountKobo < payment.amountKobo) {
    await ctx.db.patch(payment._id, { status: "failed", error: `Paid ${input.amountKobo}, expected ${payment.amountKobo}` });
    return { ok: false, reason: "short_payment" };
  }
  const physio = await ctx.db.get(payment.physioId);
  if (!physio) return { ok: false, reason: "missing" };
  const now = Date.now();
  const s = await loadPlanSettings(ctx);
  if (payment.kind === "topup") {
    await ctx.db.insert("physioScribeCredits", { physioId: physio._id, delta: s.scribeTopUpSessions, reason: "purchase", reference: input.reference, createdAt: now });
    const receiptId = await issueReceipt(ctx, {
      kind: "payment",
      payerUserId: physio._id,
      email: physio.email ?? undefined,
      name: [physio.firstName, physio.lastName].filter(Boolean).join(" ") || undefined,
      relatedType: "physio_scribe_topup",
      relatedId: physio._id,
      relationship: "independent",
      description: `Rehabify Scribe top-up: ${s.scribeTopUpSessions} sessions`,
      lines: [{ label: `Scribe top-up (${s.scribeTopUpSessions} sessions)`, amountKobo: input.amountKobo }],
      reference: input.reference,
      dedupeKey: input.reference,
      paidAt: now,
    });
    await ctx.db.patch(payment._id, { status: "paid", paidAt: now, receiptId });
    await notifyPhysio(ctx, physio._id, "Scribe top-up added", `${s.scribeTopUpSessions} more Scribe sessions. They never expire.`);
    return { ok: true, kind: "topup" };
  }
  const sub = payment.subscriptionId ? await ctx.db.get(payment.subscriptionId) : null;
  if (!sub) return { ok: false, reason: "missing" };

  if (payment.kind === "card_check") {
    const cardId = await saveCard(ctx, physio._id, input.reference, input, input.amountKobo);
    await ctx.db.patch(payment._id, { status: "paid", paidAt: now });
    if (!cardId) return { ok: false, reason: "card_unusable", kind: "card_check" };
    if (sub.status === "scheduled") {
      const startAt = sub.currentPeriodStart ?? dayStart(s.launchDate);
      await notifyPhysio(ctx, physio._id, "Pro is locked in", `We'll charge your card on ${shortDate(startAt)}.`);
      await emailPhysio(ctx, physio, {
        subject: "Your Rehabify Pro is locked in",
        heading: sub.founding ? "Your founding price is locked in" : "Your Pro is locked in",
        paragraphs: [
          `We saved your card and refunded the ${naira(input.amountKobo)} check. Nothing else is charged before ${shortDate(startAt)}.`,
          `On ${shortDate(startAt)} we'll charge ${naira(priceFor(sub, s, startAt))} for your first month of Individual Pro${sub.founding ? ` (the founding price, for your first ${s.foundingMonths} months)` : ""}, then on the same date each month. You can cancel any time before then.`,
        ],
      });
    }
    return { ok: true, kind: "card_check" };
  }

  // A month of Pro
  // Locked-in Pro charged on launch day starts at launch (midnight), so it renews on that date
  const periodStart =
    payment.kind === "renewal"
      ? (sub.currentPeriodEnd ?? now)
      : sub.status === "scheduled" && sub.currentPeriodStart && Math.abs(now - sub.currentPeriodStart) < DAY_MS
        ? sub.currentPeriodStart
        : now;
  const periodEnd = addMonthsLagos(periodStart, 1);
  const firstPaid = payment.kind === "first";
  await ctx.db.patch(sub._id, {
    status: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    ...(firstPaid && sub.founding && sub.foundingUntil === undefined ? { foundingUntil: addMonthsLagos(periodStart, s.foundingMonths) } : {}),
    renewalAttempts: 0,
    lastAttemptError: undefined,
    graceUntil: undefined,
    pausedAt: undefined,
    updatedAt: now,
  });
  await saveCard(ctx, physio._id, input.reference, input);
  const name = [physio.firstName, physio.lastName].filter(Boolean).join(" ") || undefined;
  const receiptId = await issueReceipt(ctx, {
    kind: "payment",
    payerUserId: physio._id,
    email: physio.email ?? undefined,
    name,
    relatedType: "physio_pro",
    relatedId: sub._id,
    relationship: "independent",
    description: `Rehabify Individual Pro, ${shortDate(periodStart)} to ${shortDate(periodEnd - 1)}`,
    lines: [{ label: sub.founding && payment.amountKobo === s.foundingPriceKobo ? "Individual Pro (founding price)" : "Individual Pro", amountKobo: input.amountKobo }],
    reference: input.reference,
    dedupeKey: input.reference,
    paidAt: now,
  });
  await ctx.db.patch(payment._id, { status: "paid", paidAt: now, periodStart, periodEnd, receiptId });
  if (firstPaid) {
    await notifyPhysio(ctx, physio._id, "Welcome to Rehabify Pro", `Your Pro runs to ${shortDate(periodEnd - 1)} and renews on ${shortDate(periodEnd)}.`);
  }
  return { ok: true, kind: payment.kind };
}

export const cancelPro = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requirePhysio(ctx);
    const sub = await subscriptionOf(ctx, user._id);
    if (!sub || !["scheduled", "active", "past_due"].includes(sub.status)) throw new ConvexError("You're not on Pro.");
    const now = Date.now();
    if (sub.status === "scheduled") {
      await ctx.db.patch(sub._id, { status: "cancelled", endedAt: now, updatedAt: now });
      return { endsAt: null as number | null };
    }
    if (sub.status === "past_due") {
      // Unpaid: it ends now
      await ctx.db.patch(sub._id, { status: "cancelled", endedAt: now, graceUntil: undefined, updatedAt: now });
      return { endsAt: null };
    }
    await ctx.db.patch(sub._id, { cancelAtPeriodEnd: true, updatedAt: now });
    return { endsAt: sub.currentPeriodEnd ?? null };
  },
});

/** "Not now" (or opened the plan page) on the plans pop-up: it doesn't come back. */
export const dismissAnnouncement = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requirePhysio(ctx);
    const seen = await ctx.db
      .query("featureIntros")
      .withIndex("by_user_and_key", (q) => q.eq("userId", user._id).eq("key", ANNOUNCE_KEY))
      .first();
    if (!seen) await ctx.db.insert("featureIntros", { userId: user._id, key: ANNOUNCE_KEY, seenAt: Date.now() });
    return null;
  },
});

export const keepPro = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requirePhysio(ctx);
    const sub = await subscriptionOf(ctx, user._id);
    if (sub?.status === "active" && sub.cancelAtPeriodEnd) await ctx.db.patch(sub._id, { cancelAtPeriodEnd: false, updatedAt: Date.now() });
    return null;
  },
});

export const removeCard = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requirePhysio(ctx);
    const card = await activeCard(ctx, user._id);
    if (card) await ctx.db.patch(card._id, { status: "removed", removedAt: Date.now() });
    return null;
  },
});

// ─── Card check refunds ──────────────────────────────────────────────────────

export const refundInfo = internalQuery({
  args: { cardId: v.id("physioPlanCards") },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card?.checkAmountKobo) return null;
    return { reference: card.reference, refunded: card.checkRefundedAt !== undefined };
  },
});

export const recordRefund = internalMutation({
  args: { cardId: v.id("physioPlanCards"), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) return null;
    if (args.error) await ctx.db.patch(card._id, { checkRefundError: args.error.slice(0, 300) });
    else await ctx.db.patch(card._id, { checkRefundedAt: Date.now(), checkRefundError: undefined });
    return null;
  },
});

export const refundCardCheck = internalAction({
  args: { cardId: v.id("physioPlanCards") },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(refundInfoRef, args);
    if (!info || info.refunded) return null;
    try {
      await paystackRequest("/refund", { method: "POST", body: JSON.stringify({ transaction: info.reference }) });
      await ctx.runMutation(refundDoneRef, { cardId: args.cardId });
    } catch (err) {
      await ctx.runMutation(refundDoneRef, { cardId: args.cardId, error: err instanceof Error ? err.message : String(err) });
    }
    return null;
  },
});

// ─── Renewals (daily) ────────────────────────────────────────────────────────

/** The saved-card charge for a subscription's next month (first month on launch day, or a renewal). */
export const chargeInfo = internalQuery({
  args: { subscriptionId: v.id("physioSubscriptions") },
  handler: async (ctx, args): Promise<ChargeInfo | null> => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) return null;
    const card = await activeCard(ctx, sub.physioId);
    if (!card) return null;
    const s = await loadPlanSettings(ctx);
    const periodStart = sub.status === "scheduled" ? (sub.currentPeriodStart ?? Date.now()) : (sub.currentPeriodEnd ?? Date.now());
    return {
      authorizationCode: card.authorizationCode,
      email: card.email,
      amountKobo: priceFor(sub, s, periodStart),
      reference: sub.status === "scheduled" ? `${PREFIX}${sub._id}_${Date.now()}` : `${PREFIX}RENEW_${sub._id}_${Date.now()}`,
      label: sub.founding ? "Individual Pro (founding price)" : "Individual Pro",
    };
  },
});

export const recordChargeStart = internalMutation({
  args: { subscriptionId: v.id("physioSubscriptions"), reference: v.string(), amountKobo: v.number() },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) return null;
    await ctx.db.insert("physioPlanPayments", {
      physioId: sub.physioId,
      subscriptionId: sub._id,
      reference: args.reference,
      kind: sub.status === "scheduled" ? "first" : "renewal",
      method: "saved_card",
      amountKobo: args.amountKobo,
      status: "pending",
      createdAt: Date.now(),
    });
    return null;
  },
});
const chargeStartRef = makeFunctionReference<"mutation", { subscriptionId: Id<"physioSubscriptions">; reference: string; amountKobo: number }, null>(
  "physioPlans:recordChargeStart"
);

export const chargeSavedCard = internalAction({
  args: { subscriptionId: v.id("physioSubscriptions") },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(chargeInfoRef, args);
    if (!info) return null;
    await ctx.runMutation(chargeStartRef, { subscriptionId: args.subscriptionId, reference: info.reference, amountKobo: info.amountKobo });
    try {
      const data: any = await paystackRequest("/transaction/charge_authorization", {
        method: "POST",
        body: JSON.stringify({
          authorization_code: info.authorizationCode,
          email: info.email,
          amount: info.amountKobo,
          currency: "NGN",
          reference: info.reference,
          metadata: { source: "physio_pro", subscriptionId: args.subscriptionId, renewal: true },
        }),
      });
      if (data?.status === "success") {
        await ctx.runMutation(completeRef, {
          reference: info.reference,
          amountKobo: Number(data.amount) || info.amountKobo,
          currency: String(data.currency ?? "NGN"),
          channel: "card",
        });
      } else {
        await ctx.runMutation(chargeFailedRef, { subscriptionId: args.subscriptionId, reference: info.reference, error: String(data?.gateway_response ?? data?.status ?? "declined") });
      }
    } catch (err) {
      await ctx.runMutation(chargeFailedRef, { subscriptionId: args.subscriptionId, reference: info.reference, error: err instanceof Error ? err.message : String(err) });
    }
    return null;
  },
});

/** Uses one top-up session for a Scribe session started beyond the plan's sessions (scribe.ts). */
export async function useScribeCredit(ctx: MutationCtx, physioId: Id<"users">, scribeSessionId: Id<"scribeSessions">) {
  await ctx.db.insert("physioScribeCredits", { physioId, delta: -1, reason: "used", scribeSessionId, createdAt: Date.now() });
}

export const recordChargeFailure = internalMutation({
  args: { subscriptionId: v.id("physioSubscriptions"), reference: v.string(), error: v.string() },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) return null;
    const now = Date.now();
    const s = await loadPlanSettings(ctx);
    const payment = await ctx.db
      .query("physioPlanPayments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();
    if (payment && payment.status === "pending") await ctx.db.patch(payment._id, { status: "failed", error: args.error.slice(0, 300) });
    const attempts = (sub.renewalAttempts ?? 0) + 1;
    const end = sub.currentPeriodEnd ?? now;
    await ctx.db.patch(sub._id, {
      status: sub.status === "scheduled" ? "scheduled" : "past_due",
      renewalAttempts: attempts,
      lastAttemptAt: now,
      lastAttemptError: args.error.slice(0, 200),
      graceUntil: sub.status === "scheduled" ? undefined : (sub.graceUntil ?? end + (s.retryDays + s.graceDays) * DAY_MS),
      updatedAt: now,
    });
    if (attempts === 1) {
      const physio = await ctx.db.get(sub.physioId);
      await notifyPhysio(ctx, sub.physioId, "Your Pro payment didn't go through", "We'll try your card again. You can pay or change your card on your plan page.");
      await emailPhysio(ctx, physio, {
        subject: "Your Rehabify Pro payment didn't go through",
        heading: "We couldn't charge your card",
        paragraphs: [
          `Your bank said: ${args.error.slice(0, 120)}.`,
          `We'll try again over the next ${s.retryDays} days, and you keep Pro meanwhile. To sort it now, pay or change your card on your plan page.`,
        ],
        buttonLabel: "Pay or change card",
      });
    }
    return null;
  },
});

/**
 * Daily: launch-day first charges, "renews soon" reminders, renewals, retries, grace and the move
 * back to Free, pausing Pro for physios who joined a clinic. One small step per subscription.
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const s = await loadPlanSettings(ctx);
    const launchAt = dayStart(s.launchDate);
    let charged = 0;
    for (const status of ["scheduled", "active", "past_due"] as const) {
      const subs = await ctx.db
        .query("physioSubscriptions")
        .withIndex("by_status_end", (q) => q.eq("status", status))
        .take(500);
      for (const sub of subs) {
        const physio = await ctx.db.get(sub.physioId);
        const profile = physio
          ? await ctx.db
              .query("physiotherapistProfiles")
              .withIndex("by_user_id", (q) => q.eq("userId", physio._id))
              .first()
          : null;
        const card = await activeCard(ctx, sub.physioId);
        // Joined a clinic: the clinic's plan covers them, so Pro pauses
        if (profile?.clinicId && status !== "scheduled") {
          await ctx.db.patch(sub._id, { status: "paused", pausedAt: now, updatedAt: now });
          continue;
        }
        if (status === "scheduled") {
          const startAt = sub.currentPeriodStart ?? launchAt;
          if (now < startAt) continue;
          if (card && (sub.renewalAttempts ?? 0) < s.retryDays && (!sub.lastAttemptAt || now - sub.lastAttemptAt > 20 * 60 * 60 * 1000)) {
            await ctx.db.patch(sub._id, { lastAttemptAt: now, updatedAt: now });
            await ctx.scheduler.runAfter(charged++ * 2000, chargeRef, { subscriptionId: sub._id });
          } else if (!card && sub.reminderSentFor !== startAt) {
            await ctx.db.patch(sub._id, { reminderSentFor: startAt, updatedAt: now });
            await emailPhysio(ctx, physio, {
              subject: "Rehabify Pro is open",
              heading: "Start your Pro",
              paragraphs: [`Individual Pro is open. Pay ${naira(priceFor(sub, s, now))} for your first month from your plan page to start.`],
              buttonLabel: "Start Pro",
            });
          }
          continue;
        }
        const end = sub.currentPeriodEnd ?? now;
        if (status === "active") {
          // A few days before: say when and how much (or that it ends, if cancelled)
          if (end - s.reminderDays * DAY_MS <= now && now < end && sub.reminderSentFor !== end) {
            await ctx.db.patch(sub._id, { reminderSentFor: end, updatedAt: now });
            const price = priceFor(sub, s, end);
            await emailPhysio(
              ctx,
              physio,
              sub.cancelAtPeriodEnd
                ? { subject: "Your Rehabify Pro ends soon", heading: "Your Pro ends soon", paragraphs: [`Your Pro ends on ${shortDate(end)} and you'll move to Free. Changed your mind? Keep Pro from your plan page.`], buttonLabel: "Keep Pro" }
                : card
                  ? { subject: "Your Rehabify Pro renews soon", heading: "Your Pro renews soon", paragraphs: [`We'll charge ${naira(price)} to your ${card.brand}${card.last4 ? ` ending ${card.last4}` : ""} on ${shortDate(end)}.`] }
                  : { subject: "Renew your Rehabify Pro", heading: "Your Pro is due for renewal", paragraphs: [`Your Pro runs to ${shortDate(end - 1)}. Renew for ${naira(price)} from your plan page by card or bank transfer.`], buttonLabel: "Renew Pro" }
            );
          }
          if (now < end) continue;
          if (sub.cancelAtPeriodEnd) {
            await ctx.db.patch(sub._id, { status: "cancelled", endedAt: now, updatedAt: now });
            await notifyPhysio(ctx, sub.physioId, "You're on Free now", "Your Pro ended. You can come back to Pro any time.");
            continue;
          }
          if (card) {
            await ctx.db.patch(sub._id, { lastAttemptAt: now, updatedAt: now });
            await ctx.scheduler.runAfter(charged++ * 2000, chargeRef, { subscriptionId: sub._id });
          } else {
            await ctx.db.patch(sub._id, { status: "past_due", graceUntil: end + (s.retryDays + s.graceDays) * DAY_MS, updatedAt: now });
            await notifyPhysio(ctx, sub.physioId, "Renew your Pro", "Your Pro month has ended. Renew from your plan page to keep it.");
          }
          continue;
        }
        // past_due: retry the card (once a day) while retries last; Free once grace runs out
        if ((sub.graceUntil ?? end) <= now) {
          await ctx.db.patch(sub._id, { status: "expired", endedAt: now, updatedAt: now });
          await notifyPhysio(ctx, sub.physioId, "You're on Free now", "We couldn't renew your Pro. Everything you had stays; come back to Pro any time.");
          await emailPhysio(ctx, physio, {
            subject: "Your Rehabify Pro has ended",
            heading: "You're on Free now",
            paragraphs: ["We couldn't take your Pro payment, so your account is on Free. Nothing you made is lost. You can come back to Pro from your plan page any time."],
            buttonLabel: "Back to Pro",
          });
          continue;
        }
        if (card && (sub.renewalAttempts ?? 0) < s.retryDays && (!sub.lastAttemptAt || now - sub.lastAttemptAt > 20 * 60 * 60 * 1000)) {
          await ctx.db.patch(sub._id, { lastAttemptAt: now, updatedAt: now });
          await ctx.scheduler.runAfter(charged++ * 2000, chargeRef, { subscriptionId: sub._id });
        }
      }
    }
    return { charged };
  },
});

/** The public physiotherapist page: prices and limits as admins set them (no sign-in needed). */
export const publicPlans = query({
  args: {},
  handler: async (ctx) => {
    const s = await loadPlanSettings(ctx);
    const now = Date.now();
    return {
      settings: s,
      launched: now >= dayStart(s.launchDate),
      foundingOpen: now < dayStart(s.foundingCutoff) + DAY_MS,
    };
  },
});

// ─── Admin ───────────────────────────────────────────────────────────────────

const numKeys = [
  "proPriceKobo",
  "foundingPriceKobo",
  "foundingMonths",
  "freePatientsPerMonth",
  "freeScribeSessions",
  "proScribeSessions",
  "scribeTopUpKobo",
  "scribeTopUpSessions",
  "joyPerPatientKobo",
  "proJoyPatients",
  "reminderDays",
  "retryDays",
  "graceDays",
] as const;

/** Admin › Physio plans: settings, the Plans report and grants. */
export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const s = await loadPlanSettings(ctx);
    const subs = await ctx.db.query("physioSubscriptions").order("desc").take(2000);
    const counts: Record<string, number> = {};
    let monthlyKobo = 0;
    const rows = [];
    for (const sub of subs) {
      counts[sub.status] = (counts[sub.status] ?? 0) + 1;
      if (sub.status === "active" && !sub.cancelAtPeriodEnd) monthlyKobo += priceFor(sub, s, sub.currentPeriodEnd ?? now);
      if (rows.length < 200 && sub.status !== "expired") {
        const u = await ctx.db.get(sub.physioId);
        rows.push({
          id: sub._id,
          name: [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "Physio",
          email: u?.email ?? null,
          status: sub.status,
          founding: sub.founding,
          periodEnd: sub.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
          priceKobo: priceFor(sub, s, sub.currentPeriodEnd ?? now),
          lastError: sub.lastAttemptError ?? null,
        });
      }
    }
    const grants = [];
    for (const g of (await ctx.db.query("physioPlanGrants").order("desc").take(100)).filter((g) => !g.revokedAt && g.until > now)) {
      const u = await ctx.db.get(g.physioId);
      grants.push({ id: g._id, name: [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "Physio", email: u?.email ?? null, until: g.until, reason: g.reason });
    }
    const paid = (await ctx.db.query("physioPlanPayments").order("desc").take(500)).filter((p) => p.status === "paid" && p.kind !== "card_check");
    return { settings: s, counts, monthlyKobo, subscriptions: rows, grants, paidThisMonthKobo: paid.filter((p) => (p.paidAt ?? 0) >= monthStart(now)).reduce((a, p) => a + p.amountKobo, 0) };
  },
});

export const adminSaveSettings = mutation({
  args: {
    proPriceKobo: v.optional(v.number()),
    foundingPriceKobo: v.optional(v.number()),
    foundingCutoff: v.optional(v.string()),
    foundingMonths: v.optional(v.number()),
    freePatientsPerMonth: v.optional(v.number()),
    freeScribeSessions: v.optional(v.number()),
    proScribeSessions: v.optional(v.number()),
    scribeTopUpKobo: v.optional(v.number()),
    scribeTopUpSessions: v.optional(v.number()),
    joyPerPatientKobo: v.optional(v.number()),
    proJoyPatients: v.optional(v.number()),
    launchDate: v.optional(v.string()),
    limitsDate: v.optional(v.string()),
    abroadFreePro: v.optional(v.boolean()),
    reminderDays: v.optional(v.number()),
    retryDays: v.optional(v.number()),
    graceDays: v.optional(v.number()),
    announceOn: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);
    const patch: Record<string, unknown> = { updatedBy: user._id, updatedAt: Date.now() };
    for (const key of numKeys) {
      const n = args[key];
      if (n === undefined) continue;
      if (!Number.isFinite(n) || n < 0) throw new ConvexError("Numbers can't be negative.");
      patch[key] = Math.round(n);
    }
    for (const key of ["foundingCutoff", "launchDate", "limitsDate"] as const) {
      const d = args[key];
      if (d === undefined) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ConvexError("Dates look like 2026-12-01.");
      patch[key] = d;
    }
    if (args.abroadFreePro !== undefined) patch.abroadFreePro = args.abroadFreePro;
    if (args.announceOn !== undefined) patch.announceOn = args.announceOn;
    const row = await ctx.db.query("physioPlanSettings").first();
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert("physioPlanSettings", patch as { updatedAt: number });
    return null;
  },
});

export const adminGrant = mutation({
  args: { email: v.string(), days: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx);
    const email = args.email.trim().toLowerCase();
    const physio = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!physio || physio.role !== "physiotherapist") throw new ConvexError("No physiotherapist has that email.");
    const days = Math.round(args.days);
    if (days < 1 || days > 730) throw new ConvexError("Give free Pro for 1 to 730 days.");
    const reason = args.reason.trim().slice(0, 200);
    if (reason.length < 3) throw new ConvexError("Say why, so the team knows later.");
    const now = Date.now();
    await ctx.db.insert("physioPlanGrants", { physioId: physio._id, until: now + days * DAY_MS, reason, grantedBy: admin._id, createdAt: now });
    await notifyPhysio(ctx, physio._id, "You've been given Rehabify Pro", `Free until ${shortDate(now + days * DAY_MS)}.`);
    return null;
  },
});

export const adminRevokeGrant = mutation({
  args: { grantId: v.id("physioPlanGrants") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.grantId, { revokedAt: Date.now() });
    return null;
  },
});
