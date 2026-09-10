import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

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
