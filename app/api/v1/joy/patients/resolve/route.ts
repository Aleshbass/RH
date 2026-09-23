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
  tracking_code: z.string().max(100).optional(),
  initial_message: z.string().max(2000).optional(),
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
    // The HTTP gateway route is named `resolve_patient`; its backing Convex
    // mutation resolves an existing patient or creates one by phone.
    const result = await callJoyConvexGateway("resolve_patient", {
      phone,
      joy_person_id: authenticated.data.joy_person_id,
      name: authenticated.data.name,
      email: authenticated.data.email,
      tracking_code: authenticated.data.tracking_code,
      initial_message: authenticated.data.initial_message,
    });
    const data = result as {
      resolution: "EXISTING" | "CREATED" | "AMBIGUOUS";
      patient_id?: string;
      display_name?: string;
      referral_id?: string;
      tracking_code?: string;
      referral_status?: string;
    };
    return success(requestId, data);
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
