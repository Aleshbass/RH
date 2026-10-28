/**
 * Core partner-referral operations shared by the REST API (via the partner gateway),
 * the Partner Portal and the no-code landing page. All functions take an explicit
 * partner + environment that the caller has already authenticated.
 */
import { insertNotification } from "./pushNotify";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  type PartnerEnv,
  type PublicReferralStatus,
  generateTrackingCode,
  internalStatusFor,
  isForwardTransition,
  isPartnerApproved,
  iso,
  joyWhatsAppNumber,
  linkEnv,
  normalizePhone,
  partnerApiBaseUrl,
  referralEnv,
  referralSessions,
  serializeReferral,
  summarizeSessions,
  toPublicStatus,
  trackingUrl,
  whatsappIntakeUrl,
} from "./partnerShared";
import { emitReferralEvent, markProviderMatched, transitionReferral } from "./partnerEvents";
import { bumpLinkCounter } from "./partnerAttribution";
import { platformAdminEmails } from "./adminRecipients";

export type CoreError = { ok: false; status: number; code: string; message: string; param?: string; existing?: Record<string, unknown> };
const fail = (status: number, code: string, message: string, extra: Partial<CoreError> = {}): CoreError => ({ ok: false, status, code, message, ...extra });

export type ReferralInput = {
  partnerReference?: string;
  patient: {
    firstName: string;
    lastName?: string;
    phone: string;
    email?: string;
    city?: string;
    state?: string;
    area?: string;
    preferredLanguage?: string;
  };
  clinical: {
    condition?: string;
    notes?: string;
    priority?: string;
    recommendedSessions?: number;
    referringClinician?: string;
  };
  care: { preferredMode?: string; preferredContactChannel?: string };
  billingMode?: string;
  consent: { granted: boolean; method?: string; capturedAt?: number; privacyNoticeVersion?: string };
  metadata?: Record<string, string>;
};

const SANDBOX_SCENARIOS: Record<string, Array<{ delayMs: number; step: SandboxStep }>> = {
  "+2348000000001": [{ delayMs: 5_000, step: "contacted" }],
  "+2348000000002": [
    { delayMs: 5_000, step: "contacted" },
    { delayMs: 14_000, step: "provider_matched" },
    { delayMs: 15_000, step: "booked" },
  ],
  "+2348000000003": [
    { delayMs: 5_000, step: "contacted" },
    { delayMs: 14_000, step: "provider_matched" },
    { delayMs: 15_000, step: "booked" },
    { delayMs: 25_000, step: "in_treatment" },
    { delayMs: 35_000, step: "completed" },
  ],
  "+2348000000005": [{ delayMs: 10_000, step: "not_suitable" }],
  "+2348000000006": [{ delayMs: 10_000, step: "cancelled" }],
};
export const SANDBOX_INELIGIBLE_PHONE = "+2348000000004";
export type SandboxStep = PublicReferralStatus | "provider_matched";

function internalCareMode(mode?: string): string {
  if (mode === "in_person" || mode === "face_to_face") return "face_to_face";
  if (mode === "remote") return "remote";
  return "patient_choice";
}

async function partnerByCode(ctx: QueryCtx | MutationCtx, code: string) {
  return ctx.db
    .query("partners")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
}

async function notifyAdmins(ctx: MutationCtx, title: string, message: string, data: Record<string, unknown>) {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .collect();
  const now = Date.now();
  for (const admin of admins) {
    await insertNotification(ctx, {
      userId: admin._id,
      type: "system_alert",
      title,
      message,
      data,
      status: "pending",
      priority: "high",
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function findDuplicateReference(ctx: QueryCtx | MutationCtx, partnerCode: string, env: PartnerEnv, reference: string) {
  const match = await ctx.db
    .query("inboundReferrals")
    .withIndex("by_partner_env_external_id", (q) => q.eq("partnerId", partnerCode).eq("environment", env).eq("partnerExternalId", reference))
    .first();
  if (match || env !== "live") return match;
  return ctx.db
    .query("inboundReferrals")
    .withIndex("by_partner_env_external_id", (q) => q.eq("partnerId", partnerCode).eq("environment", undefined).eq("partnerExternalId", reference))
    .first();
}

const CONVERSION_SOURCE = { api: "api", portal: "partner_portal", doctor: "doctor_referral" } as const;

/**
 * Creates a partner referral (API, partner portal, or a referring doctor's portal).
 * Validation of shapes happens in the caller. `referringDoctorId` is the doctor's user for
 * referrals from a "doctor" partner.
 */
export async function createReferralCore(
  ctx: MutationCtx,
  args: {
    partnerCode: string;
    environment: PartnerEnv;
    input: ReferralInput;
    source: "api" | "portal" | "doctor";
    referringDoctorId?: Id<"users">;
  }
): Promise<{ ok: true; referral: Record<string, unknown> } | CoreError> {
  const partner = await partnerByCode(ctx, args.partnerCode);
  if (!partner || !isPartnerApproved(partner)) return fail(403, "partner_inactive", "This partner organisation is not active.");
  const { input } = args;
  if (!input.consent.granted) {
    return fail(422, "consent_required", "consent.granted must be true: confirm the patient agreed to be contacted by Rehabify.", { param: "consent.granted" });
  }
  const phone = normalizePhone(input.patient.phone);
  if (!phone) return fail(422, "validation_error", "patient.phone must be a valid phone number (E.164, e.g. +2348012345678).", { param: "patient.phone" });
  if (args.environment === "sandbox" && phone === SANDBOX_INELIGIBLE_PHONE) {
    return fail(422, "patient_ineligible", "Sandbox scenario: the patient is not eligible for coverage. No referral was created.", { param: "patient.phone" });
  }

  const reference = input.partnerReference?.trim() || undefined;
  if (reference) {
    const duplicate = await findDuplicateReference(ctx, partner.code, args.environment, reference);
    if (duplicate) {
      return fail(409, "duplicate_partner_reference", `A referral with partner_reference "${reference}" already exists in ${args.environment}.`, {
        param: "partner_reference",
        existing: { id: duplicate._id, tracking_code: duplicate.trackingCode ?? null },
      });
    }
  }

  const now = Date.now();
  const trackingCode = await generateTrackingCode(ctx);
  const recommendedSessions = Math.min(Math.max(Math.round(input.clinical.recommendedSessions ?? 4), 1), 52);
  const consentCapturedAt = input.consent.capturedAt && input.consent.capturedAt <= now + 5 * 60_000 ? input.consent.capturedAt : now;
  const referralId = await ctx.db.insert("inboundReferrals", {
    partnerId: partner.code,
    partnerExternalId: reference,
    trackingCode,
    conversionSource: CONVERSION_SOURCE[args.source],
    referringDoctorId: args.referringDoctorId,
    patientFirstName: input.patient.firstName.trim(),
    patientLastName: (input.patient.lastName ?? "").trim(),
    patientPhone: phone,
    patientPhoneNormalized: phone,
    patientEmail: input.patient.email?.trim().toLowerCase() || undefined,
    city: input.patient.city?.trim() || undefined,
    state: input.patient.state?.trim() || undefined,
    area: input.patient.area?.trim() || undefined,
    preferredLanguage: input.patient.preferredLanguage || "en",
    hospitalClinic: input.clinical.referringClinician?.trim() || undefined,
    condition: input.clinical.condition?.trim() || undefined,
    clinicalNotes: input.clinical.notes?.trim() || undefined,
    priority: input.clinical.priority === "urgent" ? "urgent" : "standard",
    recommendedSessions,
    billingMode: input.billingMode || "patient_self_pay",
    preferredCareMode: internalCareMode(input.care.preferredMode),
    preferredContactChannel: input.care.preferredContactChannel || "whatsapp",
    consentGranted: true,
    consentCapturedAt,
    consentMethod: input.consent.method?.trim() || "partner_attested",
    consentPrivacyNoticeVersion: input.consent.privacyNoticeVersion?.trim() || undefined,
    partnerMetadata: input.metadata && Object.keys(input.metadata).length > 0 ? input.metadata : undefined,
    status: "received",
    environment: args.environment,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("patientConsents", {
    referralId,
    patientPhone: phone,
    patientEmail: input.patient.email?.trim().toLowerCase() || undefined,
    granted: true,
    capturedAt: consentCapturedAt,
    method: input.consent.method?.trim() || "partner_attested",
    privacyNoticeVersion: input.consent.privacyNoticeVersion?.trim() || "partner",
  });
  await ctx.db.insert("referralEvents", {
    referralId,
    eventName: "referral.received",
    occurredAt: now,
    actorType: "partner",
    actorId: partner.code,
    metadata: { source: args.source, environment: args.environment, partnerReference: reference },
  });

  if (args.environment === "live") {
    // Care team outreach task + notifications. Sandbox never reaches real people.
    const channel = input.care.preferredContactChannel;
    await ctx.db.insert("partnerContactRequests", {
      referralId,
      channel: channel === "email" || channel === "sms" || channel === "phone" ? channel : "whatsapp",
      status: "pending",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    const patientName = `${input.patient.firstName} ${input.patient.lastName ?? ""}`.trim();
    await notifyAdmins(ctx, "New Partner Referral Received", `${partner.name} referred ${patientName} (${trackingCode})`, {
      referralId,
      trackingCode,
      partnerCode: partner.code,
    });
    const shared = {
      patientName,
      trackingCode,
      trackingUrl: trackingUrl(trackingCode),
      whatsappIntakeUrl: whatsappIntakeUrl(trackingCode),
      whatsappPhone: `+${joyWhatsAppNumber()}`,
      condition: input.clinical.condition,
      priority: input.clinical.priority === "urgent" ? "urgent" : "standard",
      createdAt: now,
    };
    if (partner.contactEmail) {
      await ctx.scheduler.runAfter(0, internal.actions.emails.sendReferralCreatedEmails.sendPartnerReferralCreatedEmail, {
        ...shared,
        partnerEmail: partner.contactEmail,
        partnerName: partner.name,
        contactName: partner.contactName || partner.name,
      });
    }
    const adminEmails = platformAdminEmails();
    for (const adminEmail of adminEmails) {
      await ctx.scheduler.runAfter(0, internal.actions.emails.sendReferralCreatedEmails.sendAdminReferralCreatedEmail, {
        ...shared,
        adminEmail,
        partnerName: partner.name,
        patientPhone: phone,
        patientEmail: input.patient.email,
        city: input.patient.city,
        recommendedSessions,
      });
    }
  }

  await emitReferralEvent(ctx, referralId, "referral.created", null);

  if (args.environment === "sandbox") {
    for (const { delayMs, step } of SANDBOX_SCENARIOS[phone] ?? []) {
      await ctx.scheduler.runAfter(delayMs, internal.partnerApi.sandboxScenarioStep, { referralId, step });
    }
  }

  const referral = await ctx.db.get(referralId);
  return { ok: true, referral: await serializeReferral(ctx, referral!, { includePatient: true }) };
}

/** Moves a SANDBOX referral forward and fires the same events a real transition fires. */
export async function sandboxAdvanceCore(
  ctx: MutationCtx,
  referral: Doc<"inboundReferrals">,
  target: SandboxStep,
  actorId: string
): Promise<{ ok: true } | CoreError> {
  if (referralEnv(referral) !== "sandbox") return fail(403, "sandbox_only", "Only sandbox referrals can be advanced.");
  if (target === "provider_matched") {
    await markProviderMatched(ctx, referral._id, null, { actorType: "sandbox", actorId });
    return { ok: true };
  }
  const current = toPublicStatus(referral.status);
  if (!isForwardTransition(current, target)) {
    return fail(422, "invalid_status_transition", `A referral cannot move from "${current}" to "${target}".`, { param: "status" });
  }
  if ((target === "booked" || target === "in_treatment" || target === "completed") && !referral.sandboxProviderAssigned) {
    await markProviderMatched(ctx, referral._id, null, { actorType: "sandbox", actorId });
  }
  await transitionReferral(ctx, referral._id, internalStatusFor(target), { actorType: "sandbox", actorId });
  return { ok: true };
}

// ─── Sessions & reports ──────────────────────────────────────────────────────

export async function buildReport(ctx: QueryCtx | MutationCtx, referral: Doc<"inboundReferrals">) {
  const view = await serializeReferral(ctx, referral, { includePatient: false });
  const sessions = await referralSessions(ctx, referral);
  const summary = summarizeSessions(sessions);
  const status = toPublicStatus(referral.status);
  const provider = view.provider as { name: string; license_number: string | null } | null;
  const reachedContact = Boolean(referral.contactedAt) || ["contacted", "booked", "in_treatment", "completed"].includes(status);
  const milestones = [
    { key: "referral_received", label: "Referral received", status: "completed", completed_at: iso(referral.createdAt) },
    {
      key: "patient_contacted",
      label: "Patient contacted",
      status: reachedContact ? "completed" : "pending",
      completed_at: reachedContact ? iso(referral.contactedAt ?? referral.updatedAt) : null,
    },
    {
      key: "provider_matched",
      label: "Physiotherapist matched",
      status: provider ? "completed" : "pending",
      completed_at: provider ? iso(referral.providerMatchedAt ?? referral.updatedAt) : null,
    },
    {
      key: "first_session",
      label: "First session attended",
      status: summary.completed > 0 ? "completed" : summary.upcoming > 0 ? "in_progress" : "pending",
      completed_at: summary.completed > 0 ? summary.first_session_at : null,
    },
    {
      key: "treatment_completed",
      label: "Treatment completed",
      status: status === "completed" ? "completed" : status === "in_treatment" ? "in_progress" : "pending",
      completed_at: status === "completed" ? iso(referral.completedAt ?? referral.updatedAt) : null,
    },
  ];
  return {
    object: "report",
    referral: {
      id: referral._id,
      tracking_code: referral.trackingCode ?? "",
      partner_reference: referral.partnerExternalId ?? null,
      status,
      environment: referralEnv(referral),
    },
    provider,
    summary: {
      prescribed_sessions: referral.recommendedSessions ?? 4,
      completed_sessions: summary.completed,
      upcoming_sessions: summary.upcoming,
      cancelled_sessions: summary.cancelled,
      first_session_at: summary.first_session_at,
      last_session_at: summary.last_session_at,
      next_session_at: summary.next_session_at,
      discharged: status === "completed",
      discharged_at: status === "completed" ? iso(referral.completedAt ?? referral.updatedAt) : null,
    },
    milestones,
    pdf_url: `${partnerApiBaseUrl()}/partners/reports/${encodeURIComponent(referral.trackingCode ?? referral._id)}/pdf`,
    generated_at: new Date().toISOString(),
  };
}

// ─── No-code referral links: leads ───────────────────────────────────────────

export type LeadInput = {
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  preferredLanguage?: string;
  reason?: string;
  preferredCareMode?: string;
  preferredContactChannel?: string;
  consentGranted: boolean;
  privacyNoticeVersion?: string;
};

export async function submitLeadCore(
  ctx: MutationCtx,
  publicCode: string,
  input: LeadInput
): Promise<{ ok: true; duplicate: boolean; trackingCode: string | null; environment: PartnerEnv } | CoreError> {
  const link = await ctx.db
    .query("partnerReferralLinks")
    .withIndex("by_public_code", (q) => q.eq("publicCode", publicCode))
    .first();
  if (!link) return fail(404, "referral_link_not_found", "This referral link does not exist.");
  const now = Date.now();
  if (link.status !== "active" || (link.expiresAt && link.expiresAt <= now)) {
    if (link.status === "active" && link.expiresAt && link.expiresAt <= now) {
      await ctx.db.patch(link._id, { status: "expired", updatedAt: now });
    }
    return fail(410, "link_inactive", "This referral link is no longer active.");
  }
  const partner = await partnerByCode(ctx, link.partnerId);
  if (!partner || !isPartnerApproved(partner)) return fail(410, "link_inactive", "This referral link is no longer active.");
  if (!input.consentGranted) return fail(422, "consent_required", "Please confirm that Rehabify may contact you.", { param: "consent.granted" });

  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) return fail(422, "validation_error", "Enter a valid phone number, e.g. +2348012345678 or 08012345678.", { param: "patient.phone" });
  const email = input.email?.trim().toLowerCase() || undefined;
  if (!phone && !email) return fail(422, "validation_error", "A phone number or email address is required.", { param: "patient.phone" });

  const env = linkEnv(link);
  const dayAgo = now - 24 * 60 * 60 * 1000;
  if (phone) {
    const samePhone = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_and_phone", (q) => q.eq("partnerId", partner.code).eq("patientPhoneNormalized", phone))
      .order("desc")
      .first();
    if (samePhone && samePhone.createdAt > dayAgo && referralEnv(samePhone) === env) return { ok: true, duplicate: true, trackingCode: null, environment: env };
  } else if (email) {
    const recent = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", partner.code))
      .order("desc")
      .take(200);
    if (recent.some((r) => r.createdAt > dayAgo && r.patientEmail === email && referralEnv(r) === env)) {
      return { ok: true, duplicate: true, trackingCode: null, environment: env };
    }
  }

  const trackingCode = await generateTrackingCode(ctx);
  const privacyNoticeVersion = input.privacyNoticeVersion?.slice(0, 50) || "2026-09-01";
  const referralId = await ctx.db.insert("inboundReferrals", {
    partnerId: partner.code,
    linkId: link._id,
    campaignName: link.campaignName,
    firstClickAt: now,
    conversionSource: "partner_link",
    trackingCode,
    patientFirstName: input.firstName.trim(),
    patientLastName: (input.lastName ?? "").trim(),
    patientPhone: phone ?? "",
    patientPhoneNormalized: phone ?? undefined,
    patientEmail: email,
    city: input.city?.trim() || undefined,
    state: input.state?.trim() || undefined,
    preferredLanguage: input.preferredLanguage || "en",
    reason: input.reason?.trim() || undefined,
    condition: input.reason?.trim() || undefined,
    preferredCareMode: internalCareMode(input.preferredCareMode ?? link.defaultCareMode),
    preferredContactChannel: input.preferredContactChannel || "whatsapp",
    nextStep: "contact_me",
    consentGranted: true,
    consentCapturedAt: now,
    consentMethod: "partner_landing",
    consentPrivacyNoticeVersion: privacyNoticeVersion,
    status: "received",
    environment: env,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("patientConsents", {
    referralId,
    patientPhone: phone ?? undefined,
    patientEmail: email,
    granted: true,
    capturedAt: now,
    method: "partner_landing",
    privacyNoticeVersion,
  });
  await ctx.db.insert("referralEvents", {
    referralId,
    eventName: "lead.submitted",
    occurredAt: now,
    actorType: "patient",
    metadata: { publicCode, campaignName: link.campaignName, environment: env },
  });
  await bumpLinkCounter(ctx, link._id, "leads");

  if (env === "live") {
    const channel = input.preferredContactChannel;
    await ctx.db.insert("partnerContactRequests", {
      referralId,
      channel: channel === "email" || channel === "sms" || channel === "phone" ? channel : "whatsapp",
      status: "pending",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await notifyAdmins(ctx, "New Partner Referral Lead", `${partner.name} link ${publicCode}: ${input.firstName} (${trackingCode})`, {
      referralId,
      trackingCode,
      partnerCode: partner.code,
      publicCode,
    });
  }
  await emitReferralEvent(ctx, referralId, "referral.created", null);
  return { ok: true, duplicate: false, trackingCode, environment: env };
}

export function referralLinkView(link: Doc<"partnerReferralLinks">, url: string) {
  return {
    object: "referral_link",
    id: link._id,
    public_code: link.publicCode,
    url,
    campaign_name: link.campaignName ?? null,
    service_scope: link.serviceScope ?? "all_rehabilitation",
    default_care_mode:
      link.defaultCareMode === "face_to_face" || link.defaultCareMode === "in_person"
        ? "in_person"
        : link.defaultCareMode === "remote"
          ? "remote"
          : "patient_choice",
    status: link.expiresAt && link.expiresAt <= Date.now() && link.status === "active" ? "expired" : link.status,
    environment: linkEnv(link),
    expires_at: iso(link.expiresAt),
    stats: {
      clicks: link.clicks ?? 0,
      leads: link.leads ?? 0,
      signups: link.signups ?? 0,
      bookings: link.bookings ?? 0,
      payments: link.payments ?? 0,
    },
    created_at: iso(link.createdAt),
  };
}
