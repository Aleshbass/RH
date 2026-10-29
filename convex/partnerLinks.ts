/**
 * No-code partner referral links: portal management, the public landing page,
 * attribution claims, and the public (PII-free) tracking page.
 *
 * Lead submission and click counting are internal (convex/partnerApi.ts) and reached
 * through the rate-limited Next.js routes, never directly from browsers.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requirePartnerAccess, requirePartnerEnvAccess, requireViewer } from "./helpers/partnerAccess";
import {
  generateLinkPublicCode,
  isPartnerApproved,
  linkEnv,
  normalizeTrackingCode,
  referralLinkUrl,
  toPublicStatus,
} from "./helpers/partnerShared";
import { referralLinkView } from "./helpers/partnerReferralCore";
import { attributeUserToLink, attributeUserToReferral, findOpenReferralForPatient } from "./helpers/partnerAttribution";

const envV = v.union(v.literal("sandbox"), v.literal("live"));

// ─── Portal: manage links ────────────────────────────────────────────────────

export const createReferralLink = mutation({
  args: {
    partnerCode: v.string(),
    environment: envV,
    campaignName: v.optional(v.string()),
    serviceScope: v.optional(v.string()),
    defaultCareMode: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { partner, actor } = await requirePartnerEnvAccess(ctx, args.partnerCode, args.environment, { forWrite: true });
    const now = Date.now();
    if (args.expiresAt !== undefined && args.expiresAt <= now) throw new ConvexError("The expiry date must be in the future.");
    const publicCode = await generateLinkPublicCode(ctx, partner.code);
    const defaultCareMode =
      args.defaultCareMode === "in_person" || args.defaultCareMode === "face_to_face"
        ? "face_to_face"
        : args.defaultCareMode === "remote"
          ? "remote"
          : "patient_choice";
    const linkId = await ctx.db.insert("partnerReferralLinks", {
      partnerId: partner.code,
      publicCode,
      campaignName: args.campaignName?.trim().slice(0, 120) || undefined,
      serviceScope: args.serviceScope?.trim().slice(0, 80) || "all_rehabilitation",
      defaultCareMode,
      status: "active",
      expiresAt: args.expiresAt,
      environment: args.environment,
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
    const link = await ctx.db.get(linkId);
    return referralLinkView(link!, referralLinkUrl(publicCode));
  },
});

export const listReferralLinks = query({
  args: { partnerCode: v.string(), environment: v.optional(envV) },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const links = await ctx.db
      .query("partnerReferralLinks")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", partner.code))
      .order("desc")
      .collect();
    return links
      .filter((l) => !args.environment || linkEnv(l) === args.environment)
      .map((l) => {
        const view = referralLinkView(l, referralLinkUrl(l.publicCode));
        const clicks = l.clicks ?? 0;
        return { ...view, conversionRate: clicks > 0 ? Math.round(((l.leads ?? 0) / clicks) * 1000) / 10 : 0 };
      });
  },
});

export const updateLinkStatus = mutation({
  args: { partnerCode: v.string(), linkId: v.id("partnerReferralLinks"), status: v.union(v.literal("active"), v.literal("inactive")) },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode, { requireApproved: true });
    const link = await ctx.db.get(args.linkId);
    if (!link || link.partnerId !== partner.code) throw new ConvexError("Referral link not found.");
    if (args.status === "active" && link.expiresAt && link.expiresAt <= Date.now()) {
      throw new ConvexError("This link has expired. Create a new link instead.");
    }
    await ctx.db.patch(link._id, { status: args.status, updatedAt: Date.now() });
    return { success: true };
  },
});

/** Leads that arrived through one link (for the portal's per-link view). */
export const listLinkLeads = query({
  args: { partnerCode: v.string(), linkId: v.id("partnerReferralLinks") },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const link = await ctx.db.get(args.linkId);
    if (!link || link.partnerId !== partner.code) throw new ConvexError("Referral link not found.");
    const referrals = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_link_id", (q) => q.eq("linkId", link._id))
      .order("desc")
      .take(200);
    return referrals.map((r) => ({
      referralId: r._id,
      trackingCode: r.trackingCode ?? "",
      patientName: `${r.patientFirstName} ${r.patientLastName ?? ""}`.trim(),
      status: toPublicStatus(r.status),
      createdAt: r.createdAt,
    }));
  },
});

// ─── Public landing page ─────────────────────────────────────────────────────

/** Branding and defaults for /r/<code>. Exposes no counters or internal ids. */
export const resolveReferralLink = query({
  args: { publicCode: v.string() },
  handler: async (ctx, args) => {
    const code = args.publicCode.trim();
    if (!code || code.length > 64) return null;
    const link = await ctx.db
      .query("partnerReferralLinks")
      .withIndex("by_public_code", (q) => q.eq("publicCode", code))
      .first();
    if (!link) return null;
    const partner = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", link.partnerId))
      .first();
    const expired = Boolean(link.expiresAt && link.expiresAt <= Date.now());
    const usable = link.status === "active" && !expired && Boolean(partner && isPartnerApproved(partner));
    return {
      publicCode: link.publicCode,
      status: usable ? ("active" as const) : expired || link.status === "expired" ? ("expired" as const) : ("inactive" as const),
      usable,
      environment: linkEnv(link),
      campaignName: link.campaignName ?? null,
      defaultCareMode: link.defaultCareMode ?? "patient_choice",
      partner: usable && partner
        ? { name: partner.name, logoUrl: partner.logoUrl ?? null, type: partner.type, supportedCareModes: partner.supportedCareModes ?? [] }
        : null,
    };
  },
});

/**
 * Attributes the signed-in user to the partner behind a referral-link code (from the
 * 30-day attribution cookie). Validated server-side; first partner wins.
 */
export const claimReferralAttribution = mutation({
  args: { publicCode: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (!viewer.user) return { attributed: false, reason: "user_not_ready" };
    const result = await attributeUserToLink(ctx, viewer.user, args.publicCode, "referral_link", { countSignup: true });
    // The request they sent from that link (same phone) now belongs to their account, so it moves
    // along with their care and the referrer sees it
    const me = await ctx.db.get(viewer.user._id);
    if (me && !me.linkedReferralId) {
      const lead = await findOpenReferralForPatient(ctx, me);
      if (lead && lead.partnerId === me.referredByPartnerCode) await attributeUserToReferral(ctx, me._id, lead);
    }
    return { attributed: result.attributed, reason: result.reason ?? null };
  },
});

// ─── Public tracking page (no personal or clinical data) ─────────────────────

const STATUS_LABEL: Record<string, string> = {
  received: "Referral received",
  contacted: "Care team in contact",
  booked: "First session booked",
  in_treatment: "Treatment in progress",
  completed: "Treatment completed",
  not_suitable: "Redirected to appropriate care",
  cancelled: "Cancelled",
  closed: "Closed",
};

export const getPublicReferralStatus = query({
  args: { trackingCode: v.string() },
  handler: async (ctx, args) => {
    const code = normalizeTrackingCode(args.trackingCode);
    if (!code) return null;
    const referral = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_tracking_code", (q) => q.eq("trackingCode", code))
      .first();
    if (!referral) return null;
    const partner = referral.partnerId
      ? await ctx.db
          .query("partners")
          .withIndex("by_code", (q) => q.eq("code", referral.partnerId!))
          .first()
      : null;
    const status = toPublicStatus(referral.status);
    const steps: Array<{ key: string; label: string; done: boolean; at: number | null }> = [
      { key: "received", label: "Referral received", done: true, at: referral.createdAt },
      { key: "contacted", label: "Care team in contact", done: Boolean(referral.contactedAt) || ["contacted", "booked", "in_treatment", "completed"].includes(status), at: referral.contactedAt ?? null },
      { key: "booked", label: "First session booked", done: Boolean(referral.bookedAt) || ["booked", "in_treatment", "completed"].includes(status), at: referral.bookedAt ?? null },
      { key: "in_treatment", label: "Treatment in progress", done: Boolean(referral.treatmentStartedAt) || ["in_treatment", "completed"].includes(status), at: referral.treatmentStartedAt ?? null },
      { key: "completed", label: "Treatment completed", done: status === "completed", at: referral.completedAt ?? null },
    ];
    return {
      trackingCode: code,
      status,
      statusLabel: STATUS_LABEL[status] ?? status,
      isSandbox: referral.environment === "sandbox",
      partnerName: partner?.name ?? null,
      createdAt: referral.createdAt,
      updatedAt: referral.updatedAt,
      steps,
      terminal: ["not_suitable", "cancelled", "closed"].includes(status) ? STATUS_LABEL[status] : null,
    };
  },
});

export type ReferralLinkDoc = Doc<"partnerReferralLinks">;
