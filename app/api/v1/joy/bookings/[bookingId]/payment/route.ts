import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { JoyAuthError } from "@/lib/joy-integration/auth";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
import { publicAppUrl } from "@/lib/public-app-url";
import { joyLoginEmail } from "@/lib/auth/joyLoginEmail";

export const runtime = "nodejs";

// email is optional: a patient without one gets their receipt on WhatsApp, and Paystack gets their
// private Rehabify address (never delivered; the same one as their Joy dashboard login)
const schema = z.object({ patient_id: z.string().min(1), email: z.string().email().optional(), actor: actorSchema }).strict();

export async function POST(request: Request, context: { params: Promise<{ bookingId: string }> }) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const authenticated = await authenticatedJson(request, schema);
    requestId = authenticated.requestId;
    const { bookingId } = await context.params;
    const input = authenticated.data;
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey) throw new JoyAuthError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    if (input.actor.persona !== "patient" || (input.actor.rh_user_id && input.actor.rh_user_id !== input.patient_id)) throw new JoyAuthError(403, "FORBIDDEN", "Actor may only pay for their own booking");

    const reference = `JOY_${bookingId.slice(-8)}_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 18)}`;
    const prepared = await callJoyConvexGateway("prepare_payment_attempt", { booking_id: bookingId, patient_id: input.patient_id, request_id: requestId, idempotency_key: idempotencyKey, reference }) as { attempt_id: string; amount_kobo: number; reference?: string; status: string; authorization_url?: string };

    if (prepared.status === "verified") {
      throw new JoyAuthError(409, "PAYMENT_ALREADY_COMPLETED", "This booking has already been paid");
    }
    if (prepared.status === "initialized" && prepared.authorization_url) {
      return success(requestId, { booking_id: bookingId, reference: prepared.reference ?? reference, authorization_url: prepared.authorization_url, payment_status: "pending" });
    }

    // All-inclusive pricing: the patient pays the booking's amount; Rehabify absorbs Paystack's fee
    const chargeAmountKobo = prepared.amount_kobo;
    const feeMetadata: Record<string, unknown> = {};

    const appUrl = publicAppUrl();
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email ?? joyLoginEmail(input.patient_id), amount: chargeAmountKobo, currency: "NGN", reference, callback_url: `${appUrl}/payment/callback`, metadata: { rh_booking_id: bookingId, source_system: "joy_ai", source_channel: "whatsapp", correlation_id: requestId, ...feeMetadata } }),
    });
    let result: { status?: boolean; message?: string; data?: { authorization_url?: string; access_code?: string } };
    try {
      result = await response.json() as typeof result;
    } catch {
      // A proxy or provider error page must still leave an actionable but
      // non-sensitive diagnostic, rather than becoming an opaque 503.
      console.error("joy_paystack_initialization_invalid_response", {
        request_id: requestId,
        booking_id: bookingId,
        paystack_status: response.status,
        paystack_key_configured: Boolean(process.env.PAYSTACK_SECRET_KEY),
      });
      await callJoyConvexGateway("record_payment_initialization", { attempt_id: prepared.attempt_id, failure_category: "PAYSTACK_INITIALIZATION_FAILED" });
      throw new JoyAuthError(503, "PAYMENT_INITIALIZATION_FAILED", "Unable to initialize secure payment at this time");
    }
    if (!response.ok || !result.status || !result.data?.authorization_url) {
      // Preserve a safe provider diagnostic for operations. Do not log the
      // email, authorization header, access code, or raw payment payload.
      console.error("joy_paystack_initialization_failed", {
        request_id: requestId,
        booking_id: bookingId,
        paystack_status: response.status,
        paystack_message: typeof result.message === "string"
          ? result.message.replace(/[^\s@]+@[^\s@]+/g, "[redacted]").slice(0, 200)
          : "missing authorization URL",
        paystack_key_configured: Boolean(process.env.PAYSTACK_SECRET_KEY),
      });
      await callJoyConvexGateway("record_payment_initialization", { attempt_id: prepared.attempt_id, failure_category: "PAYSTACK_INITIALIZATION_FAILED" });
      throw new JoyAuthError(503, "PAYMENT_INITIALIZATION_FAILED", "Unable to initialize secure payment at this time");
    }
    await callJoyConvexGateway("record_payment_initialization", { attempt_id: prepared.attempt_id, authorization_url: result.data.authorization_url, safe_access_code: result.data.access_code ? createHash("sha256").update(result.data.access_code).digest("hex") : undefined });
    return success(requestId, { booking_id: bookingId, reference, authorization_url: result.data.authorization_url, payment_status: "pending" });
  } catch (error) { return errorResponse(requestId, error); }
}
