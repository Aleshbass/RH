/**
 * Referral lifecycle + partner webhook events.
 *
 * Every referral status change goes through transitionReferral() so the referral,
 * its audit trail (referralEvents) and the partner's webhook outbox can never drift
 * apart. Events are written to partnerWebhooksDeliveries and delivered (with retries)
 * by actions/partners/dispatchWebhook.ts.
 */
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  API_VERSION,
  type InternalReferralStatus,
  type PartnerEnv,
  type PublicReferralStatus,
  iso,
  newEventId,
  referralEnv,
  serializeReferral,
  toPublicStatus,
  trackingUrl,
  webhookTargetFor,
  whatsappIntakeUrl,
} from "./partnerShared";

export const WEBHOOK_EVENT_TYPES = [
  "referral.created",
  "referral.contacted",
  "referral.provider_matched",
  "referral.booked",
  "referral.in_treatment",
  "referral.completed",
  "referral.not_suitable",
  "referral.cancelled",
  "referral.closed",
  "ping",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export function isWebhookEventType(value: unknown): value is WebhookEventType {
  return typeof value === "string" && (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

/** Write an event to the partner's outbox and schedule its first delivery attempt. */
export async function enqueuePartnerEvent(
  ctx: MutationCtx,
  args: {
    partnerCode: string;
    environment: PartnerEnv;
    type: WebhookEventType;
    data: Record<string, unknown>;
    referralId?: Id<"inboundReferrals">;
    trackingCode?: string;
  }
): Promise<{ eventId: string; deliveryId: Id<"partnerWebhookDeliveries">; queued: boolean } | null> {
  const partner = await ctx.db
    .query("partners")
    .withIndex("by_code", (q) => q.eq("code", args.partnerCode))
    .first();
  if (!partner) return null;

  const now = Date.now();
  const eventId = newEventId();
  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    type: args.type,
    api_version: API_VERSION,
    created_at: new Date(now).toISOString(),
    environment: args.environment,
    data: args.data,
  });
  const target = webhookTargetFor(partner, args.environment);
  const queued = Boolean(target.url && target.secret);

  const deliveryId = await ctx.db.insert("partnerWebhookDeliveries", {
    eventId,
    partnerId: partner.code,
    environment: args.environment,
    eventType: args.type,
    payload,
    referralId: args.referralId,
    trackingCode: args.trackingCode,
    status: queued ? "pending" : "skipped",
    attempts: 0,
    nextAttemptAt: queued ? now : undefined,
    lastError: queued ? undefined : `No ${args.environment} webhook endpoint is configured.`,
    createdAt: now,
    updatedAt: now,
  });
  if (queued) {
    await ctx.scheduler.runAfter(0, internal.actions.partners.dispatchWebhook.deliverPartnerWebhook, { deliveryId });
  }
  return { eventId, deliveryId, queued };
}

/** Emit a referral.* event carrying the webhook form of the referral (no patient data). */
export async function emitReferralEvent(
  ctx: MutationCtx,
  referralId: Id<"inboundReferrals">,
  type: WebhookEventType,
  previousStatus: PublicReferralStatus | null
) {
  const referral = await ctx.db.get(referralId);
  if (!referral || !referral.partnerId) return null;
  const sequence = (referral.eventSequence ?? 0) + 1;
  await ctx.db.patch(referralId, { eventSequence: sequence });
  const view = await serializeReferral(ctx, { ...referral, eventSequence: sequence }, { includePatient: false });
  return enqueuePartnerEvent(ctx, {
    partnerCode: referral.partnerId,
    environment: referralEnv(referral),
    type,
    data: { previous_status: previousStatus, sequence, referral: view },
    referralId,
    trackingCode: referral.trackingCode,
  });
}

const MILESTONE_FIELD: Partial<Record<PublicReferralStatus, "contactedAt" | "bookedAt" | "treatmentStartedAt" | "completedAt" | "closedAt">> = {
  contacted: "contactedAt",
  booked: "bookedAt",
  in_treatment: "treatmentStartedAt",
  completed: "completedAt",
  closed: "closedAt",
};

/**
 * Change a referral's status, record the audit event, stamp the milestone time and,
 * when the PUBLIC status changes, emit the matching webhook (referral.<status>).
 */
export async function transitionReferral(
  ctx: MutationCtx,
  referralId: Id<"inboundReferrals">,
  toStatus: InternalReferralStatus,
  options: {
    actorType: string;
    actorId?: string;
    metadata?: Record<string, unknown>;
    extraPatch?: Partial<Doc<"inboundReferrals">>;
  }
): Promise<{ from: PublicReferralStatus; to: PublicReferralStatus } | null> {
  const referral = await ctx.db.get(referralId);
  if (!referral) return null;
  const fromPublic = toPublicStatus(referral.status);
  const toPublic = toPublicStatus(toStatus);
  const now = Date.now();

  const patch: Partial<Doc<"inboundReferrals">> = { ...options.extraPatch, status: toStatus, updatedAt: now };
  const milestone = MILESTONE_FIELD[toPublic];
  if (milestone && !referral[milestone]) patch[milestone] = now;
  // Reaching a later stage implies the earlier ones happened.
  if ((toPublic === "booked" || toPublic === "in_treatment" || toPublic === "completed") && !referral.contactedAt) {
    patch.contactedAt = now;
  }
  if ((toPublic === "in_treatment" || toPublic === "completed") && !referral.bookedAt) patch.bookedAt = now;
  await ctx.db.patch(referralId, patch);

  await ctx.db.insert("referralEvents", {
    referralId,
    eventName: `referral.${toStatus}`,
    occurredAt: now,
    actorType: options.actorType,
    actorId: options.actorId,
    metadata: { previousStatus: referral.status, newStatus: toStatus, ...options.metadata },
  });

  if (fromPublic !== toPublic && toPublic !== "received") {
    await emitReferralEvent(ctx, referralId, `referral.${toPublic}` as WebhookEventType, fromPublic);
  }
  return { from: fromPublic, to: toPublic };
}

/** Assign (or simulate, in sandbox) the treating physiotherapist and emit provider_matched once. */
export async function markProviderMatched(
  ctx: MutationCtx,
  referralId: Id<"inboundReferrals">,
  physiotherapistUserId: Id<"users"> | null,
  options: { actorType: string; actorId?: string; metadata?: Record<string, unknown> }
) {
  const referral = await ctx.db.get(referralId);
  if (!referral) return null;
  const sandbox = referralEnv(referral) === "sandbox";
  const now = Date.now();
  const unchanged = sandbox
    ? referral.sandboxProviderAssigned === true
    : Boolean(physiotherapistUserId && referral.assignedPhysiotherapistId === physiotherapistUserId);

  const patch: Partial<Doc<"inboundReferrals">> = { updatedAt: now };
  if (sandbox) patch.sandboxProviderAssigned = true;
  else if (physiotherapistUserId) patch.assignedPhysiotherapistId = physiotherapistUserId;
  if (!unchanged) patch.providerMatchedAt = now;
  await ctx.db.patch(referralId, patch);

  await ctx.db.insert("referralEvents", {
    referralId,
    eventName: "provider.matched",
    occurredAt: now,
    actorType: options.actorType,
    actorId: options.actorId,
    metadata: { physiotherapistUserId: physiotherapistUserId ?? (sandbox ? "sandbox" : null), ...options.metadata },
  });

  if (!unchanged) {
    await emitReferralEvent(ctx, referralId, "referral.provider_matched", toPublicStatus(referral.status));
  }
  return { changed: !unchanged };
}

/** Sample referral (webhook form) used for test events when no referral is chosen. */
export function sampleReferralView(env: PartnerEnv) {
  const now = Date.now();
  const code = "RHB-1234567890";
  return {
    object: "referral",
    id: "ref_sample_000000000000000000000000",
    tracking_code: code,
    partner_reference: "SAMPLE-REF-0001",
    environment: env,
    status: "booked",
    clinical: { condition: "Lower back pain", priority: "standard", recommended_sessions: 6, referring_clinician: null },
    care: { preferred_mode: "patient_choice", preferred_contact_channel: "whatsapp" },
    billing_mode: "patient_self_pay",
    provider: { name: "Sandbox Physiotherapist", license_number: "SANDBOX-0001" },
    sessions: { completed: 0, total: 6, last_session_at: null, next_session_at: iso(now + 2 * 24 * 60 * 60 * 1000) },
    links: { tracking_url: trackingUrl(code), whatsapp_intake_url: whatsappIntakeUrl(code) },
    metadata: { sample: "true" },
    created_at: iso(now - 60 * 60 * 1000),
    updated_at: iso(now),
  };
}
