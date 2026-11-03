import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const encoder = new TextEncoder();
const JOY_MINIMUM_NOTICE_MS = 2 * 60 * 60 * 1000;

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

async function verify(request: Request, path: string, body: string, secretName = "CONVEX_JOY_GATEWAY_SECRET"): Promise<boolean> {
  // Convex injects environment variables through statically referenced names.
  // Dynamic bracket access makes the read-only key appear unset in production.
  const secret = secretName === "CONVEX_JOY_READ_GATEWAY_SECRET"
    ? process.env.CONVEX_JOY_READ_GATEWAY_SECRET
    : process.env.CONVEX_JOY_GATEWAY_SECRET;
  const timestamp = request.headers.get("X-Joy-Gateway-Timestamp") ?? "";
  const nonce = request.headers.get("X-Joy-Gateway-Nonce") ?? "";
  const signature = request.headers.get("X-Joy-Gateway-Signature") ?? "";
  if (!secret || !nonce || !signature || !Number.isFinite(Number(timestamp)) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const result = await crypto.subtle.sign("HMAC", key, encoder.encode([request.method, path, timestamp, nonce, body].join("\n")));
  return equal(hex(result), signature);
}

async function readJson(request: Request, path: string): Promise<{ body: string; nonce: string; data: Record<string, unknown> } | Response> {
  const body = await request.text();
  if (!(await verify(request, path, body))) return new Response("Unauthorized", { status: 401 });
  try { return { body, nonce: request.headers.get("X-Joy-Gateway-Nonce")!, data: JSON.parse(body) }; } catch { return new Response("Invalid JSON", { status: 400 }); }
}

// The read gateway is deliberately separate from the operational gateway. Its
// key can only reach the explicit query projections below; it cannot call a
// mutation and read requests do not reserve a nonce (a replay is harmless for
// an idempotent query).
async function readReadOnlyJson(request: Request, path: string): Promise<{ data: Record<string, unknown> } | Response> {
  const body = await request.text();
  if (!(await verify(request, path, body, "CONVEX_JOY_READ_GATEWAY_SECRET"))) return new Response("Unauthorized", { status: 401 });
  try { return { data: JSON.parse(body) }; } catch { return new Response("Invalid JSON", { status: 400 }); }
}

async function reserveNonce(ctx: { runMutation: (reference: any, args: any) => Promise<any> }, nonce: string): Promise<boolean> {
  const result = await ctx.runMutation((internal as any).joyIntegration.recordGatewayNonce, { nonce, expiresAt: Date.now() + 5 * 60_000 });
  return result.accepted === true;
}

// This is intentionally a fixed allowlist, not a generic Convex function dispatcher.
export const recordExternalRequest = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/record_external_request");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.request_id !== "string" || typeof parsed.data.expires_at !== "number") return new Response("Invalid payload", { status: 400 });
  // `internal` is generated at deploy time; keep this static route-to-function mapping
  // explicit while allowing local Next type checks before Convex code generation runs.
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.recordExternalRequest, { requestId: parsed.data.request_id, expiresAt: parsed.data.expires_at }));
});

export const resolvePatient = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const parsed = await readJson(request, url.pathname);
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.phone !== "string" || typeof parsed.data.joy_person_id !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.resolveOrCreatePatientByPhone, {
    phone: parsed.data.phone,
    joyPersonId: parsed.data.joy_person_id,
    name: typeof parsed.data.name === "string" ? parsed.data.name : undefined,
    email: typeof parsed.data.email === "string" ? parsed.data.email : undefined,
    trackingCode: typeof parsed.data.tracking_code === "string" ? parsed.data.tracking_code : (typeof parsed.data.trackingCode === "string" ? parsed.data.trackingCode : undefined),
    initialMessage: typeof parsed.data.initial_message === "string" ? parsed.data.initial_message : (typeof parsed.data.initialMessage === "string" ? parsed.data.initialMessage : undefined),
  }));
});

export const linkReferral = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const parsed = await readJson(request, url.pathname);
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const trackingCode = typeof parsed.data.tracking_code === "string" ? parsed.data.tracking_code : (typeof parsed.data.trackingCode === "string" ? parsed.data.trackingCode : undefined);
  const phone = typeof parsed.data.phone === "string" ? parsed.data.phone : undefined;
  if (!trackingCode || !phone) return new Response("Invalid payload: tracking_code and phone required", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.linkTrackingCodeToWhatsAppInternal, {
    trackingCode,
    phone,
    joyPersonId: typeof parsed.data.joy_person_id === "string" ? parsed.data.joy_person_id : undefined,
    name: typeof parsed.data.name === "string" ? parsed.data.name : undefined,
    email: typeof parsed.data.email === "string" ? parsed.data.email : undefined,
    message: typeof parsed.data.message === "string" ? parsed.data.message : undefined,
  }));
});

export const resolveReferralContext = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/resolve_referral_context");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const { phone, tracking_code, joy_person_id, patient_id } = parsed.data;
  if (![phone, tracking_code, joy_person_id, patient_id].every((value) => typeof value === "string")) return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.resolveReferralContextForJoy, {
    phone, trackingCode: tracking_code, joyPersonId: joy_person_id, patientId: patient_id,
  }));
});

export const resolvePhysiotherapist = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/resolve_physiotherapist");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.phone !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runQuery((internal as any).joyIntegration.resolvePhysiotherapistByPhone, { phone: parsed.data.phone }));
});

/**
 * Where a patient's shared WhatsApp location pin is (state, town, area), for Joy to pick the
 * travel zone. Server-side reverse geocoding, so no key leaves Convex: Mapbox when
 * MAPBOX_ACCESS_TOKEN is set, otherwise LocationIQ (the key the website's search uses).
 * Only the coordinates are sent; nothing is stored here.
 */
type PinPlace = { state: string | null; town: string | null; area: string | null };

async function mapboxPlace(token: string, latitude: number, longitude: number): Promise<PinPlace | null> {
  const response = await fetch(
    `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${longitude}&latitude=${latitude}&country=ng&language=en` +
      `&types=neighborhood,locality,place,district,region&access_token=${encodeURIComponent(token)}`,
  );
  if (!response.ok) return null;
  const feature: any = (await response.json())?.features?.[0];
  if (!feature) return null;
  const props = feature.properties ?? {};
  const named = (kind: string): string | null => {
    const value = props.context?.[kind]?.name ?? (props.feature_type === kind ? props.name : null);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  return { state: named("region"), town: named("place") ?? named("district"), area: named("neighborhood") ?? named("locality") };
}

async function locationIqPlace(key: string, latitude: number, longitude: number): Promise<PinPlace | null> {
  const response = await fetch(
    `https://us1.locationiq.com/v1/reverse?key=${encodeURIComponent(key)}&lat=${latitude}&lon=${longitude}` +
      "&format=json&normalizeaddress=1&accept-language=en",
    { headers: { "User-Agent": "RehabifyHealth/1.0" } },
  );
  if (!response.ok) return null;
  const data: any = await response.json();
  const address = data?.address ?? {};
  if (address.country_code && String(address.country_code).toLowerCase() !== "ng") return null;
  const first = (...keys: string[]) => keys.map((k) => address[k]).find((value) => typeof value === "string" && value.trim())?.trim() ?? null;
  return {
    state: first("state"),
    town: first("city", "town", "village", "county"),
    area: first("neighbourhood", "suburb", "quarter", "city_district", "hamlet"),
  };
}

export const placeForPin = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/place_for_pin");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const pin = pinArgs(parsed.data.latitude, parsed.data.longitude);
  if (pin.latitude === undefined || pin.longitude === undefined) return new Response("Invalid payload", { status: 400 });
  const mapbox = process.env.MAPBOX_ACCESS_TOKEN;
  const locationIq = process.env.LOCATIONIQ_API_KEY;
  if (!mapbox && !locationIq) return Response.json({ found: false, reason: "not_configured" });
  try {
    const fromMapbox = mapbox ? await mapboxPlace(mapbox, pin.latitude, pin.longitude).catch(() => null) : null;
    const place = fromMapbox ?? (locationIq ? await locationIqPlace(locationIq, pin.latitude, pin.longitude) : null);
    if (!place || !(place.state || place.town)) return Response.json({ found: false, reason: "lookup_failed" });
    return Response.json({ found: true, ...place, source: fromMapbox ? "mapbox" : "locationiq" });
  } catch {
    return Response.json({ found: false, reason: "lookup_failed" });
  }
});

/** A shared location pin, only when both coordinates are real numbers inside Nigeria's box. */
function pinArgs(latitude: unknown, longitude: unknown): { latitude?: number; longitude?: number } {
  if (typeof latitude !== "number" || typeof longitude !== "number") return {};
  if (!(latitude >= 4 && latitude <= 14.5 && longitude >= 2.5 && longitude <= 15)) return {};
  return { latitude, longitude };
}

export const findMatches = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/find_matches");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const { patient_id, required_specialties, service_mode, city, area, limit, latitude, longitude } = parsed.data;
  if (typeof patient_id !== "string" || !Array.isArray(required_specialties) || !required_specialties.every((value) => typeof value === "string") || !["home_visit", "clinic", "online"].includes(String(service_mode))) return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runQuery((internal as any).joyIntegration.findMatches, {
    patientId: patient_id, requiredSpecialties: required_specialties, serviceMode: service_mode,
    city: typeof city === "string" ? city : undefined, area: typeof area === "string" ? area : undefined,
    ...pinArgs(latitude, longitude),
    limit: typeof limit === "number" ? limit : 3,
  }));
});

export const resolveAvailabilityProfile = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/resolve_availability_profile");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const { physiotherapist_id, service_mode, start, end, duration_minutes } = parsed.data;
  if (typeof physiotherapist_id !== "string" || !["home_visit", "clinic", "online"].includes(String(service_mode)) || typeof start !== "number" || typeof end !== "number" || typeof duration_minutes !== "number") return new Response("Invalid payload", { status: 400 });
  const profile = await ctx.runQuery((internal as any).joyIntegration.resolveProfileForAvailability, { physiotherapistId: physiotherapist_id, serviceMode: service_mode, durationMinutes: duration_minutes });
  if (!profile || !profile.amountKobo) return Response.json({ slots: [] });
  const slots = await ctx.runQuery((api as any).calendar.availability.getAvailableSlots, {
    physiotherapistId: profile.physiotherapistUserId, startDate: start, endDate: end, sessionDuration: duration_minutes,
  });
  return Response.json({ slots, amount_kobo: profile.amountKobo, currency: "NGN" });
});

// Read-only projections for Joy's server. These are intentionally not a
// generic database or Convex-function dispatcher.
export const readResolvePhysiotherapist = httpAction(async (ctx, request) => {
  const parsed = await readReadOnlyJson(request, "/joy-read/resolve_physiotherapist");
  if (parsed instanceof Response) return parsed;
  if (typeof parsed.data.phone !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runQuery((internal as any).joyIntegration.resolvePhysiotherapistByPhone, { phone: parsed.data.phone }));
});

export const readFindMatches = httpAction(async (ctx, request) => {
  const parsed = await readReadOnlyJson(request, "/joy-read/find_matches");
  if (parsed instanceof Response) return parsed;
  const { patient_id, required_specialties, service_mode, city, area, limit, latitude, longitude } = parsed.data;
  if (typeof patient_id !== "string" || !Array.isArray(required_specialties) || !required_specialties.every((value) => typeof value === "string") || !["home_visit", "clinic", "online"].includes(String(service_mode))) return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runQuery((internal as any).joyIntegration.findMatches, {
    patientId: patient_id, requiredSpecialties: required_specialties, serviceMode: service_mode,
    city: typeof city === "string" ? city : undefined, area: typeof area === "string" ? area : undefined,
    ...pinArgs(latitude, longitude),
    limit: typeof limit === "number" ? limit : 3,
  }));
});

export const readAvailability = httpAction(async (ctx, request) => {
  const parsed = await readReadOnlyJson(request, "/joy-read/availability");
  if (parsed instanceof Response) return parsed;
  const { physiotherapist_id, service_mode, start, end, duration_minutes } = parsed.data;
  if (typeof physiotherapist_id !== "string" || !["home_visit", "clinic", "online"].includes(String(service_mode)) || typeof start !== "number" || typeof end !== "number" || typeof duration_minutes !== "number") return new Response("Invalid payload", { status: 400 });
  const profile = await ctx.runQuery((internal as any).joyIntegration.resolveProfileForAvailability, { physiotherapistId: physiotherapist_id, serviceMode: service_mode, durationMinutes: duration_minutes });
  if (!profile || !profile.amountKobo) return Response.json({ slots: [] });
  const slots = await ctx.runQuery((api as any).calendar.availability.getAvailableSlots, {
    physiotherapistId: profile.physiotherapistUserId,
    startDate: Math.max(start, Date.now() + JOY_MINIMUM_NOTICE_MS),
    endDate: end,
    sessionDuration: duration_minutes,
  });
  return Response.json({ slots, amount_kobo: profile.amountKobo, currency: "NGN" });
});

export const readBooking = httpAction(async (ctx, request) => {
  const parsed = await readReadOnlyJson(request, "/joy-read/get_booking");
  if (parsed instanceof Response) return parsed;
  if (typeof parsed.data.booking_id !== "string" || typeof parsed.data.patient_id !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runQuery((internal as any).joyIntegration.getJoyBooking, { bookingId: parsed.data.booking_id, patientId: parsed.data.patient_id }));
});

export const createPendingBooking = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/create_pending_booking");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const data = parsed.data;
  const requiredStrings = ["patient_id", "physiotherapist_id", "service_mode", "session_type", "triage_summary_reference", "assessment_id", "protocol_version", "eligibility_reference", "policy_version", "policy_acceptance_reference", "conversation_id", "request_id", "idempotency_key"];
  if (!requiredStrings.every((key) => typeof data[key] === "string") || typeof data.slot_start !== "number" || typeof data.duration_minutes !== "number" || typeof data.assessment_revision !== "number" || !["home_visit", "clinic", "online"].includes(String(data.service_mode))) return new Response("Invalid payload", { status: 400 });
  if (data.slot_start < Date.now() + JOY_MINIMUM_NOTICE_MS) {
    return Response.json({ code: "SLOT_NOTICE_REQUIRED" }, { status: 409 });
  }
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.createPendingJoyBooking, {
    patientId: data.patient_id, physiotherapistId: data.physiotherapist_id, slotStart: data.slot_start,
    durationMinutes: data.duration_minutes, serviceMode: data.service_mode, sessionType: data.session_type,
    patientAddress: typeof data.patient_address === "string" ? data.patient_address : undefined,
    triageSummaryReference: data.triage_summary_reference, assessmentId: data.assessment_id,
    requiredSpecialties: Array.isArray(data.required_specialties) ? data.required_specialties : [],
    assessmentRevision: data.assessment_revision, protocolVersion: data.protocol_version,
    eligibilityReference: data.eligibility_reference, policyVersion: data.policy_version,
    policyAcceptanceReference: data.policy_acceptance_reference, conversationId: data.conversation_id,
    requestId: data.request_id, idempotencyKey: data.idempotency_key,
    trackingCode: typeof data.tracking_code === "string" ? data.tracking_code : undefined,
    referralId: typeof data.referral_id === "string" ? data.referral_id : undefined,
  }));
});

export const respondToBooking = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/respond_to_booking");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.booking_id !== "string" || typeof parsed.data.physiotherapist_user_id !== "string" || !["accept", "reject"].includes(String(parsed.data.response))) return new Response("Invalid payload", { status: 400 });
  const result = await ctx.runMutation((internal as any).joyIntegration.respondToJoyBooking, {
    bookingId: parsed.data.booking_id,
    physiotherapistId: parsed.data.physiotherapist_user_id,
    response: parsed.data.response,
  });
  // The signed Convex gateway is a first-class operational path, so it must
  // have the same authoritative RH-to-Joy notification behaviour as the
  // legacy Next adapter.  The durable outbox and stable event ids make this
  // safe if an adapter also retries the request.
  if (result.outcome === "confirmed") {
    await ctx.runAction((internal as any).joyIntegration.deliverJoyEvent, {
      eventId: `booking-confirmed-${result.booking_id}`,
      eventType: "booking.confirmed",
      data: {
        booking_id: result.booking_id,
        appointment_id: result.appointment_id,
        patient_id: result.patient_id,
      },
    });
  } else if (result.outcome === "replacement_required") {
    await ctx.runAction((internal as any).joyIntegration.deliverJoyEvent, {
      eventId: `booking-replacement-${result.booking_id}`,
      eventType: "booking.provider_rejected",
      data: { booking_id: result.booking_id, patient_id: result.patient_id },
    });
  }
  return Response.json(result);
});

export const createAdminScheduledVirtualBooking = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/create_admin_scheduled_virtual_booking");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const data = parsed.data;
  const strings = ["patient_id", "consultation_type", "triage_summary_reference", "assessment_id", "policy_version", "policy_acceptance_reference", "conversation_id", "request_id", "idempotency_key"];
  if (!strings.every(key => typeof data[key] === "string") || !["quick_initial", "full_virtual"].includes(String(data.consultation_type)) || typeof data.duration_minutes !== "number" || typeof data.amount_kobo !== "number" || typeof data.assessment_revision !== "number") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.createAdminScheduledJoyVirtualBooking, {
    patientId: data.patient_id, consultationType: data.consultation_type, durationMinutes: data.duration_minutes,
    amountKobo: data.amount_kobo, triageSummaryReference: data.triage_summary_reference,
    assessmentId: data.assessment_id, assessmentRevision: data.assessment_revision,
    policyVersion: data.policy_version, policyAcceptanceReference: data.policy_acceptance_reference,
    conversationId: data.conversation_id, requestId: data.request_id, idempotencyKey: data.idempotency_key,
    partnerReferralCode: typeof data.partner_referral_code === "string" ? data.partner_referral_code : undefined,
  }));
});

export const resolvePartnerAttribution = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/resolve_partner_attribution");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const { patient_id, public_code } = parsed.data;
  if (typeof patient_id !== "string" || typeof public_code !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.resolvePartnerAttributionForJoy, {
    patientId: patient_id,
    publicCode: public_code,
  }));
});

export const replacementCandidates = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/replacement_candidates");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.booking_id !== "string") return new Response("Invalid payload", { status: 400 });
  const candidates = await ctx.runQuery((internal as any).joyIntegration.replacementCandidates, { bookingId: parsed.data.booking_id });
  if (!candidates.length) await ctx.runMutation((internal as any).joyIntegration.createJoyAdminFollowUp, { bookingId: parsed.data.booking_id, reason: "No specialty-correct replacement provider available after provider rejection or timeout" });
  return Response.json({ candidates });
});

export const reassignBooking = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/reassign_booking");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.booking_id !== "string" || typeof parsed.data.physiotherapist_id !== "string" || typeof parsed.data.slot_start !== "number") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.reassignPaidJoyBooking, { bookingId: parsed.data.booking_id, physiotherapistId: parsed.data.physiotherapist_id, slotStart: parsed.data.slot_start }));
});

export const getBooking = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/get_booking");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.booking_id !== "string" || typeof parsed.data.patient_id !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runQuery((internal as any).joyIntegration.getJoyBooking, { bookingId: parsed.data.booking_id, patientId: parsed.data.patient_id }));
});

export const cancelBooking = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/cancel_booking");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.booking_id !== "string" || typeof parsed.data.patient_id !== "string" || typeof parsed.data.reason !== "string" || typeof parsed.data.idempotency_key !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.cancelJoyBooking, { bookingId: parsed.data.booking_id, patientId: parsed.data.patient_id, reason: parsed.data.reason, idempotencyKey: parsed.data.idempotency_key }));
});

export const preparePaymentAttempt = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/prepare_payment_attempt");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const data = parsed.data;
  if (!["booking_id", "patient_id", "request_id", "idempotency_key", "reference"].every((key) => typeof data[key] === "string")) return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.prepareJoyPaymentAttempt, { bookingId: data.booking_id, patientId: data.patient_id, requestId: data.request_id, idempotencyKey: data.idempotency_key, reference: data.reference }));
});

export const recordPaymentInitialization = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/record_payment_initialization");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.attempt_id !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.recordJoyPaymentInitialization, { attemptId: parsed.data.attempt_id, authorizationUrl: typeof parsed.data.authorization_url === "string" ? parsed.data.authorization_url : undefined, safeAccessCode: typeof parsed.data.safe_access_code === "string" ? parsed.data.safe_access_code : undefined, failureCategory: typeof parsed.data.failure_category === "string" ? parsed.data.failure_category : undefined }));
});

export const recordPaymentWebhook = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/record_payment_webhook");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const data = parsed.data;
  if (typeof data.reference !== "string" || typeof data.amount_kobo !== "number" || typeof data.currency !== "string" || typeof data.paystack_event_id !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.recordJoyPaymentWebhook, { reference: data.reference, amountKobo: data.amount_kobo, currency: data.currency, paystackEventId: data.paystack_event_id }));
});

export const recordPaymentFailedWebhook = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/record_payment_failed_webhook");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const data = parsed.data;
  if (typeof data.reference !== "string" || typeof data.paystack_event_id !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.recordJoyPaymentFailedWebhook, {
    reference: data.reference,
    paystackEventId: data.paystack_event_id,
    failureCategory: typeof data.failure_category === "string" ? data.failure_category : undefined,
  }));
});

// Phase 4/5 operational gateway. This accepts a fixed operation allowlist in
// joyOperations; it is not a generic Convex dispatcher.
export const operationalQuery = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/operational_query");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.operation !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runQuery((internal as any).joyOperations.executeQuery, { operation: parsed.data.operation, data: parsed.data.data ?? {} }));
});

export const operationalMutation = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/operational_mutation");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.operation !== "string" || typeof parsed.data.request_id !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyOperations.executeMutation, { operation: parsed.data.operation, data: parsed.data.data ?? {}, requestId: parsed.data.request_id }));
});

export const updatePatientLocation = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/update_patient_location");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const { patient_id, city, area } = parsed.data;
  if (typeof patient_id !== "string" || typeof city !== "string" || typeof area !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.updateJoyPatientLocation, { patientId: patient_id, city, area }));
});

export const createSpecialistReview = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/create_specialist_review");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const data = parsed.data;
  const fields = ["patient_id", "assessment_id", "protocol_version", "eligibility_reference", "policy_version", "policy_acceptance_reference", "conversation_id", "request_id", "idempotency_key"];
  if (!fields.every(key => typeof data[key] === "string") || typeof data.assessment_revision !== "number") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.createJoySpecialistReview, { patientId: data.patient_id, assessmentId: data.assessment_id, assessmentRevision: data.assessment_revision, protocolVersion: data.protocol_version, eligibilityReference: data.eligibility_reference, policyVersion: data.policy_version, policyAcceptanceReference: data.policy_acceptance_reference, conversationId: data.conversation_id, requestId: data.request_id, idempotencyKey: data.idempotency_key }));
});

export const prepareSpecialistReviewPayment = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/prepare_specialist_review_payment");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const data = parsed.data;
  if (!["review_id", "patient_id", "request_id", "idempotency_key", "reference"].every(key => typeof data[key] === "string")) return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.prepareJoySpecialistReviewPayment, { reviewId: data.review_id, patientId: data.patient_id, requestId: data.request_id, idempotencyKey: data.idempotency_key, reference: data.reference }));
});

export const recordSpecialistReviewPaymentInitialization = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/record_specialist_review_payment_initialization");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce)) || typeof parsed.data.attempt_id !== "string") return new Response("Invalid request", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.recordJoySpecialistReviewPaymentInitialization, { attemptId: parsed.data.attempt_id, authorizationUrl: typeof parsed.data.authorization_url === "string" ? parsed.data.authorization_url : undefined }));
});

export const recordSpecialistReviewPaymentWebhook = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/record_specialist_review_payment_webhook");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const data = parsed.data;
  if (typeof data.reference !== "string" || typeof data.amount_kobo !== "number" || typeof data.currency !== "string" || typeof data.paystack_event_id !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.recordJoySpecialistReviewPaymentWebhook, { reference: data.reference, amountKobo: data.amount_kobo, currency: data.currency, paystackEventId: data.paystack_event_id }));
});

// Handoff to the clinician: Joy's structured intake and summaries for an assessment revision.
// Field validation and length limits live in joyHandoff.upsertJoyIntake.
export const upsertIntake = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/upsert_intake");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const { patient_id, conversation_id, assessment_id, assessment_revision } = parsed.data;
  if (typeof patient_id !== "string" || typeof conversation_id !== "string" || typeof assessment_id !== "string" || typeof assessment_revision !== "number") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyHandoff.upsertJoyIntake, { payload: parsed.data }));
});

// A stage the patient reached in the WhatsApp conversation (see JOY_REPORTED_STAGES).
export const recordJourneyEvent = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/record_journey_event");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const { patient_id, stage, event_id } = parsed.data;
  if (typeof patient_id !== "string" || typeof stage !== "string" || typeof event_id !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyHandoff.recordJoyJourneyEventFromJoy, { payload: parsed.data }));
});

// A fresh dashboard link when the patient asks Joy for one. Only the patient's own
// WhatsApp number can get it, since the link signs them in (actions/joyDashboard.ts).
export const issueDashboardLink = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/issue_dashboard_link");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const { patient_id, sender_phone } = parsed.data;
  if (typeof patient_id !== "string" || typeof sender_phone !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runAction((internal as any).actions.joyDashboard.provisionJoyDashboard, { patientId: patient_id, senderPhone: sender_phone, notifyJoy: false }));
});

export const enqueueEvent = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/enqueue_event");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.event_id !== "string" || typeof parsed.data.event_type !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.enqueueJoyEvent, { eventId: parsed.data.event_id, eventType: parsed.data.event_type, payload: parsed.data.payload }));
});

export const markEventDelivery = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/mark_event_delivery");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.event_id !== "string" || typeof parsed.data.delivered !== "boolean") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.markJoyEventDelivery, { eventId: parsed.data.event_id, delivered: parsed.data.delivered, error: typeof parsed.data.error === "string" ? parsed.data.error : undefined }));
});
