/**
 * Internal functions behind the partner REST API (app/api/v1/**).
 *
 * None of these are public: they are reachable only through the HMAC-signed partner
 * gateway (convex/partnerGateway.ts) after the Next.js layer has authenticated the
 * API key. Each takes the authenticated partner code + environment explicitly and
 * scopes every read and write to exactly that partner and environment.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  type PartnerEnv,
  type PublicReferralStatus,
  PUBLIC_REFERRAL_STATUSES,
  findPartnerReferral,
  hasProductionAccess,
  isPartnerApproved,
  iso,
  referralEnv,
  referralLinkUrl,
  referralSessions,
  serializeReferral,
  generateLinkPublicCode,
  toPublicStatus,
  webhookTargetFor,
} from "./helpers/partnerShared";
import {
  buildReport,
  createReferralCore,
  referralLinkView,
  sandboxAdvanceCore,
  submitLeadCore,
  type SandboxStep,
} from "./helpers/partnerReferralCore";
import { enqueuePartnerEvent, isWebhookEventType, sampleReferralView } from "./helpers/partnerEvents";
import { publicCommissionStatus } from "./helpers/partnerLedger";
import { DEFAULT_REVENUE_SETTINGS } from "./platformSettings";

const envV = v.union(v.literal("sandbox"), v.literal("live"));
const notFound = { ok: false as const, status: 404, code: "referral_not_found", message: "No referral with that id, tracking code or partner_reference exists in this environment." };

// ─── Authentication ──────────────────────────────────────────────────────────

export const authenticate = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, { keyHash }) => {
    if (!/^[a-f0-9]{64}$/.test(keyHash)) return { ok: false as const, code: "invalid_api_key" };
    const key = await ctx.db
      .query("partnerApiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", keyHash))
      .first();
    if (!key || key.status !== "active" || (key.expiresAt && key.expiresAt <= Date.now())) {
      return { ok: false as const, code: "invalid_api_key" };
    }
    const partner = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", key.partnerId))
      .first();
    if (!partner) return { ok: false as const, code: "invalid_api_key" };
    if (!isPartnerApproved(partner)) return { ok: false as const, code: "partner_inactive" };
    if (key.environment === "live" && !hasProductionAccess(partner)) {
      return { ok: false as const, code: "production_access_required" };
    }
    return {
      ok: true as const,
      partnerCode: partner.code,
      partnerName: partner.name,
      partnerType: partner.type,
      tier: partner.tier,
      environment: key.environment,
      keyId: key._id,
      keyPrefix: key.keyPrefix,
      lastUsedAt: key.lastUsedAt ?? null,
    };
  },
});

export const touchApiKey = internalMutation({
  args: { keyId: v.id("partnerApiKeys") },
  handler: async (ctx, { keyId }) => {
    const key = await ctx.db.get(keyId);
    if (!key) return;
    const now = Date.now();
    if (!key.lastUsedAt || key.lastUsedAt < now - 60_000) await ctx.db.patch(keyId, { lastUsedAt: now });
  },
});

export const logApiRequest = internalMutation({
  args: {
    partnerCode: v.string(),
    environment: envV,
    method: v.string(),
    path: v.string(),
    statusCode: v.number(),
    latencyMs: v.number(),
    requestId: v.string(),
    errorCode: v.optional(v.string()),
    trackingCode: v.optional(v.string()),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("partnerActivityLogs", {
      partnerId: args.partnerCode,
      environment: args.environment,
      eventId: args.requestId,
      eventType: args.eventType,
      direction: "inbound",
      url: args.path.slice(0, 300),
      method: args.method,
      statusCode: args.statusCode,
      latencyMs: Math.max(0, Math.round(args.latencyMs)),
      status: args.statusCode < 400 ? "success" : "error",
      requestId: args.requestId,
      trackingCode: args.trackingCode,
      errorMessage: args.errorCode,
      occurredAt: Date.now(),
    });
  },
});

// ─── Idempotency ─────────────────────────────────────────────────────────────

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const IN_PROGRESS_STALE_MS = 60_000;

export const idempotencyBegin = internalMutation({
  args: { partnerCode: v.string(), environment: envV, key: v.string(), route: v.string(), requestHash: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("partnerIdempotencyKeys")
      .withIndex("by_partner_env_key", (q) => q.eq("partnerId", args.partnerCode).eq("environment", args.environment).eq("key", args.key))
      .first();
    if (existing && existing.expiresAt > now) {
      if (existing.route !== args.route || existing.requestHash !== args.requestHash) return { state: "mismatch" as const };
      if (existing.status === "completed") {
        return { state: "replay" as const, status: existing.responseStatus ?? 200, body: existing.responseBody ?? "{}" };
      }
      if (existing.createdAt > now - IN_PROGRESS_STALE_MS) return { state: "in_progress" as const };
      await ctx.db.patch(existing._id, { createdAt: now });
      return { state: "new" as const };
    }
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("partnerIdempotencyKeys", {
      partnerId: args.partnerCode,
      environment: args.environment,
      key: args.key,
      route: args.route,
      requestHash: args.requestHash,
      status: "in_progress",
      createdAt: now,
      expiresAt: now + IDEMPOTENCY_TTL_MS,
    });
    return { state: "new" as const };
  },
});

export const idempotencyComplete = internalMutation({
  args: { partnerCode: v.string(), environment: envV, key: v.string(), responseStatus: v.number(), responseBody: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("partnerIdempotencyKeys")
      .withIndex("by_partner_env_key", (q) => q.eq("partnerId", args.partnerCode).eq("environment", args.environment).eq("key", args.key))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, { status: "completed", responseStatus: args.responseStatus, responseBody: args.responseBody.slice(0, 500_000) });
  },
});

export const idempotencyRelease = internalMutation({
  args: { partnerCode: v.string(), environment: envV, key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("partnerIdempotencyKeys")
      .withIndex("by_partner_env_key", (q) => q.eq("partnerId", args.partnerCode).eq("environment", args.environment).eq("key", args.key))
      .first();
    if (row && row.status === "in_progress") await ctx.db.delete(row._id);
  },
});

/** Cron: drop expired idempotency keys and gateway nonces. */
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const keys = await ctx.db
      .query("partnerIdempotencyKeys")
      .withIndex("by_expires", (q) => q.lte("expiresAt", now))
      .take(500);
    for (const row of keys) await ctx.db.delete(row._id);
    const nonces = await ctx.db
      .query("partnerGatewayNonces")
      .withIndex("by_expires", (q) => q.lte("expiresAt", now))
      .take(500);
    for (const row of nonces) await ctx.db.delete(row._id);
    return { keys: keys.length, nonces: nonces.length };
  },
});

// ─── Referrals ───────────────────────────────────────────────────────────────

const referralInputV = v.object({
  partnerReference: v.optional(v.string()),
  patient: v.object({
    firstName: v.string(),
    lastName: v.optional(v.string()),
    phone: v.string(),
    email: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    area: v.optional(v.string()),
    preferredLanguage: v.optional(v.string()),
  }),
  clinical: v.object({
    condition: v.optional(v.string()),
    notes: v.optional(v.string()),
    priority: v.optional(v.string()),
    recommendedSessions: v.optional(v.number()),
    referringClinician: v.optional(v.string()),
  }),
  care: v.object({ preferredMode: v.optional(v.string()), preferredContactChannel: v.optional(v.string()) }),
  billingMode: v.optional(v.string()),
  consent: v.object({
    granted: v.boolean(),
    method: v.optional(v.string()),
    capturedAt: v.optional(v.number()),
    privacyNoticeVersion: v.optional(v.string()),
  }),
  metadata: v.optional(v.record(v.string(), v.string())),
});

export const createReferral = internalMutation({
  args: { partnerCode: v.string(), environment: envV, input: referralInputV },
  handler: async (ctx, args) => createReferralCore(ctx, { ...args, source: "api" }),
});

function internalStatusesFor(status: PublicReferralStatus): Doc<"inboundReferrals">["status"][] {
  const all: Doc<"inboundReferrals">["status"][] = [
    "received", "consent_pending", "contacted", "intake_started", "intake_completed", "qualified", "redirected_for_safety",
    "booked", "attended", "treatment_active", "completed", "cancelled", "not_suitable", "refunded", "closed",
    "pending", "in_treatment", "paid_out",
  ];
  return all.filter((s) => toPublicStatus(s) === status);
}

export const listReferrals = internalQuery({
  args: {
    partnerCode: v.string(),
    environment: envV,
    limit: v.number(),
    cursor: v.optional(v.string()),
    status: v.optional(v.string()),
    partnerReference: v.optional(v.string()),
    createdAfter: v.optional(v.number()),
    createdBefore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), 100);
    if (args.partnerReference) {
      const match = await findPartnerReferral(ctx, args.partnerCode, args.environment, args.partnerReference);
      const ok = match && match.partnerExternalId === args.partnerReference ? [match] : [];
      return {
        ok: true as const,
        data: await Promise.all(ok.map((r) => serializeReferral(ctx, r, { includePatient: true }))),
        hasMore: false,
        nextCursor: null,
      };
    }
    const statuses = args.status ? internalStatusesFor(args.status as PublicReferralStatus) : null;
    let query = ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_and_environment", (q) => {
        const base = q.eq("partnerId", args.partnerCode).eq("environment", args.environment);
        if (args.createdAfter !== undefined && args.createdBefore !== undefined) {
          return base.gt("_creationTime", args.createdAfter).lt("_creationTime", args.createdBefore);
        }
        if (args.createdAfter !== undefined) return base.gt("_creationTime", args.createdAfter);
        if (args.createdBefore !== undefined) return base.lt("_creationTime", args.createdBefore);
        return base;
      })
      .order("desc");
    if (statuses && statuses.length > 0) {
      query = query.filter((q) => q.or(...statuses.map((s) => q.eq(q.field("status"), s))));
    }
    let page;
    try {
      page = await query.paginate({ numItems: limit, cursor: args.cursor ?? null });
    } catch {
      return { ok: false as const, status: 400, code: "invalid_parameter", message: "cursor is invalid or expired.", param: "cursor" };
    }
    return {
      ok: true as const,
      data: await Promise.all(page.page.map((r) => serializeReferral(ctx, r, { includePatient: true }))),
      hasMore: !page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

export const getReferral = internalQuery({
  args: { partnerCode: v.string(), environment: envV, identifier: v.string() },
  handler: async (ctx, args) => {
    const referral = await findPartnerReferral(ctx, args.partnerCode, args.environment, args.identifier);
    if (!referral) return notFound;
    return { ok: true as const, referral: await serializeReferral(ctx, referral, { includePatient: true }) };
  },
});

// ─── Sessions & reports ──────────────────────────────────────────────────────

export const listSessions = internalQuery({
  args: {
    partnerCode: v.string(),
    environment: envV,
    referralIdentifier: v.optional(v.string()),
    status: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), 100);
    let referrals: Doc<"inboundReferrals">[] = [];
    if (args.referralIdentifier) {
      const referral = await findPartnerReferral(ctx, args.partnerCode, args.environment, args.referralIdentifier);
      if (!referral) return notFound;
      referrals = [referral];
    } else {
      const recent = await ctx.db
        .query("inboundReferrals")
        .withIndex("by_partner_and_environment", (q) => q.eq("partnerId", args.partnerCode).eq("environment", args.environment))
        .order("desc")
        .take(300);
      referrals = recent.filter((r) => (args.environment === "sandbox" ? Boolean(r.sandboxProviderAssigned || r.bookedAt) : Boolean(r.patientId)));
    }
    const sessions = [];
    for (const referral of referrals.slice(0, 150)) {
      for (const session of await referralSessions(ctx, referral)) {
        const start = session.scheduled_start ? Date.parse(session.scheduled_start) : 0;
        if (args.status && session.status !== args.status) continue;
        if (args.from !== undefined && start < args.from) continue;
        if (args.to !== undefined && start > args.to) continue;
        sessions.push(session);
      }
    }
    sessions.sort((a, b) => (Date.parse(b.scheduled_start ?? "") || 0) - (Date.parse(a.scheduled_start ?? "") || 0));
    return { ok: true as const, data: sessions.slice(0, limit), hasMore: sessions.length > limit, nextCursor: null };
  },
});

export const getReport = internalQuery({
  args: { partnerCode: v.string(), environment: envV, identifier: v.string() },
  handler: async (ctx, args) => {
    const referral = await findPartnerReferral(ctx, args.partnerCode, args.environment, args.identifier);
    if (!referral) return notFound;
    return { ok: true as const, report: await buildReport(ctx, referral) };
  },
});

// ─── Provider directory ──────────────────────────────────────────────────────

export const listProviders = internalQuery({
  args: {
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    specialty: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("virtual"), v.literal("in_person"))),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), 100);
    const profiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_marketplace_availability", (q) => q.eq("isAvailableOnMarketplace", true))
      .collect();
    const lower = (s?: string) => s?.trim().toLowerCase() ?? "";
    const results = [];
    for (const profile of profiles) {
      const location = profile.location ?? "";
      if (args.city && !lower(location).includes(lower(args.city))) continue;
      if (args.state && !lower(location).includes(lower(args.state))) continue;
      if (args.specialty && !(profile.specializations ?? []).some((s) => lower(s).includes(lower(args.specialty)))) continue;
      const modes: Array<"virtual" | "in_person"> = [];
      if (profile.offersOnlineSessions) modes.push("virtual");
      if (profile.offersInPersonSessions) modes.push("in_person");
      if (args.mode && !modes.includes(args.mode)) continue;
      const approval = await ctx.db
        .query("accountApprovalStatus")
        .withIndex("by_user_id", (q) => q.eq("userId", profile.userId))
        .first();
      if (approval?.status !== "approved") continue;
      const user = await ctx.db.get(profile.userId);
      if (!user) continue;
      results.push({
        object: "provider",
        id: profile._id,
        name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Physiotherapist",
        title: "Physiotherapist",
        license_number: profile.licenseNumber || null,
        city: location || null,
        years_of_experience: profile.yearsOfExperience ?? null,
        rating: typeof profile.averageRating === "number" && (profile.reviewCount ?? 0) > 0 ? Math.round(profile.averageRating * 10) / 10 : null,
        review_count: profile.reviewCount ?? 0,
        specializations: profile.specializations ?? [],
        modes,
      });
    }
    results.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.review_count - a.review_count);
    return { ok: true as const, data: results.slice(0, limit), hasMore: results.length > limit, nextCursor: null };
  },
});

// ─── Referral links ──────────────────────────────────────────────────────────

async function linksFor(ctx: Parameters<typeof findPartnerReferral>[0], partnerCode: string, env: PartnerEnv) {
  const rows = await ctx.db
    .query("partnerReferralLinks")
    .withIndex("by_partner_env", (q) => q.eq("partnerId", partnerCode).eq("environment", env))
    .collect();
  if (env === "live") {
    const legacy = await ctx.db
      .query("partnerReferralLinks")
      .withIndex("by_partner_env", (q) => q.eq("partnerId", partnerCode).eq("environment", undefined))
      .collect();
    rows.push(...legacy);
  }
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export const createReferralLink = internalMutation({
  args: {
    partnerCode: v.string(),
    environment: envV,
    campaignName: v.optional(v.string()),
    serviceScope: v.optional(v.string()),
    defaultCareMode: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const partner = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", args.partnerCode))
      .first();
    if (!partner) return { ok: false as const, status: 403, code: "partner_inactive", message: "Partner not found." };
    const now = Date.now();
    if (args.expiresAt !== undefined && args.expiresAt <= now) {
      return { ok: false as const, status: 422, code: "validation_error", message: "expires_at must be in the future.", param: "expires_at" };
    }
    const publicCode = await generateLinkPublicCode(ctx, partner.code);
    const careMode = args.defaultCareMode === "in_person" ? "face_to_face" : args.defaultCareMode === "remote" ? "remote" : "patient_choice";
    const linkId = await ctx.db.insert("partnerReferralLinks", {
      partnerId: partner.code,
      publicCode,
      campaignName: args.campaignName?.trim() || undefined,
      serviceScope: args.serviceScope?.trim() || "all_rehabilitation",
      defaultCareMode: careMode,
      status: "active",
      expiresAt: args.expiresAt,
      environment: args.environment,
      createdBy: args.createdBy,
      clicks: 0,
      leads: 0,
      joyStarts: 0,
      signups: 0,
      bookings: 0,
      payments: 0,
      createdAt: now,
      updatedAt: now,
    });
    const link = await ctx.db.get(linkId);
    return { ok: true as const, link: referralLinkView(link!, referralLinkUrl(publicCode)) };
  },
});

export const listReferralLinks = internalQuery({
  args: { partnerCode: v.string(), environment: envV, limit: v.number(), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), 100);
    const offset = args.cursor ? Number.parseInt(args.cursor, 10) : 0;
    if (!Number.isFinite(offset) || offset < 0) {
      return { ok: false as const, status: 400, code: "invalid_parameter", message: "cursor is invalid.", param: "cursor" };
    }
    const links = await linksFor(ctx, args.partnerCode, args.environment);
    const page = links.slice(offset, offset + limit);
    const hasMore = offset + limit < links.length;
    return {
      ok: true as const,
      data: page.map((l) => referralLinkView(l, referralLinkUrl(l.publicCode))),
      hasMore,
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  },
});

export const updateReferralLinkStatus = internalMutation({
  args: { partnerCode: v.string(), environment: envV, linkId: v.string(), status: v.union(v.literal("active"), v.literal("inactive")) },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("partnerReferralLinks", args.linkId);
    const link = id ? await ctx.db.get(id) : null;
    if (!link || link.partnerId !== args.partnerCode || (link.environment ?? "live") !== args.environment) {
      return { ok: false as const, status: 404, code: "referral_link_not_found", message: "Referral link not found." };
    }
    await ctx.db.patch(link._id, { status: args.status, updatedAt: Date.now() });
    const fresh = await ctx.db.get(link._id);
    return { ok: true as const, link: referralLinkView(fresh!, referralLinkUrl(fresh!.publicCode)) };
  },
});

// ─── Commercial terms & commissions ──────────────────────────────────────────

export const getCommercial = internalQuery({
  args: { partnerCode: v.string(), environment: envV },
  handler: async (ctx, args) => {
    const now = Date.now();
    const contracts = await ctx.db
      .query("partnerContracts")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerCode))
      .collect();
    const contract = contracts
      .filter((c) => c.status === "active" && c.effectiveFrom <= now && (!c.effectiveTo || c.effectiveTo > now))
      .sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0];
    const settings = (await ctx.db.query("platformRevenueSettings").order("desc").first()) ?? DEFAULT_REVENUE_SETTINGS;

    const contractView = contract
      ? {
          contract_number: contract.contractNumber,
          model: contract.modelType,
          revenue_share_percent: contract.revenueSharePercent ?? null,
          base_fee_per_booking_kobo: contract.baseFeePerBooking ?? null,
          activation_bonus_kobo: contract.activationBonusPerPatient ?? null,
          withholding_tax_percent: contract.withholdingTaxPercent ?? 0,
          payment_terms_days: contract.paymentTermsDays,
          currency: contract.payoutCurrency || "NGN",
          effective_from: iso(contract.effectiveFrom),
          is_default: false,
        }
      : {
          contract_number: null,
          model: "percentage_revenue_share",
          revenue_share_percent: settings.partnerPercent,
          base_fee_per_booking_kobo: null,
          activation_bonus_kobo: null,
          withholding_tax_percent: 0,
          payment_terms_days: 30,
          currency: "NGN",
          effective_from: null,
          is_default: true,
        };

    const earnings = { earned_kobo: 0, pending_payout_kobo: 0, paid_out_kobo: 0, reversed_kobo: 0, currency: "NGN" };
    if (args.environment === "live") {
      const rows = await ctx.db
        .query("partnerCommissions")
        .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerCode))
        .collect();
      for (const c of rows) {
        if (c.environment === "sandbox") continue;
        const status = publicCommissionStatus(c);
        if (status === "reversed" || status === "cancelled") {
          earnings.reversed_kobo += Math.abs(c.netPayable);
          continue;
        }
        earnings.earned_kobo += c.netPayable;
        if (status === "paid") earnings.paid_out_kobo += c.netPayable;
        else earnings.pending_payout_kobo += c.netPayable;
      }
    }
    return { ok: true as const, terms: { object: "commercial_terms", contract: contractView, earnings } };
  },
});

export const listCommissions = internalQuery({
  args: {
    partnerCode: v.string(),
    environment: envV,
    status: v.optional(v.string()),
    billingPeriod: v.optional(v.string()),
    limit: v.number(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.environment !== "live") return { ok: true as const, data: [], hasMore: false, nextCursor: null };
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), 100);
    let page;
    try {
      const base = args.billingPeriod
        ? ctx.db
            .query("partnerCommissions")
            .withIndex("by_partner_and_period", (q) => q.eq("partnerId", args.partnerCode).eq("billingPeriod", args.billingPeriod))
        : ctx.db.query("partnerCommissions").withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerCode));
      page = await base.order("desc").paginate({ numItems: args.status ? 200 : limit, cursor: args.cursor ?? null });
    } catch {
      return { ok: false as const, status: 400, code: "invalid_parameter", message: "cursor is invalid or expired.", param: "cursor" };
    }
    const rows = page.page
      .filter((c) => c.environment !== "sandbox")
      .filter((c) => !args.status || publicCommissionStatus(c) === args.status)
      .slice(0, limit)
      .map((c) => ({
        object: "commission",
        id: c._id,
        referral_id: c.referralId ?? null,
        tracking_code: c.trackingCode ?? null,
        event_type: c.eventType === "refund_adjustment" ? "refund_adjustment" : "payment",
        gross_amount_kobo: c.grossTransactionAmount,
        commission_amount_kobo: c.commissionAmount,
        net_payable_kobo: c.netPayable,
        currency: "NGN",
        status: publicCommissionStatus(c),
        billing_period: c.billingPeriod ?? null,
        earned_at: iso(c.earnedAt),
        paid_at: iso(c.paidAt ?? c.settledAt),
      }));
    return { ok: true as const, data: rows, hasMore: !page.isDone, nextCursor: page.isDone ? null : page.continueCursor };
  },
});

// ─── Sandbox ─────────────────────────────────────────────────────────────────

const sandboxStepV = v.union(
  v.literal("contacted"),
  v.literal("provider_matched"),
  v.literal("booked"),
  v.literal("in_treatment"),
  v.literal("completed"),
  v.literal("not_suitable"),
  v.literal("cancelled"),
  v.literal("closed")
);

/** Scheduled by createReferralCore for the magic sandbox phone numbers. */
export const sandboxScenarioStep = internalMutation({
  args: { referralId: v.id("inboundReferrals"), step: sandboxStepV },
  handler: async (ctx, args) => {
    const referral = await ctx.db.get(args.referralId);
    if (!referral || referralEnv(referral) !== "sandbox") return;
    const current = toPublicStatus(referral.status);
    if (args.step !== "provider_matched" && (current === args.step || !PUBLIC_REFERRAL_STATUSES.includes(args.step as PublicReferralStatus))) return;
    await sandboxAdvanceCore(ctx, referral, args.step as SandboxStep, "sandbox_scenario");
  },
});

export const sandboxAdvanceReferral = internalMutation({
  args: { partnerCode: v.string(), identifier: v.string(), status: sandboxStepV },
  handler: async (ctx, args) => {
    const referral = await findPartnerReferral(ctx, args.partnerCode, "sandbox", args.identifier);
    if (!referral) return notFound;
    const result = await sandboxAdvanceCore(ctx, referral, args.status as SandboxStep, `api:${args.partnerCode}`);
    if (!result.ok) return result;
    const fresh = await ctx.db.get(referral._id);
    return { ok: true as const, referral: await serializeReferral(ctx, fresh!, { includePatient: true }) };
  },
});

export const sandboxTriggerWebhook = internalMutation({
  args: { partnerCode: v.string(), type: v.string(), referralIdentifier: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!isWebhookEventType(args.type)) {
      return { ok: false as const, status: 422, code: "validation_error", message: `type must be one of the documented event types or "ping".`, param: "type" };
    }
    const partner = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", args.partnerCode))
      .first();
    if (!partner) return { ok: false as const, status: 403, code: "partner_inactive", message: "Partner not found." };
    const target = webhookTargetFor(partner, "sandbox");
    if (!target.url || !target.secret) {
      return {
        ok: false as const,
        status: 409,
        code: "webhook_endpoint_not_configured",
        message: "Configure your sandbox webhook endpoint in the Partner Portal first.",
      };
    }
    let referralView: Record<string, unknown> = sampleReferralView("sandbox");
    let referralId: Doc<"inboundReferrals">["_id"] | undefined;
    if (args.referralIdentifier) {
      const referral = await findPartnerReferral(ctx, partner.code, "sandbox", args.referralIdentifier);
      if (!referral) return notFound;
      referralView = await serializeReferral(ctx, referral, { includePatient: false });
      referralId = referral._id;
    }
    const data =
      args.type === "ping"
        ? { message: "Test event from Rehabify", referral: referralView }
        : { previous_status: null, sequence: 0, test: true, referral: referralView };
    const queued = await enqueuePartnerEvent(ctx, {
      partnerCode: partner.code,
      environment: "sandbox",
      type: args.type,
      data,
      referralId,
      trackingCode: typeof referralView.tracking_code === "string" ? referralView.tracking_code : undefined,
    });
    return {
      ok: true as const,
      result: { object: "webhook_test", event_id: queued?.eventId ?? null, type: args.type, status: "queued", endpoint: target.url },
    };
  },
});

// ─── Public: no-code referral links ──────────────────────────────────────────

export const submitLead = internalMutation({
  args: {
    publicCode: v.string(),
    input: v.object({
      firstName: v.string(),
      lastName: v.optional(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      preferredLanguage: v.optional(v.string()),
      reason: v.optional(v.string()),
      preferredCareMode: v.optional(v.string()),
      preferredContactChannel: v.optional(v.string()),
      consentGranted: v.boolean(),
      privacyNoticeVersion: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => submitLeadCore(ctx, args.publicCode, args.input),
});

/** Counts a de-duplicated landing-page visit (the Next.js layer filters bots and repeats). */
export const recordLinkClick = internalMutation({
  args: { publicCode: v.string() },
  handler: async (ctx, { publicCode }) => {
    const link = await ctx.db
      .query("partnerReferralLinks")
      .withIndex("by_public_code", (q) => q.eq("publicCode", publicCode))
      .first();
    if (!link || link.status !== "active") return { recorded: false };
    if (link.expiresAt && link.expiresAt <= Date.now()) {
      await ctx.db.patch(link._id, { status: "expired", updatedAt: Date.now() });
      return { recorded: false };
    }
    await ctx.db.patch(link._id, { clicks: (link.clicks ?? 0) + 1, updatedAt: Date.now() });
    return { recorded: true };
  },
});
