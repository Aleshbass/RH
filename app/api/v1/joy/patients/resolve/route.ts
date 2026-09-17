import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
import { JoyAuthError } from "@/lib/joy-integration/auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  phone: z.string().min(7).max(32),
  joy_person_id: z.string().min(1).max(128),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  actor: actorSchema,
}).strict();

export async function POST(request: Request) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const authenticated = await authenticatedJson(request, requestSchema);
    requestId = authenticated.requestId;
    const { actor, phone } = authenticated.data;
    if (actor.persona !== "patient" || actor.sender_phone !== phone) {
      return errorResponse(requestId, new JoyAuthError(403, "FORBIDDEN", "Actor may only resolve their own patient identity"));
    }
    const result = await callJoyConvexGateway("resolve_or_create_patient", {
      phone,
      joy_person_id: authenticated.data.joy_person_id,
      name: authenticated.data.name,
      email: authenticated.data.email,
    });
    const data = result as { resolution: "EXISTING" | "CREATED" | "AMBIGUOUS"; patient_id?: string; display_name?: string };
    return success(requestId, data);
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
