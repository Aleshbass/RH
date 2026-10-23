import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
import { JoyAuthError } from "@/lib/joy-integration/auth";

export const runtime = "nodejs";

// A fresh one-tap link to the patient's Rehabify dashboard ("send me my dashboard link").
// Convex only issues it when actor.sender_phone is the patient's own number (convex/actions/joyDashboard.ts).
const requestSchema = z.object({
  actor: actorSchema,
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ patientId: string }> }) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const { patientId } = await params;
    const authenticated = await authenticatedJson(request, requestSchema);
    requestId = authenticated.requestId;
    const { actor } = authenticated.data;
    if (actor.persona !== "patient" || (actor.rh_user_id && actor.rh_user_id !== patientId)) {
      throw new JoyAuthError(403, "FORBIDDEN", "Actor may only request their own dashboard link");
    }
    const data = await callJoyConvexGateway("issue_dashboard_link", {
      patient_id: patientId,
      sender_phone: actor.sender_phone,
    });
    return success(requestId, data);
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
