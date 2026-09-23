import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";

export const runtime = "nodejs";

const requestSchema = z.object({
  tracking_code: z.string().min(1).max(100),
  phone: z.string().min(7).max(32),
  joy_person_id: z.string().min(1).max(128).optional(),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  message: z.string().max(2000).optional(),
  actor: actorSchema,
}).strict();

export async function POST(request: Request) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const authenticated = await authenticatedJson(request, requestSchema);
    requestId = authenticated.requestId;
    const { tracking_code, phone, joy_person_id, name, email, message } = authenticated.data;

    const result = await callJoyConvexGateway("link_referral", {
      tracking_code,
      phone,
      joy_person_id,
      name,
      email,
      message,
    });

    return success(requestId, result as Record<string, unknown>);
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
