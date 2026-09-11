import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const LEGACY_SPECIALTY_TAGS: Record<string, string> = {
  musculoskeletal: "MSK_GENERAL",
  orthopedic: "MSK_ORTHOPAEDIC",
  orthopaedic: "MSK_ORTHOPAEDIC",
  sports: "MSK_SPORTS",
  neurological: "NEURO_REHAB",
  pediatric: "PAEDIATRIC_PHYSIO",
  paediatric: "PAEDIATRIC_PHYSIO",
  geriatric: "GERIATRIC_REHAB",
};

function controlledTags(profile: { joySpecialtyTags?: string[]; specializations?: string[] }): string[] {
  if (profile.joySpecialtyTags?.length) return [...new Set(profile.joySpecialtyTags)];
  return [...new Set((profile.specializations ?? [])
    .map((label) => LEGACY_SPECIALTY_TAGS[label.trim().toLowerCase()])
    .filter((tag): tag is string => Boolean(tag)))];
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function displayName(user: { firstName?: string; lastName?: string }): string | undefined {
  const value = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return value || undefined;
}

export const resolvePatientByPhone = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const matches = await ctx.db.query("users").filter((q) => q.eq(q.field("phoneNumber"), phone)).collect();
    const patients = matches.filter((user) => user.role === "patient");
    if (patients.length !== 1) return { resolution: patients.length ? "AMBIGUOUS" : "NOT_FOUND" };
    const user = patients[0];
    return { resolution: "MATCH", patient_id: user._id, display_name: displayName(user) };
  },
});

export const recordExternalRequest = internalMutation({
  args: { requestId: v.string(), expiresAt: v.number() },
  handler: async (ctx, { requestId, expiresAt }) => {
    const existing = await ctx.db.query("joyIntegrationRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", requestId))
      .first();
    if (existing && existing.expiresAt > Date.now()) return { accepted: false };
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("joyIntegrationRequests", { requestId, expiresAt, createdAt: Date.now() });
    return { accepted: true };
  },
});

export const recordGatewayNonce = internalMutation({
  args: { nonce: v.string(), expiresAt: v.number() },
  handler: async (ctx, { nonce, expiresAt }) => {
    const existing = await ctx.db.query("joyIntegrationGatewayNonces")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .first();
    if (existing && existing.expiresAt > Date.now()) return { accepted: false };
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("joyIntegrationGatewayNonces", { nonce, expiresAt, createdAt: Date.now() });
    return { accepted: true };
  },
});

export const resolvePhysiotherapistByPhone = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const matches = await ctx.db.query("users").filter((q) => q.eq(q.field("phoneNumber"), phone)).collect();
    const providers = matches.filter((user) => user.role === "physiotherapist");
    if (providers.length !== 1) return { resolution: providers.length ? "AMBIGUOUS" : "NO_MATCH" };
    const user = providers[0];
    const profile = await ctx.db.query("physiotherapistProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first();
    const approval = await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first();
    if (!profile || approval?.status !== "approved") return { resolution: "INELIGIBLE" };
    return { resolution: "MATCH", physiotherapist_id: profile._id, display_name: displayName(user), capabilities: { specialties: profile.specializations ?? [], service_modes: [ ...(profile.offersOnlineSessions ? ["online"] : []), ...(profile.offersInPersonSessions ? ["in_person"] : []) ] } };
  },
});

/**
 * Read-only, conservative provider matching for Joy. It never reads a bio to
 * infer eligibility and excludes unapproved, unmodeled, or incomplete data.
 */
export const findMatches = internalQuery({
  args: {
    patientId: v.id("users"),
    requiredSpecialties: v.array(v.string()),
    serviceMode: v.union(v.literal("home_visit"), v.literal("clinic"), v.literal("online")),
    location: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new Error("Patient not found");
    const profiles = await ctx.db.query("physiotherapistProfiles")
      .withIndex("by_marketplace_availability", (q) => q.eq("isAvailableOnMarketplace", true))
      .collect();
    const requestedLocation = args.location ? normalized(args.location) : "";
    const results = [];
    for (const profile of profiles) {
      const approval = await ctx.db.query("accountApprovalStatus")
        .withIndex("by_user_id", (q) => q.eq("userId", profile.userId))
        .first();
      if (approval?.status !== "approved") continue;
      const modes = profile.joyServiceModes ?? [];
      if (!modes.includes(args.serviceMode)) continue;
      const tags = controlledTags(profile);
      if (!args.requiredSpecialties.every((tag) => tags.includes(tag))) continue;
      if (args.serviceMode === "home_visit") {
        const areas = (profile.joyServiceAreas ?? []).map(normalized);
        if (!requestedLocation || !areas.includes(requestedLocation)) continue;
      }
      if (!profile.availabilitySchedule) continue;
      const user = await ctx.db.get(profile.userId);
      if (!user) continue;
      const rate = profile.initialConsultRate ?? profile.hourlyRate;
      if (!Number.isFinite(rate) || !rate || rate <= 0) continue;
      results.push({
        physiotherapist_id: profile._id,
        physiotherapist_user_id: profile.userId,
        display_name: displayName(user),
        specialties: tags,
        service_modes: modes,
        amount_kobo: rate,
        match_reasons: ["verified specialty", "approved marketplace provider", "configured service mode"],
      });
    }
    return results.slice(0, Math.min(Math.max(args.limit, 1), 3));
  },
});

export const resolveProfileForAvailability = internalQuery({
  args: { physiotherapistId: v.id("physiotherapistProfiles"), serviceMode: v.union(v.literal("home_visit"), v.literal("clinic"), v.literal("online")) },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.physiotherapistId);
    if (!profile || !profile.joyServiceModes?.includes(args.serviceMode) || !profile.availabilitySchedule) {
      return null;
    }
    const approval = await ctx.db.query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", profile.userId)).first();
    if (approval?.status !== "approved") return null;
    return { physiotherapistUserId: profile.userId, amountKobo: profile.initialConsultRate ?? profile.hourlyRate ?? null };
  },
});
