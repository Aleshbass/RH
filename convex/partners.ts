/**
 * Partner Portal backend (Clerk-authenticated) and partner onboarding.
 *
 * Security model:
 *  - Every function resolves access from the signed-in identity (requirePartnerAccess);
 *    the partnerCode argument only selects which organisation an admin is viewing.
 *  - API keys are generated in actions with real randomness, shown ONCE, and stored
 *    only as SHA-256 hashes. Webhook signing secrets are revealed only on request.
 *  - Live keys and live webhooks require approved production access (go-live).
 *  - The REST API reaches partner data only through convex/partnerGateway.ts.
 */
import { insertNotification } from "./helpers/pushNotify";
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  adminDisplayName,
  findOwnedPartner,
  getViewer,
  requireAdmin,
  requirePartnerAccess,
  requirePartnerEnvAccess,
  requireViewer,
} from "./helpers/partnerAccess";
import {
  type PartnerEnv,
  findPartnerReferral,
  hasProductionAccess,
  isPartnerApproved,
  normalizePhone,
  partnerApprovalStatus,
  randomString,
  referralEnv,
  referralSessions,
  serializeReferral,
  toPublicStatus,
  validateWebhookUrl,
  webhookTargetFor,
} from "./helpers/partnerShared";
import { buildReport, createReferralCore, sandboxAdvanceCore, type SandboxStep } from "./helpers/partnerReferralCore";

const envV = v.union(v.literal("sandbox"), v.literal("live"));
const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const MAX_ACTIVE_KEYS_PER_ENV = 10;

const partnerTypeV = v.union(
  v.literal("hmo"),
  v.literal("hospital"),
  v.literal("corporate"),
  v.literal("gym"),
  v.literal("telemedicine"),
  v.literal("pharmacy"),
  v.literal("employer"),
  v.literal("digital_health"),
  v.literal("doctor")
);

async function logPortalActivity(
  ctx: { db: any },
  partner: Doc<"partners">,
  env: PartnerEnv,
  eventType: string,
  details: Record<string, unknown> = {}
) {
  await ctx.db.insert("partnerActivityLogs", {
    partnerId: partner.code,
    environment: env,
    eventId: `evt_portal_${Date.now()}_${randomString(6, BASE62)}`,
    eventType,
    direction: "inbound",
    url: "/partners/portal",
    method: "POST",
    statusCode: 200,
    latencyMs: 0,
    status: "success",
    requestPayload: details,
    occurredAt: Date.now(),
  });
}

function partnerSummary(partner: Doc<"partners">) {
  return {
    _id: partner._id,
    name: partner.name,
    code: partner.code,
    type: partner.type,
    tier: partner.tier,
    logoUrl: partner.logoUrl,
    website: partner.website,
    contactName: partner.contactName,
    contactEmail: partner.contactEmail,
    contactPhone: partner.contactPhone,
    technicalContactEmail: partner.technicalContactEmail,
    financeContactEmail: partner.financeContactEmail,
    coverageStates: partner.coverageStates ?? [],
    coverageCities: partner.coverageCities ?? [],
    supportedCareModes: partner.supportedCareModes ?? [],
    isActive: partner.isActive,
    approvalStatus: partnerApprovalStatus(partner),
    rejectionReason: partner.rejectionReason,
    productionStatus: partner.productionStatus ?? "not_requested",
    productionRequestedAt: partner.productionRequestedAt,
    productionReviewedAt: partner.productionReviewedAt,
    productionRejectionReason: partner.productionRejectionReason,
    credentialsRotatedAt: partner.credentialsRotatedAt,
    createdAt: partner.createdAt,
  };
}

// ─── Identity & onboarding ───────────────────────────────────────────────────

export const getCurrentUserPartner = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) {
      return { isAuthenticated: false, isAdmin: false, partner: null, status: "unauthenticated" as const, claimable: false };
    }
    const partner = await findOwnedPartner(ctx, viewer.identity);
    if (!partner) {
      return { isAuthenticated: true, isAdmin: viewer.isAdmin, partner: null, status: "no_partner" as const, claimable: false };
    }
    const approvalStatus = partnerApprovalStatus(partner);
    return {
      isAuthenticated: true,
      isAdmin: viewer.isAdmin,
      partner: partnerSummary(partner),
      status: approvalStatus,
      claimable: !partner.ownerClerkId,
    };
  },
});

/** Links an admin-created organisation to the signed-in owner (verified owner email). */
export const claimPartnerAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const partner = await findOwnedPartner(ctx, viewer.identity);
    if (!partner) throw new ConvexError("No partner organisation is waiting for this account.");
    if (partner.ownerClerkId && partner.ownerClerkId !== viewer.identity.subject) {
      throw new ConvexError("This organisation is already linked to another account.");
    }
    if (!partner.ownerClerkId) {
      await ctx.db.patch(partner._id, { ownerClerkId: viewer.identity.subject, updatedAt: Date.now() });
    }
    if (viewer.user && !viewer.user.role) await ctx.db.patch(viewer.user._id, { role: "partner" });
    return { code: partner.code };
  },
});

export const applyForPartner = mutation({
  args: {
    name: v.string(),
    type: partnerTypeV,
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    website: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    contactEmail: v.string(),
    coverageStates: v.optional(v.array(v.string())),
    coverageCities: v.optional(v.array(v.string())),
    supportedCareModes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const email = args.contactEmail.trim().toLowerCase();
    const cleanName = args.name.trim();
    if (cleanName.length < 2 || cleanName.length > 120) throw new ConvexError("Enter your organisation's name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("Enter a valid contact email address.");

    const existing = await findOwnedPartner(ctx, viewer.identity);
    if (existing) throw new ConvexError("You already have a registered partner organisation or a pending application.");

    let logoUrl: string | undefined;
    if (args.logoStorageId) logoUrl = (await ctx.storage.getUrl(args.logoStorageId)) ?? undefined;
    else if (args.logoUrl && /^https:\/\//.test(args.logoUrl.trim())) logoUrl = args.logoUrl.trim();

    let baseCode = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
    if (!baseCode) baseCode = "partner";
    let code = baseCode;
    for (let counter = 2; ; counter++) {
      const match = await ctx.db
        .query("partners")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!match) break;
      code = `${baseCode}_${counter}`;
    }

    const now = Date.now();
    const website = args.website?.trim();
    const partnerId = await ctx.db.insert("partners", {
      name: cleanName,
      code,
      type: args.type,
      logoUrl,
      logoStorageId: args.logoStorageId,
      website: website && /^https?:\/\//.test(website) ? website : website ? `https://${website}` : undefined,
      contactName: args.contactName?.trim() || undefined,
      contactEmail: email,
      contactPhone: args.contactPhone?.trim() || undefined,
      ownerClerkId: viewer.identity.subject,
      ownerEmail: viewer.identity.email?.toLowerCase() ?? email,
      coverageStates: args.coverageStates ?? [],
      coverageCities: args.coverageCities ?? [],
      supportedCareModes: args.supportedCareModes ?? ["remote", "face_to_face"],
      isActive: false,
      approvalStatus: "pending",
      productionStatus: "not_requested",
      tier: "standard",
      createdAt: now,
      updatedAt: now,
    });

    if (viewer.user && (!viewer.user.role || viewer.user.role === "patient")) {
      // Partners are organisations; a brand-new account becomes a partner account.
      if (!viewer.user.role) await ctx.db.patch(viewer.user._id, { role: "partner" });
    }

    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();
    const adminEmails = new Set<string>();
    for (const admin of admins) {
      await insertNotification(ctx, {
        userId: admin._id,
        type: "system_alert",
        title: "New Partner Application",
        message: `"${cleanName}" (${args.type.toUpperCase()}) applied for partner access.`,
        data: { partnerId, code, name: cleanName, type: args.type, contactEmail: email },
        status: "pending",
        priority: "high",
        createdAt: now,
        updatedAt: now,
      });
      if (admin.email) adminEmails.add(admin.email.toLowerCase());
    }
    adminEmails.add((process.env.PARTNER_OPERATIONS_EMAIL || "partners@physioaroundme.com").toLowerCase());
    adminEmails.delete(email);
    for (const adminEmail of adminEmails) {
      await ctx.scheduler.runAfter(0, internal.actions.emails.sendPartnerApplicationEmails.sendPartnerApplicationSubmittedAdminEmail, {
        adminEmail,
        organizationName: cleanName,
        organizationType: args.type,
        contactName: args.contactName,
        contactEmail: email,
        contactPhone: args.contactPhone,
        coverageStates: args.coverageStates,
      });
    }
    return { partnerId, code, name: cleanName, approvalStatus: "pending" as const };
  },
});

export const updatePartnerBranding = mutation({
  args: {
    partnerCode: v.string(),
    name: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    removeLogo: v.optional(v.boolean()),
    website: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    technicalContactEmail: v.optional(v.string()),
    financeContactEmail: v.optional(v.string()),
    coverageStates: v.optional(v.array(v.string())),
    coverageCities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const updates: Partial<Doc<"partners">> = { updatedAt: Date.now() };
    const email = (value?: string) => {
      const clean = value?.trim().toLowerCase();
      if (!clean) return undefined;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new ConvexError(`"${value}" is not a valid email address.`);
      return clean;
    };
    if (args.name !== undefined && args.name.trim()) updates.name = args.name.trim().slice(0, 120);
    if (args.removeLogo) {
      updates.logoUrl = undefined;
      updates.logoStorageId = undefined;
    } else if (args.logoStorageId) {
      updates.logoStorageId = args.logoStorageId;
      updates.logoUrl = (await ctx.storage.getUrl(args.logoStorageId)) ?? undefined;
    }
    if (args.website !== undefined) {
      const site = args.website.trim();
      updates.website = site ? (/^https?:\/\//.test(site) ? site : `https://${site}`) : undefined;
    }
    if (args.contactName !== undefined) updates.contactName = args.contactName.trim() || undefined;
    if (args.contactEmail !== undefined) {
      const clean = email(args.contactEmail);
      if (!clean) throw new ConvexError("A primary contact email is required.");
      updates.contactEmail = clean;
    }
    if (args.technicalContactEmail !== undefined) updates.technicalContactEmail = email(args.technicalContactEmail);
    if (args.financeContactEmail !== undefined) updates.financeContactEmail = email(args.financeContactEmail);
    if (args.contactPhone !== undefined) updates.contactPhone = args.contactPhone.trim() || undefined;
    if (args.coverageStates !== undefined) updates.coverageStates = args.coverageStates.slice(0, 40);
    if (args.coverageCities !== undefined) updates.coverageCities = args.coverageCities.slice(0, 100);
    await ctx.db.patch(partner._id, updates);
    const fresh = await ctx.db.get(partner._id);
    return { success: true, partner: partnerSummary(fresh!) };
  },
});

// ─── Admin: organisations ────────────────────────────────────────────────────

/** Admin-only partner switcher. Never includes credentials. */
export const adminListPartners = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const partners = await ctx.db.query("partners").order("desc").collect();
    return partners.map((p) => ({
      code: p.code,
      name: p.name,
      type: p.type,
      approvalStatus: partnerApprovalStatus(p),
      productionStatus: p.productionStatus ?? "not_requested",
      isActive: p.isActive,
    }));
  },
});

/** Admin creates an organisation; the owner claims it by signing in with ownerEmail. */
export const adminCreatePartner = mutation({
  args: {
    name: v.string(),
    type: partnerTypeV,
    ownerEmail: v.string(),
    contactName: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    tier: v.optional(v.union(v.literal("standard"), v.literal("enterprise"))),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const email = args.ownerEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("Enter a valid owner email.");
    const baseCode = args.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "partner";
    let code = baseCode;
    for (let counter = 2; ; counter++) {
      const match = await ctx.db
        .query("partners")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!match) break;
      code = `${baseCode}_${counter}`;
    }
    const now = Date.now();
    const partnerId = await ctx.db.insert("partners", {
      name: args.name.trim(),
      code,
      type: args.type,
      contactName: args.contactName?.trim() || undefined,
      contactEmail: email,
      contactPhone: args.contactPhone?.trim() || undefined,
      ownerEmail: email,
      isActive: true,
      approvalStatus: "approved",
      approvedAt: now,
      approvedBy: adminDisplayName(admin.user),
      productionStatus: "not_requested",
      tier: args.tier ?? "standard",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.actions.emails.sendPartnerApplicationEmails.sendPartnerApplicationApprovedEmail, {
      partnerEmail: email,
      organizationName: args.name.trim(),
      partnerCode: code,
      contactName: args.contactName,
      approvedBy: adminDisplayName(admin.user),
    });
    return { partnerId, code };
  },
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const getPartnerDashboardOverview = query({
  args: { partnerCode: v.string(), environment: envV },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const referrals = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_and_environment", (q) => q.eq("partnerId", partner.code).eq("environment", args.environment))
      .order("desc")
      .take(2000);
    const counts = { received: 0, contacted: 0, booked: 0, in_treatment: 0, completed: 0, not_suitable: 0, cancelled: 0, closed: 0 };
    let totalSessionsPrescribed = 0;
    for (const r of referrals) {
      counts[toPublicStatus(r.status)]++;
      totalSessionsPrescribed += r.recommendedSessions ?? 0;
    }
    const keys = await ctx.db
      .query("partnerApiKeys")
      .withIndex("by_partner_env_status", (q) => q.eq("partnerId", partner.code).eq("environment", args.environment).eq("status", "active"))
      .collect();
    const target = webhookTargetFor(partner, args.environment);
    return {
      metrics: {
        totalReferrals: referrals.length,
        activeInTreatment: counts.booked + counts.in_treatment,
        completed: counts.completed,
        pending: counts.received + counts.contacted,
        statusCounts: counts,
        totalSessionsPrescribed,
        countIsCapped: referrals.length >= 2000,
      },
      partnerInfo: {
        ...partnerSummary(partner),
        partnerIdFormatted: `PRT-${partner.code.toUpperCase().slice(0, 10)}`,
        activeEnvironment: args.environment,
        isSandbox: args.environment === "sandbox",
        hasProductionAccess: hasProductionAccess(partner),
        webhookUrl: target.url ?? "",
        liveWebhookUrl: webhookTargetFor(partner, "live").url ?? "",
        testWebhookUrl: webhookTargetFor(partner, "sandbox").url ?? "",
        hasWebhookSecret: Boolean(target.secret),
        activeKeyCount: keys.length,
      },
      recentReferrals: await Promise.all(referrals.slice(0, 10).map((r) => referralRow(ctx, r))),
    };
  },
});

async function referralRow(ctx: any, r: Doc<"inboundReferrals">) {
  return {
    referralId: r._id,
    trackingCode: r.trackingCode ?? "",
    partnerExternalId: r.partnerExternalId ?? null,
    patientName: `${r.patientFirstName} ${r.patientLastName ?? ""}`.trim(),
    phone: r.patientPhone,
    city: r.city ?? null,
    condition: r.condition ?? r.reason ?? null,
    status: toPublicStatus(r.status),
    environment: referralEnv(r),
    source: r.conversionSource ?? "api",
    recommendedSessions: r.recommendedSessions ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export const listPartnerReferrals = query({
  args: {
    partnerCode: v.string(),
    environment: envV,
    status: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    let q = ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_and_environment", (idx) => idx.eq("partnerId", partner.code).eq("environment", args.environment))
      .order("desc");
    if (args.status && args.status !== "all") {
      const wanted = args.status;
      const statuses = (["received", "consent_pending", "contacted", "intake_started", "intake_completed", "qualified", "redirected_for_safety", "booked", "attended", "treatment_active", "completed", "cancelled", "not_suitable", "refunded", "closed", "pending", "in_treatment", "paid_out"] as const).filter(
        (s) => toPublicStatus(s) === wanted
      );
      q = q.filter((f) => f.or(...statuses.map((s) => f.eq(f.field("status"), s))));
    }
    const page = await q.paginate({ ...args.paginationOpts, numItems: Math.min(Math.max(args.paginationOpts.numItems, 1), 100) });
    return { ...page, page: await Promise.all(page.page.map((r) => referralRow(ctx, r))) };
  },
});

export const searchPartnerReferrals = query({
  args: { partnerCode: v.string(), environment: envV, term: v.string() },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const term = args.term.trim();
    if (term.length < 2) return [];
    const exact = await findPartnerReferral(ctx, partner.code, args.environment, term);
    if (exact) return [await referralRow(ctx, exact)];
    const needle = term.toLowerCase();
    const phone = normalizePhone(term);
    const recent = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_and_environment", (q) => q.eq("partnerId", partner.code).eq("environment", args.environment))
      .order("desc")
      .take(500);
    const matches = recent.filter((r) => {
      const name = `${r.patientFirstName} ${r.patientLastName ?? ""}`.toLowerCase();
      return name.includes(needle) || (phone && r.patientPhoneNormalized === phone) || (r.condition ?? "").toLowerCase().includes(needle);
    });
    return Promise.all(matches.slice(0, 50).map((r) => referralRow(ctx, r)));
  },
});

export const getPartnerReferralDetail = query({
  args: { partnerCode: v.string(), environment: envV, referralId: v.string() },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const referral = await findPartnerReferral(ctx, partner.code, args.environment, args.referralId);
    if (!referral) return null;
    const events = await ctx.db
      .query("referralEvents")
      .withIndex("by_referral_id", (q) => q.eq("referralId", referral._id))
      .order("asc")
      .collect();
    const timeline = events
      .filter((e) => !e.eventName.startsWith("commission.") && !e.eventName.startsWith("clinic."))
      .map((e) => ({ name: e.eventName, occurredAt: e.occurredAt, actorType: e.actorType ?? "system" }));
    const deliveries = await ctx.db
      .query("partnerWebhookDeliveries")
      .withIndex("by_referral", (q) => q.eq("referralId", referral._id))
      .order("desc")
      .take(50);
    return {
      referral: await serializeReferral(ctx, referral, { includePatient: true }),
      report: await buildReport(ctx, referral),
      sessions: await referralSessions(ctx, referral),
      timeline,
      webhookDeliveries: deliveries.map((d) => ({
        _id: d._id,
        eventId: d.eventId,
        eventType: d.eventType,
        status: d.status,
        attempts: d.attempts,
        lastStatusCode: d.lastStatusCode ?? null,
        createdAt: d.createdAt,
      })),
    };
  },
});

// ─── Sandbox tools (portal) ──────────────────────────────────────────────────

export const createSandboxReferral = mutation({
  args: {
    partnerCode: v.string(),
    partnerReference: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    phone: v.string(),
    email: v.optional(v.string()),
    city: v.optional(v.string()),
    condition: v.optional(v.string()),
    recommendedSessions: v.optional(v.number()),
    preferredMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode, { requireApproved: true });
    if (!args.firstName.trim()) throw new ConvexError("First name is required.");
    const result = await createReferralCore(ctx, {
      partnerCode: partner.code,
      environment: "sandbox",
      source: "portal",
      input: {
        partnerReference: args.partnerReference,
        patient: { firstName: args.firstName, lastName: args.lastName, phone: args.phone, email: args.email, city: args.city },
        clinical: { condition: args.condition, recommendedSessions: args.recommendedSessions },
        care: { preferredMode: args.preferredMode },
        consent: { granted: true, method: "sandbox_test" },
      },
    });
    if (!result.ok) throw new ConvexError(result.message);
    return result.referral;
  },
});

/** Referrals that are still open (not finished, cancelled or turned away). */
const CLOSED_PUBLIC_STATUSES = new Set(["completed", "not_suitable", "cancelled", "closed"]);
const DUPLICATE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * A real (live) referral typed into the portal: how referring doctors refer, and a manual
 * option for partner organisations. Same pipeline as the API: tracking code, consent record,
 * care-team outreach, admin alert, Joy WhatsApp intake link, attribution and commissions.
 */
export const createPortalReferral = mutation({
  args: {
    partnerCode: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    phone: v.string(),
    email: v.optional(v.string()),
    city: v.optional(v.string()),
    condition: v.optional(v.string()),
    notes: v.optional(v.string()),
    priority: v.optional(v.union(v.literal("standard"), v.literal("urgent"))),
    recommendedSessions: v.optional(v.number()),
    preferredMode: v.optional(v.union(v.literal("remote"), v.literal("in_person"), v.literal("patient_choice"))),
    consentGranted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { partner, actor } = await requirePartnerAccess(ctx, args.partnerCode, { requireApproved: true, requireProduction: true });
    if (!args.firstName.trim()) throw new ConvexError("Enter the patient's first name.");
    if (!args.consentGranted) throw new ConvexError("Confirm the patient agreed to be contacted by Rehabify.");
    const email = args.email?.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("That email address doesn't look right.");
    const phone = normalizePhone(args.phone);
    if (!phone) throw new ConvexError("Enter the patient's phone number with country code, e.g. +2348012345678.");

    // The same patient referred again while their first referral is still open
    const earlier = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_and_phone", (q) => q.eq("partnerId", partner.code).eq("patientPhoneNormalized", phone))
      .order("desc")
      .take(5);
    const open = earlier.find(
      (r) => referralEnv(r) === "live" && r.createdAt > Date.now() - DUPLICATE_WINDOW_MS && !CLOSED_PUBLIC_STATUSES.has(toPublicStatus(r.status))
    );
    if (open) {
      throw new ConvexError(`You already referred this patient (${open.trackingCode ?? "open referral"}). Follow it in your referrals.`);
    }

    const isDoctor = partner.type === "doctor";
    const owner =
      isDoctor && partner.ownerClerkId
        ? await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", partner.ownerClerkId!))
            .first()
        : null;
    const profile = owner?.doctorProfileId ? await ctx.db.get(owner.doctorProfileId) : null;

    const result = await createReferralCore(ctx, {
      partnerCode: partner.code,
      environment: "live",
      source: isDoctor ? "doctor" : "portal",
      referringDoctorId: owner?._id,
      input: {
        patient: { firstName: args.firstName, lastName: args.lastName, phone, email, city: args.city },
        clinical: {
          condition: args.condition,
          notes: args.notes,
          priority: args.priority,
          recommendedSessions: args.recommendedSessions,
          referringClinician: isDoctor
            ? [partner.name, profile?.hospitalAffiliation].filter(Boolean).join(", ")
            : undefined,
        },
        care: { preferredMode: args.preferredMode },
        consent: { granted: true, method: isDoctor ? "doctor_attested" : "partner_portal_attested", capturedAt: Date.now() },
      },
    });
    if (!result.ok) throw new ConvexError(result.message);
    await logPortalActivity(ctx, partner, "live", "referral.created_in_portal", {
      actor,
      trackingCode: (result.referral as { tracking_code?: string }).tracking_code,
    });
    return result.referral;
  },
});

export const advanceSandboxReferral = mutation({
  args: {
    partnerCode: v.string(),
    referralId: v.string(),
    status: v.union(
      v.literal("contacted"),
      v.literal("provider_matched"),
      v.literal("booked"),
      v.literal("in_treatment"),
      v.literal("completed"),
      v.literal("not_suitable"),
      v.literal("cancelled"),
      v.literal("closed")
    ),
  },
  handler: async (ctx, args) => {
    const { partner, actor } = await requirePartnerAccess(ctx, args.partnerCode, { requireApproved: true });
    const referral = await findPartnerReferral(ctx, partner.code, "sandbox", args.referralId);
    if (!referral) throw new ConvexError("Sandbox referral not found.");
    const result = await sandboxAdvanceCore(ctx, referral, args.status as SandboxStep, actor);
    if (!result.ok) throw new ConvexError(result.message);
    return { success: true };
  },
});

// ─── API keys ────────────────────────────────────────────────────────────────

export const listPartnerApiKeys = query({
  args: { partnerCode: v.string(), environment: envV },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const keys = await ctx.db
      .query("partnerApiKeys")
      .withIndex("by_partner_and_env", (q) => q.eq("partnerId", partner.code).eq("environment", args.environment))
      .order("desc")
      .collect();
    return keys
      .filter((k) => Boolean(k.keyHash)) // legacy plaintext keys no longer authenticate
      .map((k) => ({
        _id: k._id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        last4: k.last4 ?? null,
        environment: k.environment,
        status: k.status === "rolling" ? "active" : k.status,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt ?? null,
        revokedAt: k.revokedAt ?? null,
      }));
  },
});

/** Internal: authorization check reused by actions (auth propagates from the action). */
export const assertPartnerEnvAccess = internalQuery({
  args: { partnerCode: v.string(), environment: envV, forWrite: v.boolean() },
  handler: async (ctx, args) => {
    const { partner, actor } = await requirePartnerEnvAccess(ctx, args.partnerCode, args.environment, { forWrite: args.forWrite });
    return { code: partner.code, actor };
  },
});

export const insertApiKey = internalMutation({
  args: {
    partnerCode: v.string(),
    environment: envV,
    name: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    last4: v.string(),
    revokeKeyId: v.optional(v.id("partnerApiKeys")),
  },
  handler: async (ctx, args) => {
    // Re-check inside the transaction (the action's identity propagates here).
    const { partner, actor } = await requirePartnerEnvAccess(ctx, args.partnerCode, args.environment, { forWrite: true });
    const active = await ctx.db
      .query("partnerApiKeys")
      .withIndex("by_partner_env_status", (q) => q.eq("partnerId", partner.code).eq("environment", args.environment).eq("status", "active"))
      .collect();
    const revoking = args.revokeKeyId ? active.find((k) => k._id === args.revokeKeyId) : undefined;
    if (args.revokeKeyId && !revoking) throw new ConvexError("The key to rotate was not found or is already revoked.");
    if (active.length - (revoking ? 1 : 0) >= MAX_ACTIVE_KEYS_PER_ENV) {
      throw new ConvexError(`You can have at most ${MAX_ACTIVE_KEYS_PER_ENV} active ${args.environment} keys. Revoke an unused key first.`);
    }
    const now = Date.now();
    const keyId = await ctx.db.insert("partnerApiKeys", {
      partnerId: partner.code,
      name: args.name,
      keyHash: args.keyHash,
      keyPrefix: args.keyPrefix,
      last4: args.last4,
      environment: args.environment,
      status: "active",
      createdAt: now,
      createdBy: actor,
    });
    if (revoking) await ctx.db.patch(revoking._id, { status: "revoked", revokedAt: now, revokedBy: actor });
    await logPortalActivity(ctx, partner, args.environment, revoking ? "api_key.rotated" : "api_key.created", {
      name: args.name,
      keyPrefix: args.keyPrefix,
      revokedKeyPrefix: revoking?.keyPrefix,
    });
    return { keyId, createdAt: now };
  },
});

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type MintedKey = { keyId: Id<"partnerApiKeys">; key: string; keyPrefix: string; name: string; environment: PartnerEnv; createdAt: number };

async function mintKey(ctx: any, args: { partnerCode: string; environment: PartnerEnv; name: string; revokeKeyId?: Id<"partnerApiKeys"> }): Promise<MintedKey> {
  await ctx.runQuery(internal.partners.assertPartnerEnvAccess, { partnerCode: args.partnerCode, environment: args.environment, forWrite: true });
  const prefix = args.environment === "live" ? "sk_live_" : "sk_test_";
  const secret = randomString(40, BASE62);
  const key = `${prefix}${secret}`;
  const keyPrefix = `${prefix}${secret.slice(0, 4)}…${secret.slice(-4)}`;
  const name = args.name.trim().slice(0, 60) || (args.environment === "live" ? "Live key" : "Sandbox key");
  const result: { keyId: Id<"partnerApiKeys">; createdAt: number } = await ctx.runMutation(internal.partners.insertApiKey, {
    partnerCode: args.partnerCode,
    environment: args.environment,
    name,
    keyHash: await sha256Hex(key),
    keyPrefix,
    last4: secret.slice(-4),
    revokeKeyId: args.revokeKeyId,
  });
  return { keyId: result.keyId as Id<"partnerApiKeys">, key, keyPrefix, name, environment: args.environment, createdAt: result.createdAt as number };
}

/** Creates an API key. The full key is returned ONCE and never stored. */
export const createPartnerApiKey = action({
  args: { partnerCode: v.string(), environment: envV, name: v.string() },
  handler: async (ctx, args): Promise<MintedKey> => mintKey(ctx, args),
});

/** Replaces a key with a new one and revokes the old key immediately. */
export const rotatePartnerApiKey = action({
  args: { partnerCode: v.string(), keyId: v.id("partnerApiKeys") },
  handler: async (ctx, args): Promise<{ keyId: Id<"partnerApiKeys">; key: string; keyPrefix: string; name: string; environment: PartnerEnv; createdAt: number }> => {
    const existing: { environment: PartnerEnv; name: string } | null = await ctx.runQuery(internal.partners.getKeyForRotation, {
      partnerCode: args.partnerCode,
      keyId: args.keyId,
    });
    if (!existing) throw new ConvexError("API key not found.");
    return mintKey(ctx, { partnerCode: args.partnerCode, environment: existing.environment, name: existing.name, revokeKeyId: args.keyId });
  },
});

export const getKeyForRotation = internalQuery({
  args: { partnerCode: v.string(), keyId: v.id("partnerApiKeys") },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode, { requireApproved: true });
    const key = await ctx.db.get(args.keyId);
    if (!key || key.partnerId !== partner.code || key.status === "revoked") return null;
    return { environment: key.environment, name: key.name };
  },
});

export const revokePartnerApiKey = mutation({
  args: { partnerCode: v.string(), keyId: v.id("partnerApiKeys") },
  handler: async (ctx, args) => {
    const { partner, actor } = await requirePartnerAccess(ctx, args.partnerCode);
    const key = await ctx.db.get(args.keyId);
    if (!key || key.partnerId !== partner.code) throw new ConvexError("API key not found.");
    if (key.status !== "revoked") {
      await ctx.db.patch(key._id, { status: "revoked", revokedAt: Date.now(), revokedBy: actor });
      await logPortalActivity(ctx, partner, key.environment, "api_key.revoked", { keyPrefix: key.keyPrefix });
    }
    return { success: true, keyId: key._id };
  },
});

// ─── Webhook endpoints & signing secrets ─────────────────────────────────────

export const persistWebhookSettings = internalMutation({
  args: {
    partnerCode: v.string(),
    environment: envV,
    url: v.optional(v.string()),
    newSecret: v.optional(v.string()),
    onlyIfMissingSecret: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerEnvAccess(ctx, args.partnerCode, args.environment, { forWrite: true });
    const now = Date.now();
    const current = webhookTargetFor(partner, args.environment);
    const patch: Partial<Doc<"partners">> = { updatedAt: now };
    let secretChanged = false;
    if (args.newSecret && (!args.onlyIfMissingSecret || !current.secret)) {
      secretChanged = true;
      if (args.environment === "live") {
        patch.liveWebhookSecret = args.newSecret;
        patch.webhookSecret = args.newSecret;
      } else {
        patch.testWebhookSecret = args.newSecret;
      }
    }
    if (args.url !== undefined) {
      if (args.environment === "live") {
        patch.liveWebhookUrl = args.url;
        patch.webhookUrl = args.url;
      } else {
        patch.testWebhookUrl = args.url;
      }
    }
    await ctx.db.patch(partner._id, patch);
    await logPortalActivity(ctx, partner, args.environment, secretChanged && args.url === undefined ? "webhook.secret_rotated" : "webhook.endpoint_updated", {
      url: args.url,
      secretRotated: secretChanged,
    });
    return { secretChanged };
  },
});

/** Saves the endpoint URL for an environment; creates a signing secret if none exists. */
export const saveWebhookEndpoint = action({
  args: { partnerCode: v.string(), environment: envV, url: v.string() },
  handler: async (ctx, args): Promise<{ webhookUrl: string; secret: string | null }> => {
    const checked = validateWebhookUrl(args.url);
    if (!checked.ok) throw new ConvexError(checked.error);
    const candidate = `whsec_${randomString(40, BASE62)}`;
    const result: { secretChanged: boolean } = await ctx.runMutation(internal.partners.persistWebhookSettings, {
      partnerCode: args.partnerCode,
      environment: args.environment,
      url: checked.url,
      newSecret: candidate,
      onlyIfMissingSecret: true,
    });
    // The secret is returned only when it was just created; reveal it later on demand.
    return { webhookUrl: checked.url, secret: result.secretChanged ? candidate : null };
  },
});

export const removeWebhookEndpoint = mutation({
  args: { partnerCode: v.string(), environment: envV },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const patch: Partial<Doc<"partners">> = { updatedAt: Date.now() };
    if (args.environment === "live") {
      patch.liveWebhookUrl = undefined;
      patch.webhookUrl = undefined;
    } else {
      patch.testWebhookUrl = undefined;
    }
    await ctx.db.patch(partner._id, patch);
    await logPortalActivity(ctx, partner, args.environment, "webhook.endpoint_removed");
    return { success: true };
  },
});

export const rotateWebhookSecret = action({
  args: { partnerCode: v.string(), environment: envV },
  handler: async (ctx, args): Promise<{ secret: string }> => {
    const secret = `whsec_${randomString(40, BASE62)}`;
    await ctx.runMutation(internal.partners.persistWebhookSettings, {
      partnerCode: args.partnerCode,
      environment: args.environment,
      newSecret: secret,
    });
    return { secret };
  },
});

/** Reveals the signing secret on explicit request (logged). */
export const revealWebhookSecret = mutation({
  args: { partnerCode: v.string(), environment: envV },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode, { requireApproved: true });
    const secret = webhookTargetFor(partner, args.environment).secret;
    if (!secret) throw new ConvexError(`No ${args.environment} signing secret yet — save your webhook endpoint first.`);
    await logPortalActivity(ctx, partner, args.environment, "webhook.secret_revealed");
    return { secret };
  },
});

// ─── Activity, health & analytics ────────────────────────────────────────────

export const listPartnerActivityLogs = query({
  args: {
    partnerCode: v.string(),
    environment: envV,
    eventType: v.optional(v.string()),
    status: v.optional(v.string()),
    direction: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 50), 1), 200);
    const filtered = Boolean((args.eventType && args.eventType !== "all") || (args.status && args.status !== "all") || (args.direction && args.direction !== "all"));
    const logs = await ctx.db
      .query("partnerActivityLogs")
      .withIndex("by_partner_env_occurred", (q) => q.eq("partnerId", partner.code).eq("environment", args.environment))
      .order("desc")
      .take(filtered ? 1000 : limit);
    return logs
      .filter((l) => !args.eventType || args.eventType === "all" || l.eventType === args.eventType || l.eventType.startsWith(`${args.eventType}.`))
      .filter((l) => !args.status || args.status === "all" || l.status === args.status)
      .filter((l) => !args.direction || args.direction === "all" || l.direction === args.direction)
      .slice(0, limit)
      .map((l) => ({
        _id: l._id,
        eventId: l.eventId,
        eventType: l.eventType,
        direction: l.direction,
        url: l.url,
        method: l.method,
        statusCode: l.statusCode,
        latencyMs: l.latencyMs,
        status: l.status,
        requestId: l.requestId,
        trackingCode: l.trackingCode,
        requestHeaders: l.requestHeaders,
        requestPayload: l.requestPayload,
        responsePayload: l.responsePayload,
        errorMessage: l.errorMessage,
        occurredAt: l.occurredAt,
      }));
  },
});

/** Real integration health for the last 24 hours (no synthetic numbers). */
export const getIntegrationHealth = query({
  args: { partnerCode: v.string(), environment: envV },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const logs = await ctx.db
      .query("partnerActivityLogs")
      .withIndex("by_partner_env_occurred", (q) => q.eq("partnerId", partner.code).eq("environment", args.environment).gte("occurredAt", since))
      .take(5000);
    const api = logs.filter((l) => l.direction === "inbound" && l.url.startsWith("/api/v1"));
    const apiErrors = api.filter((l) => l.statusCode >= 500).length;
    const deliveries = await ctx.db
      .query("partnerWebhookDeliveries")
      .withIndex("by_partner_env_created", (q) => q.eq("partnerId", partner.code).eq("environment", args.environment).gte("createdAt", since))
      .take(5000);
    const finished = deliveries.filter((d) => d.status === "succeeded" || d.status === "failed");
    const succeeded = finished.filter((d) => d.status === "succeeded");
    const latencies = succeeded.map((d) => d.lastLatencyMs ?? 0).filter((n) => n > 0);
    const target = webhookTargetFor(partner, args.environment);
    return {
      windowHours: 24,
      api: {
        requests: api.length,
        serverErrors: apiErrors,
        clientErrors: api.filter((l) => l.statusCode >= 400 && l.statusCode < 500).length,
        successRate: api.length ? Math.round(((api.length - apiErrors) / api.length) * 1000) / 10 : null,
        avgLatencyMs: api.length ? Math.round(api.reduce((s, l) => s + l.latencyMs, 0) / api.length) : null,
        truncated: logs.length >= 5000,
      },
      webhooks: {
        endpointConfigured: Boolean(target.url && target.secret),
        endpointUrl: target.url ?? null,
        events: deliveries.length,
        delivered: succeeded.length,
        failed: deliveries.filter((d) => d.status === "failed").length,
        retrying: deliveries.filter((d) => d.status === "pending" && d.attempts > 0).length,
        skipped: deliveries.filter((d) => d.status === "skipped").length,
        successRate: finished.length ? Math.round((succeeded.length / finished.length) * 1000) / 10 : null,
        avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      },
    };
  },
});

export const getPartnerAnalyticsTimeseries = query({
  args: { partnerCode: v.string(), environment: envV, range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"))) },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const days = args.range === "7d" ? 7 : args.range === "90d" ? 90 : 30;
    const dayMs = 24 * 60 * 60 * 1000;
    const end = Date.now();
    const start = end - days * dayMs;
    const referrals = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_and_environment", (q) => q.eq("partnerId", partner.code).eq("environment", args.environment).gte("_creationTime", start))
      .take(5000);
    const buckets = new Map<string, { date: string; referrals: number; contacted: number; booked: number; completed: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(end - i * dayMs).toISOString().slice(0, 10);
      buckets.set(date, { date, referrals: 0, contacted: 0, booked: 0, completed: 0 });
    }
    const bump = (ts: number | undefined, key: "referrals" | "contacted" | "booked" | "completed") => {
      if (!ts || ts < start) return;
      const bucket = buckets.get(new Date(ts).toISOString().slice(0, 10));
      if (bucket) bucket[key]++;
    };
    const modes = { remote: 0, in_person: 0, patient_choice: 0 };
    for (const r of referrals) {
      bump(r.createdAt, "referrals");
      bump(r.contactedAt, "contacted");
      bump(r.bookedAt, "booked");
      bump(r.completedAt, "completed");
      const mode = r.preferredCareMode === "remote" ? "remote" : r.preferredCareMode === "face_to_face" || r.preferredCareMode === "in_person" ? "in_person" : "patient_choice";
      modes[mode]++;
    }
    const reached = (r: Doc<"inboundReferrals">, stage: "contacted" | "booked" | "in_treatment" | "completed") => {
      const status = toPublicStatus(r.status);
      const order = ["received", "contacted", "booked", "in_treatment", "completed"];
      const at = { contacted: r.contactedAt, booked: r.bookedAt, in_treatment: r.treatmentStartedAt, completed: r.completedAt }[stage];
      return Boolean(at) || order.indexOf(status) >= order.indexOf(stage);
    };
    return {
      rangeDays: days,
      timeseries: Array.from(buckets.values()),
      funnel: [
        { stage: "Referrals", count: referrals.length },
        { stage: "Contacted", count: referrals.filter((r) => reached(r, "contacted")).length },
        { stage: "Booked", count: referrals.filter((r) => reached(r, "booked")).length },
        { stage: "In treatment", count: referrals.filter((r) => reached(r, "in_treatment")).length },
        { stage: "Completed", count: referrals.filter((r) => reached(r, "completed")).length },
      ],
      careModes: [
        { mode: "remote", label: "Tele-rehab", count: modes.remote },
        { mode: "in_person", label: "In person", count: modes.in_person },
        { mode: "patient_choice", label: "Patient's choice", count: modes.patient_choice },
      ],
    };
  },
});

// ─── Go-live (production access) ─────────────────────────────────────────────

export const getGoLiveChecklist = query({
  args: { partnerCode: v.string() },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const sandboxKeys = await ctx.db
      .query("partnerApiKeys")
      .withIndex("by_partner_and_env", (q) => q.eq("partnerId", partner.code).eq("environment", "sandbox"))
      .collect();
    const sandboxReferral = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_and_environment", (q) => q.eq("partnerId", partner.code).eq("environment", "sandbox"))
      .first();
    const delivered = await ctx.db
      .query("partnerWebhookDeliveries")
      .withIndex("by_partner_env_created", (q) => q.eq("partnerId", partner.code).eq("environment", "sandbox"))
      .order("desc")
      .take(200);
    const bank = await ctx.db
      .query("partnerBankAccounts")
      .withIndex("by_partner_code", (q) => q.eq("partnerCode", partner.code))
      .first();
    const items = [
      { key: "approved", label: "Organisation approved by Rehabify", done: isPartnerApproved(partner), required: true },
      { key: "sandbox_key", label: "Created a sandbox API key", done: sandboxKeys.some((k) => k.keyHash), required: true },
      { key: "sandbox_referral", label: "Created a referral in sandbox", done: Boolean(sandboxReferral), required: true },
      { key: "sandbox_webhook", label: "Received a sandbox webhook (2xx response)", done: delivered.some((d) => d.status === "succeeded"), required: false },
      { key: "contacts", label: "Technical and finance contacts added", done: Boolean(partner.technicalContactEmail && partner.financeContactEmail), required: false },
      { key: "bank", label: "Payout bank account verified (needed to receive commissions)", done: Boolean(bank?.isVerified), required: false },
    ];
    return {
      productionStatus: partner.productionStatus ?? "not_requested",
      productionRequestedAt: partner.productionRequestedAt ?? null,
      productionRejectionReason: partner.productionRejectionReason ?? null,
      canRequest: items.filter((i) => i.required).every((i) => i.done) && (partner.productionStatus ?? "not_requested") !== "approved",
      items,
    };
  },
});

export const requestProductionAccess = mutation({
  args: { partnerCode: v.string(), note: v.optional(v.string()), expectedMonthlyReferrals: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { partner, viewer } = await requirePartnerAccess(ctx, args.partnerCode, { requireApproved: true });
    const status = partner.productionStatus ?? "not_requested";
    if (status === "approved") throw new ConvexError("Production access is already approved.");
    if (status === "requested") throw new ConvexError("Your request is already with the Rehabify team.");
    if (status === "suspended") throw new ConvexError("Production access is suspended. Contact partners@physioaroundme.com.");
    const sandboxReferral = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_and_environment", (q) => q.eq("partnerId", partner.code).eq("environment", "sandbox"))
      .first();
    if (!sandboxReferral) throw new ConvexError("Create at least one sandbox referral before requesting production access.");
    const now = Date.now();
    const note = [args.note?.trim(), args.expectedMonthlyReferrals ? `Expected monthly referrals: ${Math.round(args.expectedMonthlyReferrals)}` : undefined]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000);
    await ctx.db.patch(partner._id, {
      productionStatus: "requested",
      productionRequestedAt: now,
      productionRequestNote: note || undefined,
      productionRejectionReason: undefined,
      updatedAt: now,
    });
    await logPortalActivity(ctx, partner, "live", "production.requested", { requestedBy: viewer.identity.email });
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();
    for (const admin of admins) {
      await insertNotification(ctx, {
        userId: admin._id,
        type: "system_alert",
        title: "Partner go-live request",
        message: `${partner.name} requested production (live) API access.`,
        data: { partnerCode: partner.code },
        status: "pending",
        priority: "high",
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.actions.emails.sendPartnerApplicationEmails.sendPartnerGoLiveEmail, {
      to: (process.env.PARTNER_OPERATIONS_EMAIL || "partners@physioaroundme.com").toLowerCase(),
      kind: "requested",
      organizationName: partner.name,
      partnerCode: partner.code,
      note: note || undefined,
    });
    return { productionStatus: "requested" as const };
  },
});
