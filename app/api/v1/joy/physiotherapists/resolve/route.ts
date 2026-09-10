import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
import { JoyAuthError } from "@/lib/joy-integration/auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  phone: z.string().min(7).max(32),
  actor: actorSchema,
}).strict();

export async function POST(request: Request) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const authenticated = await authenticatedJson(request, requestSchema);
    requestId = authenticated.requestId;
    const { actor, phone } = authenticated.data;
    if (actor.persona !== "physiotherapist" || actor.sender_phone !== phone) {
      return errorResponse(requestId, new JoyAuthError(403, "FORBIDDEN", "Actor may only resolve their own physiotherapist identity"));
    }
    const result = await callJoyConvexGateway("resolve_physiotherapist", { phone });
    const data = result as Record<string, unknown>;
    return success(requestId, data);
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
