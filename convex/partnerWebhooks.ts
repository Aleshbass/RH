/**
 * Partner webhook outbox: delivery state machine, retries, and portal controls.
 *
 * Retry schedule (documented): first attempt immediately, then 8 retries after
 * 15s, 1m, 5m, 30m, 2h, 6h, 12h, 24h (≈44.6h). The event id and body never change
 * between attempts, so partners can de-duplicate on the event id.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { requirePartnerAccess, requirePartnerEnvAccess } from "./helpers/partnerAccess";
import { webhookTargetFor } from "./helpers/partnerShared";
import { enqueuePartnerEvent, isWebhookEventType, sampleReferralView } from "./helpers/partnerEvents";
import { findPartnerReferral, serializeReferral } from "./helpers/partnerShared";

export const RETRY_DELAYS_MS = [15_000, 60_000, 300_000, 1_800_000, 7_200_000, 21_600_000, 43_200_000, 86_400_000];
export const MAX_DELIVERY_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const STALE_DELIVERING_MS = 5 * 60_000;
const envValidator = v.union(v.literal("sandbox"), v.literal("live"));

/** Claims the next attempt. Returns the signing material only to the delivery action. */
export const beginDeliveryAttempt = internalMutation({
  args: { deliveryId: v.id("partnerWebhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const delivery = await ctx.db.get(deliveryId);
    if (!delivery) return { proceed: false as const };
    const now = Date.now();
    const staleDelivering = delivery.status === "delivering" && (delivery.lastAttemptAt ?? 0) < now - STALE_DELIVERING_MS;
    if (delivery.status !== "pending" && !staleDelivering) return { proceed: false as const };
    if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) {
      await ctx.db.patch(deliveryId, { status: "failed", nextAttemptAt: undefined, updatedAt: now });
      return { proceed: false as const };
    }

    const partner = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", delivery.partnerId))
      .first();
    const target = partner ? webhookTargetFor(partner, delivery.environment) : {};
    if (!target.url || !target.secret) {
      await ctx.db.patch(deliveryId, {
        status: "skipped",
        nextAttemptAt: undefined,
        lastError: `No ${delivery.environment} webhook endpoint is configured.`,
        updatedAt: now,
      });
      return { proceed: false as const };
    }

    const attempt = delivery.attempts + 1;
    await ctx.db.patch(deliveryId, {
      status: "delivering",
      attempts: attempt,
      lastAttemptAt: now,
      lastTargetUrl: target.url,
      nextAttemptAt: undefined,
      updatedAt: now,
    });
    return {
      proceed: true as const,
      attempt,
      url: target.url,
      secret: target.secret,
      payload: delivery.payload,
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      environment: delivery.environment,
    };
  },
});

/** Records an attempt's outcome and schedules the next retry (or gives up). */
export const completeDeliveryAttempt = internalMutation({
  args: {
    deliveryId: v.id("partnerWebhookDeliveries"),
    ok: v.boolean(),
    statusCode: v.optional(v.number()),
    error: v.optional(v.string()),
    responseSnippet: v.optional(v.string()),
    latencyMs: v.number(),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) return;
    const now = Date.now();
    const base = {
      lastStatusCode: args.statusCode,
      lastError: args.ok ? undefined : (args.error ?? "Delivery failed").slice(0, 500),
      lastResponseSnippet: args.responseSnippet?.slice(0, 2000),
      lastLatencyMs: args.latencyMs,
      updatedAt: now,
    };

    let retryInMs: number | null = null;
    if (args.ok) {
      await ctx.db.patch(args.deliveryId, { ...base, status: "succeeded", deliveredAt: now, nextAttemptAt: undefined });
    } else if (delivery.attempts < MAX_DELIVERY_ATTEMPTS) {
      retryInMs = RETRY_DELAYS_MS[delivery.attempts - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      await ctx.db.patch(args.deliveryId, { ...base, status: "pending", nextAttemptAt: now + retryInMs });
      await ctx.scheduler.runAfter(retryInMs, internal.actions.partners.dispatchWebhook.deliverPartnerWebhook, {
        deliveryId: args.deliveryId,
      });
    } else {
      await ctx.db.patch(args.deliveryId, { ...base, status: "failed", nextAttemptAt: undefined });
    }

    // Mirror into the developer activity log shown in the Partner Portal.
    const errorMessage = args.ok
      ? undefined
      : `${args.error ?? "Delivery failed"}${retryInMs !== null ? ` — attempt ${delivery.attempts}/${MAX_DELIVERY_ATTEMPTS}, retrying in ${Math.round(retryInMs / 1000)}s` : ` — attempt ${delivery.attempts}/${MAX_DELIVERY_ATTEMPTS}, no retries left`}`;
    await ctx.db.insert("partnerActivityLogs", {
      partnerId: delivery.partnerId,
      environment: delivery.environment,
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      direction: "outbound",
      url: delivery.lastTargetUrl ?? "",
      method: "POST",
      statusCode: args.statusCode ?? 0,
      latencyMs: args.latencyMs,
      status: args.ok ? "success" : "error",
      trackingCode: delivery.trackingCode,
      requestHeaders: {
        "X-Rehabify-Event-Id": delivery.eventId,
        "X-Rehabify-Event-Type": delivery.eventType,
        "X-Rehabify-Delivery-Attempt": String(delivery.attempts),
      },
      requestPayload: safeJson(delivery.payload),
      responsePayload: args.responseSnippet ? { body: args.responseSnippet.slice(0, 2000) } : undefined,
      errorMessage: errorMessage?.slice(0, 1000),
      occurredAt: now,
    });
  },
});

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Safety net (cron): re-schedules deliveries whose scheduled attempt was lost. */
export const sweepDeliveries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const overdue = await ctx.db
      .query("partnerWebhookDeliveries")
      .withIndex("by_status_next_attempt", (q) => q.eq("status", "pending").lte("nextAttemptAt", now - 2 * 60_000))
      .take(100);
    const stuck = await ctx.db
      .query("partnerWebhookDeliveries")
      .withIndex("by_status_next_attempt", (q) => q.eq("status", "delivering"))
      .take(100);
    let rescheduled = 0;
    for (const delivery of overdue) {
      await ctx.scheduler.runAfter(0, internal.actions.partners.dispatchWebhook.deliverPartnerWebhook, { deliveryId: delivery._id });
      rescheduled++;
    }
    for (const delivery of stuck) {
      if ((delivery.lastAttemptAt ?? 0) >= now - STALE_DELIVERING_MS) continue;
      await ctx.db.patch(delivery._id, { status: "pending", nextAttemptAt: now, updatedAt: now });
      await ctx.scheduler.runAfter(0, internal.actions.partners.dispatchWebhook.deliverPartnerWebhook, { deliveryId: delivery._id });
      rescheduled++;
    }
    return { rescheduled };
  },
});

// ─── Partner Portal ──────────────────────────────────────────────────────────

function deliveryView(d: Doc<"partnerWebhookDeliveries">) {
  return {
    _id: d._id,
    eventId: d.eventId,
    eventType: d.eventType,
    environment: d.environment,
    status: d.status,
    attempts: d.attempts,
    maxAttempts: MAX_DELIVERY_ATTEMPTS,
    trackingCode: d.trackingCode ?? null,
    lastStatusCode: d.lastStatusCode ?? null,
    lastError: d.lastError ?? null,
    lastResponseSnippet: d.lastResponseSnippet ?? null,
    lastLatencyMs: d.lastLatencyMs ?? null,
    lastTargetUrl: d.lastTargetUrl ?? null,
    nextAttemptAt: d.nextAttemptAt ?? null,
    deliveredAt: d.deliveredAt ?? null,
    createdAt: d.createdAt,
    payload: d.payload,
  };
}

export const listWebhookDeliveries = query({
  args: {
    partnerCode: v.string(),
    environment: envValidator,
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePartnerAccess(ctx, args.partnerCode);
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 50), 1), 200);
    const rows = await ctx.db
      .query("partnerWebhookDeliveries")
      .withIndex("by_partner_env_created", (q) => q.eq("partnerId", args.partnerCode).eq("environment", args.environment))
      .order("desc")
      .take(args.status && args.status !== "all" ? 500 : limit);
    return rows
      .filter((d) => !args.status || args.status === "all" || d.status === args.status)
      .slice(0, limit)
      .map(deliveryView);
  },
});

/** Re-delivers an event (same event id) — e.g. after fixing the endpoint. */
export const resendWebhookDelivery = mutation({
  args: { partnerCode: v.string(), deliveryId: v.id("partnerWebhookDeliveries") },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode, { requireApproved: true });
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.partnerId !== partner.code) throw new ConvexError("Delivery not found.");
    if (delivery.status === "delivering") throw new ConvexError("This event is being delivered right now.");
    const target = webhookTargetFor(partner, delivery.environment);
    if (!target.url || !target.secret) {
      throw new ConvexError(`Save your ${delivery.environment} webhook endpoint before resending.`);
    }
    const now = Date.now();
    await ctx.db.patch(delivery._id, {
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      lastError: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.actions.partners.dispatchWebhook.deliverPartnerWebhook, { deliveryId: delivery._id });
    return { deliveryId: delivery._id, eventId: delivery.eventId };
  },
});

/**
 * Sends a real, signed test event to the partner's endpoint for the environment.
 * `type` defaults to "ping"; any catalog type uses a sample (or the chosen sandbox) referral.
 */
export const sendTestWebhook = mutation({
  args: {
    partnerCode: v.string(),
    environment: envValidator,
    type: v.optional(v.string()),
    referralIdentifier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerEnvAccess(ctx, args.partnerCode, args.environment, { forWrite: true });
    const type = args.type ?? "ping";
    if (!isWebhookEventType(type)) throw new ConvexError(`Unknown event type "${type}".`);
    const target = webhookTargetFor(partner, args.environment);
    if (!target.url || !target.secret) {
      throw new ConvexError(`Save your ${args.environment} webhook endpoint first.`);
    }
    let referralView: Record<string, unknown> = sampleReferralView(args.environment);
    let referralId: Doc<"inboundReferrals">["_id"] | undefined;
    if (args.referralIdentifier) {
      const referral = await findPartnerReferral(ctx, partner.code, args.environment, args.referralIdentifier);
      if (!referral) throw new ConvexError("Referral not found in this environment.");
      referralView = await serializeReferral(ctx, referral, { includePatient: false });
      referralId = referral._id;
    }
    const data =
      type === "ping"
        ? { message: "Test event from Rehabify", referral: referralView }
        : { previous_status: null, sequence: 0, test: true, referral: referralView };
    const result = await enqueuePartnerEvent(ctx, {
      partnerCode: partner.code,
      environment: args.environment,
      type,
      data,
      referralId,
      trackingCode: typeof referralView.tracking_code === "string" ? referralView.tracking_code : undefined,
    });
    if (!result) throw new ConvexError("Could not queue the test event.");
    return { eventId: result.eventId, deliveryId: result.deliveryId, endpoint: target.url };
  },
});
