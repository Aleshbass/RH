import { createHmac, randomUUID } from "crypto";

type GatewayOperation = "record_external_request" | "resolve_patient" | "resolve_or_create_patient" | "link_referral" | "resolve_referral_context" | "resolve_partner_attribution" | "update_patient_location" | "resolve_physiotherapist" | "find_matches" | "resolve_availability_profile" | "create_pending_booking" | "create_admin_scheduled_virtual_booking" | "get_booking" | "cancel_booking" | "prepare_payment_attempt" | "record_payment_initialization" | "record_payment_webhook" | "record_payment_failed_webhook" | "create_specialist_review" | "prepare_specialist_review_payment" | "record_specialist_review_payment_webhook" | "record_specialist_review_payment_initialization" | "enqueue_event" | "mark_event_delivery" | "respond_to_booking" | "replacement_candidates" | "reassign_booking" | "operational_query" | "operational_mutation" | "upsert_intake" | "record_journey_event" | "issue_dashboard_link";

export class GatewayError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GatewayError";
  }
}

export async function callJoyConvexGateway(operation: GatewayOperation, payload: Record<string, unknown>): Promise<unknown> {
  const url = process.env.CONVEX_JOY_GATEWAY_URL;
  const secret = process.env.CONVEX_JOY_GATEWAY_SECRET;
  if (!url || !secret) throw new GatewayError("Joy Convex gateway is not configured");

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const canonical = ["POST", `/joy-integration/${operation}`, timestamp, nonce, body].join("\n");
  const signature = createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/$/, "")}/joy-integration/${operation}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Joy-Gateway-Timestamp": timestamp, "X-Joy-Gateway-Nonce": nonce, "X-Joy-Gateway-Signature": signature },
      body,
      cache: "no-store",
      // Callers include the Paystack webhook: a hung gateway must fail fast so Paystack retries
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("joy_convex_gateway_unreachable", {
      operation,
      gateway_origin: new URL(url).origin,
      error: error instanceof Error ? error.message : "fetch failed",
    });
    throw new GatewayError("Joy Convex gateway is temporarily unreachable");
  }
  if (!response.ok) {
    // Keep the patient-facing integration envelope generic, but retain enough
    // production diagnostics to distinguish an invalid request, signature
    // problem, replay rejection, or a Convex execution failure. Responses from
    // this fixed internal gateway never need to include credentials.
    const detail = (await response.text()).slice(0, 500);
    console.error("joy_convex_gateway_failed", { operation, status: response.status, detail });
    throw new GatewayError(`Joy Convex gateway returned ${response.status}`, response.status);
  }
  return response.json();
}
