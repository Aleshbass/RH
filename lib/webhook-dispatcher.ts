import crypto from "crypto";

export interface WebhookEventPayload {
  event:
    | "patient.whatsapp_intake_completed"
    | "provider.matched"
    | "session.scheduled"
    | "session.completed"
    | "treatment_plan.discharged";
  event_id: string;
  timestamp: number;
  data: Record<string, any>;
}

/**
 * Dispatches an outbound webhook to a partner's callback_url with an HMAC SHA-256 signature.
 */
export async function dispatchPartnerWebhook({
  callbackUrl,
  webhookSecret = "whsec_rehabify_default_secret",
  event,
  data,
}: {
  callbackUrl: string;
  webhookSecret?: string;
  event: WebhookEventPayload["event"];
  data: Record<string, any>;
}): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    const payload: WebhookEventPayload = {
      event,
      event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      data,
    };

    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(payloadString)
      .digest("hex");

    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Rehabify-Signature": signature,
        "X-Rehabify-Event": event,
        "User-Agent": "Rehabify-Webhook-Dispatcher/1.0",
      },
      body: payloadString,
    });

    return {
      success: response.ok,
      status: response.status,
    };
  } catch (error) {
    console.error(`Failed to dispatch partner webhook to ${callbackUrl}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown dispatch error",
    };
  }
}
