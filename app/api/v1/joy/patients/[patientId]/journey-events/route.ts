import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
import { JoyAuthError } from "@/lib/joy-integration/auth";

export const runtime = "nodejs";

// A stage the patient reached in the WhatsApp conversation, so the physio and patient can see
// where Joy left off. Payment, physio response, scheduling and calls are recorded by Rehabify
// itself and are not accepted here. `event_id` makes retries safe.
const requestSchema = z.object({
  event_id: z.string().min(1).max(160),
  stage: z.enum([
    "conversation_started",
    "referral_linked",
    "triage_completed",
    "eligibility_passed",
    "eligibility_blocked",
    "matches_shown",
    "payment_link_sent",
    "reminder_sent",
    "hold_expired",
    "abandoned",
    "cancelled",
    "handed_to_human",
  ]),
  booking_id: z.string().min(1).max(100).optional(),
  occurred_at: z.number().int().positive().optional(),
  note: z.string().max(200).optional(),
  actor: actorSchema,
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ patientId: string }> }) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const { patientId } = await params;
    const authenticated = await authenticatedJson(request, requestSchema);
    requestId = authenticated.requestId;
    const { actor, ...event } = authenticated.data;
    if (actor.persona !== "patient" || (actor.rh_user_id && actor.rh_user_id !== patientId)) {
      throw new JoyAuthError(403, "FORBIDDEN", "Actor may only record their own journey");
    }
    const data = await callJoyConvexGateway("record_journey_event", { ...event, patient_id: patientId });
    return success(requestId, data);
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
