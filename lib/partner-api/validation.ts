import { z } from "zod";
import { normalizePhone } from "./phone";

/**
 * Request validation for the partner API (documented v1 contract).
 * Older field names (flat patient fields, `clinical_notes`, `external_ref`) are still
 * accepted as aliases so early integrations keep working, but only the documented
 * shape appears in the docs and OpenAPI spec.
 */

export type ValidationFailure = { ok: false; param: string; message: string; code?: "consent_required" | "validation_error" };

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();

const referralSchema = z.object({
  partner_reference: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^\u0000-\u001f]+$/, "must not contain control characters")
    .optional(),
  patient: z.object({
    first_name: text(100),
    last_name: optionalText(100),
    phone: z.string().trim().min(1).max(32),
    email: z.string().trim().email().max(254).optional(),
    city: optionalText(100),
    state: optionalText(100),
    area: optionalText(100),
    preferred_language: z.enum(["en", "yo", "ig", "ha"]).optional(),
  }),
  clinical: z
    .object({
      condition: optionalText(200),
      notes: optionalText(5000),
      priority: z.enum(["standard", "urgent"]).optional(),
      recommended_sessions: z.number().int().min(1).max(52).optional(),
      referring_clinician: optionalText(200),
    })
    .default({}),
  care: z
    .object({
      preferred_mode: z.enum(["remote", "in_person", "patient_choice", "face_to_face"]).optional(),
      preferred_contact_channel: z.enum(["whatsapp", "phone", "email", "sms"]).optional(),
    })
    .default({}),
  billing_mode: z.enum(["patient_self_pay", "hmo_direct_billing", "corporate_sponsored"]).optional(),
  consent: z
    .object({
      granted: z.boolean(),
      method: optionalText(50),
      captured_at: z.string().datetime({ offset: true }).optional(),
      privacy_notice_version: optionalText(50),
    })
    .optional(),
  metadata: z
    .record(z.string().min(1).max(40), z.string().max(500))
    .refine((m) => Object.keys(m).length <= 20, "may contain at most 20 keys")
    .optional(),
});

function pick<T>(...values: T[]): T | undefined {
  for (const value of values) if (value !== undefined && value !== null && value !== "") return value;
  return undefined;
}

/** Maps legacy/alias request shapes onto the documented shape. */
function normaliseReferralBody(body: Record<string, any>): Record<string, any> {
  const patient = (body.patient && typeof body.patient === "object" ? body.patient : {}) as Record<string, any>;
  const legacyNotes = (body.clinical_notes && typeof body.clinical_notes === "object" ? body.clinical_notes : {}) as Record<string, any>;
  const clinical = (body.clinical && typeof body.clinical === "object" ? body.clinical : {}) as Record<string, any>;
  const care = (body.care && typeof body.care === "object" ? body.care : {}) as Record<string, any>;
  const consent = body.consent && typeof body.consent === "object" ? body.consent : body.consent_granted !== undefined ? { granted: body.consent_granted } : undefined;
  const sessions = pick(clinical.recommended_sessions, legacyNotes.recommended_sessions, body.recommended_sessions);
  return {
    partner_reference: pick(body.partner_reference, body.external_ref, body.external_id, body.external_reference),
    patient: {
      first_name: pick(patient.first_name, body.first_name, body.patientFirstName),
      last_name: pick(patient.last_name, body.last_name, body.patientLastName),
      phone: pick(patient.phone, body.phone, body.patientPhone),
      email: pick(patient.email, body.email, body.patientEmail),
      city: pick(patient.city, body.city),
      state: pick(patient.state, body.state),
      area: pick(patient.area, body.area),
      preferred_language: pick(patient.preferred_language, body.preferred_language),
    },
    clinical: {
      condition: pick(clinical.condition, clinical.diagnosis, legacyNotes.condition, legacyNotes.diagnosis, body.condition, body.diagnosis),
      notes: pick(clinical.notes, legacyNotes.notes, body.clinicalNotes),
      priority: pick(clinical.priority, legacyNotes.priority, body.priority),
      recommended_sessions: typeof sessions === "string" && /^\d+$/.test(sessions) ? Number(sessions) : sessions,
      referring_clinician: pick(clinical.referring_clinician, legacyNotes.referring_doctor, body.referring_clinician),
    },
    care: {
      preferred_mode: pick(care.preferred_mode, body.preferred_care_mode, body.care_mode),
      preferred_contact_channel: pick(care.preferred_contact_channel, body.preferred_contact),
    },
    billing_mode: pick(body.billing_mode, body.billingMode),
    consent,
    metadata: body.metadata,
  };
}

function firstIssue(error: z.ZodError): ValidationFailure {
  const issue = error.issues[0];
  const param = issue.path.join(".") || "body";
  let message = `${param} is invalid`;
  if (issue.code === "invalid_type" && issue.received === "undefined") message = `${param} is required`;
  else if (issue.code === "invalid_enum_value") message = `${param} must be one of: ${issue.options.join(", ")}`;
  else if (issue.code === "too_big") message = `${param} is too long or too large (maximum ${issue.maximum})`;
  else if (issue.code === "too_small") message = issue.minimum === 1 && issue.type === "string" ? `${param} is required` : `${param} is too small (minimum ${issue.minimum})`;
  else if (issue.message && issue.message !== "Invalid input") message = `${param} ${issue.message}`.replace(/^(\S+) Invalid/, "$1 is invalid");
  return { ok: false, param, message };
}

export type ReferralGatewayInput = {
  partnerReference?: string;
  patient: { firstName: string; lastName?: string; phone: string; email?: string; city?: string; state?: string; area?: string; preferredLanguage?: string };
  clinical: { condition?: string; notes?: string; priority?: string; recommendedSessions?: number; referringClinician?: string };
  care: { preferredMode?: string; preferredContactChannel?: string };
  billingMode?: string;
  consent: { granted: boolean; method?: string; capturedAt?: number; privacyNoticeVersion?: string };
  metadata?: Record<string, string>;
};

export function validateReferralCreate(body: Record<string, any>): { ok: true; input: ReferralGatewayInput; canonical: unknown } | ValidationFailure {
  const parsed = referralSchema.safeParse(normaliseReferralBody(body));
  if (!parsed.success) return firstIssue(parsed.error);
  const data = parsed.data;
  const phone = normalizePhone(data.patient.phone);
  if (!phone) {
    return { ok: false, param: "patient.phone", message: "patient.phone must be a valid phone number (E.164, e.g. +2348012345678)." };
  }
  if (!data.consent || data.consent.granted !== true) {
    return {
      ok: false,
      code: "consent_required",
      param: "consent.granted",
      message: "consent.granted must be true: confirm the patient agreed to be contacted by Rehabify.",
    };
  }
  const capturedAt = data.consent.captured_at ? Date.parse(data.consent.captured_at) : undefined;
  return {
    ok: true,
    canonical: data,
    input: {
      partnerReference: data.partner_reference,
      patient: {
        firstName: data.patient.first_name,
        lastName: data.patient.last_name || undefined,
        phone,
        email: data.patient.email?.toLowerCase(),
        city: data.patient.city || undefined,
        state: data.patient.state || undefined,
        area: data.patient.area || undefined,
        preferredLanguage: data.patient.preferred_language,
      },
      clinical: {
        condition: data.clinical.condition || undefined,
        notes: data.clinical.notes || undefined,
        priority: data.clinical.priority,
        recommendedSessions: data.clinical.recommended_sessions,
        referringClinician: data.clinical.referring_clinician || undefined,
      },
      care: {
        preferredMode: data.care.preferred_mode === "face_to_face" ? "in_person" : data.care.preferred_mode,
        preferredContactChannel: data.care.preferred_contact_channel,
      },
      billingMode: data.billing_mode,
      consent: {
        granted: true,
        method: data.consent.method || undefined,
        capturedAt: capturedAt && Number.isFinite(capturedAt) ? capturedAt : undefined,
        privacyNoticeVersion: data.consent.privacy_notice_version || undefined,
      },
      metadata: data.metadata,
    },
  };
}

const linkSchema = z.object({
  campaign_name: optionalText(120),
  service_scope: optionalText(80),
  default_care_mode: z.enum(["remote", "in_person", "patient_choice"]).optional(),
  expires_at: z.string().datetime({ offset: true }).optional(),
});

export function validateLinkCreate(body: Record<string, any>) {
  const parsed = linkSchema.safeParse({
    campaign_name: body.campaign_name ?? body.campaignName,
    service_scope: body.service_scope ?? body.serviceScope,
    default_care_mode: body.default_care_mode ?? body.defaultCareMode,
    expires_at: body.expires_at ?? body.expiresAt,
  });
  if (!parsed.success) return firstIssue(parsed.error);
  const expiresAt = parsed.data.expires_at ? Date.parse(parsed.data.expires_at) : undefined;
  if (expiresAt !== undefined && expiresAt <= Date.now()) {
    return { ok: false as const, param: "expires_at", message: "expires_at must be in the future." };
  }
  return {
    ok: true as const,
    input: {
      campaignName: parsed.data.campaign_name || undefined,
      serviceScope: parsed.data.service_scope || undefined,
      defaultCareMode: parsed.data.default_care_mode,
      expiresAt,
    },
    canonical: parsed.data,
  };
}

const leadSchema = z.object({
  patient: z.object({
    first_name: text(100),
    last_name: optionalText(100),
    phone: z.string().trim().max(32).optional(),
    email: z.string().trim().email().max(254).optional(),
    city: optionalText(100),
    state: optionalText(100),
    preferred_language: z.enum(["en", "yo", "ig", "ha"]).optional(),
  }),
  need: z
    .object({
      reason: optionalText(100),
      preferred_care_mode: z.enum(["remote", "in_person", "patient_choice", "face_to_face"]).optional(),
    })
    .default({}),
  contact: z.object({ preferred_channel: z.enum(["whatsapp", "phone", "email", "sms"]).optional() }).default({}),
  consent: z.object({ granted: z.boolean(), privacy_notice_version: optionalText(50) }).optional(),
});

export function validateLead(body: Record<string, any>) {
  const patient = (body.patient && typeof body.patient === "object" ? body.patient : {}) as Record<string, any>;
  const parsed = leadSchema.safeParse({
    patient: {
      first_name: pick(patient.first_name, body.first_name, body.firstName),
      last_name: pick(patient.last_name, body.last_name, body.lastName),
      phone: pick(patient.phone, body.phone),
      email: pick(patient.email, body.email),
      city: pick(patient.city, body.city),
      state: pick(patient.state, body.state),
      preferred_language: pick(patient.preferred_language, body.preferred_language),
    },
    need: body.need ?? { reason: body.reason, preferred_care_mode: body.preferred_care_mode },
    contact: body.contact ?? { preferred_channel: body.preferred_channel },
    consent: body.consent ?? (body.consent_granted !== undefined ? { granted: body.consent_granted } : undefined),
  });
  if (!parsed.success) return firstIssue(parsed.error);
  const data = parsed.data;
  const phone = data.patient.phone ? normalizePhone(data.patient.phone) : null;
  if (data.patient.phone && !phone) {
    return { ok: false as const, param: "patient.phone", message: "Enter a valid phone number, e.g. +2348012345678 or 08012345678." };
  }
  if (!phone && !data.patient.email) {
    return { ok: false as const, param: "patient.phone", message: "A phone number or email address is required." };
  }
  if (!data.consent || data.consent.granted !== true) {
    return { ok: false as const, code: "consent_required" as const, param: "consent.granted", message: "Please confirm that Rehabify may contact you." };
  }
  return {
    ok: true as const,
    input: {
      firstName: data.patient.first_name,
      lastName: data.patient.last_name || undefined,
      phone: phone ?? undefined,
      email: data.patient.email?.toLowerCase(),
      city: data.patient.city || undefined,
      state: data.patient.state || undefined,
      preferredLanguage: data.patient.preferred_language,
      reason: data.need.reason || undefined,
      preferredCareMode: data.need.preferred_care_mode === "face_to_face" ? "in_person" : data.need.preferred_care_mode,
      preferredContactChannel: data.contact.preferred_channel,
      consentGranted: true,
      privacyNoticeVersion: data.consent.privacy_notice_version || undefined,
    },
  };
}
