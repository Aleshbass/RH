/**
 * The referring doctor's portal (/partners/portal for a partner of type "doctor").
 *
 * A doctor sees each referral as six steps, Received → Contacted → Booked → Seen → In treatment
 * → Discharged, or how it ended early (helpers/doctorStages.ts), who is treating the patient,
 * the progress and discharge reports shared with them, and their personal referral link.
 * Referring itself goes through partners.createPortalReferral, commissions and payouts through
 * commercialTerms / partnerBankAccounts, like every partner.
 *
 * Access: the doctor (partner owner) or an admin, resolved from the signed-in identity. Queries
 * return null instead of throwing when signed out, so the page survives a sign-out.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { findPartnerAccess, requirePartnerAccess } from "./helpers/partnerAccess";
import { generateLinkPublicCode, linkEnv, referralEnv, referralLinkUrl, referralSessions, summarizeSessions, trackingUrl } from "./helpers/partnerShared";
import { careTeamFor, doctorEmails, reportsForReferral } from "./helpers/doctorReferrals";
import { publicCommissionStatus } from "./helpers/partnerLedger";
import {
  DOCTOR_OUTCOMES,
  DOCTOR_STEPS,
  doctorStageOf,
  doctorStepIndex,
  doctorUrgencyOf,
  isDoctorOutcome,
  isDoctorStageOpen,
  type DoctorCareSetting,
  type DoctorStage,
} from "./helpers/doctorStages";

type Ctx = QueryCtx;

const MAX_LIST = 200;

/** The doctor partner this viewer may see, or null. */
async function doctorAccess(ctx: Ctx, partnerCode: string) {
  const access = await findPartnerAccess(ctx, partnerCode);
  if (!access || access.partner.type !== "doctor") return null;
  return access;
}

async function liveReferrals(ctx: Ctx, partner: Doc<"partners">, limit: number) {
  return ctx.db
    .query("inboundReferrals")
    .withIndex("by_partner_and_environment", (q) => q.eq("partnerId", partner.code).eq("environment", "live"))
    .order("desc")
    .take(limit);
}

function stageOf(r: Doc<"inboundReferrals">): DoctorStage {
  return doctorStageOf(r.status, r);
}

async function referralRow(ctx: Ctx, partner: Doc<"partners">, r: Doc<"inboundReferrals">, emails: Set<string>) {
  const stage = stageOf(r);
  const [careTeam, reports] = await Promise.all([careTeamFor(ctx, r), reportsForReferral(ctx, partner, r, emails)]);
  return {
    referralId: r._id,
    trackingCode: r.trackingCode ?? "",
    patientName: `${r.patientFirstName} ${r.patientLastName ?? ""}`.trim(),
    condition: r.condition ?? r.reason ?? null,
    urgency: doctorUrgencyOf(r.priority),
    careSetting: (r.careSetting ?? null) as DoctorCareSetting | null,
    city: r.city ?? null,
    stage,
    stepIndex: doctorStepIndex(stage, r),
    open: isDoctorStageOpen(stage),
    /** Came through the doctor's referral link rather than the form */
    viaLink: r.conversionSource === "partner_link",
    careTeam,
    reportCount: reports.filter((rep) => rep.state === "open").length,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export type DoctorReferralRow = Awaited<ReturnType<typeof referralRow>>;

/** Home: the counts, the latest referrals and who the doctor is (for the share message). */
export const getDoctorHome = query({
  args: { partnerCode: v.string() },
  handler: async (ctx, args) => {
    const access = await doctorAccess(ctx, args.partnerCode);
    if (!access) return null;
    const { partner } = access;
    const referrals = await liveReferrals(ctx, partner, 1000);
    const counts = { total: referrals.length, waiting: 0, inCare: 0, discharged: 0, ended: 0 };
    for (const r of referrals) {
      const stage = stageOf(r);
      if (stage === "received" || stage === "contacted") counts.waiting++;
      else if (stage === "booked" || stage === "seen" || stage === "in_treatment") counts.inCare++;
      else if (stage === "discharged") counts.discharged++;
      else counts.ended++;
    }
    const emails = await doctorEmails(ctx, partner);
    return {
      name: partner.name,
      counts,
      countIsCapped: referrals.length >= 1000,
      recent: await Promise.all(referrals.slice(0, 5).map((r) => referralRow(ctx, partner, r, emails))),
    };
  },
});

/** Every referral (newest first, up to 200), for the "My referrals" list. */
export const listDoctorReferrals = query({
  args: { partnerCode: v.string() },
  handler: async (ctx, args) => {
    const access = await doctorAccess(ctx, args.partnerCode);
    if (!access) return null;
    const { partner } = access;
    const referrals = await liveReferrals(ctx, partner, MAX_LIST);
    const emails = await doctorEmails(ctx, partner);
    return {
      rows: await Promise.all(referrals.map((r) => referralRow(ctx, partner, r, emails))),
      capped: referrals.length >= MAX_LIST,
    };
  },
});

/** First time the referral reached each status, from its audit trail. */
async function statusTimes(ctx: Ctx, referralId: Id<"inboundReferrals">) {
  const events = await ctx.db
    .query("referralEvents")
    .withIndex("by_referral_id", (q) => q.eq("referralId", referralId))
    .order("asc")
    .take(200);
  const firstAt = new Map<DoctorStage, number>();
  for (const e of events) {
    if (!e.eventName.startsWith("referral.")) continue;
    const status = e.eventName.slice("referral.".length);
    const stage = doctorStageOf(status, {});
    if (!firstAt.has(stage)) firstAt.set(stage, e.occurredAt);
  }
  return firstAt;
}

/** One referral in full: timeline, care team, sessions, reports, the letter and earnings. */
export const getDoctorReferral = query({
  args: { partnerCode: v.string(), referralId: v.string() },
  handler: async (ctx, args) => {
    const access = await doctorAccess(ctx, args.partnerCode);
    if (!access) return null;
    const { partner } = access;
    const id = ctx.db.normalizeId("inboundReferrals", args.referralId);
    const r = id ? await ctx.db.get(id) : null;
    if (!r || r.partnerId !== partner.code || referralEnv(r) !== "live") return null;

    const emails = await doctorEmails(ctx, partner);
    const row = await referralRow(ctx, partner, r, emails);
    const firstAt = await statusTimes(ctx, r._id);
    const milestoneAt: Record<(typeof DOCTOR_STEPS)[number]["key"], number | null> = {
      received: r.createdAt,
      contacted: r.contactedAt ?? firstAt.get("contacted") ?? null,
      booked: r.bookedAt ?? firstAt.get("booked") ?? null,
      seen: firstAt.get("seen") ?? r.treatmentStartedAt ?? null,
      in_treatment: firstAt.get("in_treatment") ?? null,
      discharged: r.completedAt ?? firstAt.get("discharged") ?? null,
    };
    const ended = isDoctorOutcome(row.stage);
    const timeline = DOCTOR_STEPS.map((step, i) => ({
      key: step.key,
      label: step.label,
      state:
        i < row.stepIndex || (i === row.stepIndex && (ended || row.stage === "discharged"))
          ? ("done" as const)
          : i === row.stepIndex
            ? ("current" as const)
            : ("upcoming" as const),
      at: i <= row.stepIndex ? milestoneAt[step.key] : null,
    }));
    const outcome = isDoctorOutcome(row.stage)
      ? {
          key: row.stage,
          label: DOCTOR_OUTCOMES[row.stage].label,
          detail: DOCTOR_OUTCOMES[row.stage].detail,
          at: r.closedAt ?? firstAt.get(row.stage) ?? r.updatedAt,
        }
      : null;

    const sessions = summarizeSessions(await referralSessions(ctx, r));
    const commissions = r.patientId
      ? await ctx.db
          .query("partnerCommissions")
          .withIndex("by_partner_and_patient", (q) => q.eq("partnerId", partner.code).eq("patientUserId", r.patientId!))
          .take(500)
      : await ctx.db
          .query("partnerCommissions")
          .withIndex("by_referral_id", (q) => q.eq("referralId", r._id))
          .take(500);
    let earnedKobo = 0;
    let awaitingApprovalKobo = 0;
    for (const c of commissions) {
      if (c.partnerId !== partner.code || c.environment === "sandbox") continue;
      const status = publicCommissionStatus(c);
      if (status === "reversed" || status === "cancelled") continue;
      if (status === "pending") awaitingApprovalKobo += c.netPayable;
      else earnedKobo += c.netPayable;
    }

    return {
      ...row,
      patient: {
        firstName: r.patientFirstName,
        lastName: r.patientLastName || null,
        phone: r.patientPhone || null,
        email: r.patientEmail ?? null,
      },
      notes: r.clinicalNotes ?? null,
      letter: r.referralLetterStorageId
        ? { name: r.referralLetterName ?? "Referral letter", url: await ctx.storage.getUrl(r.referralLetterStorageId) }
        : null,
      timeline,
      outcome,
      sessions: {
        completed: sessions.completed,
        upcoming: sessions.upcoming,
        planned: r.recommendedSessions ?? null,
        nextAt: sessions.next_session_at,
        lastAt: sessions.last_session_at,
      },
      reports: await reportsForReferral(ctx, partner, r, emails),
      earnedKobo,
      awaitingApprovalKobo,
      trackingUrl: r.trackingCode ? trackingUrl(r.trackingCode) : null,
    };
  },
});

// ─── Personal referral link ──────────────────────────────────────────────────

function activeLink(links: Doc<"partnerReferralLinks">[]) {
  const now = Date.now();
  return links.find((l) => l.status === "active" && linkEnv(l) === "live" && (!l.expiresAt || l.expiresAt > now)) ?? null;
}

function linkView(link: Doc<"partnerReferralLinks">) {
  return {
    url: referralLinkUrl(link.publicCode),
    publicCode: link.publicCode,
    clicks: link.clicks ?? 0,
    leads: link.leads ?? 0,
    bookings: link.bookings ?? 0,
  };
}

/** The doctor's link to share with patients (WhatsApp, QR). Null link until it's made. */
export const getDoctorShareLink = query({
  args: { partnerCode: v.string() },
  handler: async (ctx, args) => {
    const access = await doctorAccess(ctx, args.partnerCode);
    if (!access) return null;
    const links = await ctx.db
      .query("partnerReferralLinks")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", access.partner.code))
      .order("desc")
      .take(100);
    const link = activeLink(links);
    return { name: access.partner.name, link: link ? linkView(link) : null };
  },
});

/** Makes the doctor's personal referral link the first time they open the portal. */
export const ensureDoctorShareLink = mutation({
  args: { partnerCode: v.string() },
  handler: async (ctx, args) => {
    const { partner, actor } = await requirePartnerAccess(ctx, args.partnerCode, { requireApproved: true, requireProduction: true });
    if (partner.type !== "doctor") throw new ConvexError("Referral links for organisations are made in the Referral links tab.");
    const links = await ctx.db
      .query("partnerReferralLinks")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", partner.code))
      .order("desc")
      .take(100);
    const existing = activeLink(links);
    if (existing) return linkView(existing);

    const now = Date.now();
    const publicCode = await generateLinkPublicCode(ctx, partner.code);
    const linkId = await ctx.db.insert("partnerReferralLinks", {
      partnerId: partner.code,
      publicCode,
      campaignName: "Referral link",
      serviceScope: "all_rehabilitation",
      defaultCareMode: "patient_choice",
      status: "active",
      environment: "live",
      createdBy: actor,
      clicks: 0,
      leads: 0,
      joyStarts: 0,
      signups: 0,
      bookings: 0,
      payments: 0,
      createdAt: now,
      updatedAt: now,
    });
    return linkView((await ctx.db.get(linkId))!);
  },
});
