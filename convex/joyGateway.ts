import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

async function verify(request: Request, path: string, body: string): Promise<boolean> {
  const secret = process.env.CONVEX_JOY_GATEWAY_SECRET;
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

async function reserveNonce(ctx: { runMutation: Function }, nonce: string): Promise<boolean> {
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
  const parsed = await readJson(request, "/joy-integration/resolve_patient");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.phone !== "string" || typeof parsed.data.joy_person_id !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.resolveOrCreatePatientByPhone, {
    phone: parsed.data.phone,
    joyPersonId: parsed.data.joy_person_id,
    name: typeof parsed.data.name === "string" ? parsed.data.name : undefined,
    email: typeof parsed.data.email === "string" ? parsed.data.email : undefined,
  }));
});

export const resolvePhysiotherapist = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/resolve_physiotherapist");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.phone !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runQuery((internal as any).joyIntegration.resolvePhysiotherapistByPhone, { phone: parsed.data.phone }));
});

export const findMatches = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/find_matches");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const { patient_id, required_specialties, service_mode, location, limit } = parsed.data;
  if (typeof patient_id !== "string" || !Array.isArray(required_specialties) || !required_specialties.every((value) => typeof value === "string") || !["home_visit", "clinic", "online"].includes(String(service_mode))) return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runQuery((internal as any).joyIntegration.findMatches, {
    patientId: patient_id, requiredSpecialties: required_specialties, serviceMode: service_mode,
    location: typeof location === "string" ? location : undefined, limit: typeof limit === "number" ? limit : 3,
  }));
});

export const resolveAvailabilityProfile = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/resolve_availability_profile");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const { physiotherapist_id, service_mode, start, end, duration_minutes } = parsed.data;
  if (typeof physiotherapist_id !== "string" || !["home_visit", "clinic", "online"].includes(String(service_mode)) || typeof start !== "number" || typeof end !== "number" || typeof duration_minutes !== "number") return new Response("Invalid payload", { status: 400 });
  const profile = await ctx.runQuery((internal as any).joyIntegration.resolveProfileForAvailability, { physiotherapistId: physiotherapist_id, serviceMode: service_mode });
  if (!profile || !profile.amountKobo) return Response.json({ slots: [] });
  const slots = await ctx.runQuery((api as any).calendar.availability.getAvailableSlots, {
    physiotherapistId: profile.physiotherapistUserId, startDate: start, endDate: end, sessionDuration: duration_minutes,
  });
  return Response.json({ slots, amount_kobo: profile.amountKobo, currency: "NGN" });
});

export const createPendingBooking = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/create_pending_booking");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  const data = parsed.data;
  const requiredStrings = ["patient_id", "physiotherapist_id", "service_mode", "session_type", "triage_summary_reference", "assessment_id", "protocol_version", "eligibility_reference", "policy_version", "policy_acceptance_reference", "conversation_id", "request_id", "idempotency_key"];
  if (!requiredStrings.every((key) => typeof data[key] === "string") || typeof data.slot_start !== "number" || typeof data.duration_minutes !== "number" || typeof data.assessment_revision !== "number" || !["home_visit", "clinic", "online"].includes(String(data.service_mode))) return new Response("Invalid payload", { status: 400 });
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
  }));
});

export const respondToBooking = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/respond_to_booking");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.booking_id !== "string" || typeof parsed.data.physiotherapist_user_id !== "string" || !["accept", "reject"].includes(String(parsed.data.response))) return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.respondToJoyBooking, { bookingId: parsed.data.booking_id, physiotherapistId: parsed.data.physiotherapist_user_id, response: parsed.data.response }));
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
