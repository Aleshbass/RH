import { createHash } from "crypto";
import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { JoyAuthError } from "@/lib/joy-integration/auth";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
import { publicAppUrl } from "@/lib/public-app-url";
import { joyLoginEmail } from "@/lib/auth/joyLoginEmail";

// email is optional: without one the receipt goes on WhatsApp and Paystack gets the patient's private address
const schema = z.object({ patient_id: z.string().min(1), email: z.string().email().optional(), actor: actorSchema }).strict();

export async function POST(request: Request, context: { params: Promise<{ reviewId: string }> }) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const verified = await authenticatedJson(request, schema);
    requestId = verified.requestId;
    const { reviewId } = await context.params;
    const input = verified.data;
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey) throw new JoyAuthError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    if (input.actor.persona !== "patient" || (input.actor.rh_user_id && input.actor.rh_user_id !== input.patient_id)) throw new JoyAuthError(403, "FORBIDDEN", "Actor may only pay for their own review");
    const reference = `JOYREV_${reviewId.slice(-8)}_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 18)}`;
    const prepared = await callJoyConvexGateway("prepare_specialist_review_payment", { review_id: reviewId, patient_id: input.patient_id, request_id: requestId, idempotency_key: idempotencyKey, reference }) as { attempt_id: string; amount_kobo: number; authorization_url?: string };
    if (prepared.authorization_url) return success(requestId, { review_id: reviewId, reference, authorization_url: prepared.authorization_url, payment_status: "pending" });
    const appUrl = publicAppUrl();
    const response = await fetch("https://api.paystack.co/transaction/initialize", { method: "POST", headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY ?? ""}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: input.email ?? joyLoginEmail(input.patient_id), amount: prepared.amount_kobo, currency: "NGN", reference, callback_url: `${appUrl}/payment/callback`, metadata: { joy_specialist_review_id: reviewId, source_system: "joy_ai", source_channel: "whatsapp", correlation_id: requestId } }) });
    let result: { status?: boolean; message?: string; data?: { authorization_url?: string } };
    try {
      result = await response.json() as typeof result;
    } catch {
      console.error("joy_specialist_review_paystack_invalid_response", {
        request_id: requestId,
        review_id: reviewId,
        paystack_status: response.status,
        paystack_key_configured: Boolean(process.env.PAYSTACK_SECRET_KEY),
      });
      throw new JoyAuthError(503, "PAYMENT_INITIALIZATION_FAILED", "Unable to initialize secure payment at this time");
    }
    if (!response.ok || !result.status || !result.data?.authorization_url) {
      console.error("joy_specialist_review_paystack_initialization_failed", {
        request_id: requestId,
        review_id: reviewId,
        paystack_status: response.status,
        paystack_message: typeof result.message === "string"
          ? result.message.replace(/[^\s@]+@[^\s@]+/g, "[redacted]").slice(0, 200)
          : "missing authorization URL",
        paystack_key_configured: Boolean(process.env.PAYSTACK_SECRET_KEY),
      });
      throw new JoyAuthError(503, "PAYMENT_INITIALIZATION_FAILED", "Unable to initialize secure payment at this time");
    }
    await callJoyConvexGateway("record_specialist_review_payment_initialization", { attempt_id: prepared.attempt_id, authorization_url: result.data.authorization_url });
    return success(requestId, { review_id: reviewId, reference, authorization_url: result.data.authorization_url, payment_status: "pending" });
  } catch (error) { return errorResponse(requestId, error); }
}
