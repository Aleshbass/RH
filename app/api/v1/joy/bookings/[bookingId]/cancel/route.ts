import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { JoyAuthError } from "@/lib/joy-integration/auth";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";

const schema = z.object({ patient_id: z.string().min(1), reason: z.string().min(1).max(500), actor: actorSchema }).strict();

export async function POST(request: Request, context: { params: Promise<{ bookingId: string }> }) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const authenticated = await authenticatedJson(request, schema);
    requestId = authenticated.requestId;
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey) throw new JoyAuthError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    if (authenticated.data.actor.persona !== "patient" || (authenticated.data.actor.rh_user_id && authenticated.data.actor.rh_user_id !== authenticated.data.patient_id)) throw new JoyAuthError(403, "FORBIDDEN", "Actor may only cancel their own booking");
    const { bookingId } = await context.params;
    const result = await callJoyConvexGateway("cancel_booking", { booking_id: bookingId, patient_id: authenticated.data.patient_id, reason: authenticated.data.reason, idempotency_key: idempotencyKey });
    return success(requestId, result);
  } catch (error) { return errorResponse(requestId, error); }
}
