import { z } from "zod";
import { authenticatedEmpty, errorResponse, success } from "@/lib/joy-integration/http";
import { JoyAuthError } from "@/lib/joy-integration/auth";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";

export const runtime = "nodejs";

const actorSchema = z.object({ persona: z.literal("patient"), rh_user_id: z.string().min(1) }).strict();

export async function GET(request: Request, context: { params: Promise<{ bookingId: string }> }) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    requestId = await authenticatedEmpty(request);
    const { bookingId } = await context.params;
    const actor = actorSchema.parse({ persona: new URL(request.url).searchParams.get("persona"), rh_user_id: new URL(request.url).searchParams.get("patient_id") });
    const booking = await callJoyConvexGateway("get_booking", { booking_id: bookingId, patient_id: actor.rh_user_id });
    if (!booking) throw new JoyAuthError(404, "BOOKING_NOT_FOUND", "Booking was not found");
    return success(requestId, booking);
  } catch (error) { return errorResponse(requestId, error); }
}
