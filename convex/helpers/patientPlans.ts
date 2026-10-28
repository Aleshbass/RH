/**
 * Flex and Flex Max (the digital recovery service): who must buy them, who has them, and the
 * lifecycle of each 30-day period. Every gate uses this file, so the rule lives in one place.
 *
 * Who pays: ONLY the own patients of independent physiotherapists, meaning a programme from a
 * physio outside a clinic where the pair isn't Rehabify Care (rehabifyFollowUps.isRehabifyCare).
 * Rehabify Care and clinic patients keep everything included and are never charged. Nothing is
 * gated, and nothing can be bought, until an admin switches a plan on (patientPlanSettings).
 *
 * What Flex unlocks: exercise demonstrations (3D clips, the physio's own photos and videos, video
 * links) and progress tracking (logging sets, pain and difficulty, progress views). Basic (the
 * steps, doses, notes, voice note and education) is never paywalled, and records never disappear.
 *
 * Lifecycle: bought (or a free activation) -> pending_activation until a programme is available
 * -> active for 30 days -> expired. A renewal bought while a period runs starts when that period
 * ends; an upgrade to Flex Max starts at once. No automatic renewal: the patient is emailed about
 * 3 days before the end. A refund under Payment Policy 4.8 cancels the period and files a refund
 * request for an admin; Paystack's refund then marks it refunded (helpers/paymentRefunds.ts).
 */
import { insertNotification } from "./pushNotify";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isRehabifyCare } from "../rehabifyFollowUps";
import {
  RECOVERY_PLAN_DAYS,
  recoveryPlan,
  type PaidRecoveryPlanId,
  type RecoveryPlansLive,
} from "../../lib/recoveryPlans";

type Ctx = QueryCtx | MutationCtx;
type Entitlement = Doc<"patientPlanEntitlements">;
export type PaidPlan = PaidRecoveryPlanId;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const LAGOS_OFFSET = HOUR; // West Africa Time, UTC+1, no daylight saving

export const PLAN_PERIOD_MS = RECOVERY_PLAN_DAYS * DAY;
/** Full refund if the programme isn't available this long after payment (Payment Policy 4.8). */
export const NOT_READY_REFUND_MS = 7 * DAY;
/** Full refund if cancelled this soon after activation, without substantial use (4.8). */
export const COOLING_OFF_MS = 48 * HOUR;
/**
 * More programme sessions than this since activation is substantial use (4.8 also counts 10 Joy
 * conversations, which aren't tracked here). A session is a day with at least one logged exercise.
 */
export const SUBSTANTIAL_SESSIONS = 3;
/** The "your plan ends soon" email goes this long before the end. */
export const REMINDER_BEFORE_MS = 3 * DAY;

const RANK: Record<PaidPlan, number> = { flex: 1, flex_max: 2 };

export type PlanOffer = {
  id: PaidPlan;
  name: string;
  description: string;
  features: string[];
  priceKobo: number;
  priceLabel: string;
};

export const planName = (plan: PaidPlan) => recoveryPlan(plan).name;
export const planPriceKobo = (plan: PaidPlan) => recoveryPlan(plan).priceKobo;

// ─────────────────────────────────────────────────────────────────────────────
// Launch switch
// ─────────────────────────────────────────────────────────────────────────────

export async function planSettings(ctx: Ctx): Promise<RecoveryPlansLive & { updatedAt: number | null; updatedBy: Id<"users"> | null }> {
  const row = await ctx.db.query("patientPlanSettings").order("desc").first();
  return {
    flexLive: row?.flexLive ?? false,
    flexMaxLive: row?.flexMaxLive ?? false,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
  };
}

export const anyPlanLive = (live: RecoveryPlansLive) => live.flexLive || live.flexMaxLive;

export const isLive = (live: RecoveryPlansLive, plan: PaidPlan) => (plan === "flex" ? live.flexLive : live.flexMaxLive);

/** The plans on sale now, cheapest first. */
export function planOffer(live: RecoveryPlansLive): PlanOffer[] {
  return (["flex", "flex_max"] as const)
    .filter((id) => isLive(live, id))
    .map((id) => {
      const plan = recoveryPlan(id);
      return {
        id,
        name: plan.name,
        description: plan.description,
        features: plan.features,
        priceKobo: plan.priceKobo,
        priceLabel: plan.priceLabel,
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Who must buy it
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A physio's own patient: the physio isn't in a clinic and the pair isn't Rehabify Care.
 * Programmes from clinics, clinic members or admins never make a pair that pays.
 */
export async function isIndependentPair(ctx: Ctx, patientId: Id<"users">, physiotherapistId: Id<"users">): Promise<boolean> {
  const physio = await ctx.db.get(physiotherapistId);
  if (!physio || physio.role !== "physiotherapist" || physio.clinicId) return false;
  const profile = physio.physiotherapistProfileId ? await ctx.db.get(physio.physiotherapistProfileId) : null;
  if (!profile || profile.clinicId) return false;
  return !(await isRehabifyCare(ctx, patientId, physiotherapistId));
}

/** Whether Flex applies to this programme at all, whatever the launch switch says. */
export async function isIndependentProgram(ctx: Ctx, program: Doc<"exercisePrograms">): Promise<boolean> {
  if (program.clinicId) return false;
  return isIndependentPair(ctx, program.patientId, program.createdBy);
}

/** THE gating rule: this programme's demonstrations and tracking need Flex right now. */
export async function programNeedsFlex(ctx: Ctx, program: Doc<"exercisePrograms">, live?: RecoveryPlansLive): Promise<boolean> {
  const settings = live ?? (await planSettings(ctx));
  if (!anyPlanLive(settings)) return false;
  return isIndependentProgram(ctx, program);
}

async function activePrograms(ctx: Ctx, patientId: Id<"users">) {
  const rows = await ctx.db
    .query("exercisePrograms")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .order("desc")
    .take(30);
  return rows.filter((program) => program.status === "active" && program.items.length > 0);
}

/**
 * The patient's situation: `independent` when an independent physio's programme (or, before the
 * first programme, an independent physio) is in their care; `included` when some of their care
 * comes from Rehabify Care or a clinic, which includes everything.
 */
export async function patientFlexContext(ctx: Ctx, patientId: Id<"users">) {
  const programs = await activePrograms(ctx, patientId);
  let independent: Doc<"exercisePrograms"> | null = null;
  let included = false;
  for (const program of programs) {
    if (await isIndependentProgram(ctx, program)) independent ??= program;
    else included = true;
  }
  if (independent) {
    return { independent: true, included, programId: independent._id, physiotherapistId: independent.createdBy };
  }
  if (programs.length > 0) return { independent: false, included: true, programId: null, physiotherapistId: null };

  // No programme yet: their current physiotherapists
  const relationships = (
    await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .take(20)
  ).filter((relationship) => relationship.status === "active");
  let physio: Id<"users"> | null = null;
  for (const relationship of relationships) {
    if (!relationship.clinicId && (await isIndependentPair(ctx, patientId, relationship.physiotherapistId))) {
      physio ??= relationship.physiotherapistId;
    } else {
      included = true;
    }
  }
  return { independent: physio !== null, included, programId: null, physiotherapistId: physio };
}

// ─────────────────────────────────────────────────────────────────────────────
// Who has it
// ─────────────────────────────────────────────────────────────────────────────

export function patientEntitlements(ctx: Ctx, patientId: Id<"users">, limit = 50) {
  return ctx.db
    .query("patientPlanEntitlements")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .order("desc")
    .take(limit);
}

/** Running now: active, started and not yet ended. */
export function isRunning(entitlement: Entitlement, now = Date.now()) {
  return (
    entitlement.status === "active" &&
    entitlement.activatedAt !== undefined &&
    entitlement.expiresAt !== undefined &&
    entitlement.activatedAt <= now &&
    now < entitlement.expiresAt
  );
}

/** The period running now, Flex Max before Flex. */
export async function currentEntitlement(ctx: Ctx, patientId: Id<"users">, now = Date.now()): Promise<Entitlement | null> {
  const running = (await patientEntitlements(ctx, patientId)).filter((row) => isRunning(row, now));
  running.sort((a, b) => RANK[b.plan] - RANK[a.plan] || b.expiresAt! - a.expiresAt!);
  return running[0] ?? null;
}

export async function hasFlex(ctx: Ctx, patientId: Id<"users">, now = Date.now()) {
  return (await currentEntitlement(ctx, patientId, now)) !== null;
}

export type ProgramPlan = {
  /** Flex applies to this programme (an independent physio's own patient) and a plan is on sale */
  needsFlex: boolean;
  /** The patient has Flex or Flex Max running now */
  hasFlex: boolean;
  /** Demonstrations and tracking are hidden: needsFlex and no plan running */
  locked: boolean;
  plan: PaidPlan | null;
  expiresAt: number | null;
  /** The plans on sale, to show with the upgrade card */
  offer: PlanOffer[];
};

/** What the patient player needs to know about Flex for one programme. */
export async function programPlan(ctx: Ctx, program: Doc<"exercisePrograms">, now = Date.now()): Promise<ProgramPlan> {
  const live = await planSettings(ctx);
  const needsFlex = await programNeedsFlex(ctx, program, live);
  const current = needsFlex ? await currentEntitlement(ctx, program.patientId, now) : null;
  return {
    needsFlex,
    hasFlex: current !== null,
    locked: needsFlex && current === null,
    plan: current?.plan ?? null,
    expiresAt: current?.expiresAt ?? null,
    offer: needsFlex ? planOffer(live) : [],
  };
}

export const FLEX_LOCKED_MESSAGE = {
  demo: "Exercise demonstrations are part of Flex. Your steps are still here to follow.",
  log: "Logging your exercises is part of Flex. Your steps are still here to follow. Get Flex from your Rehabify dashboard to log your sets, pain and progress.",
} as const;

/** True when this programme's demonstrations and tracking are hidden for its patient. */
export async function isProgramLocked(ctx: Ctx, program: Doc<"exercisePrograms">, now = Date.now()) {
  if (!(await programNeedsFlex(ctx, program))) return false;
  return !(await hasFlex(ctx, program.patientId, now));
}

/** Throws a friendly message when the patient needs Flex for this. */
export async function assertProgramUnlocked(ctx: Ctx, program: Doc<"exercisePrograms">, what: keyof typeof FLEX_LOCKED_MESSAGE) {
  if (await isProgramLocked(ctx, program)) throw new ConvexError(FLEX_LOCKED_MESSAGE[what]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Periods
// ─────────────────────────────────────────────────────────────────────────────

/** The programme a period runs for: an independent physio's first, otherwise any active one. */
async function availableProgram(ctx: Ctx, patientId: Id<"users">) {
  const programs = await activePrograms(ctx, patientId);
  for (const program of programs) {
    if (await isIndependentProgram(ctx, program)) return program;
  }
  return programs[0] ?? null;
}

/** When a new period starts: now, or when a running period of the same or a higher plan ends. */
export function periodStart(existing: Entitlement[], plan: PaidPlan, now: number) {
  let start = now;
  for (const row of existing) {
    if (row.status !== "active" || row.expiresAt === undefined || row.expiresAt <= now) continue;
    if (RANK[row.plan] >= RANK[plan]) start = Math.max(start, row.expiresAt);
  }
  return start;
}

/**
 * How a new period begins: active now (or after the running one) when a programme is available,
 * otherwise waiting for it. The 30 days count from activation, not from payment.
 */
export async function newPeriod(ctx: MutationCtx, patientId: Id<"users">, plan: PaidPlan, now: number) {
  const program = await availableProgram(ctx, patientId);
  if (!program) return { status: "pending_activation" as const };
  const start = periodStart(await patientEntitlements(ctx, patientId), plan, now);
  return {
    status: "active" as const,
    activatedAt: start,
    expiresAt: start + PLAN_PERIOD_MS,
    programId: program._id,
    physiotherapistId: program.createdBy,
  };
}

/**
 * Starts the patient's waiting periods, oldest first, once a programme is available. Called when
 * a programme is sent and by the hourly sweep. Returns how many started.
 */
export async function activatePendingPlans(ctx: MutationCtx, patientId: Id<"users">, now = Date.now()) {
  const pending = (await patientEntitlements(ctx, patientId))
    .filter((row) => row.status === "pending_activation")
    .sort((a, b) => a.purchasedAt - b.purchasedAt);
  if (pending.length === 0) return 0;
  const program = await availableProgram(ctx, patientId);
  if (!program) return 0;
  for (const row of pending) {
    // Read again each time, so a second waiting period queues after the first
    const start = periodStart(await patientEntitlements(ctx, patientId), row.plan, now);
    await ctx.db.patch(row._id, {
      status: "active",
      activatedAt: start,
      expiresAt: start + PLAN_PERIOD_MS,
      programId: row.programId ?? program._id,
      physiotherapistId: row.physiotherapistId ?? program.createdBy,
    });
  }
  await insertNotification(ctx, {
    userId: patientId,
    type: "patient_plan",
    priority: "medium",
    status: "pending",
    payload: {
      title: `${planName(pending[0].plan)} is on`,
      body: "Your programme is ready, so your 30 days have started. Open your exercises to see the demonstrations and log how you get on.",
      data: { actionUrl: "/dashboard/patient/exercises" },
    },
    createdAt: now,
  });
  return pending.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Refunds (Payment Policy 4.8)
// ─────────────────────────────────────────────────────────────────────────────

/** Days with at least one logged exercise since `since`, in Lagos time. */
export async function sessionsSince(ctx: Ctx, patientId: Id<"users">, since: number) {
  const logs = await ctx.db
    .query("exerciseProgramLogs")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId).gte("createdAt", since))
    .take(1000);
  return new Set(logs.map((log) => Math.floor((log.createdAt + LAGOS_OFFSET) / DAY))).size;
}

export type RefundRule = {
  reason: "flex_not_ready_7d" | "flex_48h";
  reasonText: string;
  /** Until when the patient can ask (null: until the programme is ready) */
  until: number | null;
};

/** The refund this period qualifies for now, if any. Only paid periods can be refunded. */
export async function refundRule(ctx: Ctx, row: Entitlement, now = Date.now()): Promise<RefundRule | null> {
  if (row.source !== "purchase" || !row.reference || row.amountKobo <= 0 || row.refundRequestId) return null;
  const name = planName(row.plan);
  if (row.status === "pending_activation") {
    if (now - row.purchasedAt < NOT_READY_REFUND_MS) return null;
    return {
      reason: "flex_not_ready_7d",
      reasonText: `${name}: the physiotherapist's programme wasn't made available within 7 days of payment (Payment Policy 4.8).`,
      until: null,
    };
  }
  if (row.status === "active" && row.activatedAt !== undefined && now <= row.activatedAt + COOLING_OFF_MS) {
    const sessions = row.activatedAt <= now ? await sessionsSince(ctx, row.patientId, row.activatedAt) : 0;
    if (sessions > SUBSTANTIAL_SESSIONS) return null;
    return {
      reason: "flex_48h",
      reasonText: `${name}: cancelled within 48 hours of activation, with ${sessions} programme session${sessions === 1 ? "" : "s"} logged (Payment Policy 4.8).`,
      until: row.activatedAt + COOLING_OFF_MS,
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paystack references: FLEX_<patientId>_<flex|max>_<timestamp>
// ─────────────────────────────────────────────────────────────────────────────

const REFERENCE = /^FLEX_([a-z0-9]+)_(flex|max)_\d+$/;

export function flexReference(patientId: Id<"users">, plan: PaidPlan, now: number) {
  return `FLEX_${patientId}_${plan === "flex_max" ? "max" : "flex"}_${now}`;
}

export function parseFlexReference(reference: string): { patientId: string; plan: PaidPlan } | null {
  const match = REFERENCE.exec(reference);
  if (!match) return null;
  return { patientId: match[1], plan: match[2] === "max" ? "flex_max" : "flex" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Views
// ─────────────────────────────────────────────────────────────────────────────

export function entitlementView(row: Entitlement, now = Date.now()) {
  return {
    _id: row._id,
    plan: row.plan,
    name: planName(row.plan),
    status: row.status,
    source: row.source,
    amountKobo: row.amountKobo,
    purchasedAt: row.purchasedAt,
    activatedAt: row.activatedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    running: isRunning(row, now),
    startsLater: row.status === "active" && row.activatedAt !== undefined && row.activatedAt > now,
    refundRequested: Boolean(row.refundRequestId),
  };
}

/**
 * For Joy on WhatsApp: whether the patient has Flex Max now, so Joy can switch on reminders and
 * support. `joy_reminders_allowed` is also true when their care includes it (Rehabify Care or a
 * clinic), when they aren't an independent physio's own patient, or before Flex Max launches.
 */
export async function recoveryPlanForJoy(ctx: Ctx, patientId: Id<"users">, now = Date.now()) {
  const live = await planSettings(ctx);
  const current = await currentEntitlement(ctx, patientId, now);
  const flexMaxActive = current?.plan === "flex_max";
  const situation = flexMaxActive || !live.flexMaxLive ? null : await patientFlexContext(ctx, patientId);
  return {
    plan: (current?.plan ?? "basic") as PaidPlan | "basic",
    flex_max_active: flexMaxActive,
    expires_at: current?.expiresAt ?? null,
    flex_max_on_sale: live.flexMaxLive,
    joy_reminders_allowed: situation === null || !situation.independent || situation.included,
  };
}
