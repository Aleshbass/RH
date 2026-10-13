/**
 * Shared building blocks for the partner platform (API, portal, webhooks, links).
 *
 * Everything partner-facing is derived from these helpers so the REST API, webhooks
 * and the portal always agree on identifiers, statuses and object shapes. The public
 * contract they implement is documented in content/docs (and public/openapi.json).
 */
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { publicAppUrl } from "./appUrl";

export type PartnerEnv = "sandbox" | "live";
type ReadCtx = QueryCtx | MutationCtx;

export const API_VERSION = "2026-10-01";

// ─── Randomness ───────────────────────────────────────────────────────────────

/** Unbiased random index in [0, max) using crypto.getRandomValues. */
function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
}

export function randomString(length: number, alphabet: string): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomIndex(alphabet.length)];
  return out;
}

const DIGITS = "0123456789";
/** Crockford-style alphabet without ambiguous characters (no I, L, O, 0, 1). */
const SAFE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LOWER_ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";

export function newEventId(): string {
  return `evt_${randomString(26, SAFE_ALPHABET)}`;
}

export function newRequestId(): string {
  return `req_${randomString(24, LOWER_ALNUM)}`;
}

// ─── Tracking codes ───────────────────────────────────────────────────────────

/**
 * Normalises a user-typed tracking code ("rhb 4829173655", "RHB–4829173655") to the
 * canonical "RHB-<digits>" form. Returns null for anything that is not a tracking code.
 */
export function normalizeTrackingCode(input: string | undefined | null): string | null {
  if (!input) return null;
  const compact = input.trim().toUpperCase().replace(/[\s–—]+/g, (m) => (/[–—]/.test(m) ? "-" : ""));
  const match = compact.match(/^RHB-?(\d{4,16})$/);
  return match ? `RHB-${match[1]}` : null;
}

/**
 * Tracking codes are "RHB-" + 10 random digits (first digit non-zero), unique across
 * all referrals. Digits only so the code survives WhatsApp, SMS and phone dictation,
 * and matches Joy's RHB-<digits> parser.
 */
export async function generateTrackingCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = `RHB-${randomString(1, "123456789")}${randomString(9, DIGITS)}`;
    const clash = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_tracking_code", (q) => q.eq("trackingCode", code))
      .first();
    if (!clash) return code;
  }
  throw new Error("Could not allocate a unique tracking code");
}

/** Public referral-link code: "<partner prefix>-<8 random chars>", unique. */
export async function generateLinkPublicCode(ctx: MutationCtx, partnerCode: string): Promise<string> {
  const prefix = partnerCode.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "rh";
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = `${prefix}-${randomString(8, SAFE_ALPHABET)}`;
    const clash = await ctx.db
      .query("partnerReferralLinks")
      .withIndex("by_public_code", (q) => q.eq("publicCode", code))
      .first();
    if (!clash) return code;
  }
  throw new Error("Could not allocate a unique referral link code");
}

// ─── Phones ───────────────────────────────────────────────────────────────────

/**
 * Normalises a phone number to E.164. Accepts international numbers with a leading
 * "+" or "00", and Nigerian numbers in local form (08012345678), with country code
 * but no plus (2348012345678) or without the trunk zero (8012345678).
 */
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/[\s().\-]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("+")) {
    const rest = digits.slice(1);
    if (!/^\d{8,15}$/.test(rest) || rest.startsWith("0")) return null;
    return `+${rest}`;
  }
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith("234") && digits.length === 13) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;
  if (/^[789]\d{9}$/.test(digits)) return `+234${digits}`;
  return null;
}

export function phonesMatch(left: string | undefined | null, right: string | undefined | null): boolean {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  return Boolean(a && b && a === b);
}

// ─── Statuses ─────────────────────────────────────────────────────────────────

export type PublicReferralStatus =
  | "received"
  | "contacted"
  | "booked"
  | "in_treatment"
  | "completed"
  | "not_suitable"
  | "cancelled"
  | "closed";

export const PUBLIC_REFERRAL_STATUSES: PublicReferralStatus[] = [
  "received",
  "contacted",
  "booked",
  "in_treatment",
  "completed",
  "not_suitable",
  "cancelled",
  "closed",
];

export type InternalReferralStatus = Doc<"inboundReferrals">["status"];

/** Maps the 18 internal referral statuses onto the 8 documented public statuses. */
export function toPublicStatus(status: InternalReferralStatus | string): PublicReferralStatus {
  switch (status) {
    case "contacted":
    case "intake_started":
    case "intake_completed":
    case "qualified":
      return "contacted";
    case "booked":
      return "booked";
    case "attended":
    case "treatment_active":
    case "in_treatment":
      return "in_treatment";
    case "completed":
    case "paid_out":
      return "completed";
    case "not_suitable":
    case "redirected_for_safety":
      return "not_suitable";
    case "cancelled":
    case "refunded":
      return "cancelled";
    case "closed":
      return "closed";
    default:
      return "received";
  }
}

/** Internal status written when a public status is set directly (sandbox, admin). */
export function internalStatusFor(status: PublicReferralStatus): InternalReferralStatus {
  switch (status) {
    case "in_treatment":
      return "treatment_active";
    default:
      return status;
  }
}

const PROGRESS_RANK: Record<PublicReferralStatus, number> = {
  received: 0,
  contacted: 1,
  booked: 2,
  in_treatment: 3,
  completed: 4,
  not_suitable: 4,
  cancelled: 4,
  closed: 5,
};

export function isTerminalPublicStatus(status: PublicReferralStatus): boolean {
  return status === "completed" || status === "not_suitable" || status === "cancelled" || status === "closed";
}

/** Forward-only lifecycle used by the sandbox advance endpoint. */
export function isForwardTransition(from: PublicReferralStatus, to: PublicReferralStatus): boolean {
  if (from === to) return false;
  if (from === "closed") return false;
  if (to === "closed") return true;
  if (isTerminalPublicStatus(from)) return false;
  return PROGRESS_RANK[to] > PROGRESS_RANK[from];
}

export function referralEnv(referral: Pick<Doc<"inboundReferrals">, "environment">): PartnerEnv {
  return referral.environment ?? "live";
}

export function linkEnv(link: Pick<Doc<"partnerReferralLinks">, "environment">): PartnerEnv {
  return link.environment ?? "live";
}

// ─── Partner state ────────────────────────────────────────────────────────────

export function partnerApprovalStatus(partner: Doc<"partners">): "pending" | "approved" | "rejected" {
  return partner.approvalStatus ?? (partner.isActive ? "approved" : "pending");
}

export function isPartnerApproved(partner: Doc<"partners">): boolean {
  return partner.isActive && partnerApprovalStatus(partner) === "approved";
}

export function hasProductionAccess(partner: Doc<"partners">): boolean {
  return isPartnerApproved(partner) && partner.productionStatus === "approved";
}

export function webhookTargetFor(partner: Doc<"partners">, env: PartnerEnv): { url?: string; secret?: string } {
  // Sandbox never falls back to live settings, so test events can never reach a
  // production endpoint or be signed with the production secret.
  if (env === "sandbox") {
    return { url: partner.testWebhookUrl || undefined, secret: partner.testWebhookSecret || undefined };
  }
  return {
    url: partner.liveWebhookUrl || partner.webhookUrl || undefined,
    secret: partner.liveWebhookSecret || partner.webhookSecret || undefined,
  };
}

// ─── URLs ─────────────────────────────────────────────────────────────────────

export function partnerApiBaseUrl(): string {
  return (process.env.PARTNER_API_BASE_URL || "https://api.physioaroundme.com/v1").replace(/\/$/, "");
}

export function joyWhatsAppNumber(): string {
  return (process.env.JOY_WHATSAPP_NUMBER || "2348061525811").replace(/\D/g, "");
}

export function trackingUrl(trackingCode: string): string {
  return `${publicAppUrl()}/track/${encodeURIComponent(trackingCode)}`;
}

export function whatsappIntakeUrl(trackingCode: string): string {
  return `https://wa.me/${joyWhatsAppNumber()}?text=${encodeURIComponent(`START ${trackingCode}`)}`;
}

export function referralLinkUrl(publicCode: string): string {
  return `${publicAppUrl()}/r/${encodeURIComponent(publicCode)}`;
}

export function iso(ms: number | null | undefined): string | null {
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// ─── Webhook endpoint validation (SSRF guard, no DNS) ─────────────────────────

function ipv4ToInt(host: string): number | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

function inRange(ip: number, base: string, bits: number): boolean {
  const start = ipv4ToInt(base)!;
  const size = 2 ** (32 - bits);
  return ip >= start && ip < start + size;
}

/** True for loopback, private, link-local, CGNAT, multicast and reserved addresses. */
export function isPrivateAddress(address: string): boolean {
  const host = address.replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = ipv4ToInt(host.startsWith("::ffff:") ? host.slice(7) : host);
  if (v4 !== null) {
    return (
      inRange(v4, "0.0.0.0", 8) ||
      inRange(v4, "10.0.0.0", 8) ||
      inRange(v4, "100.64.0.0", 10) ||
      inRange(v4, "127.0.0.0", 8) ||
      inRange(v4, "169.254.0.0", 16) ||
      inRange(v4, "172.16.0.0", 12) ||
      inRange(v4, "192.0.0.0", 24) ||
      inRange(v4, "192.168.0.0", 16) ||
      inRange(v4, "198.18.0.0", 15) ||
      inRange(v4, "224.0.0.0", 3)
    );
  }
  if (host.includes(":")) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe8") ||
      host.startsWith("fe9") ||
      host.startsWith("fea") ||
      host.startsWith("feb") ||
      host.startsWith("ff")
    );
  }
  return false;
}

/** Validates a partner webhook URL before it is stored or used. */
export function validateWebhookUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Enter your webhook endpoint URL." };
  if (value.length > 2048) return { ok: false, error: "The webhook URL is too long." };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "Enter a valid URL, e.g. https://api.example.com/rehabify/webhooks." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Webhook endpoints must use https://." };
  if (url.username || url.password) return { ok: false, error: "Webhook URLs must not contain credentials." };
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host === "metadata.google.internal" ||
    !host.includes(".") && !host.includes(":")
  ) {
    return { ok: false, error: "Webhook endpoints must be publicly reachable hosts." };
  }
  if (isPrivateAddress(host)) return { ok: false, error: "Private and internal IP addresses are not allowed." };
  if (url.port) {
    const port = Number(url.port);
    if (port !== 443 && port !== 8443 && port < 1024) {
      return { ok: false, error: "Use port 443 (default), 8443, or a port above 1023." };
    }
  }
  url.hash = "";
  return { ok: true, url: url.toString() };
}

// ─── Referral serialisation (the documented Referral object) ──────────────────

const SANDBOX_PROVIDER = { name: "Sandbox Physiotherapist", license_number: "SANDBOX-0001" };

type ProviderView = { name: string; license_number: string | null };

async function resolveProvider(ctx: ReadCtx, referral: Doc<"inboundReferrals">): Promise<{ view: ProviderView | null; userId?: Id<"users"> }> {
  if (referralEnv(referral) === "sandbox") {
    return { view: referral.sandboxProviderAssigned ? SANDBOX_PROVIDER : null };
  }
  let physioUserId = referral.assignedPhysiotherapistId;
  if (!physioUserId && referral.bookingId) {
    const booking = await ctx.db.get(referral.bookingId);
    physioUserId = booking?.physiotherapistId ?? undefined;
  }
  if (!physioUserId) return { view: null };
  const user = await ctx.db.get(physioUserId);
  if (!user) return { view: null };
  const profile = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", physioUserId!))
    .first();
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Physiotherapist";
  return { view: { name, license_number: profile?.licenseNumber || null }, userId: physioUserId };
}

export type SessionView = {
  object: "session";
  id: string;
  referral_id: string;
  tracking_code: string;
  partner_reference: string | null;
  sequence: number;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  mode: "virtual" | "in_person";
  scheduled_start: string | null;
  scheduled_end: string | null;
  completed_at: string | null;
  provider: { name: string } | null;
  simulated: boolean;
};

function appointmentStatus(status: string): SessionView["status"] {
  if (status === "completed") return "completed";
  if (status === "no_show") return "no_show";
  if (status === "cancelled_by_patient" || status === "cancelled_by_therapist") return "cancelled";
  return "scheduled";
}

/**
 * Sessions that belong to a referral: appointments of the linked patient that started
 * after the referral was created (and with the matched provider, when known).
 * Sandbox referrals return deterministic simulated sessions derived from their status.
 */
export async function referralSessions(ctx: ReadCtx, referral: Doc<"inboundReferrals">): Promise<SessionView[]> {
  const base = {
    referral_id: referral._id as string,
    tracking_code: referral.trackingCode ?? "",
    partner_reference: referral.partnerExternalId ?? null,
  };
  const total = Math.min(Math.max(referral.recommendedSessions ?? 4, 1), 12);
  const status = toPublicStatus(referral.status);

  if (referralEnv(referral) === "sandbox") {
    if (status !== "booked" && status !== "in_treatment" && status !== "completed") return [];
    const anchor = referral.bookedAt ?? referral.updatedAt ?? referral.createdAt;
    const completedCount = status === "completed" ? total : status === "in_treatment" ? 1 : 0;
    const count = status === "booked" ? 1 : status === "in_treatment" ? 2 : total;
    const sessions: SessionView[] = [];
    for (let i = 0; i < count; i++) {
      const start = anchor + (i + 1) * 24 * 60 * 60 * 1000;
      const done = i < completedCount;
      sessions.push({
        object: "session",
        id: `ses_sandbox_${referral._id}_${i + 1}`,
        ...base,
        sequence: i + 1,
        status: done ? "completed" : "scheduled",
        mode: referral.preferredCareMode === "remote" ? "virtual" : "in_person",
        scheduled_start: iso(start),
        scheduled_end: iso(start + 45 * 60 * 1000),
        completed_at: done ? iso(start + 45 * 60 * 1000) : null,
        provider: { name: SANDBOX_PROVIDER.name },
        simulated: true,
      });
    }
    return sessions;
  }

  if (!referral.patientId) return [];
  const provider = await resolveProvider(ctx, referral);
  const appointments = await ctx.db
    .query("appointments")
    .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", referral.patientId!).gte("startTime", referral.createdAt - 60 * 60 * 1000))
    .collect();
  const relevant = appointments
    .filter((a) => !provider.userId || a.physiotherapistId === provider.userId)
    .sort((a, b) => a.startTime - b.startTime);
  const providerNames = new Map<string, string>();
  const views: SessionView[] = [];
  for (let i = 0; i < relevant.length; i++) {
    const a = relevant[i];
    let providerName = providerNames.get(a.physiotherapistId as string);
    if (providerName === undefined) {
      const physio = await ctx.db.get(a.physiotherapistId);
      providerName = physio ? `${physio.firstName ?? ""} ${physio.lastName ?? ""}`.trim() || "Physiotherapist" : "Physiotherapist";
      providerNames.set(a.physiotherapistId as string, providerName);
    }
    const mapped = appointmentStatus(a.status);
    const isVirtual = Boolean((a as { isOnline?: boolean }).isOnline) || a.appointmentType === "telehealth";
    views.push({
      object: "session",
      id: a._id as string,
      ...base,
      sequence: i + 1,
      status: mapped,
      mode: isVirtual ? "virtual" : "in_person",
      scheduled_start: iso(a.startTime),
      scheduled_end: iso(a.endTime),
      completed_at: mapped === "completed" ? iso(a.endTime) : null,
      provider: { name: providerName },
      simulated: false,
    });
  }
  return views;
}

export function summarizeSessions(sessions: SessionView[]) {
  const now = Date.now();
  const completed = sessions.filter((s) => s.status === "completed");
  const upcoming = sessions.filter((s) => s.status === "scheduled" && s.scheduled_start && Date.parse(s.scheduled_start) > now);
  const cancelled = sessions.filter((s) => s.status === "cancelled" || s.status === "no_show");
  return {
    completed: completed.length,
    upcoming: upcoming.length,
    cancelled: cancelled.length,
    first_session_at: completed[0]?.scheduled_start ?? null,
    last_session_at: completed[completed.length - 1]?.scheduled_start ?? null,
    next_session_at: upcoming[0]?.scheduled_start ?? null,
  };
}

export type ReferralView = Record<string, unknown> & { id: string; tracking_code: string; status: PublicReferralStatus };

/**
 * The documented Referral object. `includePatient: false` produces the webhook form
 * (no personal data). Clinical notes are never included.
 */
export async function serializeReferral(
  ctx: ReadCtx,
  referral: Doc<"inboundReferrals">,
  options: { includePatient: boolean }
): Promise<ReferralView> {
  const trackingCode = referral.trackingCode ?? "";
  const provider = await resolveProvider(ctx, referral);
  const sessions = summarizeSessions(await referralSessions(ctx, referral));
  const careMode =
    referral.preferredCareMode === "face_to_face" || referral.preferredCareMode === "in_person"
      ? "in_person"
      : referral.preferredCareMode === "remote"
        ? "remote"
        : "patient_choice";

  const view: ReferralView = {
    object: "referral",
    id: referral._id as string,
    tracking_code: trackingCode,
    partner_reference: referral.partnerExternalId ?? null,
    environment: referralEnv(referral),
    status: toPublicStatus(referral.status),
    clinical: {
      condition: referral.condition ?? null,
      priority: referral.priority === "urgent" || referral.priority === "high" ? "urgent" : "standard",
      recommended_sessions: referral.recommendedSessions ?? 4,
      referring_clinician: referral.hospitalClinic ?? null,
    },
    care: {
      preferred_mode: careMode,
      preferred_contact_channel: referral.preferredContactChannel ?? "whatsapp",
    },
    billing_mode: referral.billingMode ?? "patient_self_pay",
    provider: provider.view,
    sessions: {
      completed: sessions.completed,
      total: referral.recommendedSessions ?? 4,
      last_session_at: sessions.last_session_at,
      next_session_at: sessions.next_session_at,
    },
    links: {
      tracking_url: trackingUrl(trackingCode),
      whatsapp_intake_url: whatsappIntakeUrl(trackingCode),
    },
    metadata: referral.partnerMetadata ?? {},
    created_at: iso(referral.createdAt),
    updated_at: iso(referral.updatedAt),
  };

  if (options.includePatient) {
    view.patient = {
      first_name: referral.patientFirstName,
      last_name: referral.patientLastName || null,
      phone: normalizePhone(referral.patientPhone) ?? referral.patientPhone ?? null,
      email: referral.patientEmail ?? null,
      city: referral.city ?? null,
      state: referral.state ?? null,
      area: referral.area ?? null,
      preferred_language: referral.preferredLanguage ?? "en",
    };
    // Keep the documented key order: patient right after status.
    const { object, id, tracking_code, partner_reference, environment, status, patient, ...rest } = view;
    return { object, id, tracking_code, partner_reference, environment, status, patient, ...rest } as ReferralView;
  }
  return view;
}

// ─── Referral lookup (partner + environment scoped) ───────────────────────────

/**
 * Resolves a referral by id, tracking code or partner_reference, strictly within one
 * partner and one environment. Returns null for anything that belongs elsewhere.
 */
export async function findPartnerReferral(
  ctx: ReadCtx,
  partnerCode: string,
  env: PartnerEnv,
  identifier: string
): Promise<Doc<"inboundReferrals"> | null> {
  const term = identifier.trim();
  if (!term || term.length > 200) return null;
  const belongs = (r: Doc<"inboundReferrals"> | null) =>
    Boolean(r && r.partnerId === partnerCode && referralEnv(r) === env);

  const code = normalizeTrackingCode(term);
  if (code) {
    const matches = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_tracking_code", (q) => q.eq("trackingCode", code))
      .take(10);
    const match = matches.find((r) => belongs(r));
    if (match) return match;
  }

  const byReference = await ctx.db
    .query("inboundReferrals")
    .withIndex("by_partner_env_external_id", (q) => q.eq("partnerId", partnerCode).eq("environment", env).eq("partnerExternalId", term))
    .first();
  if (byReference) return byReference;
  if (env === "live") {
    // Legacy rows created before the environment field existed are live.
    const legacy = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_env_external_id", (q) => q.eq("partnerId", partnerCode).eq("environment", undefined).eq("partnerExternalId", term))
      .first();
    if (legacy) return legacy;
  }

  const normalizedId = ctx.db.normalizeId("inboundReferrals", term);
  if (normalizedId) {
    const doc = await ctx.db.get(normalizedId);
    if (belongs(doc)) return doc;
  }
  return null;
}
