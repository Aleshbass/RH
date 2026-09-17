import { createHash } from "crypto";
import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { JoyAuthError } from "@/lib/joy-integration/auth";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";

const schema = z.object({ patient_id: z.string().min(1), email: z.string().email(), actor: actorSchema }).strict();

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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://physioaroundme.com";
    const response = await fetch("https://api.paystack.co/transaction/initialize", { method: "POST", headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY ?? ""}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: input.email, amount: prepared.amount_kobo, currency: "NGN", reference, callback_url: `${appUrl}/payment/callback`, metadata: { joy_specialist_review_id: reviewId, source_system: "joy_ai", source_channel: "whatsapp", correlation_id: requestId } }) });
    const result = await response.json() as { status?: boolean; data?: { authorization_url?: string } };
    if (!response.ok || !result.status || !result.data?.authorization_url) throw new JoyAuthError(503, "PAYMENT_INITIALIZATION_FAILED", "Unable to initialize secure payment at this time");
    await callJoyConvexGateway("record_specialist_review_payment_initialization", { attempt_id: prepared.attempt_id, authorization_url: result.data.authorization_url });
    return success(requestId, { review_id: reviewId, reference, authorization_url: result.data.authorization_url, payment_status: "pending" });
  } catch (error) { return errorResponse(requestId, error); }
}
