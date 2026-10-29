import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { providerResponseDueAt } from "../lib/bookingResponse";
import { issueReceipt } from "./helpers/receipts";
import { isJoyLoginEmail } from "../lib/auth/joyLoginEmail";
import { getService } from "../lib/rehabify-services";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { ensureUserRole } from "./auth";
import { publicAppUrl } from "./helpers/appUrl";
import { normalizePhone, normalizeTrackingCode, phonesMatch, referralEnv, toPublicStatus } from "./helpers/partnerShared";
import { markProviderMatched, transitionReferral } from "./helpers/partnerEvents";
import { attributeUserToLink, attributeUserToReferral, bumpLinkCounter } from "./helpers/partnerAttribution";
import { recordPartnerCommission } from "./helpers/partnerLedger";
import { ensureJoyCareLink, logJourney } from "./joyHandoff";
import { ensureUserNumbers } from "./helpers/rehabifyIds";
import { servesRehabifyNetwork } from "./physioSetup";
import { loadTariffs, quoteBooking, quoteSnapshot } from "./helpers/rehabifyPricing";
import {
  isJoyProviderEligible,
  JOY_CONSULTATION_SERVICES,
  joyServiceFor,
  JoyPricingError,
  LEGACY_JOY_CONSULTATION_KOBO,
  quoteJoyProviderBooking,
} from "./helpers/joyPricing";
import { ensureMarketplaceInvoice } from "./helpers/marketplaceInvoices";
import { calculatePaystackInboundGrossAmount } from "../lib/pricing";
import { missingPolicies } from "./helpers/policyAcceptance";
import { recoveryPlanForJoy } from "./helpers/patientPlans";
import { PATIENT_CONSENT_POLICIES, consentDocumentsForJoy } from "../lib/policies";

const HOUR_MS = 60 * 60 * 1000;
const BOOKING_HOLD_MS = 30 * 60 * 1000;
const encoder = new TextEncoder();
export const AMBER_SPECIALIST_REVIEW_PRICE_KOBO = 600_000;
export const AMBER_SPECIALIST_REVIEW_DURATION_MINUTES = 5;

// Patient-facing booking codes skip look-alike characters (0/O, 1/I) so they
// survive being read aloud or retyped from WhatsApp. 32^8 ≈ 1.1 trillion codes.
const BOOKING_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const BOOKING_CODE_LENGTH = 8;
// The patient's join link opens shortly before the session and stays usable
// through a generous overrun.
const JOIN_OPENS_BEFORE_MS = 30 * 60_000;
const JOIN_CLOSES_AFTER_MS = 2 * HOUR_MS;

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

function samePhone(left: string, right: string): boolean {
  const a = left.replace(/\D/g, "");
  const b = right.replace(/\D/g, "");
  return a.length >= 7 && b.length >= 7 && a.slice(-10) === b.slice(-10);
}

function displayName(user: { firstName?: string; lastName?: string }): string | undefined {
  const value = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return value || undefined;
}

function joyRoomId(appointmentId: Id<"appointments">): string {
  return `joy-${appointmentId}`;
}

function newBookingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(BOOKING_CODE_LENGTH));
  // 256 is a multiple of the alphabet size, so every character is equally likely.
  return Array.from(bytes, (byte) => BOOKING_CODE_ALPHABET[byte % BOOKING_CODE_ALPHABET.length]).join("");
}

async function bookingByCode(ctx: QueryCtx, rawCode: string): Promise<Doc<"marketplaceBookings"> | null> {
  const code = rawCode.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (code.length !== BOOKING_CODE_LENGTH) return null;
  const booking = await ctx.db.query("marketplaceBookings").withIndex("by_booking_code", (q) => q.eq("bookingCode", code)).first();
  return booking?.sourceSystem === "joy_ai" ? booking : null;
}

/**
 * What Joy shows before a booking exists: the standard price for the service a provider
 * booking in this mode maps to (Joy bookings are priced from the Rehabify catalogue; the exact
 * service and travel charge are fixed when the booking is created).
 */
async function indicativeJoyAmountKobo(ctx: QueryCtx, mode: "home_visit" | "clinic" | "online", durationMinutes?: number, assessed?: boolean): Promise<number | null> {
  const serviceId = joyServiceFor(mode, { durationMinutes, assessed });
  if (!serviceId) return null;
  const { tariffs } = await loadTariffs(ctx);
  return tariffs[serviceId].active ? tariffs[serviceId].priceKobo : null;
}

export const resolvePatientByPhone = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const matches = await ctx.db.query("users").withIndex("by_phone_number", (q) => q.eq("phoneNumber", phone)).collect();
    const patients = matches.filter((user) => user.role === "patient");
    if (patients.length !== 1) return { resolution: patients.length ? "AMBIGUOUS" : "NOT_FOUND" };
    const user = patients[0];
    return { resolution: "MATCH", patient_id: user._id, display_name: displayName(user) };
  },
});

/**
 * Extract referral tracking code from incoming text message.
 * Robust against punctuation, casing, and sentence embedding:
 *  - START RHB-95942
 *  - START RHB-95942 - Hello Joy...
 *  - REHAB_REF_RHB-95942
 *  - Hello... My tracking code is RHB-95942. Please connect me...
 *  - Any RHB-XXXXX pattern
 */
export function extractTrackingCode(text?: string): string | null {
  if (!text) return null;
  const cleanPunctuation = (val: string) => val.replace(/[.,!?;:()]+$/, "").trim().toUpperCase();

  // 1. Explicit START command
  const startMatch = text.match(/START\s+([A-Za-z0-9_-]+)/i);
  if (startMatch) return cleanPunctuation(startMatch[1]);

  // 2. REHAB_REF_ prefix
  const refMatch = text.match(/REHAB_REF_([A-Za-z0-9_-]+)/i);
  if (refMatch) return cleanPunctuation(refMatch[1]);

  // 3. Sentence form: "tracking code is RHB-XXXXX" or "code is RHB-XXXXX"
  const sentenceMatch = text.match(/(?:tracking|referral)\s+code\s+(?:is\s+)?[:#]?\s*([A-Za-z0-9_-]+)/i);
  if (sentenceMatch) return cleanPunctuation(sentenceMatch[1]);

  // 4. Standard RHB- pattern anywhere in message
  const rhbMatch = text.match(/\b(RHB-[A-Za-z0-9_-]+)\b/i);
  if (rhbMatch) return cleanPunctuation(rhbMatch[1]);

  return null;
}

/**
 * Multi-strategy referral resolver by tracking code, external partner ID,
 * Convex ID, or code suffix.
 */
/**
 * Resolves a LIVE referral by its exact tracking code (case/spacing-insensitive).
 * Sandbox referrals are never linked to real WhatsApp patients, and there is no
 * fuzzy/suffix matching that could attach a patient to someone else's referral.
 */
async function findReferralByCode(ctx: any, code: string) {
  const normalized = normalizeTrackingCode(code);
  if (!normalized) return null;
  const matches = await ctx.db
    .query("inboundReferrals")
    .withIndex("by_tracking_code", (q: any) => q.eq("trackingCode", normalized))
    .take(5);
  return matches.find((r: any) => referralEnv(r) === "live") ?? null;
}

/** Recent live referral (last 30 days, not yet booked) whose patient phone matches. */
async function findOpenReferralByPhone(ctx: any, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const candidates = await ctx.db
    .query("inboundReferrals")
    .withIndex("by_phone_normalized", (q: any) => q.eq("patientPhoneNormalized", normalized))
    .order("desc")
    .take(10);
  const legacy = candidates.length > 0 ? [] : await ctx.db.query("inboundReferrals").order("desc").take(50);
  return (
    [...candidates, ...legacy].find(
      (r: any) =>
        referralEnv(r) === "live" &&
        r.createdAt >= cutoff &&
        phonesMatch(r.patientPhone, normalized) &&
        ["received", "contacted"].includes(toPublicStatus(r.status))
    ) ?? null
  );
}

/** Joy reached the patient: move the referral to "contacted" (fires referral.contacted). */
async function markReferralContacted(ctx: any, referral: any, metadata: Record<string, unknown>) {
  if (toPublicStatus(referral.status) !== "received") return;
  await transitionReferral(ctx, referral._id, "intake_started", {
    actorType: "joy_ai",
    actorId: "joy_ai",
    metadata: { channel: "whatsapp", ...metadata },
  });
}

async function linkTrackingCodeToWhatsAppInternalHandler(
  ctx: any,
  args: {
    trackingCode: string;
    phone: string;
    joyPersonId?: string;
    name?: string;
    email?: string;
    message?: string;
  }
) {
  const phone = args.phone.trim();
  const trackingCode = args.trackingCode.trim();
  const matched = await findReferralByCode(ctx, trackingCode);

  if (!matched) {
    return { success: false, reason: "REFERRAL_NOT_FOUND", trackingCode };
  }

  // A referral already linked to another patient cannot be claimed by a different
  // WhatsApp number (prevents hijacking a referral with a guessed/forwarded code).
  if (matched.patientId) {
    const linkedPatient = await ctx.db.get(matched.patientId);
    if (linkedPatient && !phonesMatch(linkedPatient.phoneNumber, phone)) {
      return { success: false, reason: "REFERRAL_ALREADY_LINKED", trackingCode };
    }
  }

  // Resolve or provision patient user
  const matches = await ctx.db.query("users").withIndex("by_phone_number", (q: any) => q.eq("phoneNumber", phone)).collect();
  const patients = matches.filter((user: any) => user.role === "patient");

  const [firstName, ...remainingNames] = (args.name || `${matched.patientFirstName || ""} ${matched.patientLastName || ""}`).trim().split(/\s+/).filter(Boolean);
  const patientFirstName = firstName || matched.patientFirstName || "Patient";
  const patientLastName = remainingNames.join(" ") || matched.patientLastName || "";

  let resolvedPatientId: Id<"users">;
  if (patients.length > 0) {
    resolvedPatientId = patients[0]._id;
    await ctx.db.patch(resolvedPatientId, {
      linkedReferralTrackingCode: matched.trackingCode,
      firstName: patients[0].firstName && patients[0].firstName !== "Patient" ? patients[0].firstName : patientFirstName,
      lastName: patients[0].lastName || patientLastName,
    });
  } else {
    resolvedPatientId = await ctx.db.insert("users", {
      clerkId: `joy-whatsapp:${args.joyPersonId || phone.replace(/\D/g, "")}`,
      email: args.email || matched.patientEmail,
      firstName: patientFirstName,
      lastName: patientLastName,
      phoneNumber: phone,
      role: "patient",
      onboarded: false,
      linkedReferralTrackingCode: matched.trackingCode,
    });
  }
  await ensureUserNumbers(ctx, resolvedPatientId);

  // Ensure patient profile is synchronized with city, area, and address from referral
  const existingProfile = await ctx.db
    .query("patientProfiles")
    .withIndex("by_user_id", (q: any) => q.eq("userId", resolvedPatientId))
    .first();

  const profileCity = matched.city || existingProfile?.city || "Lagos";
  const profileArea = matched.area || existingProfile?.area || undefined;
  const profileAddress = [profileArea, profileCity].filter(Boolean).join(", ");

  if (existingProfile) {
    await ctx.db.patch(existingProfile._id, {
      city: profileCity,
      area: profileArea,
      address: profileAddress || existingProfile.address,
    });
  } else {
    await ctx.db.insert("patientProfiles", {
      userId: resolvedPatientId,
      city: profileCity,
      area: profileArea,
      address: profileAddress || undefined,
    });
  }

  const previousStatus = matched.status;
  const shouldAdvance = toPublicStatus(previousStatus) === "received";
  const nextStatus = shouldAdvance ? "intake_started" : previousStatus;

  await ctx.db.patch(matched._id, {
    patientId: resolvedPatientId,
    whatsappPhone: phone,
    whatsappJoyPersonId: args.joyPersonId || matched.whatsappJoyPersonId,
    lastWhatsAppInteractionAt: Date.now(),
    updatedAt: Date.now(),
  });

  await ctx.db.insert("referralEvents", {
    referralId: matched._id,
    eventName: "patient.whatsapp_linked",
    occurredAt: Date.now(),
    actorType: "system",
    actorId: "joy_ai",
    metadata: { channel: "whatsapp", joyPersonId: args.joyPersonId },
  });
  await markReferralContacted(ctx, matched, { strategy: "tracking_code" });
  await attributeUserToReferral(ctx, resolvedPatientId, matched);

  // Lookup partner for personalized context
  let partnerInfo: any = null;
  if (matched.partnerId) {
    partnerInfo = await ctx.db
      .query("partners")
      .withIndex("by_code", (q: any) => q.eq("code", matched.partnerId))
      .first();
  }

  const partnerName = partnerInfo?.name || "Healthcare Partner";
  const condition = matched.condition || "Musculoskeletal Rehabilitation";
  const careMode = matched.preferredCareMode || "patient_choice";
  const careModeLabel =
    careMode === "remote"
      ? "online tele-rehab"
      : careMode === "face_to_face"
      ? "an in-person home visit"
      : "physiotherapy care";

  const suggestedGreeting = `Hello ${patientFirstName}! Welcome to Rehabify Health. We received your referral from ${partnerName} for ${condition}. I see you're located in ${[profileArea, profileCity].filter(Boolean).join(", ")} and prefer ${careModeLabel}. Let's get you matched with a verified physiotherapist right away.`;

  const intakeSummary = `Verified Referral ${matched.trackingCode}: Patient ${patientFirstName} ${patientLastName} referred by ${partnerName} for ${condition} in ${[profileArea, profileCity].filter(Boolean).join(", ")}. Pre-filled info verified; DO NOT ask patient for name, location, or diagnosis again. Proceed directly to confirming their schedule.`;

  return {
    success: true,
    referralId: matched._id,
    trackingCode: matched.trackingCode,
    status: nextStatus,
    patientId: resolvedPatientId,
    patientName: `${patientFirstName} ${patientLastName}`.trim(),
    first_name: patientFirstName,
    last_name: patientLastName,
    phone,
    partner_name: partnerName,
    partner_code: matched.partnerId,
    condition,
    diagnosis: condition,
    clinical_notes: matched.clinicalNotes || null,
    city: profileCity,
    area: profileArea || null,
    preferred_care_mode: careMode,
    recommended_sessions: matched.recommendedSessions || 4,
    referring_doctor: matched.hospitalClinic || partnerName,
    suggested_greeting: suggestedGreeting,
    intake_summary: intakeSummary,
    referral: {
      id: matched._id,
      tracking_code: matched.trackingCode,
      partner_name: partnerName,
      condition,
      city: profileCity,
      area: profileArea || null,
      preferred_care_mode: careMode,
      recommended_sessions: matched.recommendedSessions || 4,
      referring_doctor: matched.hospitalClinic || partnerName,
      status: nextStatus,
    },
  };
}

export const linkTrackingCodeToWhatsAppInternal = internalMutation({
  args: {
    trackingCode: v.string(),
    phone: v.string(),
    joyPersonId: v.optional(v.string()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return linkTrackingCodeToWhatsAppInternalHandler(ctx, args);
  },
});

// The former public `linkTrackingCodeToWhatsApp` mutation was removed: linking a
// referral to a WhatsApp number is reachable only through the HMAC-signed Joy
// gateway (/joy-integration/link_referral → linkTrackingCodeToWhatsAppInternal).

/**
 * Joy may provision a minimal patient record, but never a Clerk account (Rehabify
 * creates that after payment, in actions/joyDashboard.ts). The normalized WhatsApp
 * number is the idempotency key for this integration path.
 */
export const resolveOrCreatePatientByPhone = internalMutation({
  args: {
    phone: v.string(),
    joyPersonId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    trackingCode: v.optional(v.string()),
    initialMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const phone = args.phone.trim();
    const matches = await ctx.db.query("users").withIndex("by_phone_number", (q) => q.eq("phoneNumber", phone)).collect();
    const patients = matches.filter((user) => user.role === "patient");
    if (patients.length > 1) return { resolution: "AMBIGUOUS" as const };

    let resolvedPatientId: Id<"users">;
    let resultResolution: "EXISTING" | "CREATED";
    let resultDisplayName: string | undefined;

    if (patients.length === 1) {
      const user = patients[0];
      resolvedPatientId = user._id;
      resultResolution = "EXISTING";
      resultDisplayName = displayName(user);
    } else {
      const [firstName, ...remainingNames] = (args.name ?? "").trim().split(/\s+/).filter(Boolean);
      resolvedPatientId = await ctx.db.insert("users", {
        // This is intentionally not a Clerk ID. It identifies a service-created
        // WhatsApp patient until the person later links a Clerk account.
        clerkId: `joy-whatsapp:${args.joyPersonId}`,
        // Lower-cased so a later sign-up with the same (verified) email claims this record
        email: args.email?.trim().toLowerCase() || undefined,
        firstName: firstName || "Patient",
        lastName: remainingNames.join(" "),
        phoneNumber: phone,
        role: "patient",
        onboarded: false,
      });
      const patientProfileId = await ctx.db.insert("patientProfiles", { userId: resolvedPatientId });
      // Documents and the patient dashboard find the profile through this pointer
      await ctx.db.patch(resolvedPatientId, { patientProfileId });
      await ensureUserNumbers(ctx, resolvedPatientId);
      resultResolution = "CREATED";
      resultDisplayName = [firstName, ...remainingNames].filter(Boolean).join(" ") || undefined;
    }

    // Strategies (live referrals only): 1) tracking code in the message, 2) this WhatsApp
    // number was linked before, 3) an open referral recorded with this phone number.
    const explicitCode = (args.trackingCode || "").trim();
    const extractedCode = extractTrackingCode(args.initialMessage);
    const trackingCode = explicitCode || extractedCode;

    let linkedReferral: any = null;
    let strategy = "";
    if (trackingCode) {
      const matched = await findReferralByCode(ctx, trackingCode);
      const owner: Doc<"users"> | null = matched?.patientId ? await ctx.db.get(matched.patientId as Id<"users">) : null;
      if (matched && (!owner || owner._id === resolvedPatientId || phonesMatch(owner.phoneNumber, phone))) {
        linkedReferral = matched;
        strategy = "tracking_code";
      }
    }
    if (!linkedReferral) {
      const existingLinked = await ctx.db
        .query("inboundReferrals")
        .withIndex("by_whatsapp_phone", (q) => q.eq("whatsappPhone", phone))
        .order("desc")
        .first();
      if (existingLinked && referralEnv(existingLinked) === "live") {
        linkedReferral = existingLinked;
        strategy = "phone_relink";
      }
    }
    if (!linkedReferral) {
      const byPhone = await findOpenReferralByPhone(ctx, phone);
      if (byPhone && (!byPhone.patientId || byPhone.patientId === resolvedPatientId)) {
        linkedReferral = byPhone;
        strategy = "phone_match";
      }
    }

    if (linkedReferral) {
      await ctx.db.patch(linkedReferral._id, {
        patientId: resolvedPatientId,
        whatsappPhone: phone,
        whatsappJoyPersonId: args.joyPersonId,
        lastWhatsAppInteractionAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("referralEvents", {
        referralId: linkedReferral._id,
        eventName: "patient.whatsapp_linked",
        occurredAt: Date.now(),
        actorType: "system",
        actorId: "joy_ai",
        metadata: { channel: "whatsapp", strategy, joyPersonId: args.joyPersonId },
      });
      await markReferralContacted(ctx, linkedReferral, { strategy });
      await attributeUserToReferral(ctx, resolvedPatientId, linkedReferral);
      linkedReferral = await ctx.db.get(linkedReferral._id);
    }

    // Synchronize patient profile & user names with referral details
    let partnerInfo: any = null;
    let profileCity = "Lagos";
    let profileArea: string | null = null;
    let patientFirstName = resultDisplayName?.split(" ")[0] || "there";
    let patientLastName = resultDisplayName?.split(" ").slice(1).join(" ") || "";

    if (linkedReferral) {
      if (linkedReferral.partnerId) {
        partnerInfo = await ctx.db
          .query("partners")
          .withIndex("by_code", (q: any) => q.eq("code", linkedReferral.partnerId))
          .first();
      }

      profileCity = linkedReferral.city || "Lagos";
      profileArea = linkedReferral.area || null;
      if (linkedReferral.patientFirstName) patientFirstName = linkedReferral.patientFirstName;
      if (linkedReferral.patientLastName) patientLastName = linkedReferral.patientLastName;

      // Update user names if blank
      await ctx.db.patch(resolvedPatientId, {
        firstName: patientFirstName,
        lastName: patientLastName,
        linkedReferralTrackingCode: linkedReferral.trackingCode,
      });

      // Update patient profile location
      const existingProfile = await ctx.db
        .query("patientProfiles")
        .withIndex("by_user_id", (q: any) => q.eq("userId", resolvedPatientId))
        .first();

      const profileAddress = [profileArea, profileCity].filter(Boolean).join(", ");
      if (existingProfile) {
        await ctx.db.patch(existingProfile._id, {
          city: profileCity,
          area: profileArea || existingProfile.area,
          address: profileAddress || existingProfile.address,
        });
      } else {
        await ctx.db.insert("patientProfiles", {
          userId: resolvedPatientId,
          city: profileCity,
          area: profileArea || undefined,
          address: profileAddress || undefined,
        });
      }
    }

    const partnerName = partnerInfo?.name || "Healthcare Partner";
    const condition = linkedReferral?.condition || "Musculoskeletal Rehabilitation";
    const careMode = linkedReferral?.preferredCareMode || "patient_choice";
    const careModeLabel =
      careMode === "remote"
        ? "online tele-rehab"
        : careMode === "face_to_face"
        ? "an in-person home visit"
        : "physiotherapy care";

    const suggestedGreeting = linkedReferral
      ? `Hello ${patientFirstName}! Welcome to Rehabify Health. We received your referral from ${partnerName} for ${condition}. I see you're located in ${[profileArea, profileCity].filter(Boolean).join(", ")} and prefer ${careModeLabel}. Let's get you matched with a verified physiotherapist right away.`
      : undefined;

    const intakeSummary = linkedReferral
      ? `Verified Referral ${linkedReferral.trackingCode}: Patient ${patientFirstName} ${patientLastName} referred by ${partnerName} for ${condition} in ${[profileArea, profileCity].filter(Boolean).join(", ")}. Pre-filled info verified; DO NOT ask patient for name, location, or diagnosis again. Proceed directly to confirming their schedule.`
      : undefined;

    return {
      resolution: resultResolution,
      patient_id: resolvedPatientId,
      // Additive (Oct 2026), read-only; nothing here changes booking. `consents_required`: Terms,
      // Privacy to ask for at this first chat (empty when already
      // accepted; record with operation patient_record_consents, see joyOperations.ts).
      // `recovery_plan`: whether the patient has Flex Max, so Joy can switch on reminders and
      // support (joy_reminders_allowed; helpers/patientPlans.ts recoveryPlanForJoy).
      consents_required: consentDocumentsForJoy(await missingPolicies(ctx, resolvedPatientId, PATIENT_CONSENT_POLICIES), publicAppUrl()),
      recovery_plan: await recoveryPlanForJoy(ctx, resolvedPatientId),
      display_name: resultDisplayName || `${patientFirstName} ${patientLastName}`.trim(),
      first_name: patientFirstName,
      last_name: patientLastName,
      phone,
      referral_id: linkedReferral?._id,
      tracking_code: linkedReferral?.trackingCode,
      referral_status: linkedReferral?.status,
      partner_name: partnerName,
      partner_code: linkedReferral?.partnerId,
      condition,
      diagnosis: condition,
      clinical_notes: linkedReferral?.clinicalNotes || null,
      city: profileCity,
      area: profileArea,
      preferred_care_mode: careMode,
      recommended_sessions: linkedReferral?.recommendedSessions || 4,
      referring_doctor: linkedReferral?.hospitalClinic || partnerName,
      suggested_greeting: suggestedGreeting,
      intake_summary: intakeSummary,
      referral: linkedReferral
        ? {
            id: linkedReferral._id,
            tracking_code: linkedReferral.trackingCode,
            partner_name: partnerName,
            condition,
            city: profileCity,
            area: profileArea,
            preferred_care_mode: careMode,
            recommended_sessions: linkedReferral.recommendedSessions || 4,
            referring_doctor: linkedReferral.hospitalClinic || partnerName,
            status: linkedReferral.status,
          }
        : null,
    };
  },
});

/**
 * Resolve a partner/HMO referral for the verified WhatsApp sender.  This is a
 * deliberately small, patient-facing projection; it is not a general Convex
 * read and never returns clinicalNotes, callback URLs, partner finance, or
 * unrelated patient records.
 */
export const resolveReferralContextForJoy = internalMutation({
  args: { phone: v.string(), trackingCode: v.string(), joyPersonId: v.string(), patientId: v.id("users") },
  handler: async (ctx, args) => {
    const referral = await findReferralByCode(ctx, args.trackingCode);
    // Do not disclose whether a code exists when it does not belong to the
    // verified sender.
    if (!referral || !samePhone(referral.patientPhone, args.phone)) return { resolution: "MISMATCH" as const };
    if (referral.patientId && referral.patientId !== args.patientId) return { resolution: "CONFLICT" as const };

    const now = Date.now();
    if (!referral.patientId) {
      await ctx.db.patch(referral._id, { patientId: args.patientId, updatedAt: now });
      await ctx.db.insert("referralEvents", {
        referralId: referral._id,
        eventName: "patient.whatsapp_referral_verified",
        occurredAt: now,
        actorType: "system",
        actorId: "joy_ai",
        metadata: { joyPersonId: args.joyPersonId, channel: "whatsapp" },
      });
      await markReferralContacted(ctx, referral, { strategy: "verified_sender" });
    }
    await attributeUserToReferral(ctx, args.patientId, referral);

    return {
      resolution: "MATCH" as const,
      referral: {
        referral_id: referral._id,
        tracking_code: referral.trackingCode,
        patient: { display_name: `${referral.patientFirstName} ${referral.patientLastName}`.trim() || undefined },
        location: { city: referral.city, state: referral.state, area: referral.area },
        preferred_language: referral.preferredLanguage,
        preferred_care_mode: referral.preferredCareMode,
        preferred_contact_channel: referral.preferredContactChannel,
        condition: referral.condition,
        reason: referral.reason,
        priority: referral.priority,
        recommended_sessions: referral.recommendedSessions,
        hospital_clinic: referral.hospitalClinic,
        billing_mode: referral.billingMode,
        referral_status: referral.status,
        next_step: referral.nextStep,
        consent: {
          granted: referral.consentGranted,
          captured_at: referral.consentCapturedAt,
          method: referral.consentMethod,
          privacy_notice_version: referral.consentPrivacyNoticeVersion,
        },
      },
    };
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
    const matches = await ctx.db.query("users").withIndex("by_phone_number", (q) => q.eq("phoneNumber", phone)).collect();
    const providers = matches.filter((user) => user.role === "physiotherapist");
    if (providers.length !== 1) return { resolution: providers.length ? "AMBIGUOUS" : "NO_MATCH" };
    const user = providers[0];
    const profile = await ctx.db.query("physiotherapistProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first();
    const approval = await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first();
    if (!profile || approval?.status !== "approved") return { resolution: "INELIGIBLE" };
    return { resolution: "MATCH", physiotherapist_id: profile._id, rh_user_id: user._id, display_name: displayName(user), capabilities: { specialties: profile.specializations ?? [], service_modes: [ ...(profile.offersOnlineSessions ? ["online"] : []), ...(profile.offersInPersonSessions ? ["in_person"] : []) ] } };
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
    city: v.optional(v.string()),
    area: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new Error("Patient not found");
    const profiles = await ctx.db.query("physiotherapistProfiles")
      .withIndex("by_marketplace_availability", (q) => q.eq("isAvailableOnMarketplace", true))
      .collect();
    const requestedCity = args.city ? normalized(args.city) : "";
    const requestedArea = args.area ? normalized(args.area) : "";
    // Every provider charges the same Rehabify price, so the amount is worked out once
    let amountKobo: number;
    try {
      amountKobo = (await quoteJoyProviderBooking(ctx, { patientId: args.patientId, serviceMode: args.serviceMode, city: args.city, area: args.area })).quote.chargeKobo;
    } catch (error) {
      if (error instanceof JoyPricingError) return [];
      throw error;
    }
    const results = [];
    for (const profile of profiles) {
      if (!(await isJoyProviderEligible(ctx, profile))) continue;
      const modes = profile.joyServiceModes ?? [];
      if (!modes.includes(args.serviceMode)) continue;
      const tags = controlledTags(profile);
      if (!args.requiredSpecialties.every((tag) => tags.includes(tag))) continue;
      if (args.serviceMode === "home_visit") {
        const areas = (profile.joyServiceAreas ?? []).map(normalized);
        const coverage = areas.includes(requestedArea) ? requestedArea : areas.includes(requestedCity) ? requestedCity : null;
        if (!requestedCity || !requestedArea || !coverage) continue;
      }
      if (!profile.availabilitySchedule) continue;
      const user = await ctx.db.get(profile.userId);
      if (!user) continue;
      results.push({
        physiotherapist_id: profile._id,
        physiotherapist_user_id: profile.userId,
        display_name: displayName(user),
        specialties: tags,
        service_modes: modes,
        amount_kobo: amountKobo,
        match_reasons: ["verified specialty", "approved marketplace provider", "configured service mode", ...(args.serviceMode === "home_visit" ? ["serves your city or area"] : [])],
      });
    }
    return results.slice(0, Math.min(Math.max(args.limit, 1), 3));
  },
});

export const resolveProfileForAvailability = internalQuery({
  args: {
    physiotherapistId: v.id("physiotherapistProfiles"),
    serviceMode: v.union(v.literal("home_visit"), v.literal("clinic"), v.literal("online")),
    durationMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.physiotherapistId);
    if (!profile || !profile.joyServiceModes?.includes(args.serviceMode) || !profile.availabilitySchedule) {
      return null;
    }
    if (!(await isJoyProviderEligible(ctx, profile))) return null;
    // Indicative: the booking fixes the exact service and any travel charge
    const amountKobo = await indicativeJoyAmountKobo(ctx, args.serviceMode, args.durationMinutes, (args.durationMinutes ?? 60) <= 45);
    return { physiotherapistUserId: profile.userId, amountKobo };
  },
});

/**
 * Creates the RH-owned Joy booking hold. The Next integration route has
 * already validated a scoped, current eligibility reference directly with
 * Joy. Callers cannot supply their own price or a confirmed status.
 */
export const createPendingJoyBooking = internalMutation({
  args: {
    patientId: v.id("users"),
    physiotherapistId: v.id("physiotherapistProfiles"),
    slotStart: v.number(),
    durationMinutes: v.number(),
    serviceMode: v.union(v.literal("home_visit"), v.literal("clinic"), v.literal("online")),
    sessionType: v.string(),
    patientAddress: v.optional(v.string()),
    triageSummaryReference: v.string(), requiredSpecialties: v.array(v.string()),
    assessmentId: v.string(),
    assessmentRevision: v.number(),
    protocolVersion: v.string(),
    eligibilityReference: v.string(),
    policyVersion: v.string(),
    policyAcceptanceReference: v.string(),
    conversationId: v.string(),
    requestId: v.string(),
    idempotencyKey: v.string(),
    trackingCode: v.optional(v.string()),
    referralId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.slotStart < Date.now() + 2 * HOUR_MS) throw new Error("Booking slots require at least two hours' notice");
    if (!Number.isInteger(args.durationMinutes) || args.durationMinutes < 5 || args.durationMinutes > 180) throw new Error("Invalid session duration");

    const existing = await ctx.db.query("marketplaceBookings")
      .withIndex("by_origin_idempotency", (q) => q.eq("originIdempotencyKey", args.idempotencyKey)).first();
    if (existing) {
      if (existing.patientId !== args.patientId || existing.sourceSystem !== "joy_ai") throw new Error("Idempotency key already belongs to another request");
      return { booking_id: existing._id, booking_status: existing.bookingStatus, payment_status: existing.paymentStatus, amount_kobo: existing.totalAmount, hold_expires_at: existing.holdExpiresAt };
    }

    const patient = await ctx.db.get(args.patientId);
    const profile = await ctx.db.get(args.physiotherapistId);
    if (!patient || patient.role !== "patient" || !profile) throw new Error("Patient or physiotherapist not found");
    if (!profile.isAvailableOnMarketplace || !profile.joyServiceModes?.includes(args.serviceMode) || !(await isJoyProviderEligible(ctx, profile))) {
      throw new Error("Physiotherapist is not eligible for this service");
    }
    // Standard Rehabify price for the service this maps to; the session length is the service's
    let priced;
    try {
      priced = await quoteJoyProviderBooking(ctx, { patientId: args.patientId, serviceMode: args.serviceMode, durationMinutes: args.durationMinutes });
    } catch (error) {
      if (error instanceof JoyPricingError) throw new Error(error.code === "AREA_NOT_COVERED" ? "Home visits are not available in the patient's area" : "This service is not available");
      throw error;
    }
    const durationMinutes = priced.quote.durationMinutes;

    const slotEnd = args.slotStart + durationMinutes * 60_000;
    const appointments = await ctx.db.query("appointments").withIndex("by_physiotherapist_id_and_time", (q) => q.eq("physiotherapistId", profile.userId)).collect();
    const conflictingAppointment = appointments.some((appointment) =>
      appointment.status !== "cancelled_by_patient" && appointment.status !== "cancelled_by_therapist" &&
      appointment.startTime < slotEnd && appointment.endTime > args.slotStart
    );
    if (conflictingAppointment) throw new Error("Selected slot is no longer available");
    const activeHolds = await ctx.db.query("marketplaceBookings").withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", profile.userId)).collect();
    const conflictingHold = activeHolds.some((booking) => booking.bookingStatus === "pending_payment" && (booking.holdExpiresAt ?? 0) > Date.now() && (booking.sessionDate ?? 0) < slotEnd && ((booking.sessionDate ?? 0) + booking.sessionDuration * 60_000) > args.slotStart);
    if (conflictingHold) throw new Error("Selected slot is temporarily held");

    // Resolve the patient's LIVE partner referral (validated: must belong to this patient).
    let linkedReferral: any = null;
    const referralIdArg = args.referralId ? ctx.db.normalizeId("inboundReferrals", args.referralId) : null;
    if (referralIdArg) {
      const candidate = await ctx.db.get(referralIdArg);
      if (candidate && referralEnv(candidate) === "live" && (!candidate.patientId || candidate.patientId === args.patientId)) {
        linkedReferral = candidate;
      }
    }
    if (!linkedReferral && patient.linkedReferralId) {
      const candidate = await ctx.db.get(patient.linkedReferralId);
      if (candidate && referralEnv(candidate) === "live") linkedReferral = candidate;
    }
    if (!linkedReferral) {
      const code = args.trackingCode || patient.linkedReferralTrackingCode;
      const candidate = code ? await findReferralByCode(ctx, code) : null;
      if (candidate && (!candidate.patientId || candidate.patientId === args.patientId)) linkedReferral = candidate;
    }
    if (!linkedReferral && patient.phoneNumber) {
      const candidate = await findOpenReferralByPhone(ctx, patient.phoneNumber);
      if (candidate && (!candidate.patientId || candidate.patientId === args.patientId)) linkedReferral = candidate;
    }
    // Partner attribution: the referral's partner, else the patient's (validated) link attribution.
    const partnerId = linkedReferral?.partnerId ?? patient.referredByPartnerCode;
    const referralLinkId = linkedReferral?.linkId ?? patient.referralLinkId;

    const fees = quoteSnapshot(priced.quote, priced.area);
    const now = Date.now();
    const bookingId = await ctx.db.insert("marketplaceBookings", {
      physiotherapistId: profile.userId, patientId: args.patientId, sessionType: args.sessionType,
      sessionDate: args.slotStart, sessionDuration: durationMinutes, isOnline: args.serviceMode === "online", joyServiceMode: args.serviceMode, joyRequiredSpecialties: args.requiredSpecialties,
      careMode: args.serviceMode === "online" ? "virtual" : "in_person",
      patientAddress: args.patientAddress, ...fees, paymentStatus: "pending", bookingStatus: "pending_payment",
      patientNotes: `Joy triage summary reference: ${args.triageSummaryReference}`,
      sourceSystem: "joy_ai", sourceChannel: "whatsapp", sourceEntryPoint: "patient_booking",
      joyConversationId: args.conversationId, joyAssessmentId: args.assessmentId, joyAssessmentRevision: args.assessmentRevision,
      joyEligibilityReference: args.eligibilityReference, joyPolicyVersion: args.policyVersion,
      joyPolicyAcceptanceReference: args.policyAcceptanceReference, originRequestId: args.requestId,
      originIdempotencyKey: args.idempotencyKey, originatedAt: now, holdExpiresAt: now + BOOKING_HOLD_MS,
      providerResponse: "pending", replacementStatus: "not_needed",
      referralId: linkedReferral?._id,
      partnerId,
      referralLinkId,
      createdAt: now, updatedAt: now,
    });
    await bumpLinkCounter(ctx, referralLinkId, "bookings");
    await logJourney(ctx, { patientId: args.patientId, bookingId, stage: "booking_held", eventKey: `booking-held-${bookingId}` });
    // Every Joy booking gets its short link up front, so the patient can follow its status
    await ctx.scheduler.runAfter(0, internal.joyIntegration.ensureJoyBookingCode, { bookingId });

    // A physiotherapist was matched. The referral becomes "booked" only once payment
    // is verified (recordJoyPaymentWebhook).
    if (linkedReferral) {
      await ctx.db.patch(linkedReferral._id, { bookingId, patientId: args.patientId, updatedAt: now });
      await markProviderMatched(ctx, linkedReferral._id, profile.userId, {
        actorType: "joy_ai",
        actorId: "joy_ai",
        metadata: { bookingId, slotStart: args.slotStart, serviceMode: args.serviceMode },
      });
    }

    return {
      booking_id: bookingId, booking_status: "pending_payment", payment_status: "pending", amount_kobo: fees.totalAmount, hold_expires_at: now + BOOKING_HOLD_MS,
      service_id: priced.serviceId, duration_minutes: durationMinutes,
    };
  },
});

/**
 * Creates the fixed-price virtual consultation requested by Joy. It has no
 * provider or slot yet: an RH administrator allocates both only after the
 * verified Paystack webhook records payment.
 */
export const createAdminScheduledJoyVirtualBooking = internalMutation({
  args: {
    patientId: v.id("users"),
    consultationType: v.union(v.literal("quick_initial"), v.literal("full_virtual")),
    durationMinutes: v.number(), amountKobo: v.number(), triageSummaryReference: v.string(),
    assessmentId: v.string(), assessmentRevision: v.number(), policyVersion: v.string(),
    policyAcceptanceReference: v.string(), conversationId: v.string(), requestId: v.string(), idempotencyKey: v.string(),
    partnerReferralCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Priced from the Rehabify catalogue. Joy's templates may still send the old amount
    // (₦15,000 for a full assessment); it is accepted but the catalogue price is charged.
    const serviceId = JOY_CONSULTATION_SERVICES[args.consultationType];
    const quote = await quoteBooking(ctx, { serviceId });
    const expectedDuration = quote.durationMinutes;
    if (args.durationMinutes !== expectedDuration) throw new Error("Invalid virtual consultation price or duration");
    if (args.amountKobo !== quote.chargeKobo && args.amountKobo !== LEGACY_JOY_CONSULTATION_KOBO[args.consultationType]) {
      throw new Error("Invalid virtual consultation price or duration");
    }
    if (args.amountKobo !== quote.chargeKobo) {
      console.warn("joy_consultation_price_outdated", { consultationType: args.consultationType, sent: args.amountKobo, charged: quote.chargeKobo });
    }
    const existing = await ctx.db.query("marketplaceBookings").withIndex("by_origin_idempotency", q => q.eq("originIdempotencyKey", args.idempotencyKey)).first();
    if (existing) {
      if (existing.patientId !== args.patientId || existing.joyBookingRoute !== "admin_scheduled_virtual") throw new Error("Idempotency key already belongs to another request");
      return { booking_id: existing._id, booking_status: existing.bookingStatus, payment_status: existing.paymentStatus, amount_kobo: existing.totalAmount, hold_expires_at: existing.holdExpiresAt };
    }
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new Error("Patient not found");
    const partnerReferralCode = args.partnerReferralCode;
    let partnerId: string | undefined = patient.referredByPartnerCode;
    let referralLinkId = patient.referralLinkId;
    if (partnerReferralCode) {
      const link = await ctx.db.query("partnerReferralLinks")
        .withIndex("by_public_code", (q) => q.eq("publicCode", partnerReferralCode))
        .first();
      if (!link || link.status !== "active" || (link.expiresAt && link.expiresAt <= Date.now())) {
        throw new Error("Partner referral link is not active");
      }
      if (patient.referralPublicCode !== link.publicCode || patient.referredByPartnerCode !== link.partnerId) {
        throw new Error("Partner attribution does not belong to this patient");
      }
      partnerId = link.partnerId;
      referralLinkId = link._id;
    }
    let referralId = patient.linkedReferralId;
    if (referralId) {
      const linked = await ctx.db.get(referralId);
      if (!linked || linked.partnerId !== partnerId || referralEnv(linked) !== "live") referralId = undefined;
    }
    const now = Date.now();
    const bookingId = await ctx.db.insert("marketplaceBookings", {
      patientId: args.patientId, sessionType: args.consultationType, sessionDuration: expectedDuration,
      isOnline: true, joyServiceMode: "online", careMode: "virtual",
      // Standard pricing: the clinician the admin assigns earns the service's payout once
      // the session is completed; Rehabify keeps the rest (and absorbs Paystack's fee).
      ...quoteSnapshot(quote), paymentStatus: "pending", bookingStatus: "pending_payment",
      patientNotes: `Joy triage summary reference: ${args.triageSummaryReference}`,
      sourceSystem: "joy_ai", sourceChannel: "whatsapp", sourceEntryPoint: "virtual_consultation",
      partnerId, joyPartnerReferralLinkCode: partnerReferralCode, referralLinkId, referralId,
      joyConversationId: args.conversationId, joyAssessmentId: args.assessmentId, joyAssessmentRevision: args.assessmentRevision,
      joyPolicyVersion: args.policyVersion, joyPolicyAcceptanceReference: args.policyAcceptanceReference,
      originRequestId: args.requestId, originIdempotencyKey: args.idempotencyKey, originatedAt: now,
      holdExpiresAt: now + BOOKING_HOLD_MS, joyBookingRoute: "admin_scheduled_virtual",
      joyConsultationType: args.consultationType, adminSchedulingStatus: "awaiting_schedule",
      replacementStatus: "not_needed", createdAt: now, updatedAt: now,
    });
    await logJourney(ctx, { patientId: args.patientId, bookingId, stage: "booking_held", eventKey: `booking-held-${bookingId}` });
    await ctx.scheduler.runAfter(0, internal.joyIntegration.ensureJoyBookingCode, { bookingId });
    return {
      booking_id: bookingId, booking_status: "pending_payment", payment_status: "pending", amount_kobo: quote.chargeKobo, hold_expires_at: now + BOOKING_HOLD_MS,
      service_id: serviceId, duration_minutes: expectedDuration,
    };
  },
});

/** Verify and persist the original partner link before Joy uses its attribution. */
export const resolvePartnerAttributionForJoy = internalMutation({
  args: { patientId: v.id("users"), publicCode: v.string() },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") return { resolution: "NOT_FOUND" as const };
    const link = await ctx.db.query("partnerReferralLinks")
      .withIndex("by_public_code", (q) => q.eq("publicCode", args.publicCode.trim()))
      .first();
    if (!link) return { resolution: "NOT_FOUND" as const };
    // First partner wins: an already-attributed patient keeps their partner.
    if (patient.referredByPartnerCode && patient.referredByPartnerCode !== link.partnerId) {
      return { resolution: "CONFLICT" as const };
    }
    if (!patient.referredByPartnerCode) {
      const result = await attributeUserToLink(ctx, patient, args.publicCode, "joy");
      if (!result.attributed) return { resolution: "NOT_FOUND" as const };
      await bumpLinkCounter(ctx, link._id, "joyStarts");
    }
    const partner = await ctx.db.query("partners")
      .withIndex("by_code", (q) => q.eq("code", link.partnerId)).first();
    return {
      resolution: "MATCH" as const,
      partner_id: link.partnerId,
      partner_name: partner?.name || "Rehabify partner",
      public_code: link.publicCode,
    };
  },
});

export const getJoyBooking = internalQuery({
  args: { bookingId: v.id("marketplaceBookings"), patientId: v.id("users") },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.patientId !== args.patientId || booking.sourceSystem !== "joy_ai") return null;
    const provider = booking.physiotherapistId ? await ctx.db.get(booking.physiotherapistId) : null;
    return {
      booking_id: booking._id, booking_status: booking.bookingStatus, payment_status: booking.paymentStatus,
      amount_kobo: booking.totalAmount, currency: "NGN", session_start: booking.sessionDate,
      duration_minutes: booking.sessionDuration, hold_expires_at: booking.holdExpiresAt,
      service_mode: booking.joyServiceMode ?? (booking.isOnline ? "online" : "clinic"),
      provider: provider ? { display_name: displayName(provider) } : null, updated_at: booking.updatedAt,
      booking_code: booking.bookingCode ?? null,
      meeting_url: booking.bookingCode ? `${publicAppUrl()}/v/${booking.bookingCode}` : null,
    };
  },
});

export const cancelJoyBooking = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), patientId: v.id("users"), reason: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.patientId !== args.patientId || booking.sourceSystem !== "joy_ai") throw new Error("Joy booking not found");
    if (booking.bookingStatus === "cancelled") return { booking_id: booking._id, booking_status: booking.bookingStatus, payment_status: booking.paymentStatus };
    // This route deliberately handles only an unpaid hold. Paid cancellation is
    // an operational/refund workflow and must not erase payment evidence.
    if (booking.paymentStatus !== "pending" || booking.bookingStatus !== "pending_payment") throw new Error("Paid bookings require the approved cancellation workflow");
    await ctx.db.patch(booking._id, { bookingStatus: "cancelled", cancellationReason: args.reason, holdExpiresAt: Date.now(), updatedAt: Date.now() });
    await logJourney(ctx, { patientId: booking.patientId, bookingId: booking._id, stage: "cancelled", eventKey: `booking-cancelled-${booking._id}` });
    return { booking_id: booking._id, booking_status: "cancelled", payment_status: booking.paymentStatus };
  },
});

export const prepareJoyPaymentAttempt = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), patientId: v.id("users"), requestId: v.string(), idempotencyKey: v.string(), reference: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("joyPaymentAttempts").withIndex("by_origin_idempotency", (q) => q.eq("originIdempotencyKey", args.idempotencyKey)).first();
    if (existing) {
      // An idempotency key may only ever identify the booking that created it.
      // Returning another booking's URL could expose a completed checkout.
      if (existing.bookingId !== args.bookingId) throw new Error("Payment idempotency key belongs to another booking");
      return { attempt_id: existing._id, booking_id: existing.bookingId, reference: existing.reference, amount_kobo: existing.amountKobo, status: existing.status, authorization_url: existing.authorizationUrl };
    }
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.patientId !== args.patientId || booking.sourceSystem !== "joy_ai") throw new Error("Joy booking not found");
    if (booking.bookingStatus !== "pending_payment" || booking.paymentStatus !== "pending" || (booking.holdExpiresAt ?? 0) <= Date.now()) throw new Error("Booking is not available for payment");
    const now = Date.now();
    const attemptId = await ctx.db.insert("joyPaymentAttempts", { bookingId: booking._id, reference: args.reference, amountKobo: booking.totalAmount, currency: "NGN", status: "initializing", sourceSystem: "joy_ai", sourceChannel: "whatsapp", originRequestId: args.requestId, originIdempotencyKey: args.idempotencyKey, createdAt: now, updatedAt: now });
    await ctx.db.patch(booking._id, { paymentReference: args.reference, updatedAt: now });
    return { attempt_id: attemptId, booking_id: booking._id, reference: args.reference, amount_kobo: booking.totalAmount, status: "initializing" };
  },
});

export const recordJoyPaymentInitialization = internalMutation({
  args: { attemptId: v.id("joyPaymentAttempts"), authorizationUrl: v.optional(v.string()), safeAccessCode: v.optional(v.string()), failureCategory: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Payment attempt not found");
    const success = Boolean(args.authorizationUrl);
    await ctx.db.patch(attempt._id, { status: success ? "initialized" : "failed", authorizationUrl: args.authorizationUrl, safeAccessCode: args.safeAccessCode, failureCategory: args.failureCategory, updatedAt: Date.now() });
    return { status: success ? "initialized" : "failed" };
  },
});

/**
 * Verified Joy payment → partner side effects: the linked live referral becomes
 * "booked" (fires referral.booked), the partner earns a commission through the
 * unified ledger, and the referral link's payment counter increments.
 */
async function creditPartnerForJoyPayment(ctx: any, booking: Doc<"marketplaceBookings">, reference: string, now: number) {
  let referral: any = booking.referralId ? await ctx.db.get(booking.referralId) : null;
  if (referral && referralEnv(referral) !== "live") referral = null;
  if (referral) {
    await ctx.db.insert("referralEvents", {
      referralId: referral._id,
      eventName: "payment.verified",
      occurredAt: now,
      actorType: "system",
      actorId: "paystack",
      metadata: { bookingId: booking._id, reference },
    });
    const status = toPublicStatus(referral.status);
    if (status === "received" || status === "contacted") {
      await transitionReferral(ctx, referral._id, "booked", {
        actorType: "system",
        actorId: "paystack",
        metadata: { bookingId: booking._id, reference },
        extraPatch: { bookingId: booking._id },
      });
    }
  }
  const partnerCode = booking.partnerId ?? referral?.partnerId;
  if (!partnerCode) return;
  const physio: any = booking.physiotherapistId ? await ctx.db.get(booking.physiotherapistId) : null;
  const patient: any = await ctx.db.get(booking.patientId);
  try {
    await recordPartnerCommission(ctx, {
      partnerCode,
      environment: "live",
      idempotencyKey: `payment:${reference}`,
      // Standard pricing: the travel charge is excluded and the physio's share is their fixed payout
      grossKobo: booking.pricingModel ? booking.serviceAmount - (booking.travelSurchargeKobo ?? 0) : booking.serviceAmount,
      physiotherapistKobo: booking.pricingModel ? booking.payoutKobo : undefined,
      paymentMethod: "paystack",
      paymentReference: reference,
      source: "joy",
      referralId: referral?._id,
      bookingId: booking._id,
      linkId: booking.referralLinkId,
      patientUserId: booking.patientId,
      patientName: patient ? displayName(patient) : undefined,
      trackingCode: referral?.trackingCode,
      physiotherapistId: booking.physiotherapistId ?? undefined,
      physiotherapistName: physio ? displayName(physio) : undefined,
      careMode: booking.isOnline ? "virtual" : "in_person",
      earnedAt: now,
    });
  } catch (error) {
    // Never block payment recording; the ledger is idempotent and can be replayed.
    console.error("partner_commission_failed", { reference, error: error instanceof Error ? error.message : String(error) });
  }
  await bumpLinkCounter(ctx, booking.referralLinkId, "payments");
}

/** Once a Joy patient has paid, give them a login and send Joy their dashboard link. */
async function scheduleJoyDashboard(ctx: MutationCtx, booking: Doc<"marketplaceBookings">) {
  await ctx.scheduler.runAfter(0, internal.actions.joyDashboard.provisionJoyDashboard, {
    patientId: booking.patientId, bookingId: booking._id, notifyJoy: true,
  });
}

/** Webhook-only payment evidence. It deliberately does not confirm an appointment. */
export const recordJoyPaymentWebhook = internalMutation({
  args: { reference: v.string(), amountKobo: v.number(), currency: v.string(), paystackEventId: v.string() },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.query("joyPaymentAttempts").withIndex("by_reference", (q) => q.eq("reference", args.reference)).first();
    if (!attempt) return { handled: false };
    // Payments started before all-inclusive pricing were grossed up by Paystack's fee
    const legacyGross = calculatePaystackInboundGrossAmount(attempt.amountKobo).grossKobo;
    if (args.currency !== "NGN" || (args.amountKobo !== attempt.amountKobo && args.amountKobo !== legacyGross)) {
      // Recorded for the team rather than thrown: a retry would never succeed
      await logJoyPaymentProblem(ctx, "joy_payment_amount_mismatch", args.reference, { expected: attempt.amountKobo, paid: args.amountKobo, currency: args.currency });
      return { handled: true, duplicate: true };
    }
    if (attempt.status === "verified") return { handled: true, duplicate: true, booking_id: attempt.bookingId };
    const booking = await ctx.db.get(attempt.bookingId);
    if (!booking) throw new Error("Payment booking not found");
    const now = Date.now();
    await ctx.db.patch(attempt._id, { status: "verified", verifiedAt: now, updatedAt: now });
    // Paid twice (another attempt already paid) or paid after the booking was cancelled: keep
    // the evidence for a refund, but don't re-run the booking or credit a partner again.
    if (booking.paymentStatus === "completed" || booking.bookingStatus === "cancelled") {
      await logJoyPaymentProblem(ctx, booking.paymentStatus === "completed" ? "joy_payment_paid_twice" : "joy_payment_after_cancel", args.reference, {
        bookingId: booking._id,
        paid: args.amountKobo,
      });
      return { handled: true, duplicate: true };
    }
    // Payment evidence is deliberately separate from allocation/provider
    // acceptance. A later authorized workflow may create the appointment.
    if (booking.joyBookingRoute === "admin_scheduled_virtual") {
      await ctx.db.patch(booking._id, {
        paymentStatus: "completed",
        paidAt: now,
        paymentReference: args.reference,
        paidAmountKobo: args.amountKobo,
        bookingStatus: "awaiting_admin_schedule",
        adminSchedulingStatus: "awaiting_schedule",
        updatedAt: now,
      });
      await creditPartnerForJoyPayment(ctx, booking, args.reference, now);
      await logJourney(ctx, { patientId: booking.patientId, bookingId: booking._id, stage: "payment_completed", eventKey: `payment-completed-${booking._id}` });
      await logJourney(ctx, { patientId: booking.patientId, bookingId: booking._id, stage: "awaiting_admin_schedule", eventKey: `awaiting-admin-schedule-${booking._id}` });
      // Queued with the payment, so a lost delivery is retried by the outbox cron
      const receiptUrl = await joyPaymentReceipt(ctx, booking, args.reference, args.amountKobo, now);
      await queueJoyEvent(ctx, `pay-${args.reference}`, "booking.payment_confirmed", {
        booking_id: booking._id, patient_id: booking.patientId, payment_reference: args.reference,
        // Added Oct 2026: the receipt's link, for Joy to send on WhatsApp (Payment Policy 7)
        receipt_url: receiptUrl,
      });
      await scheduleJoyDashboard(ctx, booking);
      return {
        handled: true,
        duplicate: false,
        booking_id: booking._id,
        patient_id: booking.patientId,
        admin_scheduling_required: true,
        event_id: args.paystackEventId,
      };
    }
    // Booking Policy 5.4: 5 hours to answer, or 1 hour when the visit starts within 8 hours
    const joyResponseDueAt = providerResponseDueAt(now, booking.sessionDate);
    await ctx.db.patch(booking._id, { paymentStatus: "completed", paidAt: now, paymentReference: args.reference, paidAmountKobo: args.amountKobo, updatedAt: now, providerResponse: "pending", providerResponseDueAt: joyResponseDueAt });
    await creditPartnerForJoyPayment(ctx, booking, args.reference, now);
    await logJourney(ctx, { patientId: booking.patientId, bookingId: booking._id, stage: "payment_completed", eventKey: `payment-completed-${booking._id}` });
    await logJourney(ctx, { patientId: booking.patientId, bookingId: booking._id, stage: "provider_requested", eventKey: `provider-requested-${booking._id}-${booking.physiotherapistId}` });
    // Queued with the payment, so a lost delivery is retried by the outbox cron
    const receiptUrl = await joyPaymentReceipt(ctx, booking, args.reference, args.amountKobo, now);
    const eventData = {
      booking_id: booking._id, patient_id: booking.patientId, physiotherapist_id: booking.physiotherapistId,
      payment_reference: args.reference, provider_response_due_at: joyResponseDueAt,
      // Added Oct 2026: the receipt's link, for Joy to send on WhatsApp (Payment Policy 7)
      receipt_url: receiptUrl,
    };
    await queueJoyEvent(ctx, `pay-${args.reference}`, "booking.payment_confirmed", eventData);
    await queueJoyEvent(ctx, `provider-response-${booking._id}`, "booking.provider_response_requested", eventData);
    await scheduleJoyDashboard(ctx, booking);

    return { handled: true, duplicate: false, booking_id: booking._id, patient_id: booking.patientId, physiotherapist_id: booking.physiotherapistId, provider_response_due_at: joyResponseDueAt, event_id: args.paystackEventId };
  },
});

/** Record a terminal Paystack failure without treating it as payment evidence. */
export const recordJoyPaymentFailedWebhook = internalMutation({
  args: { reference: v.string(), paystackEventId: v.string(), failureCategory: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.query("joyPaymentAttempts").withIndex("by_reference", (q) => q.eq("reference", args.reference)).first();
    if (!attempt) return { handled: false };
    // Paystack can retry or deliver events out of order. Verified payment is
    // authoritative and must never be downgraded by a later failed event.
    if (attempt.status === "verified") return { handled: true, duplicate: true, booking_id: attempt.bookingId };
    const booking = await ctx.db.get(attempt.bookingId);
    if (!booking) throw new Error("Payment booking not found");
    if (attempt.status === "failed" && booking.paymentStatus === "failed") {
      return { handled: true, duplicate: true, booking_id: booking._id, patient_id: booking.patientId };
    }
    const now = Date.now();
    await ctx.db.patch(attempt._id, {
      status: "failed",
      failureCategory: args.failureCategory ?? "PAYSTACK_CHARGE_FAILED",
      updatedAt: now,
    });
    await ctx.db.patch(booking._id, { paymentStatus: "failed", updatedAt: now });
    await logJourney(ctx, { patientId: booking.patientId, bookingId: booking._id, stage: "payment_failed", eventKey: `payment-failed-${attempt._id}` });
    return { handled: true, duplicate: false, booking_id: booking._id, patient_id: booking.patientId };
  },
});

/** Admin-only allocation for a paid virtual Joy consultation. */
export const adminScheduleJoyVirtualBooking = mutation({
  args: { bookingId: v.id("marketplaceBookings"), physiotherapistId: v.id("users"), startTime: v.number() },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.sourceSystem !== "joy_ai" || booking.joyBookingRoute !== "admin_scheduled_virtual") throw new Error("Virtual consultation booking not found");
    if (booking.paymentStatus !== "completed" || booking.bookingStatus !== "awaiting_admin_schedule") throw new Error("This consultation is not awaiting scheduling");
    if (!Number.isFinite(args.startTime) || args.startTime < Date.now() + 5 * 60_000) throw new Error("Choose an appointment time at least five minutes from now");
    const clinician = await ctx.db.get(args.physiotherapistId);
    const profile = await ctx.db.query("physiotherapistProfiles").withIndex("by_user_id", q => q.eq("userId", args.physiotherapistId)).first();
    const approval = await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", q => q.eq("userId", args.physiotherapistId)).first();
    if (!clinician || clinician.role !== "physiotherapist" || approval?.status !== "approved" || !profile?.offersOnlineSessions) throw new Error("Choose an approved clinician who offers online sessions");
    if (!servesRehabifyNetwork(profile)) throw new Error("Choose a Rehabify network clinician (clinic members and independent physios aren't matched to Rehabify patients)");
    const endTime = args.startTime + booking.sessionDuration * 60_000;
    const appointments = await ctx.db.query("appointments").withIndex("by_physiotherapist_id_and_time", q => q.eq("physiotherapistId", args.physiotherapistId)).collect();
    if (appointments.some(a => a.status !== "cancelled_by_patient" && a.status !== "cancelled_by_therapist" && a.startTime < endTime && a.endTime > args.startTime)) throw new Error("That clinician already has an appointment at this time");
    const appointmentId = await ctx.db.insert("appointments", { patientId: booking.patientId, physiotherapistId: args.physiotherapistId, startTime: args.startTime, endTime, serviceType: booking.sessionType, status: "confirmed", appointmentType: "telehealth", isOnline: true });
    await ctx.db.patch(booking._id, { physiotherapistId: args.physiotherapistId, sessionDate: args.startTime, appointmentId, bookingStatus: "confirmed", adminSchedulingStatus: "scheduled", providerResponse: "accepted", updatedAt: Date.now() });
    // The paid invoice the clinician's payout is created from when the session is completed
    if (booking.pricingModel) {
      await ensureMarketplaceInvoice(ctx, { ...booking, physiotherapistId: args.physiotherapistId }, appointmentId, {
        reference: booking.paymentReference ?? `JOY_${booking._id}`,
        method: "paystack",
        paidKobo: booking.paidAmountKobo ?? booking.serviceAmount,
      });
    }
    await ensureJoyCareLink(ctx, booking, args.physiotherapistId, appointmentId);
    await logJourney(ctx, { patientId: booking.patientId, bookingId: booking._id, stage: "admin_scheduled", eventKey: `admin-scheduled-${booking._id}` });
    await ctx.scheduler.runAfter(0, internal.joyIntegration.notifyJoyAdminScheduledVirtualBooking, { bookingId: booking._id, appointmentId, patientId: booking.patientId, physiotherapistId: args.physiotherapistId, startTime: args.startTime, endTime });
    return { booking_id: booking._id, appointment_id: appointmentId };
  },
});

/** Admin-only time change for a future, already scheduled Joy virtual consultation. */
export const adminRescheduleJoyVirtualBooking = mutation({
  args: { bookingId: v.id("marketplaceBookings"), startTime: v.number() },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.sourceSystem !== "joy_ai" || booking.joyBookingRoute !== "admin_scheduled_virtual") {
      throw new Error("Virtual consultation booking not found");
    }
    if (booking.paymentStatus !== "completed" || booking.bookingStatus !== "confirmed" || booking.adminSchedulingStatus !== "scheduled" || !booking.appointmentId || !booking.physiotherapistId || !booking.sessionDate) {
      throw new Error("This consultation is not available for rescheduling");
    }
    const now = Date.now();
    if (booking.sessionDate <= now) throw new Error("This appointment has already started or passed and cannot be rescheduled here");
    if (!Number.isFinite(args.startTime) || args.startTime < now + 5 * 60_000) throw new Error("Choose an appointment time at least five minutes from now");
    const appointment = await ctx.db.get(booking.appointmentId);
    if (!appointment || appointment.startTime <= now) throw new Error("This appointment has already started or passed and cannot be rescheduled here");
    const endTime = args.startTime + booking.sessionDuration * 60_000;
    const appointments = await ctx.db.query("appointments").withIndex("by_physiotherapist_id_and_time", q => q.eq("physiotherapistId", booking.physiotherapistId!)).collect();
    if (appointments.some(a => a._id !== appointment._id && a.status !== "cancelled_by_patient" && a.status !== "cancelled_by_therapist" && a.startTime < endTime && a.endTime > args.startTime)) {
      throw new Error("That clinician already has an appointment at this time");
    }
    await ctx.db.patch(appointment._id, { startTime: args.startTime, endTime });
    await ctx.db.patch(booking._id, { sessionDate: args.startTime, updatedAt: now });
    await logJourney(ctx, { patientId: booking.patientId, bookingId: booking._id, stage: "rescheduled", eventKey: `rescheduled-${booking._id}-${now}` });
    await ctx.scheduler.runAfter(0, internal.joyIntegration.notifyJoyVirtualBookingRescheduled, {
      bookingId: booking._id, appointmentId: appointment._id, patientId: booking.patientId,
      physiotherapistId: booking.physiotherapistId, startTime: args.startTime, endTime,
      revision: now,
    });
    return { booking_id: booking._id, appointment_id: appointment._id };
  },
});

/** Persist the minimal, patient-supplied service area used for Joy home visits. */
export const updateJoyPatientLocation = internalMutation({
  args: { patientId: v.id("users"), city: v.string(), area: v.string() },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new Error("Patient not found");
    const city = args.city.trim();
    const area = args.area.trim();
    if (!city || !area) throw new Error("City and area are required");
    const profile = await ctx.db.query("patientProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", args.patientId)).first();
    if (profile) await ctx.db.patch(profile._id, { city, area, address: `${area}, ${city}` });
    else await ctx.db.insert("patientProfiles", { userId: args.patientId, city, area, address: `${area}, ${city}` });
    return { patient_id: args.patientId, city, area };
  },
});

/** A paid AMBER review is a distinct service, not a routine consultation. */
export const createJoySpecialistReview = internalMutation({
  args: {
    patientId: v.id("users"), assessmentId: v.string(), assessmentRevision: v.number(),
    protocolVersion: v.string(), eligibilityReference: v.string(), policyVersion: v.string(),
    policyAcceptanceReference: v.string(), conversationId: v.string(), requestId: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("joySpecialistReviews").withIndex("by_origin_idempotency", q => q.eq("originIdempotencyKey", args.idempotencyKey)).first();
    if (existing) return { review_id: existing._id, payment_status: existing.paymentStatus, review_status: existing.reviewStatus, amount_kobo: existing.priceKobo };
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.role !== "patient") throw new Error("Patient not found");
    const now = Date.now();
    const reviewId = await ctx.db.insert("joySpecialistReviews", {
      patientId: args.patientId, assessmentId: args.assessmentId, assessmentRevision: args.assessmentRevision,
      protocolVersion: args.protocolVersion, eligibilityReference: args.eligibilityReference,
      policyVersion: args.policyVersion, policyAcceptanceReference: args.policyAcceptanceReference,
      priceKobo: AMBER_SPECIALIST_REVIEW_PRICE_KOBO, durationMinutes: AMBER_SPECIALIST_REVIEW_DURATION_MINUTES,
      paymentStatus: "pending", reviewStatus: "pending_payment", sourceSystem: "joy_ai", sourceChannel: "whatsapp",
      sourceEntryPoint: "specialist_review", joyConversationId: args.conversationId, originRequestId: args.requestId,
      originIdempotencyKey: args.idempotencyKey, originatedAt: now, createdAt: now, updatedAt: now,
    });
    return { review_id: reviewId, payment_status: "pending", review_status: "pending_payment", amount_kobo: AMBER_SPECIALIST_REVIEW_PRICE_KOBO };
  },
});

export const prepareJoySpecialistReviewPayment = internalMutation({
  args: { reviewId: v.id("joySpecialistReviews"), patientId: v.id("users"), requestId: v.string(), idempotencyKey: v.string(), reference: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("joySpecialistReviewPaymentAttempts").withIndex("by_origin_idempotency", q => q.eq("originIdempotencyKey", args.idempotencyKey)).first();
    if (existing) return { attempt_id: existing._id, review_id: existing.reviewId, reference: existing.reference, amount_kobo: existing.amountKobo, authorization_url: existing.authorizationUrl };
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.patientId !== args.patientId || review.reviewStatus !== "pending_payment" || review.paymentStatus !== "pending") throw new Error("Review is not available for payment");
    const now = Date.now();
    const attemptId = await ctx.db.insert("joySpecialistReviewPaymentAttempts", { reviewId: review._id, reference: args.reference, amountKobo: AMBER_SPECIALIST_REVIEW_PRICE_KOBO, status: "initializing", originRequestId: args.requestId, originIdempotencyKey: args.idempotencyKey, createdAt: now, updatedAt: now });
    await ctx.db.patch(review._id, { paymentReference: args.reference, updatedAt: now });
    return { attempt_id: attemptId, review_id: review._id, reference: args.reference, amount_kobo: AMBER_SPECIALIST_REVIEW_PRICE_KOBO };
  },
});

export const recordJoySpecialistReviewPaymentInitialization = internalMutation({
  args: { attemptId: v.id("joySpecialistReviewPaymentAttempts"), authorizationUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Review payment attempt not found");
    await ctx.db.patch(attempt._id, { status: args.authorizationUrl ? "initialized" : "failed", authorizationUrl: args.authorizationUrl, updatedAt: Date.now() });
    return { status: args.authorizationUrl ? "initialized" : "failed" };
  },
});

export const recordJoySpecialistReviewPaymentWebhook = internalMutation({
  args: { reference: v.string(), amountKobo: v.number(), currency: v.string(), paystackEventId: v.string() },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.query("joySpecialistReviewPaymentAttempts").withIndex("by_reference", q => q.eq("reference", args.reference)).first();
    if (!attempt) return { handled: false };
    // Checked against the amount this attempt was opened for (the price may change later)
    if (args.currency !== "NGN" || args.amountKobo !== attempt.amountKobo) {
      await logJoyPaymentProblem(ctx, "joy_review_payment_amount_mismatch", args.reference, { expected: attempt.amountKobo, paid: args.amountKobo, currency: args.currency });
      return { handled: true, duplicate: true };
    }
    if (attempt.status === "verified") return { handled: true, duplicate: true, review_id: attempt.reviewId };
    const review = await ctx.db.get(attempt.reviewId);
    if (!review) throw new Error("Review not found");
    const now = Date.now();
    await ctx.db.patch(attempt._id, { status: "verified", updatedAt: now });
    // Only profiles explicitly tagged by RH as AMBER reviewers can be allocated.
    // Absence of such a roster is a visible admin queue, never a fallback to an
    // unrelated general physio or a fabricated appointment.
    const profiles = await ctx.db.query("physiotherapistProfiles").withIndex("by_marketplace_availability", q => q.eq("isAvailableOnMarketplace", true)).collect();
    let reviewerId: Id<"users"> | undefined;
    for (const profile of profiles) {
      if (!profile.joySpecialtyTags?.includes("AMBER_REVIEWER")) continue;
      const approval = await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", q => q.eq("userId", profile.userId)).first();
      if (approval?.status === "approved") { reviewerId = profile.userId; break; }
    }
    const reviewStatus = reviewerId ? "assigned" : "awaiting_assignment";
    await ctx.db.patch(review._id, { paymentStatus: "completed", paidAt: now, paymentReference: args.reference, reviewerId, reviewStatus, updatedAt: now });
    await queueJoyEvent(ctx, `review-payment-${args.reference}`, "specialist_review.payment_confirmed", {
      review_id: review._id, patient_id: review.patientId, payment_reference: args.reference,
      reviewer_id: reviewerId, assignment_status: reviewStatus,
    });
    return { handled: true, duplicate: false, review_id: review._id, patient_id: review.patientId, reviewer_id: reviewerId, review_status: reviewStatus, event_id: args.paystackEventId };
  },
});

/**
 * Puts a Joy event in the outbox inside the current transaction (same envelope and event id
 * as lib/joy-integration/events.ts deliverJoyEvent, which is idempotent on the id). The
 * retry-joy-event-outbox cron delivers anything the immediate attempt missed.
 */
async function queueJoyEvent(ctx: MutationCtx, eventId: string, eventType: string, data: Record<string, unknown>) {
  const existing = await ctx.db.query("joyEventOutbox").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).first();
  if (existing) return;
  const now = Date.now();
  const payload = { event_id: eventId, event_type: eventType, api_version: "1", occurred_at: new Date(now).toISOString(), data };
  await ctx.db.insert("joyEventOutbox", { eventId, eventType, payload, status: "pending", attempts: 0, createdAt: now, updatedAt: now });
}

async function logJoyPaymentProblem(ctx: MutationCtx, action: string, reference: string, details: Record<string, unknown>) {
  console.error(action, { reference, ...details });
  await ctx.db.insert("systemLogs", {
    type: "payment",
    timestamp: Date.now(),
    action,
    targetEntityType: "payment_reference",
    targetEntityId: reference,
    details,
  });
}

export const enqueueJoyEvent = internalMutation({
  args: { eventId: v.string(), eventType: v.string(), payload: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("joyEventOutbox").withIndex("by_event_id", (q) => q.eq("eventId", args.eventId)).first();
    if (existing) return { event_id: existing.eventId, status: existing.status };
    const now = Date.now();
    await ctx.db.insert("joyEventOutbox", { eventId: args.eventId, eventType: args.eventType, payload: args.payload, status: "pending", attempts: 0, createdAt: now, updatedAt: now });
    return { event_id: args.eventId, status: "pending" };
  },
});

export const markJoyEventDelivery = internalMutation({
  args: { eventId: v.string(), delivered: v.boolean(), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const event = await ctx.db.query("joyEventOutbox").withIndex("by_event_id", (q) => q.eq("eventId", args.eventId)).first();
    if (!event) throw new Error("Joy event not found");
    const attempts = event.attempts + 1;
    const now = Date.now();
    const exhausted = !args.delivered && attempts >= 8;
    // 30s, 60s, 2m ... capped at 30 minutes. This protects Joy while keeping
    // RH's outbox authoritative and recoverable.
    const delayMs = Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
    const status = args.delivered ? "delivered" : exhausted ? "dead_letter" : "failed";
    await ctx.db.patch(event._id, {
      status, attempts, lastError: args.error,
      deliveredAt: args.delivered ? now : undefined,
      nextAttemptAt: args.delivered || exhausted ? undefined : now + delayMs,
      updatedAt: now,
    });
    return { status, attempts };
  },
});

export const retryableJoyEvents = internalQuery({
  args: { now: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    const pending = await ctx.db.query("joyEventOutbox").withIndex("by_status", q => q.eq("status", "pending")).collect();
    const failed = await ctx.db.query("joyEventOutbox").withIndex("by_status", q => q.eq("status", "failed")).collect();
    return [...pending, ...failed]
      .filter(event => !event.nextAttemptAt || event.nextAttemptAt <= args.now)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, args.limit)
      .map(event => ({ eventId: event.eventId, payload: event.payload }));
  },
});

export const respondToJoyBooking = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), physiotherapistId: v.id("users"), response: v.union(v.literal("accept"), v.literal("reject")) },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.sourceSystem !== "joy_ai" || booking.physiotherapistId !== args.physiotherapistId) throw new Error("Booking not found");
    if (booking.paymentStatus !== "completed" || booking.providerResponse !== "pending") throw new Error("Booking cannot be responded to");
    if ((booking.providerResponseDueAt ?? 0) < Date.now()) throw new Error("Provider response has expired");
    if (args.response === "reject") {
      await ctx.db.patch(booking._id, { providerResponse: "rejected", replacementStatus: "awaiting_patient_slot", updatedAt: Date.now() });
      await logJourney(ctx, { patientId: booking.patientId, bookingId: booking._id, stage: "provider_rejected", eventKey: `provider-rejected-${booking._id}-${args.physiotherapistId}` });
      return { outcome: "replacement_required", booking_id: booking._id, patient_id: booking.patientId };
    }
    if (!booking.sessionDate) throw new Error("Validated booking slot missing");
    const appointmentId = await ctx.db.insert("appointments", {
      patientId: booking.patientId, physiotherapistId: booking.physiotherapistId,
      startTime: booking.sessionDate, endTime: booking.sessionDate + booking.sessionDuration * 60_000,
      serviceType: booking.sessionType, status: "confirmed", appointmentType: booking.isOnline ? "telehealth" : "in-person",
      isOnline: booking.isOnline, location: booking.patientAddress,
    });
    await ctx.db.patch(booking._id, { providerResponse: "accepted", bookingStatus: "confirmed", appointmentId, updatedAt: Date.now() });
    // The paid invoice the physio's payout is created from when the session is completed
    if (booking.pricingModel) {
      await ensureMarketplaceInvoice(ctx, booking, appointmentId, {
        reference: booking.paymentReference ?? `JOY_${booking._id}`,
        method: "paystack",
        paidKobo: booking.paidAmountKobo ?? booking.serviceAmount,
      });
    }
    await ensureJoyCareLink(ctx, booking, args.physiotherapistId, appointmentId);
    await logJourney(ctx, { patientId: booking.patientId, bookingId: booking._id, stage: "provider_accepted", eventKey: `provider-accepted-${booking._id}` });
    if (booking.isOnline) {
      await ctx.scheduler.runAfter(0, internal.joyIntegration.createJoyOnlineMeeting, {
        bookingId: booking._id, appointmentId, patientId: booking.patientId, physiotherapistId: booking.physiotherapistId,
        startTime: booking.sessionDate, endTime: booking.sessionDate + booking.sessionDuration * 60_000,
      });
    }
    return { outcome: "confirmed", booking_id: booking._id, appointment_id: appointmentId, patient_id: booking.patientId };
  },
});

export const storeJoyStreamMeeting = internalMutation({
  args: { appointmentId: v.id("appointments"), meetingLink: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.appointmentId, { meetingLink: args.meetingLink, isOnline: true });
  },
});

/** Keeps a booking's first code, so reschedules reuse the link Joy already sent.
 * Returns null on the rare collision; the caller retries with a fresh candidate. */
export const assignJoyBookingCode = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), candidate: v.string() },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.bookingCode) return booking.bookingCode;
    const taken = await ctx.db.query("marketplaceBookings").withIndex("by_booking_code", q => q.eq("bookingCode", args.candidate)).first();
    if (taken) return null;
    await ctx.db.patch(booking._id, { bookingCode: args.candidate });
    return args.candidate;
  },
});

/** Codes are generated in the action, which has real randomness, then claimed atomically. */
export const ensureJoyBookingCode = internalAction({
  args: { bookingId: v.id("marketplaceBookings") },
  handler: async (ctx, args): Promise<string> => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code: string | null = await ctx.runMutation(internal.joyIntegration.assignJoyBookingCode, { bookingId: args.bookingId, candidate: newBookingCode() });
      if (code) return code;
    }
    throw new Error("Could not allocate a booking code");
  },
});

function joyJoinWindow(appointment: { startTime: number; endTime: number }) {
  return { opensAt: appointment.startTime - JOIN_OPENS_BEFORE_MS, closesAt: appointment.endTime + JOIN_CLOSES_AFTER_MS };
}

function isJoyAppointmentCancelled(booking: { bookingStatus: string }, appointment: { status: string }) {
  return booking.bookingStatus === "cancelled" || appointment.status === "cancelled_by_patient" || appointment.status === "cancelled_by_therapist";
}

/** What the patient's short link (/v/<code>) shows. Times are returned raw and
 * compared on the client: a cached query would not notice the window opening. */
export const getJoyJoinSession = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const booking = await bookingByCode(ctx, args.code);
    const appointment = booking?.appointmentId ? await ctx.db.get(booking.appointmentId) : null;
    // Only online visits have a call; the page shows getJoyBookingStatus for everything else
    if (!booking || !appointment || !booking.isOnline) return null;
    const [clinician, identity] = await Promise.all([ctx.db.get(appointment.physiotherapistId), ctx.auth.getUserIdentity()]);
    // The clinician uses their normal signed-in call page, never the patient seat.
    const viewerIsClinician = !!identity && clinician?.clerkId === identity.subject;
    return {
      bookingCode: booking.bookingCode!,
      startTime: appointment.startTime, endTime: appointment.endTime, ...joyJoinWindow(appointment),
      cancelled: isJoyAppointmentCancelled(booking, appointment),
      clinicianName: (clinician && displayName(clinician)) || "your physiotherapist",
      clinicianCallPath: viewerIsClinician ? `/video-call/${joyRoomId(appointment._id)}` : null,
    };
  },
});

/** Server-side gate for the patient's Stream token; the window is re-checked here. */
export const resolveJoyPatientJoin = internalQuery({
  args: { code: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const booking = await bookingByCode(ctx, args.code);
    const appointment = booking?.appointmentId ? await ctx.db.get(booking.appointmentId) : null;
    if (!booking || !appointment || !booking.isOnline) return { ok: false as const, reason: "not_found" as const };
    if (isJoyAppointmentCancelled(booking, appointment)) return { ok: false as const, reason: "cancelled" as const };
    const { opensAt, closesAt } = joyJoinWindow(appointment);
    if (args.now < opensAt) return { ok: false as const, reason: "too_early" as const };
    if (args.now > closesAt) return { ok: false as const, reason: "ended" as const };
    const [patient, clinician] = await Promise.all([ctx.db.get(appointment.patientId), ctx.db.get(appointment.physiotherapistId)]);
    return {
      ok: true as const, callId: joyRoomId(appointment._id), patientId: appointment.patientId, bookingId: booking._id, closesAt,
      patientName: (patient && displayName(patient)) || "Patient",
      clinicianName: (clinician && displayName(clinician)) || "your physiotherapist",
    };
  },
});

async function signEvent(timestamp: string, eventId: string, body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode([timestamp, eventId, body].join("\n")));
  return Array.from(new Uint8Array(signature)).map(value => value.toString(16).padStart(2, "0")).join("");
}

/** Durable, signed RH-to-Joy event delivery for asynchronous operations. */
export const deliverJoyEvent = internalAction({
  args: { eventId: v.string(), eventType: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    const payload = { event_id: args.eventId, event_type: args.eventType, api_version: "1", occurred_at: new Date().toISOString(), data: args.data };
    await ctx.runMutation(internal.joyIntegration.enqueueJoyEvent, { eventId: args.eventId, eventType: args.eventType, payload });
    const url = process.env.JOY_EVENT_URL;
    const secret = process.env.JOY_EVENT_HMAC_SECRET;
    if (!url || !secret) return { delivered: false, reason: "event_receiver_not_configured" };
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-RH-Event-Timestamp": timestamp, "X-RH-Event-Signature": await signEvent(timestamp, args.eventId, body, secret) }, body });
      if (!response.ok) throw new Error(`Joy event receiver returned ${response.status}`);
      await ctx.runMutation(internal.joyIntegration.markJoyEventDelivery, { eventId: args.eventId, delivered: true });
      return { delivered: true };
    } catch (error) {
      await ctx.runMutation(internal.joyIntegration.markJoyEventDelivery, { eventId: args.eventId, delivered: false, error: error instanceof Error ? error.message : "delivery failed" });
      return { delivered: false };
    }
  },
});

/** Replays durable outbox events without reconstructing business payloads. */
export const retryJoyEvent = internalAction({
  args: { eventId: v.string(), payload: v.any() },
  handler: async (ctx, args) => {
    const url = process.env.JOY_EVENT_URL;
    const secret = process.env.JOY_EVENT_HMAC_SECRET;
    if (!url || !secret) return { delivered: false, reason: "event_receiver_not_configured" };
    const body = JSON.stringify(args.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-RH-Event-Timestamp": timestamp, "X-RH-Event-Signature": await signEvent(timestamp, args.eventId, body, secret) }, body });
      if (!response.ok) throw new Error(`Joy event receiver returned ${response.status}`);
      await ctx.runMutation(internal.joyIntegration.markJoyEventDelivery, { eventId: args.eventId, delivered: true });
      return { delivered: true };
    } catch (error) {
      await ctx.runMutation(internal.joyIntegration.markJoyEventDelivery, { eventId: args.eventId, delivered: false, error: error instanceof Error ? error.message : "delivery failed" });
      return { delivered: false };
    }
  },
});

/** Bounded outbox worker. Dead-lettered events are deliberately not retried. */
export const retryJoyEvents = internalAction({
  args: {},
  handler: async (ctx): Promise<{ attempted: number }> => {
    const events = await ctx.runQuery(internal.joyIntegration.retryableJoyEvents, { now: Date.now(), limit: 25 });
    for (const event of events) await ctx.runAction(internal.joyIntegration.retryJoyEvent, event);
    return { attempted: events.length };
  },
});

/** Notify Joy only after an RH administrator has assigned a real clinician and time. */
export const notifyJoyAdminScheduledVirtualBooking = internalAction({
  args: {
    bookingId: v.id("marketplaceBookings"), appointmentId: v.id("appointments"), patientId: v.id("users"),
    physiotherapistId: v.id("users"), startTime: v.number(), endTime: v.number(),
  },
  handler: async (ctx, args) => {
    // Mark Joy's state as confirmed but let the meeting-link event carry the
    // patient-facing appointment details in one complete notification.
    await ctx.runAction(internal.joyIntegration.deliverJoyEvent, {
      eventId: `booking-confirmed-${args.bookingId}`,
      eventType: "booking.confirmed",
      data: { booking_id: args.bookingId, appointment_id: args.appointmentId, patient_id: args.patientId, defer_patient_notification: true },
    });
    await ctx.runAction(internal.joyIntegration.createJoyOnlineMeeting, args);
  },
});

/** Send Joy a distinct, signed event after a future virtual appointment is moved. */
export const notifyJoyVirtualBookingRescheduled = internalAction({
  args: {
    bookingId: v.id("marketplaceBookings"), appointmentId: v.id("appointments"), patientId: v.id("users"),
    physiotherapistId: v.id("users"), startTime: v.number(), endTime: v.number(), revision: v.number(),
  },
  handler: async (ctx, args) => {
    // The code (and so the link) survives a reschedule; Joy can resend it as-is.
    const bookingCode = await ctx.runAction(internal.joyIntegration.ensureJoyBookingCode, { bookingId: args.bookingId });
    await ctx.runAction(internal.joyIntegration.deliverJoyEvent, {
      eventId: `booking-rescheduled-${args.bookingId}-${args.revision}`,
      eventType: "booking.rescheduled",
      data: {
        booking_id: args.bookingId, booking_code: bookingCode, appointment_id: args.appointmentId, patient_id: args.patientId,
        meeting_url: `${publicAppUrl()}/v/${bookingCode}`, start_time: args.startTime,
      },
    });
  },
});

/** Creates the configured online room after a paid Joy booking is accepted. */
export const createJoyOnlineMeeting = internalAction({
  args: {
    bookingId: v.id("marketplaceBookings"), appointmentId: v.id("appointments"), patientId: v.id("users"), physiotherapistId: v.id("users"),
    startTime: v.number(), endTime: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      // Joy online appointments always use the approved Stream workflow. Do
      // not silently switch to Google Meet: its OAuth approval is not part of
      // the supported Joy operational path.
      const platform = "stream" as const;
      const appBase = publicAppUrl();
      const roomId = joyRoomId(args.appointmentId);
      // Clinicians join through the signed-in call page. WhatsApp patients have
      // no login, so they get a short link whose code is their credential.
      const meetingUrl = `${appBase}/video-call/${roomId}`;
      const bookingCode = await ctx.runAction(internal.joyIntegration.ensureJoyBookingCode, { bookingId: args.bookingId });
      const patientJoinUrl = `${appBase}/v/${bookingCode}`;
      await ctx.runMutation(internal.videoCalls.createVideoCallRecord, {
        roomId, streamCallId: roomId, meetingLink: meetingUrl, platform, appointmentId: args.appointmentId,
        initiatorId: args.physiotherapistId, participants: [args.patientId, args.physiotherapistId], callType: "appointment",
        title: "Rehabify online physiotherapy appointment",
        settings: { recordingEnabled: false, chatEnabled: true, maxParticipants: 2, waitingRoomEnabled: true, screenShareEnabled: true, prejoinUiEnabled: true, ejectAtRoomExp: true, language: "en", geo: "us-west" },
        streamConfig: { callId: roomId, createdAt: new Date().toISOString() },
      });
      await ctx.runMutation(internal.joyIntegration.storeJoyStreamMeeting, { appointmentId: args.appointmentId, meetingLink: meetingUrl });
      await ctx.runAction(internal.joyIntegration.deliverJoyEvent, {
        eventId: `booking-meeting-link-${args.bookingId}`, eventType: "booking.meeting_link_ready",
        data: {
          booking_id: args.bookingId, booking_code: bookingCode, appointment_id: args.appointmentId, patient_id: args.patientId,
          meeting_url: patientJoinUrl, platform, start_time: args.startTime,
        },
      });
      await ctx.runMutation(internal.joyHandoff.recordJourneyEvent, {
        patientId: args.patientId, bookingId: args.bookingId, stage: "meeting_link_sent", eventKey: `meeting-link-${args.bookingId}`,
      });
    } catch (error) {
      await ctx.runMutation(internal.joyIntegration.createJoyOnlineMeetingFollowUp, {
        bookingId: args.bookingId, reason: "online_meeting_link_generation_failed",
      });
      await ctx.runAction(internal.joyIntegration.deliverJoyEvent, {
        eventId: `booking-meeting-link-failed-${args.bookingId}`, eventType: "booking.meeting_link_failed",
        data: { booking_id: args.bookingId, appointment_id: args.appointmentId, patient_id: args.patientId, reason: "meeting_link_generation_failed" },
      });
    }
  },
});

/** The receipt for a Joy payment; emailed only to a real address (not the WhatsApp login placeholder). */
async function joyPaymentReceipt(ctx: MutationCtx, booking: Doc<"marketplaceBookings">, reference: string, amountKobo: number, paidAt: number) {
  const patient = await ctx.db.get(booking.patientId);
  const service = booking.serviceId ? getService(booking.serviceId) : undefined;
  const travel = booking.travelSurchargeKobo ?? 0;
  const email = booking.guestEmail || patient?.email;
  const receiptId = await issueReceipt(ctx, {
    kind: "payment",
    payerUserId: booking.patientId,
    email: email && !isJoyLoginEmail(email) ? email : undefined,
    name: booking.guestName || [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") || undefined,
    relatedType: "marketplace_booking",
    relatedId: booking._id,
    relationship: "rehabify_care",
    description: service?.name ?? booking.sessionType ?? "Physiotherapy session",
    lines: travel > 0 && amountKobo > travel
      ? [{ label: service?.name ?? "Session", amountKobo: amountKobo - travel }, { label: "Travel", amountKobo: travel }]
      : [{ label: service?.name ?? "Session", amountKobo }],
    reference,
    dedupeKey: reference,
    paidAt,
  });
  const receipt = await ctx.db.get(receiptId);
  return receipt ? `${publicAppUrl()}/receipt/${receipt.accessToken}` : undefined;
}

export const expireJoyProviderResponses = internalMutation({
  args: {}, handler: async (ctx) => {
    const paid = await ctx.db.query("marketplaceBookings").withIndex("by_payment_status", q => q.eq("paymentStatus", "completed")).collect();
    const due = paid.filter(b => b.sourceSystem === "joy_ai" && b.providerResponse === "pending" && (b.providerResponseDueAt ?? Infinity) <= Date.now());
    for (const booking of due) {
      const now = Date.now();
      await ctx.db.patch(booking._id, { providerResponse: "rejected", replacementStatus: "awaiting_patient_slot", updatedAt: now });
      await logJourney(ctx, { patientId: booking.patientId, bookingId: booking._id, stage: "provider_timeout", eventKey: `provider-timeout-${booking._id}-${booking.physiotherapistId}` });
      await ctx.db.insert("joyEventOutbox", {
        eventId: `booking-provider-timeout-${booking._id}`,
        eventType: "booking.provider_rejected",
        payload: {
          event_id: `booking-provider-timeout-${booking._id}`,
          event_type: "booking.provider_rejected",
          api_version: "1",
          occurred_at: new Date(now).toISOString(),
          data: { booking_id: booking._id, patient_id: booking.patientId, reason: "provider_response_timeout" },
        },
        status: "pending", attempts: 0, createdAt: now, updatedAt: now,
      });
    }
    return { expired: due.map(b => ({ booking_id: b._id, patient_id: b.patientId })) };
  },
});

async function eventSignature(timestamp: string, eventId: string, body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode([timestamp, eventId, body].join("\n"))));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Five-hour provider timeout path. It fails safely: the booking is never confirmed
 * by a timeout; Joy receives the same replacement-selection event as a rejection. */
export const dispatchExpiredJoyProviderResponses = internalAction({
  args: {},
  handler: async (ctx): Promise<{ expired: number; delivered: number; configuration_missing?: boolean }> => {
    const res: any = await ctx.runMutation(internal.joyIntegration.expireJoyProviderResponses, {});
    const expired: Array<{ booking_id: string; patient_id: any }> = res.expired || [];
    const url = process.env.JOY_EVENT_URL;
    const secret = process.env.JOY_EVENT_HMAC_SECRET;
    if (!url || !secret) return { expired: expired.length, delivered: 0, configuration_missing: true };
    let delivered = 0;
    for (const booking of expired) {
      const eventId = `booking-provider-timeout-${booking.booking_id}`;
      const envelope = { event_id: eventId, event_type: "booking.provider_rejected", api_version: "1", occurred_at: new Date().toISOString(), data: { booking_id: booking.booking_id, patient_id: booking.patient_id, reason: "provider_response_timeout" } };
      const body = JSON.stringify(envelope);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      try {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-RH-Event-Timestamp": timestamp, "X-RH-Event-Signature": await eventSignature(timestamp, eventId, body, secret) }, body });
        await ctx.runMutation(internal.joyIntegration.markJoyEventDelivery, { eventId, delivered: response.ok, error: response.ok ? undefined : `HTTP ${response.status}` });
        if (response.ok) delivered += 1;
      } catch (error) {
        await ctx.runMutation(internal.joyIntegration.markJoyEventDelivery, { eventId, delivered: false, error: error instanceof Error ? error.message : "delivery failed" });
      }
    }
    return { expired: expired.length, delivered };
  },
});

export const replacementCandidates = internalQuery({
  args: { bookingId: v.id("marketplaceBookings") },
  handler: async (ctx, { bookingId }) => {
    const booking = await ctx.db.get(bookingId);
    if (!booking || booking.sourceSystem !== "joy_ai" || booking.replacementStatus !== "awaiting_patient_slot") return [];
    const tags = booking.joyRequiredSpecialties ?? [];
    const mode = booking.joyServiceMode;
    if (!mode || !tags.length) return [];
    const profiles = await ctx.db.query("physiotherapistProfiles").withIndex("by_marketplace_availability", q => q.eq("isAvailableOnMarketplace", true)).collect();
    const results = [];
    for (const profile of profiles) {
      if (profile.userId === booking.physiotherapistId || !profile.joyServiceModes?.includes(mode)) continue;
      if (!tags.every(tag => controlledTags(profile).includes(tag))) continue;
      if (!profile.availabilitySchedule || !(await isJoyProviderEligible(ctx, profile))) continue;
      // Home visits: the replacement must cover the booking's travel zone
      if (booking.travelZoneId && !(profile.coveredZoneIds ?? []).includes(booking.travelZoneId)) continue;
      const user = await ctx.db.get(profile.userId);
      // The patient already paid this booking's standard price, whoever takes it
      results.push({ physiotherapist_id: profile._id, display_name: user ? displayName(user) : undefined, amount_kobo: booking.totalAmount, specialties: controlledTags(profile), service_modes: profile.joyServiceModes });
    }
    return results.slice(0, 3);
  },
});

export const createJoyAdminFollowUp = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), reason: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("joyAdminFollowUps").withIndex("by_booking", q => q.eq("bookingId", args.bookingId)).first();
    if (existing) return { follow_up_id: existing._id, duplicate: true };
    const now = Date.now();
    const id = await ctx.db.insert("joyAdminFollowUps", { bookingId: args.bookingId, recipientEmail: "admin@physioaroundme.com", reason: args.reason, status: "open", createdAt: now, updatedAt: now });
    await ctx.db.patch(args.bookingId, { replacementStatus: "admin_follow_up", updatedAt: now });
    return { follow_up_id: id, duplicate: false };
  },
});

/** Meeting-link failures need operations attention without changing rematch state. */
export const createJoyOnlineMeetingFollowUp = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), reason: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("joyAdminFollowUps").withIndex("by_booking", q => q.eq("bookingId", args.bookingId)).first();
    if (existing) return { follow_up_id: existing._id, duplicate: true };
    const now = Date.now();
    const id = await ctx.db.insert("joyAdminFollowUps", { bookingId: args.bookingId, recipientEmail: "admin@physioaroundme.com", reason: args.reason, status: "open", createdAt: now, updatedAt: now });
    return { follow_up_id: id, duplicate: false };
  },
});

export const reassignPaidJoyBooking = internalMutation({
  args: { bookingId: v.id("marketplaceBookings"), physiotherapistId: v.id("physiotherapistProfiles"), slotStart: v.number() },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    const profile = await ctx.db.get(args.physiotherapistId);
    if (!booking || !profile || booking.sourceSystem !== "joy_ai" || booking.replacementStatus !== "awaiting_patient_slot" || booking.paymentStatus !== "completed") throw new Error("Booking is not eligible for reassignment");
    if (!profile.joyServiceModes?.includes(booking.joyServiceMode as any) || !(booking.joyRequiredSpecialties ?? []).every(tag => controlledTags(profile).includes(tag))) throw new Error("Replacement provider is not eligible");
    const approval = await ctx.db.query("accountApprovalStatus").withIndex("by_user_id", q => q.eq("userId", profile.userId)).first();
    if (approval?.status !== "approved") throw new Error("Replacement provider is not approved");
    const proposedEnd = args.slotStart + booking.sessionDuration * 60_000;
    const conflicts = await ctx.db.query("appointments").withIndex("by_physiotherapist_id_and_time", q => q.eq("physiotherapistId", profile.userId)).filter(q => q.and(
      q.lt(q.field("startTime"), proposedEnd), q.gt(q.field("endTime"), args.slotStart),
      q.neq(q.field("status"), "cancelled_by_patient"), q.neq(q.field("status"), "cancelled_by_therapist"),
    )).collect();
    if (conflicts.length) throw new Error("Replacement slot is no longer available");
    const now = Date.now();
    await ctx.db.patch(booking._id, { physiotherapistId: profile.userId, sessionDate: args.slotStart, providerResponse: "pending", providerResponseDueAt: providerResponseDueAt(now, args.slotStart), replacementStatus: "not_needed", updatedAt: now });
    await logJourney(ctx, { patientId: booking.patientId, bookingId: booking._id, stage: "provider_requested", eventKey: `provider-requested-${booking._id}-${profile.userId}` });
    return { booking_id: booking._id, physiotherapist_id: profile.userId, provider_response_due_at: providerResponseDueAt(now, args.slotStart) };
  },
});
