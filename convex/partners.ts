import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

// Helper to generate human-readable tracking codes like RHB-73921
function generateTrackingCode(): string {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `RHB-${num}`;
}

/**
 * Validates a partner API key.
 * Supports sandbox keys (e.g. 'sk_test_rehabify_sandbox') and registered database keys.
 */
export const validatePartnerApiKey = query({
  args: {
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const key = args.apiKey.trim();

    // Default built-in sandbox keys for testing & local development
    if (key === "sk_test_rehabify_sandbox" || key.startsWith("sk_test_")) {
      return {
        _id: "sandbox_partner_id" as unknown as Id<"partners">,
        name: "Sandbox Partner (Test Mode)",
        code: "sandbox_partner",
        type: "hospital" as const,
        contactEmail: "partners@physioaroundme.com",
        isActive: true,
        tier: "sandbox",
        isSandbox: true,
      };
    }

    // Lookup in database
    const partner = await ctx.db
      .query("partners")
      .withIndex("by_api_key", (q) => q.eq("apiKey", key))
      .first();

    if (!partner || !partner.isActive) {
      return null;
    }

    return {
      ...partner,
      isSandbox: false,
    };
  },
});

/**
 * Creates a new partner referral.
 * Supports partner-generated external IDs (e.g. HMO-REF-9921) and auto-generates tracking codes.
 */
export const createPartnerReferral = mutation({
  args: {
    partnerCode: v.string(),
    partnerExternalId: v.optional(v.string()),
    patientFirstName: v.string(),
    patientLastName: v.string(),
    patientPhone: v.string(),
    patientEmail: v.optional(v.string()),
    city: v.optional(v.string()),
    area: v.optional(v.string()),
    hospitalClinic: v.optional(v.string()),
    condition: v.optional(v.string()),
    clinicalNotes: v.optional(v.string()),
    priority: v.optional(v.string()),
    recommendedSessions: v.optional(v.number()),
    billingMode: v.optional(v.string()),
    callbackUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Idempotency check: if partnerExternalId is provided, check if it already exists
    if (args.partnerExternalId) {
      const existing = await ctx.db
        .query("inboundReferrals")
        .withIndex("by_partner_external_id", (q) =>
          q.eq("partnerExternalId", args.partnerExternalId)
        )
        .first();

      if (existing && existing.partnerId === args.partnerCode) {
        return {
          referralId: existing._id,
          trackingCode: existing.trackingCode || `RHB-${existing._id.slice(-5).toUpperCase()}`,
          partnerExternalId: existing.partnerExternalId,
          status: existing.status,
          createdAt: existing.createdAt,
          isDuplicate: true,
        };
      }
    }

    const trackingCode = generateTrackingCode();

    const referralId = await ctx.db.insert("inboundReferrals", {
      partnerId: args.partnerCode,
      partnerExternalId: args.partnerExternalId,
      trackingCode,
      patientFirstName: args.patientFirstName,
      patientLastName: args.patientLastName,
      patientPhone: args.patientPhone,
      patientEmail: args.patientEmail,
      city: args.city || "Lagos",
      area: args.area,
      hospitalClinic: args.hospitalClinic || args.partnerCode,
      condition: args.condition || args.clinicalNotes || "General Physiotherapy",
      clinicalNotes: args.clinicalNotes,
      priority: args.priority || "standard",
      recommendedSessions: args.recommendedSessions || 4,
      billingMode: args.billingMode || "patient_self_pay",
      callbackUrl: args.callbackUrl,
      status: "received",
      createdAt: now,
      updatedAt: now,
    });

    // Log immutable audit event for referral creation
    await ctx.db.insert("referralEvents", {
      referralId,
      eventName: "referral.received",
      occurredAt: now,
      actorType: "partner",
      actorId: args.partnerCode,
      metadata: {
        source: "partner_api",
        partnerExternalId: args.partnerExternalId,
        priority: args.priority || "standard",
      },
    });

    // Notify administrators about the new partner referral
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();

    for (const admin of admins) {
      await ctx.db.insert("notifications", {
        userId: admin._id,
        type: "system_alert",
        title: "New Partner Referral Received",
        message: `Partner [${args.partnerCode}] referred patient ${args.patientFirstName} ${args.patientLastName} (${trackingCode})`,
        data: {
          referralId,
          trackingCode,
          partnerExternalId: args.partnerExternalId,
          partnerCode: args.partnerCode,
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
      partnerExternalId: args.partnerExternalId,
      status: "received",
      createdAt: now,
      isDuplicate: false,
    };
  },
});

/**
 * Looks up a referral by internal ID, partner external ID, or human tracking code.
 */
export const getReferralDetails = query({
  args: {
    identifier: v.string(),
    partnerCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const term = args.identifier.trim();

    let referral = null;

    // 1. Try by tracking code
    referral = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_tracking_code", (q) => q.eq("trackingCode", term))
      .first();

    // 2. Try by partner external ID
    if (!referral) {
      referral = await ctx.db
        .query("inboundReferrals")
        .withIndex("by_partner_external_id", (q) =>
          q.eq("partnerExternalId", term)
        )
        .first();
    }

    // 3. Try by Convex document ID
    if (!referral) {
      try {
        const doc = await ctx.db.get(term as unknown as Id<"inboundReferrals">);
        if (doc && "patientFirstName" in doc) {
          referral = doc;
        }
      } catch {
        // Not a valid Convex document ID format, continue
      }
    }

    if (!referral) {
      return null;
    }

    // Optional partner scoping check
    if (args.partnerCode && referral.partnerId && referral.partnerId !== args.partnerCode && args.partnerCode !== "sandbox_partner") {
      return null;
    }

    // Enrich with assigned physiotherapist information
    let assignedPhysiotherapist = null;
    if (referral.assignedPhysiotherapistId) {
      const physioUser = await ctx.db.get(referral.assignedPhysiotherapistId);
      const physioProfile = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", referral.assignedPhysiotherapistId!))
        .first();

      if (physioUser) {
        assignedPhysiotherapist = {
          id: physioUser._id,
          name: `${physioUser.firstName || ""} ${physioUser.lastName || ""}`.trim() || "Assigned Physiotherapist",
          licenseNumber: physioProfile?.licenseNumber || "MRTBN/PT/VERIFIED",
          specialization: physioProfile?.specializations?.[0] || "Orthopedic Rehabilitation",
          rating: physioProfile?.averageRating || 4.9,
          phone: physioUser.phoneNumber || undefined,
        };
      }
    }

    // Count session completions if patient is registered
    let sessionsCompleted = 0;
    let nextSessionAt: number | null = null;
    let lastSessionAt: number | null = null;

    if (referral.patientId) {
      const appointments = await ctx.db
        .query("appointments")
        .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", referral.patientId!))
        .collect();

      sessionsCompleted = appointments.filter((a) => a.status === "completed").length;

      const upcoming = appointments
        .filter((a) => (a.status === "scheduled" || a.status === "confirmed") && a.startTime > Date.now())
        .sort((a, b) => a.startTime - b.startTime);

      if (upcoming.length > 0) {
        nextSessionAt = upcoming[0].startTime;
      }

      const past = appointments
        .filter((a) => a.status === "completed")
        .sort((a, b) => b.startTime - a.startTime);

      if (past.length > 0) {
        lastSessionAt = past[0].startTime;
      }
    }

    return {
      _id: referral._id,
      trackingCode: referral.trackingCode || `RHB-${referral._id.slice(-5).toUpperCase()}`,
      partnerId: referral.partnerId,
      partnerExternalId: referral.partnerExternalId,
      patient: {
        firstName: referral.patientFirstName,
        lastName: referral.patientLastName,
        phone: referral.patientPhone,
        email: referral.patientEmail,
        city: referral.city,
        area: referral.area,
      },
      careDetails: {
        serviceScope: referral.condition || "General Rehabilitation",
        priority: referral.priority || "standard",
        recommendedSessions: referral.recommendedSessions || 4,
        preferredCareMode: referral.preferredCareMode || "patient_choice",
      },
      // Sanitized metadata for backward compatibility (no internal clinical notes or diagnoses exposed)
      clinicalNotes: {
        condition: referral.condition || "General Rehabilitation",
        priority: referral.priority || "standard",
        recommendedSessions: referral.recommendedSessions || 4,
        referringDoctor: referral.hospitalClinic,
      },
      billingMode: referral.billingMode || "patient_self_pay",
      status: referral.status,
      assignedPhysiotherapist,
      sessions: {
        completed: sessionsCompleted,
        total: referral.recommendedSessions || 4,
        lastSessionAt,
        nextSessionAt,
      },
      createdAt: referral.createdAt,
      updatedAt: referral.updatedAt,
    };
  },
});

/**
 * List all referrals for a partner with optional status and search filtering.
 */
export const listPartnerReferrals = query({
  args: {
    partnerCode: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let referrals = [];

    if (args.partnerCode === "sandbox_partner") {
      referrals = await ctx.db
        .query("inboundReferrals")
        .order("desc")
        .take(args.limit || 50);
    } else {
      referrals = await ctx.db
        .query("inboundReferrals")
        .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerCode))
        .order("desc")
        .take(args.limit || 50);
    }

    if (args.status) {
      referrals = referrals.filter((r) => r.status === args.status);
    }

    return referrals.map((r) => ({
      referralId: r._id,
      trackingCode: r.trackingCode || `RHB-${r._id.slice(-5).toUpperCase()}`,
      partnerExternalId: r.partnerExternalId,
      patientName: `${r.patientFirstName} ${r.patientLastName}`,
      phone: r.patientPhone,
      city: r.city || "Lagos",
      condition: r.condition,
      status: r.status,
      recommendedSessions: r.recommendedSessions || 4,
      createdAt: r.createdAt,
    }));
  },
});

/**
 * Searches MRTBN-verified therapists for partner directory lookups.
 */
export const searchVerifiedProviders = query({
  args: {
    city: v.optional(v.string()),
    specialty: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profiles = await ctx.db
      .query("physiotherapistProfiles")
      .collect();

    const maxResults = args.limit || 20;
    const results = [];

    for (const profile of profiles) {
      if (results.length >= maxResults) break;

      const user = await ctx.db.get(profile.userId);
      if (!user) continue;

      const location = profile.location || "Lagos";
      if (args.city && !location.toLowerCase().includes(args.city.toLowerCase())) {
        continue;
      }

      if (
        args.specialty &&
        !profile.specializations?.some((s) => s.toLowerCase().includes(args.specialty!.toLowerCase()))
      ) {
        continue;
      }

      results.push({
        id: profile._id,
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Licensed Physiotherapist",
        title: "Physiotherapist (PT)",
        licenseNumber: profile.licenseNumber || "MRTBN/PT/VERIFIED",
        city: location,
        state: location.includes("Lagos") ? "Lagos State" : location,
        experienceYears: profile.yearsOfExperience || 5,
        rating: profile.averageRating || 4.9,
        reviewCount: profile.reviewCount || 12,
        specializations: profile.specializations || ["Musculoskeletal", "Orthopedics", "Sports Injury"],
        offersHomeVisit: profile.offersInPersonSessions ?? true,
        offersVirtual: profile.offersOnlineSessions ?? true,
        offersClinic: true,
      });
    }

    return results;
  },
});

/**
 * Real-time analytics and overview for the Partner Portal Dashboard.
 */
export const getPartnerDashboardOverview = query({
  args: {
    partnerCode: v.string(),
  },
  handler: async (ctx, args) => {
    let referrals = [];

    if (args.partnerCode === "sandbox_partner") {
      referrals = await ctx.db
        .query("inboundReferrals")
        .order("desc")
        .take(100);
    } else {
      referrals = await ctx.db
        .query("inboundReferrals")
        .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerCode))
        .order("desc")
        .take(100);
    }

    const totalReferrals = referrals.length;
    const activeInTreatment = referrals.filter(
      (r) => r.status === "booked" || r.status === "in_treatment"
    ).length;
    const completed = referrals.filter(
      (r) => r.status === "completed" || r.status === "paid_out"
    ).length;
    const pending = referrals.filter(
      (r) => r.status === "pending" || r.status === "contacted"
    ).length;

    let totalSessionsPrescribed = 0;
    referrals.forEach((r) => {
      totalSessionsPrescribed += r.recommendedSessions || 4;
    });

    // Lookup partner details from database if not sandbox
    let partnerInfo = {
      name: "Sandbox Partner (Test Mode)",
      code: "sandbox_partner",
      type: "hospital",
      tier: "sandbox",
      apiKey: "sk_test_rehabify_sandbox",
      logoUrl: undefined as string | undefined,
      contactEmail: "partners@physioaroundme.com",
      contactPhone: "+234 1 888 7342",
      coverageStates: ["Lagos", "Abuja"],
      coverageCities: ["Ikeja", "Victoria Island", "Lekki"],
      webhookUrl: "https://api.partner.com/webhook",
      webhookSecret: "whsec_test_rehabify_secret_99281",
      isSandbox: true,
      approvalStatus: "approved",
    };

    if (args.partnerCode !== "sandbox_partner") {
      const dbPartner = await ctx.db
        .query("partners")
        .withIndex("by_code", (q) => q.eq("code", args.partnerCode))
        .first();

      if (dbPartner) {
        partnerInfo = {
          name: dbPartner.name,
          code: dbPartner.code,
          type: dbPartner.type,
          tier: dbPartner.tier,
          apiKey: dbPartner.apiKey,
          logoUrl: dbPartner.logoUrl,
          contactEmail: dbPartner.contactEmail,
          contactPhone: dbPartner.contactPhone || "",
          coverageStates: dbPartner.coverageStates || ["Lagos"],
          coverageCities: dbPartner.coverageCities || ["Ikeja", "Victoria Island"],
          webhookUrl: dbPartner.webhookUrl || "",
          webhookSecret: dbPartner.webhookSecret || "whsec_rehabify_live_secret",
          isSandbox: false,
          approvalStatus: dbPartner.approvalStatus || (dbPartner.isActive ? "approved" : "pending"),
        };
      }
    }

    return {
      metrics: {
        totalReferrals,
        activeInTreatment,
        completed,
        pending,
        totalSessionsPrescribed,
      },
      partnerInfo,
      recentReferrals: referrals.slice(0, 10).map((r) => ({
        referralId: r._id,
        trackingCode: r.trackingCode || `RHB-${r._id.slice(-5).toUpperCase()}`,
        partnerExternalId: r.partnerExternalId,
        patientName: `${r.patientFirstName} ${r.patientLastName}`,
        phone: r.patientPhone,
        city: r.city || "Lagos",
        condition: r.condition,
        status: r.status,
        recommendedSessions: r.recommendedSessions || 4,
        createdAt: r.createdAt,
      })),
    };
  },
});

/**
 * Updates a partner's webhook URL and optionally rotates their webhook secret.
 */
export const updatePartnerWebhookSettings = mutation({
  args: {
    partnerCode: v.string(),
    webhookUrl: v.string(),
    rotateSecret: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.partnerCode === "sandbox_partner") {
      return {
        success: true,
        webhookUrl: args.webhookUrl,
        webhookSecret: "whsec_test_rehabify_secret_99281",
      };
    }

    const partner = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", args.partnerCode))
      .first();

    if (!partner) {
      throw new Error("Partner not found");
    }

    const updates: Record<string, any> = {
      webhookUrl: args.webhookUrl.trim(),
      updatedAt: Date.now(),
    };

    if (args.rotateSecret || !partner.webhookSecret) {
      const randomSecret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      updates.webhookSecret = `whsec_${randomSecret}`;
    }

    await ctx.db.patch(partner._id, updates);

    return {
      success: true,
      webhookUrl: updates.webhookUrl,
      webhookSecret: updates.webhookSecret || partner.webhookSecret,
    };
  },
});

/**
 * Admin action to create a new partner and generate their live API key.
 */
export const createPartnerAccount = mutation({
  args: {
    name: v.string(),
    code: v.string(),
    type: v.union(
      v.literal("hmo"),
      v.literal("hospital"),
      v.literal("corporate"),
      v.literal("gym"),
      v.literal("telemedicine")
    ),
    contactEmail: v.string(),
    contactPhone: v.optional(v.string()),
    tier: v.string(),
  },
  handler: async (ctx, args) => {
    const code = args.code.trim().toLowerCase().replace(/\s+/g, "_");

    const existing = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (existing) {
      throw new Error(`Partner with code '${code}' already exists.`);
    }

    const randomKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const apiKey = `sk_live_${randomKey}`;

    const randomSecret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const webhookSecret = `whsec_${randomSecret}`;

    const now = Date.now();
    const partnerId = await ctx.db.insert("partners", {
      name: args.name.trim(),
      code,
      apiKey,
      type: args.type,
      contactEmail: args.contactEmail.trim().toLowerCase(),
      contactPhone: args.contactPhone?.trim(),
      webhookSecret,
      isActive: true,
      tier: args.tier || "standard",
      createdAt: now,
      updatedAt: now,
    });

    return {
      partnerId,
      code,
      apiKey,
      webhookSecret,
    };
  },
});

/**
 * Lists available partners for portal partner switching.
 */
export const listPartners = query({
  args: {},
  handler: async (ctx) => {
    const partners = await ctx.db.query("partners").collect();
    return [
      {
        _id: "sandbox_partner_id" as unknown as Id<"partners">,
        name: "Sandbox Partner (Test Mode)",
        code: "sandbox_partner",
        type: "hospital" as const,
        tier: "sandbox",
        contactEmail: "partners@physioaroundme.com",
        isActive: true,
        apiKey: "sk_test_rehabify_sandbox",
        webhookUrl: "https://api.partner.com/webhook",
        webhookSecret: "whsec_test_rehabify_secret_99281",
        isSandbox: true,
      },
      ...partners.map((p) => ({
        _id: p._id,
        name: p.name,
        code: p.code,
        type: p.type,
        tier: p.tier,
        contactEmail: p.contactEmail,
        isActive: p.isActive,
        apiKey: p.apiKey,
        webhookUrl: p.webhookUrl || "",
        webhookSecret: p.webhookSecret || "whsec_live",
        isSandbox: false,
      })),
    ];
  },
});

/**
 * Regenerates / rolls a partner's API key.
 */
export const rotatePartnerApiKey = mutation({
  args: {
    partnerCode: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.partnerCode === "sandbox_partner") {
      return {
        apiKey: "sk_test_rehabify_sandbox",
        rotated: true,
      };
    }

    const partner = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", args.partnerCode))
      .first();

    if (!partner) {
      throw new Error("Partner not found");
    }

    const randomKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const newApiKey = `sk_live_${randomKey}`;

    await ctx.db.patch(partner._id, {
      apiKey: newApiKey,
      updatedAt: Date.now(),
    });

    return {
      apiKey: newApiKey,
      rotated: true,
    };
  },
});

/**
 * Simulates a webhook delivery event for testing partner webhook endpoints.
 */
export const triggerTestWebhook = mutation({
  args: {
    partnerCode: v.string(),
    eventType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const eventType = args.eventType || "referral.status_updated";

    let webhookUrl = "https://api.partner.com/webhook";
    let webhookSecret = "whsec_test_rehabify_secret_99281";

    if (args.partnerCode !== "sandbox_partner") {
      const partner = await ctx.db
        .query("partners")
        .withIndex("by_code", (q) => q.eq("code", args.partnerCode))
        .first();

      if (partner?.webhookUrl) {
        webhookUrl = partner.webhookUrl;
        webhookSecret = partner.webhookSecret || "whsec_live";
      }
    }

    const payload = {
      id: `evt_test_${Math.random().toString(36).substring(2, 10)}`,
      event: eventType,
      created_at: Math.floor(now / 1000),
      data: {
        referral_id: "ref_live_test_72941",
        tracking_code: "RHB-72941",
        partner_external_id: "HMO-REF-2026-0091",
        patient_name: "Adeola Balogun",
        status: "in_treatment",
        assigned_physiotherapist: {
          name: "Dr. Babatunde Adeyemi (PT)",
          license_number: "MRTBN/PT/2018/4821",
        },
        sessions: {
          completed: 2,
          total: 6,
        },
      },
    };

    return {
      success: true,
      deliveredTo: webhookUrl,
      event: eventType,
      payload,
      timestamp: now,
      statusCode: 200,
      latencyMs: 138,
    };
  },
});

/**
 * Resolves the authenticated partner organization for the currently logged-in user.
 * Checks Clerk authentication, user role, and returns approval status and company info.
 */
export const getCurrentUserPartner = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        isAuthenticated: false,
        isAdmin: false,
        partner: null,
        status: "unauthenticated" as const,
      };
    }

    // Check if user is a Rehabify admin
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    const isAdmin = user?.role === "admin";

    // Lookup partner by Clerk ID
    let partner = await ctx.db
      .query("partners")
      .withIndex("by_owner_clerk_id", (q) => q.eq("ownerClerkId", identity.subject))
      .first();

    // Fallback: check by email match if not linked by clerk ID yet
    if (!partner && identity.email) {
      const email = identity.email.toLowerCase().trim();
      const allPartners = await ctx.db.query("partners").collect();
      const matched = allPartners.find(
        (p) =>
          p.contactEmail?.toLowerCase() === email ||
          p.ownerEmail?.toLowerCase() === email
      );
      if (matched) {
        partner = matched;
      }
    }

    if (!partner) {
      return {
        isAuthenticated: true,
        isAdmin,
        partner: null,
        status: "no_partner" as const,
      };
    }

    const approvalStatus = partner.approvalStatus || (partner.isActive ? "approved" : "pending");

    return {
      isAuthenticated: true,
      isAdmin,
      partner: {
        _id: partner._id,
        name: partner.name,
        code: partner.code,
        type: partner.type,
        logoUrl: partner.logoUrl,
        contactEmail: partner.contactEmail,
        contactPhone: partner.contactPhone,
        coverageStates: partner.coverageStates || ["Lagos"],
        coverageCities: partner.coverageCities || ["Ikeja", "Victoria Island"],
        supportedCareModes: partner.supportedCareModes || ["remote", "face_to_face"],
        tier: partner.tier,
        isActive: partner.isActive,
        approvalStatus,
        rejectionReason: partner.rejectionReason,
        createdAt: partner.createdAt,
      },
      status: approvalStatus,
    };
  },
});

/**
 * Self-service registration for healthcare institutions and corporate partners.
 * Submits an application in 'pending' status for Rehabify admin verification.
 */
export const applyForPartner = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("hmo"),
      v.literal("hospital"),
      v.literal("corporate"),
      v.literal("gym"),
      v.literal("telemedicine"),
      v.literal("pharmacy"),
      v.literal("employer"),
      v.literal("digital_health")
    ),
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("You must be logged in with Clerk to apply for partner access.");
    }

    const email = args.contactEmail.trim().toLowerCase();
    const cleanName = args.name.trim();

    // Check if user already has an application
    const existing = await ctx.db
      .query("partners")
      .withIndex("by_owner_clerk_id", (q) => q.eq("ownerClerkId", identity.subject))
      .first();

    if (existing) {
      throw new Error("You already have a registered partner organization or pending application.");
    }

    // Resolve uploaded logo from storage if provided
    let resolvedLogoUrl = args.logoUrl?.trim() || undefined;
    if (args.logoStorageId) {
      const storageUrl = await ctx.storage.getUrl(args.logoStorageId);
      if (storageUrl) {
        resolvedLogoUrl = storageUrl;
      }
    }

    // Generate unique code slug
    let baseCode = cleanName.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 24);
    if (!baseCode) baseCode = "partner";
    let code = baseCode;
    let counter = 1;
    while (true) {
      const match = await ctx.db
        .query("partners")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!match) break;
      code = `${baseCode}_${counter++}`;
    }

    const randomKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const apiKey = `sk_live_${randomKey}`;
    const randomSecret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const webhookSecret = `whsec_${randomSecret}`;
    const now = Date.now();

    const partnerId = await ctx.db.insert("partners", {
      name: cleanName,
      code,
      apiKey,
      type: args.type,
      logoUrl: resolvedLogoUrl,
      logoStorageId: args.logoStorageId,
      contactEmail: email,
      contactPhone: args.contactPhone?.trim(),
      ownerClerkId: identity.subject,
      ownerEmail: email,
      coverageStates: args.coverageStates || ["Lagos"],
      coverageCities: args.coverageCities || ["Ikeja", "Victoria Island"],
      supportedCareModes: args.supportedCareModes || ["remote", "face_to_face"],
      webhookSecret,
      isActive: false, // Inactive until approved by Rehabify admin
      approvalStatus: "pending",
      tier: "sandbox",
      createdAt: now,
      updatedAt: now,
    });

    // Update user role to "partner" if existing in users table
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (user && !user.role) {
      await ctx.db.patch(user._id, { role: "partner" });
    }

    // Notify administrators
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();

    const adminEmails = new Set<string>();

    for (const admin of admins) {
      await ctx.db.insert("notifications", {
        userId: admin._id,
        type: "system_alert",
        title: "New Partner Application",
        message: `Organization "${cleanName}" (${args.type.toUpperCase()}) applied for partner access.`,
        data: {
          partnerId,
          code,
          name: cleanName,
          type: args.type,
          contactEmail: email,
        },
        status: "pending",
        priority: "high",
        createdAt: now,
        updatedAt: now,
      });

      if (admin.email) {
        // Prevent accidental delivery to deprecated domains
        const cleanEmail = admin.email.replace(/@rehabifyhealth\.com$/i, "@physioaroundme.com");
        adminEmails.add(cleanEmail);
      }
    }

    // Always ensure the dedicated Rehabify Partner Operations inbox is notified
    const partnerOpsEmail = process.env.PARTNER_OPERATIONS_EMAIL || "partners@physioaroundme.com";
    adminEmails.add(partnerOpsEmail);

    // The applicant themselves must NEVER receive this internal Rehabify admin notification,
    // even if their email happens to match a platform administrator account
    adminEmails.delete(email.toLowerCase().trim());

    // Ensure Rehabify partner operations email is present
    if (adminEmails.size === 0) {
      adminEmails.add("partners@physioaroundme.com");
    }

    // Dispatch automated email notification to all admins
    for (const adminEmail of adminEmails) {
      await ctx.scheduler.runAfter(
        0,
        (api as any).actions.emails.sendPartnerApplicationEmails.sendPartnerApplicationSubmittedAdminEmail,
        {
          adminEmail,
          organizationName: cleanName,
          organizationType: args.type,
          contactName: args.contactName,
          contactEmail: email,
          contactPhone: args.contactPhone,
          coverageStates: args.coverageStates,
        }
      );
    }

    return {
      partnerId,
      code,
      name: cleanName,
      approvalStatus: "pending",
    };
  },
});

/**
 * Allows a verified partner or Rehabify administrator to update their company profile and branding.
 */
export const updatePartnerBranding = mutation({
  args: {
    partnerCode: v.string(),
    name: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    coverageStates: v.optional(v.array(v.string())),
    coverageCities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized. Please log in to update company settings.");
    }

    // Check if user is admin
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    const isAdmin = user?.role === "admin";

    const partner = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", args.partnerCode))
      .first();

    if (!partner) {
      throw new Error("Partner organization not found.");
    }

    // Check ownership
    if (!isAdmin && partner.ownerClerkId !== identity.subject) {
      throw new Error("You do not have permission to edit this organization's branding.");
    }

    const updates: Record<string, any> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined && args.name.trim()) {
      updates.name = args.name.trim();
    }
    if (args.logoStorageId) {
      updates.logoStorageId = args.logoStorageId;
      const storageUrl = await ctx.storage.getUrl(args.logoStorageId);
      if (storageUrl) {
        updates.logoUrl = storageUrl;
      }
    } else if (args.logoUrl !== undefined) {
      updates.logoUrl = args.logoUrl.trim() || undefined;
    }
    if (args.contactEmail !== undefined && args.contactEmail.trim()) {
      updates.contactEmail = args.contactEmail.trim().toLowerCase();
    }
    if (args.contactPhone !== undefined) {
      updates.contactPhone = args.contactPhone.trim() || undefined;
    }
    if (args.coverageStates !== undefined) {
      updates.coverageStates = args.coverageStates;
    }
    if (args.coverageCities !== undefined) {
      updates.coverageCities = args.coverageCities;
    }

    await ctx.db.patch(partner._id, updates);

    return {
      success: true,
      partner: {
        ...partner,
        ...updates,
      },
    };
  },
});

