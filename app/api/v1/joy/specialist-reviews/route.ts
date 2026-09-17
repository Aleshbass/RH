import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { JoyAuthError } from "@/lib/joy-integration/auth";
import { verifyJoyEligibility, JoyEligibilityError } from "@/lib/joy-integration/eligibility";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";

const schema = z.object({
  patient_id: z.string().min(1), assessment_id: z.string().min(1), assessment_revision: z.number().int().positive(),
  protocol_version: z.string().min(1), policy_version: z.string().min(1), policy_acceptance_reference: z.string().min(1),
  joy_conversation_id: z.string().min(1), actor: actorSchema,
}).strict();

/** Creates the server-priced, five-minute AMBER safety review. */
export async function POST(request: Request) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const verified = await authenticatedJson(request, schema);
    requestId = verified.requestId;
    const input = verified.data;
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey) throw new JoyAuthError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    if (input.actor.persona !== "patient" || (input.actor.rh_user_id && input.actor.rh_user_id !== input.patient_id)) throw new JoyAuthError(403, "FORBIDDEN", "Actor may only request their own review");
    const eligibility = await verifyJoyEligibility({ patientId: input.patient_id, assessmentId: input.assessment_id, assessmentRevision: input.assessment_revision, serviceType: "specialist_review", policyVersion: input.policy_version });
    const review = await callJoyConvexGateway("create_specialist_review", { ...input, eligibility_reference: eligibility.eligibility_reference, conversation_id: input.joy_conversation_id, request_id: requestId, idempotency_key: idempotencyKey });
    return success(requestId, review, 201);
  } catch (error) {
    if (error instanceof JoyEligibilityError) return errorResponse(requestId, new JoyAuthError(409, "SAFETY_ELIGIBILITY_REQUIRED", error.message));
    return errorResponse(requestId, error);
  }
}
