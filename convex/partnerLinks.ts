import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Generate a short, non-guessable public code for partner referral links.
 * Format: {partnerPrefix}-{random4chars}  e.g. "wella-7KQ2"
 */
function generatePublicCode(partnerCode: string): string {
  const prefix = partnerCode.slice(0, 5).toLowerCase();
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let random = "";
  for (let i = 0; i < 4; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${random}`;
}

function generateTrackingCode(): string {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `RHB-${num}`;
}

// ─── Admin: Create a referral link ─────────────────────────────

/**
 * Creates a new partner referral link (admin action).
 * POST /v1/admin/partners/{partner_id}/referral-links
 */
export const createReferralLink = mutation({
  args: {
    partnerId: v.string(),
    campaignName: v.optional(v.string()),
    serviceScope: v.optional(v.string()),
    defaultCareMode: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const publicCode = generatePublicCode(args.partnerId);

    // Ensure unique public code
    const existing = await ctx.db
      .query("partnerReferralLinks")
      .withIndex("by_public_code", (q) => q.eq("publicCode", publicCode))
      .first();

    // Extremely unlikely collision — regenerate if needed
    const finalCode = existing ? generatePublicCode(args.partnerId + now.toString().slice(-3)) : publicCode;

    const linkId = await ctx.db.insert("partnerReferralLinks", {
      partnerId: args.partnerId,
      publicCode: finalCode,
      campaignName: args.campaignName,
      serviceScope: args.serviceScope || "all_rehabilitation",
      defaultCareMode: args.defaultCareMode || "patient_choice",
      status: "active",
      expiresAt: args.expiresAt || undefined,
      clicks: 0,
      leads: 0,
      joyStarts: 0,
      bookings: 0,
      payments: 0,
      createdAt: now,
      updatedAt: now,
    });

    return {
      referralLinkId: linkId,
      publicCode: finalCode,
      url: `https://rehabify.com/r/${finalCode}`,
      status: "active",
      createdAt: new Date(now).toISOString(),
    };
  },
});

// ─── Public: Resolve a referral link ───────────────────────────

/**
 * Resolves a public code to its partner referral link details.
 * Used by the landing page to display partner branding and defaults.
 */
export const resolveReferralLink = query({
  args: {
    publicCode: v.string(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("partnerReferralLinks")
      .withIndex("by_public_code", (q) => q.eq("publicCode", args.publicCode))
      .first();

    if (!link) return null;

    // Check expiry
    if (link.expiresAt && link.expiresAt < Date.now()) {
      return { ...link, status: "expired" as const, expired: true };
    }

    if (link.status !== "active") {
      return { ...link, expired: link.status === "expired" };
    }

    // Fetch partner details for branding
    const partner = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", link.partnerId))
      .first();

    return {
      _id: link._id,
      publicCode: link.publicCode,
      partnerId: link.partnerId,
      campaignName: link.campaignName,
      serviceScope: link.serviceScope,
      defaultCareMode: link.defaultCareMode,
      status: link.status,
      expired: false,
      partner: partner
        ? {
            name: partner.name,
            logoUrl: partner.logoUrl,
            type: partner.type,
            supportedCareModes: partner.supportedCareModes,
          }
        : {
            name: "Rehabify Health Partner",
            logoUrl: null,
            type: "hospital" as const,
            supportedCareModes: ["remote", "face_to_face"],
          },
    };
  },
});

// ─── Public: Record a link click ───────────────────────────────

/**
 * Records a click on a partner referral link.
 * Called when the landing page loads.
 */
export const recordLinkClick = mutation({
  args: {
    publicCode: v.string(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("partnerReferralLinks")
      .withIndex("by_public_code", (q) => q.eq("publicCode", args.publicCode))
      .first();

    if (!link || link.status !== "active") return null;

    // Check expiry
    if (link.expiresAt && link.expiresAt < Date.now()) {
      await ctx.db.patch(link._id, { status: "expired", updatedAt: Date.now() });
      return null;
    }

    await ctx.db.patch(link._id, {
      clicks: (link.clicks || 0) + 1,
      updatedAt: Date.now(),
    });

    // Record activity in partnerActivityLogs for developer console & dashboard analytics
    const isSandbox =
      link.partnerId === "sandbox_partner" ||
      link.partnerId.includes("sandbox") ||
      link.partnerId.includes("test");
    const environment = isSandbox ? ("sandbox" as const) : ("live" as const);

    await ctx.db.insert("partnerActivityLogs", {
      partnerId: link.partnerId,
      environment,
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      eventType: "link.clicked",
      direction: "inbound",
      url: `/r/${args.publicCode}`,
      method: "GET",
      statusCode: 200,
      latencyMs: 18,
      status: "success",
      requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      requestPayload: {
        publicCode: args.publicCode,
        campaignName: link.campaignName,
      },
      responsePayload: { recorded: true },
      occurredAt: Date.now(),
    });

    return { recorded: true };
  },
});

// ─── Public: Submit a lead from the landing page ───────────────

/**
 * Creates a referral from the partner landing page.
 * This is the core lead capture endpoint.
 *
 * POST /v1/public/referral-links/{public_code}/leads
 */
export const submitLead = mutation({
  args: {
    publicCode: v.string(),
    sessionId: v.optional(v.string()),
    // Patient details
    firstName: v.string(),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    preferredLanguage: v.optional(v.string()),
    // Need
    reason: v.optional(v.string()),
    preferredCareMode: v.optional(v.string()),
    // Next step
    nextStep: v.optional(v.string()), // defaults to "contact_me"
    preferredContactChannel: v.optional(v.string()), // "whatsapp", "email", "sms"
    // Consent
    consentGranted: v.boolean(),
    privacyNoticeVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Resolve the link
    const link = await ctx.db
      .query("partnerReferralLinks")
      .withIndex("by_public_code", (q) => q.eq("publicCode", args.publicCode))
      .first();

    if (!link || link.status !== "active") {
      throw new Error("This referral link is no longer active.");
    }

    if (link.expiresAt && link.expiresAt < Date.now()) {
      await ctx.db.patch(link._id, { status: "expired", updatedAt: now });
      throw new Error("This referral link has expired.");
    }

    // 2. Deduplication: check by phone + partner within recent window (24h)
    if (args.phone) {
      const recentWindow = now - 24 * 60 * 60 * 1000;
      const existingByPhone = await ctx.db
        .query("inboundReferrals")
        .withIndex("by_partner_id", (q) => q.eq("partnerId", link.partnerId))
        .collect();

      const duplicate = existingByPhone.find(
        (r) =>
          r.patientPhone === args.phone &&
          r.createdAt > recentWindow
      );

      if (duplicate) {
        return {
          referralId: duplicate._id,
          trackingCode: duplicate.trackingCode || "",
          status: duplicate.status,
          isDuplicate: true,
          nextAction: "contact_pending",
        };
      }
    }

    // 3. Create the referral
    const trackingCode = generateTrackingCode();

    const referralId = await ctx.db.insert("inboundReferrals", {
      partnerId: link.partnerId,
      linkId: link._id,
      campaignName: link.campaignName,
      firstClickAt: now,
      conversionSource: "partner_link",
      trackingCode,
      patientFirstName: args.firstName.trim(),
      patientLastName: (args.lastName || "").trim(),
      patientPhone: (args.phone || "").trim(),
      patientEmail: args.email?.trim(),
      city: args.city?.trim() || "Lagos",
      state: args.state?.trim(),
      preferredLanguage: args.preferredLanguage || "en",
      reason: args.reason?.trim(),
      preferredCareMode: args.preferredCareMode || link.defaultCareMode || "patient_choice",
      preferredContactChannel: args.preferredContactChannel || "whatsapp",
      nextStep: "contact_me",
      consentGranted: args.consentGranted,
      consentCapturedAt: now,
      consentMethod: "partner_landing",
      consentPrivacyNoticeVersion: args.privacyNoticeVersion || "2026-09-01",
      status: args.consentGranted ? "received" : "consent_pending",
      createdAt: now,
      updatedAt: now,
    });

    // 4. Create consent record
    await ctx.db.insert("patientConsents", {
      referralId,
      patientPhone: args.phone?.trim(),
      patientEmail: args.email?.trim(),
      granted: args.consentGranted,
      capturedAt: now,
      method: "partner_landing",
      privacyNoticeVersion: args.privacyNoticeVersion || "2026-09-01",
    });

    // 5. Create immutable audit event
    await ctx.db.insert("referralEvents", {
      referralId,
      eventName: "lead.submitted",
      occurredAt: now,
      actorType: "patient",
      metadata: {
        publicCode: args.publicCode,
        campaignName: link.campaignName,
        partnerId: link.partnerId,
        nextStep: args.nextStep,
      },
    });

    // Also log the "received" event
    if (args.consentGranted) {
      await ctx.db.insert("referralEvents", {
        referralId,
        eventName: "referral.received",
        occurredAt: now,
        actorType: "system",
        metadata: { source: "partner_landing_page" },
      });
    }

    // 5b. Record in partnerActivityLogs for Developer Console & Activity Inspector
    const isLeadSandbox =
      link.partnerId === "sandbox_partner" ||
      link.partnerId.includes("sandbox") ||
      link.partnerId.includes("test");
    const leadEnvironment = isLeadSandbox ? ("sandbox" as const) : ("live" as const);
    const patientFullName = `${args.firstName.trim()} ${(args.lastName || "").trim()}`.trim();

    await ctx.db.insert("partnerActivityLogs", {
      partnerId: link.partnerId,
      environment: leadEnvironment,
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      eventType: "referral.received",
      direction: "inbound",
      url: `/r/${args.publicCode}`,
      method: "POST",
      statusCode: 201,
      latencyMs: 42,
      status: "success",
      patientName: patientFullName,
      trackingCode,
      requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      requestPayload: {
        publicCode: args.publicCode,
        campaignName: link.campaignName,
        preferredCareMode: args.preferredCareMode || link.defaultCareMode || "patient_choice",
        preferredContactChannel: args.preferredContactChannel || "whatsapp",
        city: args.city || "Lagos",
      },
      responsePayload: {
        referralId,
        trackingCode,
        status: args.consentGranted ? "received" : "consent_pending",
      },
      occurredAt: now,
    });

    // 6. Create an outreach task for Rehabify Care Team
    const contactChannel = (args.preferredContactChannel || "whatsapp") as "whatsapp" | "email" | "sms" | "phone";
    await ctx.db.insert("partnerContactRequests", {
      referralId,
      channel: contactChannel,
      status: "pending",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    // 7. Update link analytics
    await ctx.db.patch(link._id, {
      leads: (link.leads || 0) + 1,
      joyStarts: args.nextStep === "start_joy" ? (link.joyStarts || 0) + 1 : link.joyStarts,
      updatedAt: now,
    });

    // 8. Notify admins
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();

    for (const admin of admins) {
      await ctx.db.insert("notifications", {
        userId: admin._id,
        type: "system_alert",
        title: "New Partner Referral Lead",
        message: `Partner link [${link.partnerId}] – ${args.firstName} ${args.lastName || ""} submitted via ${args.nextStep === "start_joy" ? "Joy" : args.preferredContactChannel || "landing page"} (${trackingCode})`,
        data: {
          referralId,
          trackingCode,
          partnerId: link.partnerId,
          publicCode: args.publicCode,
        },
        status: "pending",
        priority: "high",
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      referralId,
      trackingCode,
      status: args.consentGranted ? "received" : "consent_pending",
      isDuplicate: false,
      nextAction: "contact_pending",
      contactRequestId: referralId,
    };
  },
});

// ─── Admin: List referral links for a partner ──────────────────

export const listReferralLinks = query({
  args: {
    partnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("partnerReferralLinks")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerId))
      .order("desc")
      .collect();

    return links.map((link) => ({
      ...link,
      url: `https://rehabify.com/r/${link.publicCode}`,
      conversionRate:
        link.clicks && link.clicks > 0
          ? ((link.leads || 0) / link.clicks * 100).toFixed(1) + "%"
          : "0%",
    }));
  },
});

// ─── Admin: Deactivate or reactivate a link ────────────────────

export const updateLinkStatus = mutation({
  args: {
    linkId: v.id("partnerReferralLinks"),
    status: v.union(v.literal("active"), v.literal("inactive")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.linkId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

// ─── Query: Get referral events timeline ───────────────────────

/**
 * Returns the immutable event history for a referral.
 * Used in both admin and partner portal for status tracking.
 */
export const getReferralTimeline = query({
  args: {
    referralId: v.id("inboundReferrals"),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("referralEvents")
      .withIndex("by_referral_id", (q) => q.eq("referralId", args.referralId))
      .order("asc")
      .collect();

    return events;
  },
});
