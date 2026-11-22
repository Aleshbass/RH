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
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { paystackChargeVerdict } from "./helpers/paystackVerdict";
import { isOutsideRehabifyCare } from "../lib/practiceCountries";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer, requireAdmin } from "./helpers/partnerAccess";
import { paystackRequest } from "./clinicBilling";
import { chargeWithRouting, initializeWithRouting, rehabifyOnlySplit } from "./helpers/paystackRouting";
import { verifyPaystackSignature } from "./helpers/paystackSignature";
import { issueReceipt } from "./helpers/receipts";
import { addMonthsLagos } from "./helpers/clinicSubscriptions";
import { zonedDateKey, zonedDateTimeToUtc } from "./helpers/lagosTime";
import { appLink, publicAppUrl } from "./helpers/appUrl";
import { insertNotification } from "./helpers/pushNotify";
import { currentEntitlement, isIndependentPair } from "./helpers/patientPlans";
import { DEFAULT_PHYSIO_PLAN_SETTINGS, PRO_CARD_CHECK_KOBO, dayLabel, isOutsideNigeria, naira, type PhysioPlanSettings } from "../lib/physioPlans";

type Ctx = QueryCtx | MutationCtx;
type Sub = Doc<"physioSubscriptions">;

const DAY_MS = 24 * 60 * 60 * 1000;
/** The plans pop-up, once per physio (featureIntros) */
const ANNOUNCE_KEY = "plans:announce-2026-11";
/** The 18 Dec notice, once per physio */
const NOTICE_KEY = "plans:notice-2027-limits";
const NOTICE_BATCH = 60;
const noticeRef = makeFunctionReference<"mutation", { after?: string }, null>("physioPlans:sendLimitsNotice");
export const PLAN_PAGE = "/dashboard/physiotherapist/settings/plan";
const PREFIX = "PHYSIOPRO_";
const REFERENCE = /^PHYSIOPRO_(CARD_|RENEW_|TOPUP_|JOY_)?([a-z0-9]+)_\d+$/;
const FOOTNOTE = "You're receiving this because you use Rehabify as a physiotherapist. Questions about your plan? Write to hello@myrehabifyhealth.com.";

const sendEmailRef = makeFunctionReference<
  "action",
  { to: string; subject: string; greetingName?: string; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string; footnote?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");
const prepareRef = makeFunctionReference<"mutation", { purpose: Purpose; patientId?: Id<"users"> }, Prepared>("physioPlans:prepareCheckout");
const completeRef = makeFunctionReference<"mutation", Settle, SettleResult>("physioPlans:settlePayment");
const chargeInfoRef = makeFunctionReference<"query", { subscriptionId: Id<"physioSubscriptions"> }, ChargePlan | null>("physioPlans:chargeInfo");
const chargeFailedRef = makeFunctionReference<"mutation", { subscriptionId: Id<"physioSubscriptions">; reference: string; error: string }, null>(
  "physioPlans:recordChargeFailure"
);
const chargeRef = makeFunctionReference<"action", { subscriptionId: Id<"physioSubscriptions"> }, null>("physioPlans:chargeSavedCard");
const verifyChargeRef = makeFunctionReference<"action", { subscriptionId: Id<"physioSubscriptions">; reference: string; tries: number }, null>(
  "physioPlans:verifySavedCardCharge"
);
const chargeUnknownRef = makeFunctionReference<"mutation", { reference: string; error: string }, null>("physioPlans:recordChargeUnknown");
const refundCheckRef = makeFunctionReference<"action", { paymentId: Id<"physioPlanPayments"> }, null>("physioPlans:refundUnusableCardCheck");
const refundCheckInfoRef = makeFunctionReference<"query", { paymentId: Id<"physioPlanPayments"> }, { reference: string } | null>(
  "physioPlans:unusableCheckInfo"
);
const refundCheckDoneRef = makeFunctionReference<"mutation", { paymentId: Id<"physioPlanPayments">; error?: string }, null>(
  "physioPlans:recordUnusableCheckRefund"
);
const refundRef = makeFunctionReference<"action", { cardId: Id<"physioPlanCards"> }, null>("physioPlans:refundCardCheck");
const refundInfoRef = makeFunctionReference<"query", { cardId: Id<"physioPlanCards"> }, { reference: string; refunded: boolean } | null>("physioPlans:refundInfo");
const refundDoneRef = makeFunctionReference<"mutation", { cardId: Id<"physioPlanCards">; error?: string }, null>("physioPlans:recordRefund");

type Purpose = "upgrade" | "card" | "renew" | "topup" | "joy";
type Prepared = { reference: string; amountKobo: number; email: string; name: string; channels: string[]; label: string; subscriptionId: Id<"physioSubscriptions"> | null };
type Settle = { reference: string; amountKobo: number; currency: string; channel?: string; authorization?: unknown; email?: string };
type SettleResult = { ok: boolean; already?: boolean; reason?: string; kind?: string };
type ChargeInfo = { authorizationCode: string; email: string; amountKobo: number; reference: string; label: string };
/** Charge the card, or first find out what happened to the last charge (never charge twice). */
type ChargePlan = { charge: ChargeInfo } | { verify: string };

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

/** Locked in: a card check made for this Pro went through and saved a card (not just any older card). */
async function lockedIn(ctx: Ctx, sub: Sub) {
  const rows = await ctx.db
    .query("physioPlanPayments")
    .withIndex("by_physio", (q) => q.eq("physioId", sub.physioId))
    .order("desc")
    .take(200);
  for (const p of rows) {
    if (p.subscriptionId !== sub._id || p.kind !== "card_check" || (p.status !== "paid" && p.status !== "refunded")) continue;
    const card = await ctx.db
      .query("physioPlanCards")
      .withIndex("by_reference", (q) => q.eq("reference", p.reference))
      .first();
    if (card) return true;
  }
  return false;
}

/** A saved-card charge for this Pro that Paystack hasn't confirmed or declined yet (last 2 days). */
async function unresolvedCharge(ctx: Ctx, sub: Sub, now: number) {
  const rows = await ctx.db
    .query("physioPlanPayments")
    .withIndex("by_physio", (q) => q.eq("physioId", sub.physioId))
    .order("desc")
    .take(50);
  return rows.find((p) => p.subscriptionId === sub._id && p.method === "saved_card" && p.status === "pending" && now - p.createdAt < 2 * DAY_MS) ?? null;
}

/** The end of the month that starts at `periodStart`, on the anchor's day (31 Jan → 28 Feb → 31 Mar). */
export function periodEndFrom(anchor: number, periodStart: number) {
  for (let k = 1; k <= 600; k++) {
    const end = addMonthsLagos(anchor, k);
    if (end > periodStart + DAY_MS) return end;
  }
  return addMonthsLagos(periodStart, 1);
}

const nextMonthKey = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const monthLabel = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Africa/Lagos" });

/** Tells every admin (bell + push) about a Pro payment that needs a person. */
async function alertAdmins(ctx: MutationCtx, title: string, body: string) {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .take(25);
  const now = Date.now();
  for (const admin of admins) {
    await insertNotification(ctx, {
      userId: admin._id,
      type: "system_alert",
      priority: "medium",
      status: "pending",
      payload: { title, body, data: { actionUrl: "/dashboard/admin/physio-plans" } },
      createdAt: now,
    });
  }
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

const monthKey = (now: number) => zonedDateKey(now).slice(0, 7);

/** The independent physio looking after this patient (not a clinic, not Rehabify Care), if any. */
async function independentPhysioOf(ctx: Ctx, patientId: Id<"users">) {
  const relationships = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .take(20);
  for (const r of relationships) {
    if (r.status !== "active" || r.clinicId) continue;
    if (await isIndependentPair(ctx, patientId, r.physiotherapistId)) return await ctx.db.get(r.physiotherapistId);
  }
  return null;
}

/** A month of Joy the physio paid for, for this patient. */
async function joyMonthPaid(ctx: Ctx, physioId: Id<"users">, patientId: Id<"users">, month: string) {
  const rows = await ctx.db
    .query("physioPlanPayments")
    .withIndex("by_physio", (q) => q.eq("physioId", physioId))
    .order("desc")
    .take(300);
  return rows.some((p) => p.kind === "joy" && p.status === "paid" && p.joyPatientId === patientId && p.joyMonth === month);
}

export type JoyAllowance = {
  allowed: boolean;
  physioId: Id<"users"> | null;
  via?: Doc<"physioJoyPatients">["via"] | "counted" | "not_independent";
  reason?: "free" | "pro_full";
};

/**
 * May Joy send this patient care messages (reminders, daily rhythm) this month? Patients of
 * clinics and Rehabify Care aren't part of this. For an independent physio: before the limits,
 * yes; a patient already counted this month, yes; Flex Max (the patient pays), yes; a month the
 * physio paid for, yes; on Pro, the first proJoyPatients patients; otherwise not until someone pays.
 */
export async function joyAllowance(ctx: Ctx, patientId: Id<"users">, now: number): Promise<JoyAllowance> {
  const physio = await independentPhysioOf(ctx, patientId);
  if (!physio) return { allowed: true, physioId: null, via: "not_independent" };
  const profile = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", physio._id))
    .first();
  const s = await loadPlanSettings(ctx);
  const plan = await physioPlanFor(ctx, physio, profile, s, now);
  const month = monthKey(now);
  const counted = await ctx.db
    .query("physioJoyPatients")
    .withIndex("by_physio_month", (q) => q.eq("physioId", physio._id).eq("month", month))
    .take(2000);
  if (counted.some((c) => c.patientId === patientId)) return { allowed: true, physioId: physio._id, via: "counted" };
  if (plan.kind === "clinic" || now < limitsFromFor(physio, profile, s)) return { allowed: true, physioId: physio._id, via: "before_limits" };
  if ((await currentEntitlement(ctx, patientId, now))?.plan === "flex_max") return { allowed: true, physioId: physio._id, via: "flex_max" };
  if (await joyMonthPaid(ctx, physio._id, patientId, month)) return { allowed: true, physioId: physio._id, via: "physio_paid" };
  if (plan.kind !== "free" && counted.filter((c) => c.via === "plan").length < s.proJoyPatients) return { allowed: true, physioId: physio._id, via: "plan" };
  return { allowed: false, physioId: physio._id, reason: plan.kind === "free" ? "free" : "pro_full" };
}

/** Joy sent this patient a care message: counts them for their physio this month (once). */
export async function recordJoyCareMessage(ctx: MutationCtx, patientId: Id<"users">, now: number) {
  const a = await joyAllowance(ctx, patientId, now);
  if (!a.physioId || !a.allowed || a.via === "counted" || a.via === "not_independent" || !a.via) return { counted: false };
  await ctx.db.insert("physioJoyPatients", { physioId: a.physioId, patientId, month: monthKey(now), via: a.via, firstMessageAt: now });
  return { counted: true };
}

/** This physio's Joy this month: patients counted, the plan's included number, who is waiting. */
async function joyThisMonth(ctx: Ctx, physioId: Id<"users">, now: number) {
  const counted = await ctx.db
    .query("physioJoyPatients")
    .withIndex("by_physio_month", (q) => q.eq("physioId", physioId).eq("month", monthKey(now)))
    .take(2000);
  // Patients with a programme from this physio whose Joy is waiting for someone to pay
  const programmes = await ctx.db
    .query("exercisePrograms")
    .withIndex("by_creator", (q) => q.eq("createdBy", physioId))
    .order("desc")
    .take(300);
  const waiting: { patientId: Id<"users">; name: string }[] = [];
  const seen = new Set<string>(counted.map((c) => c.patientId as string));
  for (const p of programmes) {
    if (p.status !== "active" || p.clinicId || seen.has(p.patientId) || waiting.length >= 30) continue;
    seen.add(p.patientId);
    const a = await joyAllowance(ctx, p.patientId, now);
    if (a.allowed || a.physioId !== physioId) continue;
    const patient = await ctx.db.get(p.patientId);
    if (!patient?.phoneNumber) continue; // Joy can't reach them anyway
    waiting.push({ patientId: p.patientId, name: [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Patient" });
  }
  return { counted: counted.length, included: counted.filter((c) => c.via === "plan").length, waiting };
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
    const joy = await joyThisMonth(ctx, user._id, now);
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
        joy: {
          patients: joy.counted,
          included: plan.kind === "free" ? 0 : plan.kind === "clinic" ? null : s.proJoyPatients,
          usedIncluded: joy.included,
          waiting: now >= limitsFrom && plan.kind !== "clinic" ? joy.waiting : [],
        },
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
  args: {
    purpose: v.union(v.literal("upgrade"), v.literal("card"), v.literal("renew"), v.literal("topup"), v.literal("joy")),
    patientId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<Prepared> => {
    const { user, profile } = await requirePhysio(ctx);
    if (profile?.clinicId) throw new ConvexError("You're covered by your clinic's plan, so there's nothing to pay.");
    const email = user.email?.trim().toLowerCase();
    if (!email || email.endsWith("@joy.rehabify")) throw new ConvexError("Add your email address in Settings › Profile first, so we can send your receipts.");
    const s = await loadPlanSettings(ctx);
    const now = Date.now();
    if (args.purpose === "joy") {
      // A month of Joy for one patient, paid by the physio
      if (!args.patientId) throw new ConvexError("Choose the patient.");
      const patient = await ctx.db.get(args.patientId);
      if (!patient || !(await isIndependentPair(ctx, args.patientId, user._id))) throw new ConvexError("That patient isn't one of yours.");
      const month = monthKey(now);
      if (await joyMonthPaid(ctx, user._id, args.patientId, month)) throw new ConvexError("Joy is already paid for this patient this month.");
      const reference = `${PREFIX}JOY_${user._id}_${now}`;
      await ctx.db.insert("physioPlanPayments", {
        physioId: user._id,
        reference,
        kind: "joy",
        method: "checkout",
        amountKobo: s.joyPerPatientKobo,
        status: "pending",
        joyPatientId: args.patientId,
        joyMonth: month,
        createdAt: now,
      });
      return {
        reference,
        amountKobo: s.joyPerPatientKobo,
        email,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Physiotherapist",
        channels: ["card", "bank_transfer"],
        label: `Joy for ${patient.firstName ?? "your patient"} this month`,
        subscriptionId: null,
      };
    }
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
  args: {
    purpose: v.union(v.literal("upgrade"), v.literal("card"), v.literal("renew"), v.literal("topup"), v.literal("joy")),
    patientId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<{ authorizationUrl: string }> => {
    const p = await ctx.runMutation(prepareRef, { purpose: args.purpose, ...(args.patientId ? { patientId: args.patientId } : {}) });
    // Pro, Scribe top-ups and Joy months are Rehabify's revenue: with money routing on they go to
    // Rehabify's sub-account. The card check (PHYSIOPRO_CARD_) is refunded at once, and Paystack
    // takes refunds from the main balance, so it is never routed.
    const isCardCheck = p.reference.startsWith(`${PREFIX}CARD_`);
    const split = isCardCheck ? {} : await rehabifyOnlySplit(ctx);
    const data = await initializeWithRouting(ctx, "physio_pro", split, { reference: p.reference, amountKobo: p.amountKobo }, (routed) => paystackRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        reference: p.reference,
        amount: p.amountKobo,
        email: p.email,
        currency: "NGN",
        callback_url: `${publicAppUrl()}${PLAN_PAGE}?pro=return`,
        channels: p.channels,
        ...routed,
        metadata: {
          source: "physio_pro",
          ...(p.subscriptionId ? { subscriptionId: p.subscriptionId } : {}),
          custom_fields: [
            { display_name: "Physiotherapist", variable_name: "physio", value: p.name },
            { display_name: "For", variable_name: "purpose", value: p.label },
          ],
        },
      }),
    }));
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
  const physio = await ctx.db.get(payment.physioId);
  if (input.amountKobo < payment.amountKobo) {
    await ctx.db.patch(payment._id, { status: "failed", error: `Paid ${input.amountKobo}, expected ${payment.amountKobo}` });
    // Money arrived but less than the price: nothing is given, so a person sorts it out
    if (input.amountKobo > 0) {
      const who = [physio?.firstName, physio?.lastName].filter(Boolean).join(" ") || physio?.email || "A physio";
      await alertAdmins(ctx, "Pro payment was short", `${who} paid ${naira(input.amountKobo)} for ${naira(payment.amountKobo)} (${input.reference}). Refund it or add the rest by hand.`);
    }
    return { ok: false, reason: "short_payment" };
  }
  if (!physio) return { ok: false, reason: "missing" };
  const now = Date.now();
  const s = await loadPlanSettings(ctx);
  if (payment.kind === "joy") {
    const patient = payment.joyPatientId ? await ctx.db.get(payment.joyPatientId) : null;
    // A transfer started on 31 Dec and settled on 1 Jan pays for January; a second payment for a
    // month already paid moves on to the next month instead of being wasted
    let month = payment.joyMonth && payment.joyMonth >= monthKey(now) ? payment.joyMonth : monthKey(now);
    for (let i = 0; i < 24 && payment.joyPatientId && (await joyMonthPaid(ctx, physio._id, payment.joyPatientId, month)); i++) month = nextMonthKey(month);
    const receiptId = await issueReceipt(ctx, {
      kind: "payment",
      payerUserId: physio._id,
      email: physio.email ?? undefined,
      name: [physio.firstName, physio.lastName].filter(Boolean).join(" ") || undefined,
      relatedType: "physio_joy_month",
      relatedId: String(payment.joyPatientId ?? physio._id),
      relationship: "independent",
      description: `Joy on WhatsApp for ${patient?.firstName ?? "a patient"}, ${monthLabel(month)}`,
      lines: [{ label: "Joy for one patient, one month", amountKobo: input.amountKobo }],
      reference: input.reference,
      dedupeKey: input.reference,
      paidAt: now,
    });
    await ctx.db.patch(payment._id, { status: "paid", paidAt: now, receiptId, joyMonth: month });
    await notifyPhysio(
      ctx,
      physio._id,
      "Joy is back on",
      month === monthKey(now)
        ? `Joy will message ${patient?.firstName ?? "your patient"} again this month.`
        : `Joy is paid for ${patient?.firstName ?? "your patient"} for ${monthLabel(month)}.`
    );
    return { ok: true, kind: "joy" };
  }
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
    if (!cardId) {
      // The check was taken but the card can't be charged again: give the check back anyway
      await ctx.scheduler.runAfter(0, refundCheckRef, { paymentId: payment._id });
      return { ok: false, reason: "card_unusable", kind: "card_check" };
    }
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
  // A second payment while Pro is running (a late transfer, or "Pay and start" racing the launch-day
  // card charge) adds a month after the paid one instead of cutting it short
  const extending = sub.status === "active" && (sub.currentPeriodEnd ?? 0) > now;
  const periodStart =
    payment.kind === "renewal" || extending
      ? (sub.currentPeriodEnd ?? now)
      : sub.status === "scheduled" && sub.currentPeriodStart && Math.abs(now - sub.currentPeriodStart) < DAY_MS
        ? sub.currentPeriodStart
        : now;
  // Months end on the day Pro started (31 Jan → 28 Feb → 31 Mar), not on a drifting date
  const continuing = sub.status === "active" || sub.status === "past_due";
  const anchor = continuing ? (sub.periodAnchor ?? sub.currentPeriodStart ?? periodStart) : periodStart;
  const periodEnd = periodEndFrom(anchor, periodStart);
  const firstPaid = payment.kind === "first";
  await ctx.db.patch(sub._id, {
    status: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    periodAnchor: anchor,
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
  if (extending) {
    await notifyPhysio(ctx, physio._id, "We added a month of Pro", `You paid again while Pro was running, so it now runs to ${shortDate(periodEnd - 1)}.`);
  } else if (firstPaid) {
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
    if (args.error) {
      await ctx.db.patch(card._id, { checkRefundError: args.error.slice(0, 300) });
      const physio = await ctx.db.get(card.physioId);
      const who = [physio?.firstName, physio?.lastName].filter(Boolean).join(" ") || physio?.email || "A physio";
      await alertAdmins(ctx, "Card check refund failed", `${who}'s card check (${card.reference}) wasn't refunded: ${args.error.slice(0, 120)}. Refund it on Paystack.`);
    } else await ctx.db.patch(card._id, { checkRefundedAt: Date.now(), checkRefundError: undefined });
    return null;
  },
});

/** A card check that went through but left no reusable card: it's refunded all the same. */
export const unusableCheckInfo = internalQuery({
  args: { paymentId: v.id("physioPlanPayments") },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.kind !== "card_check" || payment.status !== "paid" || payment.refundedAt !== undefined) return null;
    return { reference: payment.reference };
  },
});

export const recordUnusableCheckRefund = internalMutation({
  args: { paymentId: v.id("physioPlanPayments"), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return null;
    if (!args.error) {
      await ctx.db.patch(payment._id, { status: "refunded", refundedAt: Date.now(), refundError: undefined });
      return null;
    }
    await ctx.db.patch(payment._id, { refundError: args.error.slice(0, 300) });
    const physio = await ctx.db.get(payment.physioId);
    const who = [physio?.firstName, physio?.lastName].filter(Boolean).join(" ") || physio?.email || "A physio";
    await alertAdmins(ctx, "Card check refund failed", `${who}'s card check (${payment.reference}) wasn't refunded: ${args.error.slice(0, 120)}. Refund it on Paystack.`);
    return null;
  },
});

export const refundUnusableCardCheck = internalAction({
  args: { paymentId: v.id("physioPlanPayments") },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(refundCheckInfoRef, args);
    if (!info) return null;
    try {
      await paystackRequest("/refund", { method: "POST", body: JSON.stringify({ transaction: info.reference }) });
      await ctx.runMutation(refundCheckDoneRef, { paymentId: args.paymentId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Already refunded is the outcome we wanted
      await ctx.runMutation(refundCheckDoneRef, /already.*refund|fully refunded/i.test(message) ? { paymentId: args.paymentId } : { paymentId: args.paymentId, error: message });
    }
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
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(refundDoneRef, /already.*refund|fully refunded/i.test(message) ? { cardId: args.cardId } : { cardId: args.cardId, error: message });
    }
    return null;
  },
});

// ─── Renewals (daily) ────────────────────────────────────────────────────────

/** The saved-card charge for a subscription's next month (first month on launch day, or a renewal). */
export const chargeInfo = internalQuery({
  args: { subscriptionId: v.id("physioSubscriptions") },
  handler: async (ctx, args): Promise<ChargePlan | null> => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub || !["scheduled", "active", "past_due"].includes(sub.status)) return null;
    const now = Date.now();
    // In a clinic now: the clinic's plan covers them, so their own card is never charged
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", sub.physioId))
      .first();
    if (profile?.clinicId) return null;
    // A Pro chosen but never locked in (checkout closed) is never charged to an older card
    if (sub.status === "scheduled" && !(await lockedIn(ctx, sub))) return null;
    // The last charge may have gone through: find out before charging again
    const pending = await unresolvedCharge(ctx, sub, now);
    if (pending) return { verify: pending.reference };
    const card = await activeCard(ctx, sub.physioId);
    if (!card) return null;
    const s = await loadPlanSettings(ctx);
    const periodStart = sub.status === "scheduled" ? (sub.currentPeriodStart ?? now) : (sub.currentPeriodEnd ?? now);
    return {
      charge: {
        authorizationCode: card.authorizationCode,
        email: card.email,
        amountKobo: priceFor(sub, s, periodStart),
        reference: sub.status === "scheduled" ? `${PREFIX}${sub._id}_${now}` : `${PREFIX}RENEW_${sub._id}_${now}`,
        label: sub.founding ? "Individual Pro (founding price)" : "Individual Pro",
      },
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
    const plan = await ctx.runQuery(chargeInfoRef, args);
    if (!plan) return null;
    if ("verify" in plan) {
      await settleOrFailCharge(ctx, args.subscriptionId, plan.verify, 0);
      return null;
    }
    const info = plan.charge;
    await ctx.runMutation(chargeStartRef, { subscriptionId: args.subscriptionId, reference: info.reference, amountKobo: info.amountKobo });
    // Rehabify's revenue: with money routing on, to Rehabify's sub-account (read before the try,
    // so the charge's own error handling below is unchanged)
    const split = await rehabifyOnlySplit(ctx);
    try {
      const data: any = await chargeWithRouting(ctx, "physio_pro_renewal", split, { reference: info.reference, amountKobo: info.amountKobo }, (routed) => paystackRequest("/transaction/charge_authorization", {
        method: "POST",
        body: JSON.stringify({
          authorization_code: info.authorizationCode,
          email: info.email,
          amount: info.amountKobo,
          currency: "NGN",
          reference: info.reference,
          ...routed,
          metadata: { source: "physio_pro", subscriptionId: args.subscriptionId, renewal: true },
        }),
      }));
      if (data?.status === "success") {
        await ctx.runMutation(completeRef, {
          reference: info.reference,
          amountKobo: Number(data.amount) || info.amountKobo,
          currency: String(data.currency ?? "NGN"),
          channel: "card",
        });
      } else if (data?.status === "failed") {
        await ctx.runMutation(chargeFailedRef, { subscriptionId: args.subscriptionId, reference: info.reference, error: String(data?.gateway_response ?? "declined") });
      } else {
        // Still going through (pending, send_otp…): Paystack's webhook or our check settles it
        await ctx.runMutation(chargeUnknownRef, { reference: info.reference, error: String(data?.gateway_response ?? data?.status ?? "pending") });
        await ctx.scheduler.runAfter(15 * 60_000, verifyChargeRef, { subscriptionId: args.subscriptionId, reference: info.reference, tries: 0 });
      }
    } catch (err) {
      // No clear answer (a timeout can still have taken the money): check before doing anything else
      await ctx.runMutation(chargeUnknownRef, { reference: info.reference, error: err instanceof Error ? err.message : String(err) });
      await ctx.scheduler.runAfter(15 * 60_000, verifyChargeRef, { subscriptionId: args.subscriptionId, reference: info.reference, tries: 0 });
    }
    return null;
  },
});

/** What happened to a saved-card charge: applied if it went through, a decline if it didn't. */
async function settleOrFailCharge(ctx: ActionCtx, subscriptionId: Id<"physioSubscriptions">, reference: string, tries: number) {
  const verdict = await paystackChargeVerdict(reference);
  if (verdict.outcome === "success") {
    const tx = verdict.tx;
    await ctx.runMutation(completeRef, {
      reference,
      amountKobo: Number(tx.amount) || 0,
      currency: String(tx.currency ?? ""),
      channel: typeof tx.channel === "string" ? tx.channel : "card",
      authorization: tx.authorization,
      email: typeof tx.customer?.email === "string" ? tx.customer.email : undefined,
    });
  } else if (verdict.outcome === "failed") {
    await ctx.runMutation(chargeFailedRef, { subscriptionId, reference, error: verdict.reason });
  } else if (tries < 6) {
    await ctx.scheduler.runAfter(60 * 60_000, verifyChargeRef, { subscriptionId, reference, tries: tries + 1 });
  } else {
    await ctx.runMutation(chargeFailedRef, { subscriptionId, reference, error: "The bank didn't confirm the payment" });
  }
}

export const verifySavedCardCharge = internalAction({
  args: { subscriptionId: v.id("physioSubscriptions"), reference: v.string(), tries: v.number() },
  handler: async (ctx, args) => {
    await settleOrFailCharge(ctx, args.subscriptionId, args.reference, args.tries);
    return null;
  },
});

/** A saved-card charge with no clear answer yet: it stays pending (blocking another charge) until checked. */
export const recordChargeUnknown = internalMutation({
  args: { reference: v.string(), error: v.string() },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("physioPlanPayments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();
    if (payment && payment.status === "pending") await ctx.db.patch(payment._id, { error: `Checking: ${args.error.slice(0, 200)}` });
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
          // Locked in, then joined a clinic: the clinic covers them, so nothing is charged
          if (profile?.clinicId) {
            await ctx.db.patch(sub._id, { status: "cancelled", endedAt: now, updatedAt: now });
            await notifyPhysio(ctx, sub.physioId, "Your clinic covers you", "You're on your clinic's plan now, so we cancelled your Pro lock-in. Nothing was charged.");
            continue;
          }
          const startAt = sub.currentPeriodStart ?? launchAt;
          if (now < startAt) continue;
          const locked = await lockedIn(ctx, sub);
          // Upgrade opened after launch but never paid: nothing to charge, and it lapses after 3 days
          if (!locked && sub.currentPeriodStart === undefined) {
            if (now - sub.startedAt > 3 * DAY_MS) await ctx.db.patch(sub._id, { status: "cancelled", endedAt: now, updatedAt: now });
            continue;
          }
          if (locked && card && (sub.renewalAttempts ?? 0) < s.retryDays && (!sub.lastAttemptAt || now - sub.lastAttemptAt > 20 * 60 * 60 * 1000)) {
            await ctx.db.patch(sub._id, { lastAttemptAt: now, updatedAt: now });
            await ctx.scheduler.runAfter(charged++ * 2000, chargeRef, { subscriptionId: sub._id });
          } else if ((!card || !locked) && sub.reminderSentFor !== startAt) {
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
    // On the notice date (18 Dec): tell physios on Free what changes when the limits start
    if (zonedDateKey(now) >= s.noticeDate && now < dayStart(s.limitsDate) + 31 * DAY_MS) {
      await ctx.scheduler.runAfter(0, noticeRef, {});
    }
    return { charged };
  },
});

/**
 * The limits notice (spec: email + in-app on 18 Dec) to independent physios on Free who haven't had
 * it: what Free covers from the limits date, the founding price for early physios, and that what
 * they've sent stays. Batches of NOTICE_BATCH, continuing until everyone has it.
 */
export const sendLimitsNotice = internalMutation({
  args: { after: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const s = await loadPlanSettings(ctx);
    const now = Date.now();
    const physios = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "physiotherapist"))
      .take(3000);
    const start = args.after ? physios.findIndex((u) => u._id === args.after) + 1 : 0;
    let sent = 0;
    let i = start;
    for (; i < physios.length && sent < NOTICE_BATCH; i++) {
      const user = physios[i];
      if (user.deletedAt) continue;
      const seen = await ctx.db
        .query("featureIntros")
        .withIndex("by_user_and_key", (q) => q.eq("userId", user._id).eq("key", NOTICE_KEY))
        .first();
      if (seen) continue;
      const profile = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .first();
      const plan = await physioPlanFor(ctx, user, profile, s, now);
      await ctx.db.insert("featureIntros", { userId: user._id, key: NOTICE_KEY, seenAt: now });
      if (plan.kind !== "free") continue;
      const founding = isFoundingPhysio(user, profile, s);
      const limitsDay = dayLabel(s.limitsDate, false);
      await notifyPhysio(ctx, user._id, `Your plan from ${limitsDay}`, `Free covers ${s.freePatientsPerMonth} patients a month from ${limitsDay}. See what that means for you.`);
      await emailPhysio(ctx, user, {
        subject: `Your Rehabify plan from ${limitsDay}`,
        heading: `Free stays free. Here's what changes on ${limitsDay}`,
        paragraphs: [
          `From ${dayLabel(s.limitsDate)}, Free covers home programmes for ${s.freePatientsPerMonth} different patients a month and ${s.freeScribeSessions} Rehabify Scribe sessions. Patients who pay for Flex themselves never count, and everything you've already sent stays as it is.`,
          founding
            ? `You joined early, so you can have Individual Pro for ${naira(s.foundingPriceKobo)} a month for your first ${s.foundingMonths} months (normally ${naira(s.proPriceKobo)}): programmes for every patient, ${s.proScribeSessions} Scribe sessions a month and Joy for up to ${s.proJoyPatients} patients.`
            : `Need more? Individual Pro is ${naira(s.proPriceKobo)} a month: programmes for every patient, ${s.proScribeSessions} Scribe sessions a month and Joy for up to ${s.proJoyPatients} patients.`,
        ],
        buttonLabel: "See my plan",
      });
      sent++;
    }
    if (i < physios.length) await ctx.scheduler.runAfter(5000, noticeRef, { after: physios[i - 1]._id });
    return null;
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
    await requireAdmin(ctx, "physioPlans:adminOverview");
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
    const recent = await ctx.db.query("physioPlanPayments").order("desc").take(500);
    const paid = recent.filter((p) => p.status === "paid" && p.kind !== "card_check");
    // Payments a person should look at: unconfirmed card charges, short payments, refunds that failed
    const attention: { id: string; name: string; email: string | null; what: string; kind: string; amountKobo: number; reference: string; at: number }[] = [];
    const nameOf = (u: Doc<"users"> | null) => [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "Physio";
    for (const p of recent) {
      const what =
        p.status === "pending" && p.method === "saved_card" && now - p.createdAt > 2 * 60 * 60 * 1000
          ? "Card charge not confirmed by Paystack yet"
          : p.status === "failed" && p.error?.startsWith("Paid ")
            ? "Paid less than the price: refund it or add the rest"
            : p.refundError
              ? "Card check refund failed: refund it on Paystack"
              : null;
      if (!what || attention.length >= 50) continue;
      const u = await ctx.db.get(p.physioId);
      attention.push({ id: p._id, name: nameOf(u), email: u?.email ?? null, what, kind: p.kind, amountKobo: p.amountKobo, reference: p.reference, at: p.createdAt });
    }
    for (const card of await ctx.db.query("physioPlanCards").order("desc").take(300)) {
      if (!card.checkRefundError || card.checkRefundedAt || attention.length >= 50) continue;
      const u = await ctx.db.get(card.physioId);
      attention.push({
        id: card._id,
        name: nameOf(u),
        email: u?.email ?? null,
        what: "Card check refund failed: refund it on Paystack",
        kind: "card_check",
        amountKobo: card.checkAmountKobo ?? PRO_CARD_CHECK_KOBO,
        reference: card.reference,
        at: card.createdAt,
      });
    }
    return {
      settings: s,
      counts,
      monthlyKobo,
      subscriptions: rows,
      grants,
      attention,
      paidThisMonthKobo: paid.filter((p) => (p.paidAt ?? 0) >= monthStart(now)).reduce((a, p) => a + p.amountKobo, 0),
    };
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
    noticeDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "physioPlans:adminSaveSettings");
    const patch: Record<string, unknown> = { updatedBy: user._id, updatedAt: Date.now() };
    for (const key of numKeys) {
      const n = args[key];
      if (n === undefined) continue;
      if (!Number.isFinite(n) || n < 0) throw new ConvexError("Numbers can't be negative.");
      patch[key] = Math.round(n);
    }
    for (const key of ["foundingCutoff", "launchDate", "limitsDate", "noticeDate"] as const) {
      const d = args[key];
      if (d === undefined) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ConvexError("Dates look like 2026-12-01.");
      patch[key] = d;
    }
    if (args.abroadFreePro !== undefined) patch.abroadFreePro = args.abroadFreePro;
    if (args.announceOn !== undefined) patch.announceOn = args.announceOn;
    // Pro opens later than before: locked-in physios aren't charged until the new day (told in-app
    // and by email). Opening earlier keeps the day they were promised.
    const before = await loadPlanSettings(ctx);
    if (args.launchDate && dayStart(args.launchDate) > dayStart(before.launchDate)) {
      await moveLockIns(ctx, before.launchDate, args.launchDate);
    }
    const row = await ctx.db.query("physioPlanSettings").first();
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert("physioPlanSettings", patch as { updatedAt: number });
    return null;
  },
});

/** Locked-in Pro first charged on `fromDay` moves to `toDay`; each physio is told in-app and by email. */
async function moveLockIns(ctx: MutationCtx, fromDay: string, toDay: string) {
  const oldAt = dayStart(fromDay);
  const newAt = dayStart(toDay);
  const scheduled = await ctx.db
    .query("physioSubscriptions")
    .withIndex("by_status_end", (q) => q.eq("status", "scheduled"))
    .take(1000);
  let moved = 0;
  for (const sub of scheduled.filter((r) => r.currentPeriodStart === oldAt)) {
    await ctx.db.patch(sub._id, { currentPeriodStart: newAt, updatedAt: Date.now() });
    await notifyPhysio(ctx, sub.physioId, "Pro now opens later", `Your first Pro charge moves to ${shortDate(newAt)}. Nothing changes until then.`);
    await emailPhysio(ctx, await ctx.db.get(sub.physioId), {
      subject: `Your Rehabify Pro now starts on ${shortDate(newAt)}`,
      heading: "Pro opens a little later",
      paragraphs: [`We've moved the start of Individual Pro to ${shortDate(newAt)}, so your first charge moves there too. Your price stays the same, and you can cancel any time before then.`],
    });
    moved += 1;
  }
  return moved;
}

/**
 * Operator (CLI): the default Pro start moved in code (lib/physioPlans.ts, owner 18 Nov 2026:
 * 1 Dec 2026 → 1 Jan 2027), so lock-ins made for the old day move too. Safe to run twice.
 */
export const moveLockInsInternal = internalMutation({
  args: { fromDay: v.string(), toDay: v.string() },
  handler: async (ctx, args) => {
    if (dayStart(args.toDay) <= dayStart(args.fromDay)) throw new ConvexError("Only later dates");
    return { moved: await moveLockIns(ctx, args.fromDay, args.toDay) };
  },
});

export const adminGrant = mutation({
  args: { email: v.string(), days: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx, "physioPlans:adminGrant");
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

/** Admin: a physio's country of practice (physios can't change it themselves once approved). */
export const adminSetPhysioCountry = mutation({
  args: { userId: v.id("users"), country: v.string() },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx, "physioPlans:adminSetPhysioCountry");
    const country = args.country.trim().slice(0, 60);
    if (country.length < 2) throw new ConvexError("Choose a country.");
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .first();
    if (!profile) throw new ConvexError("That account has no physiotherapist profile.");
    if (profile.country === country) return null;
    // Rehabify Care patients are only in Nigeria: physios elsewhere practise independently
    const outside = isOutsideRehabifyCare(country);
    await ctx.db.patch(profile._id, outside ? { country, practiceMode: "independent", isAvailableOnMarketplace: false } : { country, timeZone: undefined });
    await ctx.db.insert("auditLogs", {
      actorUserId: admin._id,
      action: "physio_country_changed",
      targetEntityType: "user",
      targetEntityId: args.userId,
      timestamp: Date.now(),
      details: { from: profile.country ?? null, to: country },
    });
    return null;
  },
});

export const adminRevokeGrant = mutation({
  args: { grantId: v.id("physioPlanGrants") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "physioPlans:adminRevokeGrant");
    await ctx.db.patch(args.grantId, { revokedAt: Date.now() });
    return null;
  },
});
