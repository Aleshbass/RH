/**
 * One-off partner-platform migrations. Run from the Convex dashboard or CLI after deploy:
 *
 *   npx convex run partnerMigrations:backfillReferralFields '{}' --prod
 *   npx convex run partnerMigrations:backfillLinkEnvironment '{}' --prod
 *   npx convex run partnerMigrations:rotateAllPartnerCredentials '{"dryRun": true}' --prod
 *   npx convex run partnerMigrations:rotateAllPartnerCredentials '{"dryRun": false, "notify": true}' --prod
 *
 * rotateAllPartnerCredentials revokes EVERY API key issued before hashing (they were
 * readable through formerly public queries), clears the legacy plaintext key columns,
 * and issues new webhook signing secrets. Partners create new keys in the portal.
 */
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { normalizePhone, randomString } from "./helpers/partnerShared";

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const listPartnersForRotation = internalQuery({
  args: {},
  handler: async (ctx) => {
    const partners = await ctx.db.query("partners").collect();
    const rows = [];
    for (const p of partners) {
      const keys = await ctx.db
        .query("partnerApiKeys")
        .withIndex("by_partner", (q) => q.eq("partnerId", p.code))
        .collect();
      rows.push({
        id: p._id,
        code: p.code,
        name: p.name,
        email: p.technicalContactEmail || p.contactEmail || p.ownerEmail || null,
        activeKeys: keys.filter((k) => k.status !== "revoked").length,
        plaintextKeys: keys.filter((k) => Boolean(k.key)).length + [p.apiKey, p.liveApiKey, p.testApiKey].filter(Boolean).length,
        hasLiveSecret: Boolean(p.liveWebhookSecret || p.webhookSecret),
        hasTestSecret: Boolean(p.testWebhookSecret),
      });
    }
    return rows;
  },
});

export const applyCredentialRotation = internalMutation({
  args: {
    partnerId: v.id("partners"),
    liveSecret: v.optional(v.string()),
    testSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const partner = await ctx.db.get(args.partnerId);
    if (!partner) return { revoked: 0 };
    const now = Date.now();
    const keys = await ctx.db
      .query("partnerApiKeys")
      .withIndex("by_partner", (q) => q.eq("partnerId", partner.code))
      .collect();
    let revoked = 0;
    for (const key of keys) {
      // Hashed keys created after this release are kept; everything older is revoked.
      if (key.keyHash && !key.key && key.createdAt > (partner.credentialsRotatedAt ?? 0)) continue;
      await ctx.db.patch(key._id, { status: "revoked", key: undefined, revokedAt: now, revokedBy: "security_rotation" });
      revoked++;
    }
    await ctx.db.patch(partner._id, {
      apiKey: undefined,
      liveApiKey: undefined,
      testApiKey: undefined,
      ...(args.liveSecret ? { liveWebhookSecret: args.liveSecret, webhookSecret: args.liveSecret } : {}),
      ...(args.testSecret ? { testWebhookSecret: args.testSecret } : {}),
      credentialsRotatedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("partnerActivityLogs", {
      partnerId: partner.code,
      environment: "live",
      eventId: `evt_rotation_${now}`,
      eventType: "security.credentials_rotated",
      direction: "inbound",
      url: "/security/rotation",
      method: "POST",
      statusCode: 200,
      latencyMs: 0,
      status: "success",
      requestPayload: { revokedKeys: revoked, liveSecretRotated: Boolean(args.liveSecret), testSecretRotated: Boolean(args.testSecret) },
      occurredAt: now,
    });
    return { revoked };
  },
});

export const rotateAllPartnerCredentials = internalAction({
  args: { dryRun: v.boolean(), notify: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const partners: Array<{
      id: Id<"partners">;
      code: string;
      name: string;
      email: string | null;
      activeKeys: number;
      plaintextKeys: number;
      hasLiveSecret: boolean;
      hasTestSecret: boolean;
    }> = await ctx.runQuery(internal.partnerMigrations.listPartnersForRotation, {});
    if (args.dryRun) return { dryRun: true, partners };
    const results = [];
    for (const p of partners) {
      const liveSecret = p.hasLiveSecret ? `whsec_${randomString(40, BASE62)}` : undefined;
      const testSecret = p.hasTestSecret ? `whsec_${randomString(40, BASE62)}` : undefined;
      const outcome: { revoked: number } = await ctx.runMutation(internal.partnerMigrations.applyCredentialRotation, { partnerId: p.id, liveSecret, testSecret });
      if (args.notify && p.email) {
        await ctx.runAction(internal.actions.emails.sendPartnerApplicationEmails.sendPartnerGoLiveEmail, {
          to: p.email,
          kind: "credentials_rotated",
          organizationName: p.name,
          partnerCode: p.code,
        });
      }
      results.push({ code: p.code, ...outcome });
    }
    return { dryRun: false, rotated: results };
  },
});

/**
 * Sets environment = "live" on referrals created before the field existed and fills
 * the normalised phone used for de-duplication and WhatsApp matching. Self-continues.
 */
export const backfillReferralFields = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("inboundReferrals").paginate({ numItems: 200, cursor: args.cursor ?? null });
    let updated = 0;
    for (const r of page.page) {
      const patch: Record<string, unknown> = {};
      if (!r.environment) patch.environment = r.partnerId === "sandbox_partner" ? "sandbox" : "live";
      if (!r.patientPhoneNormalized && r.patientPhone) {
        const normalized = normalizePhone(r.patientPhone);
        if (normalized) patch.patientPhoneNormalized = normalized;
      }
      if (Object.keys(patch).length) {
        await ctx.db.patch(r._id, patch);
        updated++;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.partnerMigrations.backfillReferralFields, { cursor: page.continueCursor });
    }
    return { updated, done: page.isDone };
  },
});

/** Referral links created before environments existed are live links. */
export const backfillLinkEnvironment = internalMutation({
  args: {},
  handler: async (ctx) => {
    const links = await ctx.db.query("partnerReferralLinks").collect();
    let updated = 0;
    for (const link of links) {
      if (!link.environment) {
        await ctx.db.patch(link._id, { environment: "live", signups: link.signups ?? 0 });
        updated++;
      }
    }
    return { updated };
  },
});
