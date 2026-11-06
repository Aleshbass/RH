/**
 * Clinic subscriptions (Clinic Master SaaS Agreement: Schedule 1, clauses 3.2-3.4 and 7): plan
 * numbers, billing dates, clinician seats, Active Patient Programmes and the read-only rule.
 * Billing itself lives in convex/clinicBilling.ts; seats and read-only are enforced from
 * convex/clinicTools.ts and convex/clinics.ts.
 *
 * Nothing here applies to a clinic until an admin switches its billing on: a clinic with no
 * subscription (or an inactive or cancelled one) works exactly as before.
 *
 * Clinics don't get Joy or Flex Max. A clinic's patients get their home programme as part of the
 * clinic's plan, so they must never be charged for Flex.
 */
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { CLINIC_PLANS, CLINIC_PROGRAMME_OVERAGE_KOBO, isUnlimitedSeats } from "../../lib/clinicPlans";
import { loadClinicPlans } from "../clinicPlans";
import { formatLagos, startOfZonedDay, zonedDateKey, zonedDateTimeToUtc } from "./lagosTime";

type Ctx = QueryCtx | MutationCtx;

export type ClinicPlanId = "starter" | "growth" | "enterprise";
export type ClinicSubscription = Doc<"clinicSubscriptions">;
export type ClinicSubscriptionInvoice = Doc<"clinicSubscriptionInvoices">;

export const DAY_MS = 86_400_000;
/** Each invoice is payable within 7 days of its date (clause 7.2). */
export const PAYMENT_TERMS_DAYS = 7;
/** Written notice goes out if an invoice is still unpaid 14 days after the due-date reminder (7.4). */
export const NOTICE_AFTER_REMINDER_DAYS = 14;
/** Read-only starts 7 days after the written notice (7.4). */
export const READ_ONLY_NOTICE_DAYS = 7;
/** "Active Patient Programme": created, updated or accessed by the patient within the preceding 30 days. */
export const ACTIVE_PROGRAMME_WINDOW_DAYS = 30;
export const OVERAGE_UNIT_KOBO = CLINIC_PROGRAMME_OVERAGE_KOBO;

/** Where a clinic sees its plan and pays Rehabify's invoices. */
export const CLINIC_PLAN_PAGE = "/dashboard/clinic/billing/plan";

export const BILLING_READ_ONLY_MESSAGE =
  "Your clinic is read-only because a Rehabify invoice is overdue. You can still view and export everything, bill your patients and remove team members. Pay it under Billing → Your plan to make changes again.";

export function planName(plan: string): string {
  return CLINIC_PLANS.find((p) => p.id === plan)?.name ?? "Clinic plan";
}

/** Seats, allowance and fee of a standard plan as an admin last set it (Enterprise numbers are set per clinic). */
export async function standardPlanNumbers(ctx: Ctx, plan: "starter" | "growth") {
  const { plans } = await loadClinicPlans(ctx);
  const found = plans.find((p) => p.id === plan);
  if (!found || found.seatLimit === null || found.programmeAllowance === null || found.monthlyFeeKobo === null) {
    throw new ConvexError("Unknown plan");
  }
  return { seatLimit: found.seatLimit, programmeAllowance: found.programmeAllowance, monthlyFeeKobo: found.monthlyFeeKobo };
}

/** Billing is on: plan limits apply, invoices are issued and late payment is followed up. */
export function billingIsOn(sub: ClinicSubscription | null | undefined): sub is ClinicSubscription {
  return sub?.status === "active" || sub?.status === "past_due" || sub?.status === "read_only";
}

export async function subscriptionForClinic(ctx: Ctx, clinicId: Id<"clinics">): Promise<ClinicSubscription | null> {
  return await ctx.db
    .query("clinicSubscriptions")
    .withIndex("by_clinic", (q) => q.eq("clinicId", clinicId))
    .first();
}

/**
 * Refuses changes while the clinic is read-only for an unpaid invoice. Reading, exporting,
 * paying Rehabify's invoices, billing the clinic's patients and taking someone's access away
 * never come through here (callers pass allowBillingReadOnly).
 */
export async function assertClinicNotBillingReadOnly(ctx: Ctx, clinicId: Id<"clinics">) {
  const sub = await subscriptionForClinic(ctx, clinicId);
  if (sub?.status === "read_only") throw new ConvexError(BILLING_READ_ONLY_MESSAGE);
}

// ─── Dates (Lagos calendar) ──────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/** Lagos midnight `months` calendar months after the Lagos day of `anchorMs` (31 Jan + 1 → 28/29 Feb). */
export function addMonthsLagos(anchorMs: number, months: number): number {
  const [year, month, day] = zonedDateKey(anchorMs).split("-").map(Number);
  const index = month - 1 + months;
  const y = year + Math.floor(index / 12);
  const m = ((index % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return zonedDateTimeToUtc(`${y}-${pad(m + 1)}-${pad(Math.min(day, lastDay))}`, "00:00");
}

/** Last moment (Lagos) of the 7th day after the invoice date. */
export function dueAtFor(issuedAt: number): number {
  return startOfZonedDay(issuedAt) + (PAYMENT_TERMS_DAYS + 1) * DAY_MS - 1;
}

/** When the written notice is due: 14 days after the day the due-date reminder went out. */
export function noticeDueFrom(invoice: Pick<ClinicSubscriptionInvoice, "dueAt" | "reminderSentAt">): number {
  return startOfZonedDay(invoice.reminderSentAt ?? invoice.dueAt) + NOTICE_AFTER_REMINDER_DAYS * DAY_MS;
}

/** Read-only starts at the beginning of the 7th day after the notice. */
export function readOnlyFromFor(noticeSentAt: number): number {
  return startOfZonedDay(noticeSentAt) + READ_ONLY_NOTICE_DAYS * DAY_MS;
}

/** "1 Nov – 30 Nov 2026" for a period whose end is exclusive. */
export function periodLabel(start: number, endExclusive: number): string {
  const last = endExclusive - 1;
  const sameYear = zonedDateKey(start).slice(0, 4) === zonedDateKey(last).slice(0, 4);
  const from = formatLagos(start, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  const to = formatLagos(last, { day: "numeric", month: "short", year: "numeric" });
  return `${from} – ${to}`;
}

/** "29 November 2026" */
export function longDate(utcMs: number): string {
  return formatLagos(utcMs, { day: "numeric", month: "long", year: "numeric" });
}

/** Lagos midnight of a "YYYY-MM-DD" date, or null when it isn't a real date. */
export function lagosDateToMs(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = zonedDateTimeToUtc(date, "00:00");
  return Number.isFinite(ms) && zonedDateKey(ms) === date ? ms : null;
}

// ─── Status ──────────────────────────────────────────────────────────────────

/**
 * The status the open invoices put a switched-on subscription in: read-only once an invoice's
 * notice period has run out, past due once one is past its due date, otherwise active.
 */
export function statusFromOpenInvoices(open: ClinicSubscriptionInvoice[], now: number): "active" | "past_due" | "read_only" {
  if (open.some((inv) => inv.readOnlyFrom !== undefined && now >= inv.readOnlyFrom)) return "read_only";
  if (open.some((inv) => now > inv.dueAt)) return "past_due";
  return "active";
}

// ─── Seats ───────────────────────────────────────────────────────────────────

/**
 * Clinician seats in use: named physiotherapists on the team who can currently sign in (the
 * owner's account and front-desk staff don't take a seat). `pending` counts clinician
 * invitations that haven't been answered and haven't expired.
 */
export async function clinicianSeatUsage(ctx: Ctx, clinic: Doc<"clinics">, excludeUserId?: Id<"users">) {
  const profiles = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
    .collect();
  const seen = new Set<Id<"users">>();
  let used = 0;
  for (const profile of profiles) {
    const userId = profile.userId;
    if (seen.has(userId) || userId === clinic.ownerId || userId === excludeUserId) continue;
    seen.add(userId);
    const user = await ctx.db.get(userId);
    if (!user || user.clinicId !== clinic._id || user.role !== "physiotherapist") continue;
    if (user.status && user.status !== "active") continue;
    used += 1;
  }
  const now = Date.now();
  const invitations = await ctx.db
    .query("clinicStaffInvitations")
    .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
    .collect();
  const pending = invitations.filter((i) => i.status === "pending" && i.role === "physiotherapist" && i.expiresAt > now).length;
  return { used, pending };
}

/**
 * Blocks adding a clinician when the plan's seats are all taken. `countPending` reserves seats
 * for invitations still waiting for an answer. `audience: "invitee"` words it for the
 * physiotherapist accepting an invitation.
 */
export async function assertClinicianSeatFree(
  ctx: Ctx,
  clinic: Doc<"clinics">,
  opts: { countPending: boolean; excludeUserId?: Id<"users">; audience?: "clinic" | "invitee" }
) {
  const sub = await subscriptionForClinic(ctx, clinic._id);
  if (!billingIsOn(sub)) return;
  const { used, pending } = await clinicianSeatUsage(ctx, clinic, opts.excludeUserId);
  const taken = used + (opts.countPending ? pending : 0);
  if (taken < sub.seatLimit || isUnlimitedSeats(sub.seatLimit)) return;
  if (opts.audience === "invitee") {
    throw new ConvexError(
      `${clinic.name} has no free clinician seats on its Rehabify plan. Ask the clinic to upgrade its plan or free a seat, then accept again.`
    );
  }
  const seats = `${sub.seatLimit} clinician seat${sub.seatLimit === 1 ? "" : "s"}`;
  const waiting = opts.countPending && pending > 0 ? ` (${pending} held by invitation${pending === 1 ? "" : "s"} still waiting)` : "";
  throw new ConvexError(
    `Your ${planName(sub.plan)} plan includes ${seats}, and they're all in use${waiting}. Ask for an upgrade under Billing → Your plan, or free a seat first.`
  );
}

// ─── Active Patient Programmes ───────────────────────────────────────────────

async function programmeActiveBetween(ctx: Ctx, program: Doc<"exercisePrograms">, since: number, until: number) {
  if (program.createdAt >= since && program.createdAt < until) return true;
  // Archiving a programme isn't use: only a live programme counts by its last update
  if (program.status === "active" && program.updatedAt >= since && program.updatedAt < until) return true;
  const log = await ctx.db
    .query("exerciseProgramLogs")
    .withIndex("by_program", (q) => q.eq("programId", program._id).gte("createdAt", since).lt("createdAt", until))
    .first();
  if (log) return true;
  const links = await ctx.db
    .query("exerciseShareLinks")
    .withIndex("by_program", (q) => q.eq("programId", program._id))
    .collect();
  return links.some((link) => link.lastOpenedAt !== undefined && link.lastOpenedAt >= since && link.lastOpenedAt < until);
}

/**
 * Active Patient Programmes at `at`: the clinic's patients with an exercise programme that was
 * created, updated, logged or opened by the patient in the 30 days before `at`. The agreement
 * counts patient records, so a patient with two programmes counts once.
 */
async function activeProgrammePatients(ctx: Ctx, clinicId: Id<"clinics">, at: number): Promise<Set<Id<"users">>> {
  const since = at - ACTIVE_PROGRAMME_WINDOW_DAYS * DAY_MS;
  const programmes = await ctx.db
    .query("exercisePrograms")
    .withIndex("by_clinic", (q) => q.eq("clinicId", clinicId))
    .collect();
  const patients = new Set<Id<"users">>();
  for (const program of programmes) {
    if (patients.has(program.patientId) || program.createdAt >= at) continue;
    if (await programmeActiveBetween(ctx, program, since, at)) patients.add(program.patientId);
  }
  return patients;
}

export async function countActiveProgrammes(ctx: Ctx, clinicId: Id<"clinics">, at: number): Promise<number> {
  return (await activeProgrammePatients(ctx, clinicId, at)).size;
}

/**
 * What sending this patient a programme does to the clinic's allowance. Null while billing is off
 * (a pilot has no limits) or read-only (sending is refused anyway). Over the allowance a
 * programme still goes out and is billed as overage (Schedule 1); this is for warning first.
 */
export async function programmeAllowanceInfo(ctx: Ctx, clinicId: Id<"clinics">, patientId: Id<"users">, at: number) {
  const sub = await subscriptionForClinic(ctx, clinicId);
  if (!sub || (sub.status !== "active" && sub.status !== "past_due")) return null;
  const patients = await activeProgrammePatients(ctx, clinicId, at);
  const alreadyCounted = patients.has(patientId);
  const count = patients.size + (alreadyCounted ? 0 : 1);
  return {
    allowance: sub.programmeAllowance,
    /** Active patient programmes once this one is sent */
    count,
    alreadyCounted,
    overage: !alreadyCounted && count > sub.programmeAllowance,
    unitKobo: OVERAGE_UNIT_KOBO,
  };
}

/** 80% and 100% of the allowance (integer maths, so 24 of 30 is exactly 80%). */
export function allowanceLevel(count: number, allowance: number): 0 | 80 | 100 {
  if (allowance <= 0) return 0;
  if (count >= allowance) return 100;
  if (count * 5 >= allowance * 4) return 80;
  return 0;
}
