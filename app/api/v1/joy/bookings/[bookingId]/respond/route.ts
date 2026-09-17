import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { JoyAuthError } from "@/lib/joy-integration/auth";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
import { deliverJoyEvent } from "@/lib/joy-integration/events";

const schema = z.object({ response: z.enum(["accept", "reject"]), physiotherapist_user_id: z.string().min(1), actor: actorSchema }).strict();

export async function POST(request: Request, context: { params: Promise<{ bookingId: string }> }) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const { data, requestId: verifiedRequestId } = await authenticatedJson(request, schema);
    requestId = verifiedRequestId;
    if (data.actor.persona !== "physiotherapist" || data.actor.rh_user_id !== data.physiotherapist_user_id) throw new JoyAuthError(403, "FORBIDDEN", "Only the assigned physiotherapist may respond");
    const { bookingId } = await context.params;
    const result = await callJoyConvexGateway("respond_to_booking", { booking_id: bookingId, physiotherapist_user_id: data.physiotherapist_user_id, response: data.response });
    const response = result as { outcome?: string; appointment_id?: string; booking_id?: string; patient_id?: string };
    if (response.outcome === "confirmed" && response.booking_id) {
      await deliverJoyEvent(`booking-confirmed-${response.booking_id}`, "booking.confirmed", { booking_id: response.booking_id, appointment_id: response.appointment_id, patient_id: response.patient_id });
    } else if (response.outcome === "replacement_required") {
      await deliverJoyEvent(`booking-replacement-${bookingId}`, "booking.provider_rejected", { booking_id: bookingId, patient_id: response.patient_id });
    }
    return success(requestId, result);
  } catch (error) { return errorResponse(requestId, error); }
}
