import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { JoyAuthError } from "@/lib/joy-integration/auth";
import { GatewayError, callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
import { JoyEligibilityError, verifyJoyEligibility } from "@/lib/joy-integration/eligibility";

export const runtime = "nodejs";

const schema = z.object({
  patient_id: z.string().min(1), physiotherapist_id: z.string().min(1), slot_start: z.number().int().positive(),
  duration_minutes: z.number().int().min(5).max(180), service_mode: z.enum(["home_visit", "clinic", "online"]),
  session_type: z.string().min(1).max(80), patient_address: z.string().max(500).optional(),
  triage_summary_reference: z.string().min(1).max(160), assessment_id: z.string().min(1).max(160),
  assessment_revision: z.number().int().positive(), protocol_version: z.string().min(1).max(80),
  required_specialties: z.array(z.string().min(1)).min(1).max(8),
  policy_version: z.string().min(1).max(80), policy_acceptance_reference: z.string().min(1).max(160),
  joy_conversation_id: z.string().min(1).max(160), actor: actorSchema,
  referral_id: z.string().max(100).optional(), tracking_code: z.string().max(100).optional(),
}).strict();

export async function POST(request: Request) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const authenticated = await authenticatedJson(request, schema);
    requestId = authenticated.requestId;
    const input = authenticated.data;
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey) throw new JoyAuthError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    if (input.actor.persona !== "patient" || (input.actor.rh_user_id && input.actor.rh_user_id !== input.patient_id)) throw new JoyAuthError(403, "FORBIDDEN", "Actor may only create their own booking");
    // Keep this precondition aligned with Convex. It turns a stale or
    // near-boundary time into a refreshable client response instead of a
    // gateway 503 that looks like an outage.
    if (input.slot_start < Date.now() + 2 * 60 * 60 * 1000) {
      throw new JoyAuthError(409, "SLOT_NOTICE_REQUIRED", "Booking slots require at least two hours' notice");
    }
    const eligibility = await verifyJoyEligibility({ patientId: input.patient_id, assessmentId: input.assessment_id, assessmentRevision: input.assessment_revision, serviceType: "standard_consultation", policyVersion: input.policy_version });
    // The public Joy API names this field explicitly for traceability, while
    // the fixed Convex gateway accepts its canonical conversation_id name.
    // Map it here rather than forwarding an incompatible payload.
    const { joy_conversation_id, ...bookingInput } = input;
    const booking = await callJoyConvexGateway("create_pending_booking", {
      ...bookingInput,
      conversation_id: joy_conversation_id,
      eligibility_reference: eligibility.eligibility_reference,
      request_id: requestId,
      idempotency_key: idempotencyKey,
    });
    return success(requestId, booking, 201);
  } catch (error) {
    if (error instanceof JoyEligibilityError) return errorResponse(requestId, new JoyAuthError(409, "SAFETY_ELIGIBILITY_REQUIRED", error.message));
    if (error instanceof GatewayError) {
      console.error("joy_booking_gateway_unavailable", {
        request_id: requestId,
        gateway_status: error.status,
        error: error.message,
      });
      return errorResponse(requestId, new JoyAuthError(503, "RH_BOOKING_GATEWAY_UNAVAILABLE", "Rehabify booking service is temporarily unavailable"));
    }
    return errorResponse(requestId, error);
  }
}
