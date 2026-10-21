/**
 * Rehabify Access: structured reduced-fee care for patients in genuine financial difficulty.
 *
 * A patient applies (signed in, short form, income in bands). The team reviews it against
 * the same checklist every time, and approves within capacity, waitlists or declines.
 * Approval creates an award: chosen services, a number of sessions, and a matched physio who
 * has opted in and whose minimum payout the assisted tariff meets. Rehabify sets the price
 * from the assisted tariff, never per case. The patient then books those services at the
 * Access rate (marketplace/booking.ts), and each paid session uses up one.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ensureUserRole, getAuthenticatedUser } from "./auth";
import { FUNDING_OPTIONS, INCOME_BANDS, SITUATIONS, isOption } from "../lib/rehabify-access";
import { BOOKABLE_SERVICE_IDS, getService, isBookableServiceId } from "../lib/rehabify-services";
import { loadPricingSettings, loadTariffs } from "./helpers/rehabifyPricing";
import { isPhysioNetworkEligible, meetsAccessMinimum } from "./physioSetup";
import { sessionsCommitted } from "./helpers/accessAwards";

const OPEN_STATUSES = new Set(["submitted", "under_review", "waitlisted"]);
const MAX_AWARD_DAYS = 180;

const fullName = (user: Doc<"users"> | null) =>
  user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Unknown" : "Unknown";

async function activeAwardCount(ctx: QueryCtx): Promise<number> {
  const awards = await ctx.db.query("accessAwards").withIndex("by_status", (q) => q.eq("status", "active")).collect();
  const now = Date.now();
  return awards.filter((award) => award.expiresAt > now).length;
}

// ── Patient ────────────────────────────────────────────────────────────────

/** Public: whether applications are open (the form shows a waiting-list note when full). */
export const getAccessStatus = query({
  args: {},
  handler: async (ctx) => {
    const settings = await loadPricingSettings(ctx);
    const active = await activeAwardCount(ctx);
    return { intakeOpen: settings.accessIntakeOpen, placesAvailable: active < settings.accessCapacity };
  },
});

export const submitApplication = mutation({
  args: {
    serviceNeeded: v.string(),
    isCurrentPatient: v.boolean(),
    situation: v.string(),
    incomeBand: v.string(),
    alternativeFunding: v.string(),
    clinicalNeed: v.string(),
    statement: v.optional(v.string()),
    city: v.optional(v.string()),
    area: v.optional(v.string()),
    phone: v.optional(v.string()),
    consent: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "patient") throw new ConvexError("Please apply from a patient account.");
    const settings = await loadPricingSettings(ctx);
    if (!settings.accessIntakeOpen) throw new ConvexError("Rehabify Access isn't taking new applications right now. Please check back soon.");
    if (!args.consent) throw new ConvexError("Please confirm the information is accurate and that we can review it.");
    if (args.serviceNeeded !== "not_sure" && !isBookableServiceId(args.serviceNeeded)) throw new ConvexError("Choose the care you need.");
    if (!isOption(SITUATIONS, args.situation)) throw new ConvexError("Choose what best describes your situation.");
    if (!isOption(INCOME_BANDS, args.incomeBand)) throw new ConvexError("Choose an income range.");
    if (!isOption(FUNDING_OPTIONS, args.alternativeFunding)) throw new ConvexError("Tell us about any other funding.");
    const clinicalNeed = args.clinicalNeed.trim();
    if (clinicalNeed.length < 10) throw new ConvexError("Tell us briefly what you need help with.");

    const existing = await ctx.db
      .query("assistedCareApplications")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .collect();
    if (existing.some((app) => OPEN_STATUSES.has(app.status))) {
      throw new ConvexError("You already have an application with us. We'll be in touch about it.");
    }

    // Applying mid-treatment: link their current Rehabify physio so the team can keep them together
    let currentPhysiotherapistId: Id<"users"> | undefined;
    if (args.isCurrentPatient) {
      const relationship = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient", (q) => q.eq("patientId", user._id))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();
      currentPhysiotherapistId = relationship?.physiotherapistId;
    }

    const now = Date.now();
    const id = await ctx.db.insert("assistedCareApplications", {
      patientId: user._id,
      serviceNeeded: args.serviceNeeded,
      isCurrentPatient: args.isCurrentPatient,
      currentPhysiotherapistId,
      situation: args.situation,
      incomeBand: args.incomeBand,
      alternativeFunding: args.alternativeFunding,
      clinicalNeed: clinicalNeed.slice(0, 1000),
      statement: args.statement?.trim().slice(0, 1000) || undefined,
      city: args.city?.trim().slice(0, 80) || undefined,
      area: args.area?.trim().slice(0, 80) || undefined,
      phone: args.phone?.trim().slice(0, 32) || user.phoneNumber || undefined,
      consentAt: now,
      status: "submitted",
      createdAt: now,
      updatedAt: now,
    });
    return { applicationId: id };
  },
});

/** The patient's latest application and active award, for their dashboard and the Access page. */
export const getMyAccess = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject)).unique();
    if (!user) return null;
    const application = await ctx.db
      .query("assistedCareApplications")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .order("desc")
      .first();
    const awards = await ctx.db.query("accessAwards").withIndex("by_patient", (q) => q.eq("patientId", user._id)).collect();
    const now = Date.now();
    const award = awards.find((a) => a.status === "active" && a.expiresAt > now) ?? null;
    if (!application && !award) return { application: null, award: null };

    let awardView = null;
    if (award) {
      const physio = await ctx.db.get(award.physiotherapistId);
      const { tariffs } = await loadTariffs(ctx);
      awardView = {
        id: award._id,
        physiotherapistId: award.physiotherapistId,
        physiotherapistName: fullName(physio),
        sessionsGranted: award.sessionsGranted,
        sessionsLeft: Math.max(0, award.sessionsGranted - (await sessionsCommitted(ctx, award))),
        expiresAt: award.expiresAt,
        services: award.serviceIds.filter(isBookableServiceId).map((id) => ({
          id,
          name: getService(id)?.name ?? id,
          assistedPriceKobo: tariffs[id].assistedPriceKobo ?? null,
          standardPriceKobo: tariffs[id].priceKobo,
        })),
      };
    }
    return {
      application: application
        ? { id: application._id, status: application.status, createdAt: application.createdAt, decisionReason: application.decisionReason ?? null }
        : null,
      award: awardView,
    };
  },
});

export const withdrawApplication = mutation({
  args: { applicationId: v.id("assistedCareApplications") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const application = await ctx.db.get(args.applicationId);
    if (!application || application.patientId !== user._id) throw new ConvexError("Application not found.");
    if (!OPEN_STATUSES.has(application.status)) throw new ConvexError("This application has already been decided.");
    await ctx.db.patch(application._id, { status: "withdrawn", updatedAt: Date.now() });
    return { success: true };
  },
});

// ── Admin ──────────────────────────────────────────────────────────────────

export const adminListApplications = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const rows = args.status
      ? await ctx.db
          .query("assistedCareApplications")
          .withIndex("by_status", (q) => q.eq("status", args.status as Doc<"assistedCareApplications">["status"]))
          .order("desc")
          .take(200)
      : await ctx.db.query("assistedCareApplications").order("desc").take(200);
    const settings = await loadPricingSettings(ctx);
    const active = await activeAwardCount(ctx);
    const applications = await Promise.all(
      rows.map(async (app) => {
        const patient = await ctx.db.get(app.patientId);
        const physio = app.currentPhysiotherapistId ? await ctx.db.get(app.currentPhysiotherapistId) : null;
        const award = app.awardId ? await ctx.db.get(app.awardId) : null;
        return {
          ...app,
          patientName: fullName(patient),
          patientEmail: patient?.email ?? null,
          patientNumber: (patient as { patientNumber?: string } | null)?.patientNumber ?? null,
          currentPhysiotherapistName: physio ? fullName(physio) : null,
          award: award
            ? {
                id: award._id,
                status: award.status,
                sessionsGranted: award.sessionsGranted,
                sessionsUsed: award.sessionsUsed,
                expiresAt: award.expiresAt,
                reassessAt: award.reassessAt ?? null,
                serviceIds: award.serviceIds,
                serviceNames: award.serviceIds.map((id) => getService(id)?.name ?? id),
                physiotherapistId: award.physiotherapistId,
                physiotherapistName: fullName(await ctx.db.get(award.physiotherapistId)),
              }
            : null,
        };
      })
    );
    // Counts per status from the index, so tab badges stay right beyond the 200 rows listed
    const statuses = ["submitted", "under_review", "approved", "declined", "waitlisted", "withdrawn"] as const;
    const statusCounts: Record<string, number> = {};
    for (const status of statuses) {
      statusCounts[status] = (
        await ctx.db.query("assistedCareApplications").withIndex("by_status", (q) => q.eq("status", status)).take(1000)
      ).length;
    }
    return {
      applications,
      capacity: settings.accessCapacity,
      activeAwards: active,
      intakeOpen: settings.accessIntakeOpen,
      openCount: statusCounts.submitted + statusCounts.under_review,
      statusCounts,
    };
  },
});

/** Physios who can take this Access case: opted in, minimum met, and offering the services. */
export const adminEligiblePhysios = query({
  args: { serviceIds: v.array(v.string()), zoneId: v.optional(v.id("travelZones")) },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const { tariffs } = await loadTariffs(ctx);
    const serviceIds = args.serviceIds.filter(isBookableServiceId);
    const profiles = await ctx.db.query("physiotherapistProfiles").collect();
    const optedIn = profiles.filter((profile) => !profile.clinicId && profile.networkTerms?.accessOptIn);
    const results = [];
    for (const profile of optedIn) {
      let ok = serviceIds.length > 0;
      for (const serviceId of serviceIds) {
        const payout = tariffs[serviceId].assistedPayoutKobo;
        if (payout === undefined || !meetsAccessMinimum(profile, serviceId, payout)) {
          ok = false;
          break;
        }
        const zoneId = getService(serviceId)?.mode === "home" ? args.zoneId ?? null : null;
        if (!(await isPhysioNetworkEligible(ctx, profile.userId, { serviceId, zoneId, access: { payoutKobo: payout } }))) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const user = await ctx.db.get(profile.userId);
      const activeCases = (await ctx.db.query("accessAwards").withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", profile.userId)).collect())
        .filter((award) => award.status === "active").length;
      results.push({
        userId: profile.userId,
        name: fullName(user),
        specializations: profile.specializations ?? [],
        yearsOfExperience: profile.yearsOfExperience ?? null,
        location: profile.location ?? null,
        activeAccessCases: activeCases,
      });
    }
    return results.sort((a, b) => a.activeAccessCases - b.activeAccessCases);
  },
});

const checklist = v.object({
  identityVerified: v.boolean(),
  financialNeedConfirmed: v.boolean(),
  clinicalNeedConfirmed: v.boolean(),
  alternativesExplored: v.boolean(),
});

export const adminStartReview = mutation({
  args: { applicationId: v.id("assistedCareApplications") },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new ConvexError("Application not found.");
    if (application.status === "submitted" || application.status === "waitlisted") {
      await ctx.db.patch(application._id, { status: "under_review", reviewedBy: admin._id, updatedAt: Date.now() });
    }
    return { success: true };
  },
});

export const adminApprove = mutation({
  args: {
    applicationId: v.id("assistedCareApplications"),
    physiotherapistId: v.id("users"),
    serviceIds: v.array(v.string()),
    sessionsGranted: v.number(),
    validForDays: v.number(),
    reassessAfterDays: v.optional(v.number()),
    zoneId: v.optional(v.id("travelZones")),
    checklist,
    reviewNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new ConvexError("Application not found.");
    if (application.status === "approved") throw new ConvexError("This application is already approved.");
    if (application.status === "withdrawn") throw new ConvexError("The patient withdrew this application.");
    if (!Object.values(args.checklist).every(Boolean)) {
      throw new ConvexError("Complete every review check before approving, so every decision follows the same criteria.");
    }
    if (!Number.isInteger(args.sessionsGranted) || args.sessionsGranted < 1 || args.sessionsGranted > 24) {
      throw new ConvexError("Sessions must be between 1 and 24.");
    }
    if (!Number.isInteger(args.validForDays) || args.validForDays < 7 || args.validForDays > MAX_AWARD_DAYS) {
      throw new ConvexError(`The arrangement must last between 7 and ${MAX_AWARD_DAYS} days.`);
    }
    const serviceIds = [...new Set(args.serviceIds)];
    if (serviceIds.length === 0 || !serviceIds.every(isBookableServiceId)) throw new ConvexError("Choose the services this covers.");

    const settings = await loadPricingSettings(ctx);
    if ((await activeAwardCount(ctx)) >= settings.accessCapacity) {
      throw new ConvexError("All Rehabify Access places are in use. Add the applicant to the waiting list, or raise capacity.");
    }

    const { tariffs } = await loadTariffs(ctx);
    for (const serviceId of serviceIds) {
      const tariff = tariffs[serviceId];
      if (tariff.assistedPriceKobo === undefined || tariff.assistedPayoutKobo === undefined) {
        throw new ConvexError(`${getService(serviceId)?.name} has no Access rate yet. Set one in Admin › Pricing.`);
      }
      const zoneId = getService(serviceId)?.mode === "home" ? args.zoneId ?? null : null;
      const eligible = await isPhysioNetworkEligible(ctx, args.physiotherapistId, {
        serviceId,
        zoneId,
        access: { payoutKobo: tariff.assistedPayoutKobo },
      });
      if (!eligible) {
        throw new ConvexError(`That physiotherapist can't take ${getService(serviceId)?.name} at the Access rate (not opted in, minimum not met, or area not covered).`);
      }
    }

    const now = Date.now();
    const awardId = await ctx.db.insert("accessAwards", {
      applicationId: application._id,
      patientId: application.patientId,
      physiotherapistId: args.physiotherapistId,
      serviceIds,
      sessionsGranted: args.sessionsGranted,
      sessionsUsed: 0,
      status: "active",
      startsAt: now,
      expiresAt: now + args.validForDays * 86_400_000,
      reassessAt: args.reassessAfterDays ? now + args.reassessAfterDays * 86_400_000 : undefined,
      approvedBy: admin._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(application._id, {
      status: "approved",
      reviewChecklist: args.checklist,
      reviewNotes: args.reviewNotes?.trim().slice(0, 2000) || undefined,
      reviewedBy: admin._id,
      reviewedAt: now,
      awardId,
      updatedAt: now,
    });
    await ctx.db.insert("notifications", {
      userId: application.patientId,
      type: "system_message",
      priority: "high",
      status: "pending",
      payload: {
        title: "Rehabify Access approved",
        body: `You can book ${args.sessionsGranted} session${args.sessionsGranted === 1 ? "" : "s"} at your Rehabify Access rate.`,
        data: { entityType: "access_award", entityId: awardId, actionUrl: "/dashboard/patient" },
      },
      createdAt: now,
    });
    return { awardId };
  },
});

export const adminDecide = mutation({
  args: {
    applicationId: v.id("assistedCareApplications"),
    decision: v.union(v.literal("declined"), v.literal("waitlisted")),
    reason: v.optional(v.string()),
    checklist: v.optional(checklist),
    reviewNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new ConvexError("Application not found.");
    if (application.status === "approved") throw new ConvexError("This application is already approved. End the arrangement instead.");
    if (args.decision === "declined" && !args.reason?.trim()) throw new ConvexError("Give the reason for the decision.");
    await ctx.db.patch(application._id, {
      status: args.decision,
      decisionReason: args.reason?.trim().slice(0, 500) || undefined,
      reviewChecklist: args.checklist,
      reviewNotes: args.reviewNotes?.trim().slice(0, 2000) || undefined,
      reviewedBy: admin._id,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

/** Reassessment: extend or top up an award, or end it. */
export const adminUpdateAward = mutation({
  args: {
    awardId: v.id("accessAwards"),
    action: v.union(v.literal("extend"), v.literal("end")),
    extraSessions: v.optional(v.number()),
    extraDays: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const award = await ctx.db.get(args.awardId);
    if (!award) throw new ConvexError("Arrangement not found.");
    const now = Date.now();
    if (args.action === "end") {
      await ctx.db.patch(award._id, { status: "revoked", note: args.note?.trim().slice(0, 500) || award.note, updatedAt: now });
      return { success: true };
    }
    const extraSessions = args.extraSessions ?? 0;
    const extraDays = args.extraDays ?? 0;
    if (!Number.isInteger(extraSessions) || extraSessions < 0 || extraSessions > 24) throw new ConvexError("Add between 0 and 24 sessions.");
    if (!Number.isInteger(extraDays) || extraDays < 0 || extraDays > MAX_AWARD_DAYS) throw new ConvexError(`Extend by up to ${MAX_AWARD_DAYS} days.`);
    const expiresAt = Math.max(award.expiresAt, now) + extraDays * 86_400_000;
    await ctx.db.patch(award._id, {
      sessionsGranted: award.sessionsGranted + extraSessions,
      expiresAt,
      status: award.sessionsUsed < award.sessionsGranted + extraSessions && expiresAt > now ? "active" : award.status,
      note: args.note?.trim().slice(0, 500) || award.note,
      updatedAt: now,
    });
    return { success: true };
  },
});

/** For the review drawer: the assisted tariff per service. */
export const adminAccessTariffs = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const { tariffs } = await loadTariffs(ctx);
    return BOOKABLE_SERVICE_IDS.map((id) => ({
      id,
      name: getService(id)?.name ?? id,
      mode: getService(id)?.mode ?? "virtual",
      priceKobo: tariffs[id].priceKobo,
      assistedPriceKobo: tariffs[id].assistedPriceKobo ?? null,
      assistedPayoutKobo: tariffs[id].assistedPayoutKobo ?? null,
    }));
  },
});
