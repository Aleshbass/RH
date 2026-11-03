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
  city: z.string().min(2).max(80).optional(),
  area: z.string().min(2).max(80).optional(),
  // The patient's shared WhatsApp location pin (nearest physios first)
  latitude: z.number().min(4).max(14.5).optional(),
  longitude: z.number().min(2.5).max(15).optional(),
  actor: actorSchema,
}).strict().superRefine((value, ctx) => {
  if (value.service_mode === "home_visit" && (!value.city || !value.area)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "City and area are required for home visits" });
  }
});

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
      service_mode: input.service_mode, city: input.city, area: input.area,
      latitude: input.latitude, longitude: input.longitude, limit: 3,
    });
    return success(requestId, { providers });
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
