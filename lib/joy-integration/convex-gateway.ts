import { createHmac, randomUUID } from "crypto";

type GatewayOperation = "record_external_request" | "resolve_patient" | "resolve_or_create_patient" | "update_patient_location" | "resolve_physiotherapist" | "find_matches" | "resolve_availability_profile" | "create_pending_booking" | "get_booking" | "cancel_booking" | "prepare_payment_attempt" | "record_payment_initialization" | "record_payment_webhook" | "create_specialist_review" | "prepare_specialist_review_payment" | "record_specialist_review_payment_initialization" | "record_specialist_review_payment_webhook" | "enqueue_event" | "mark_event_delivery" | "respond_to_booking" | "replacement_candidates" | "reassign_booking";

export class GatewayError extends Error {}

export async function callJoyConvexGateway(operation: GatewayOperation, payload: Record<string, unknown>): Promise<unknown> {
  const url = process.env.CONVEX_JOY_GATEWAY_URL;
  const secret = process.env.CONVEX_JOY_GATEWAY_SECRET;
  if (!url || !secret) throw new GatewayError("Joy Convex gateway is not configured");

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const canonical = ["POST", `/joy-integration/${operation}`, timestamp, nonce, body].join("\n");
  const signature = createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
  const response = await fetch(`${url.replace(/\/$/, "")}/joy-integration/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Joy-Gateway-Timestamp": timestamp, "X-Joy-Gateway-Nonce": nonce, "X-Joy-Gateway-Signature": signature },
    body,
    cache: "no-store",
  });
  if (!response.ok) throw new GatewayError(`Joy Convex gateway returned ${response.status}`);
  return response.json();
}
