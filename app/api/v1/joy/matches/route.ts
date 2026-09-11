import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
import { JoyAuthError } from "@/lib/joy-integration/auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  patient_id: z.string().min(1),
  assessment_id: z.string().min(1),
  assessment_revision: z.number().int().positive(),
  required_specialties: z.array(z.string().min(1)).min(1).max(8),
  service_mode: z.enum(["home_visit", "clinic", "online"]),
  location: z.string().min(2).max(160).optional(),
  actor: actorSchema,
}).strict();

export async function POST(request: Request) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const authenticated = await authenticatedJson(request, requestSchema);
    requestId = authenticated.requestId;
    const input = authenticated.data;
    if (input.actor.persona !== "patient" || (input.actor.rh_user_id && input.actor.rh_user_id !== input.patient_id)) {
      throw new JoyAuthError(403, "FORBIDDEN", "Actor may only request matches for their own patient identity");
    }
    const providers = await callJoyConvexGateway("find_matches", {
      patient_id: input.patient_id, required_specialties: input.required_specialties,
      service_mode: input.service_mode, location: input.location, limit: 3,
    });
    return success(requestId, { providers });
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
