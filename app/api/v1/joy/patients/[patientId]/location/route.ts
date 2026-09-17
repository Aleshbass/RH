import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
import { JoyAuthError } from "@/lib/joy-integration/auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  city: z.string().min(2).max(80),
  area: z.string().min(2).max(80),
  actor: actorSchema,
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ patientId: string }> }) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const { patientId } = await params;
    const authenticated = await authenticatedJson(request, requestSchema);
    requestId = authenticated.requestId;
    const { actor, city, area } = authenticated.data;
    if (actor.persona !== "patient" || (actor.rh_user_id && actor.rh_user_id !== patientId)) {
      throw new JoyAuthError(403, "FORBIDDEN", "Actor may only update their own booking location");
    }
    const data = await callJoyConvexGateway("update_patient_location", {
      patient_id: patientId, city: city.trim(), area: area.trim(),
    });
    return success(requestId, data);
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
