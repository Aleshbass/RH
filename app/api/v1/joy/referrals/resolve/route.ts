import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
import { JoyAuthError } from "@/lib/joy-integration/auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  phone: z.string().min(7).max(32),
  tracking_code: z.string().regex(/^RHB\s*[-–—]\s*\d{4,}$/i),
  joy_person_id: z.string().min(1).max(128),
  // The patient's full name, when they write from a different number than the referral's
  confirm_name: z.string().min(2).max(120).optional(),
  actor: actorSchema,
}).strict();

export async function POST(request: Request) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const authenticated = await authenticatedJson(request, requestSchema);
    requestId = authenticated.requestId;
    const { actor, phone } = authenticated.data;
    if (actor.persona !== "patient" || actor.sender_phone !== phone || !actor.rh_user_id) {
      return errorResponse(requestId, new JoyAuthError(403, "FORBIDDEN", "Actor may only resolve their own referral"));
    }
    const trackingCode = authenticated.data.tracking_code.replace(/\s+/g, "").toUpperCase();
    const result = await callJoyConvexGateway("resolve_referral_context", {
      phone,
      tracking_code: trackingCode,
      joy_person_id: authenticated.data.joy_person_id,
      patient_id: actor.rh_user_id,
      ...(authenticated.data.confirm_name ? { confirm_name: authenticated.data.confirm_name } : {}),
    });
    return success(requestId, result);
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
