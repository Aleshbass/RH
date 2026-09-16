import { createHmac } from "crypto";
import { callJoyConvexGateway } from "./convex-gateway";

export async function deliverJoyEvent(eventId: string, eventType: string, data: Record<string, unknown>) {
  const url = process.env.JOY_EVENT_URL;
  const secret = process.env.JOY_EVENT_HMAC_SECRET;
  const occurredAt = new Date().toISOString();
  const payload = { event_id: eventId, event_type: eventType, api_version: "1", occurred_at: occurredAt, data };
  await callJoyConvexGateway("enqueue_event", { event_id: eventId, event_type: eventType, payload });
  if (!url || !secret) return;
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update([timestamp, eventId, body].join("\n"), "utf8").digest("hex");
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-RH-Event-Timestamp": timestamp, "X-RH-Event-Signature": signature }, body });
    if (!response.ok) throw new Error(`Joy event receiver returned ${response.status}`);
    await callJoyConvexGateway("mark_event_delivery", { event_id: eventId, delivered: true });
  } catch (error) {
    await callJoyConvexGateway("mark_event_delivery", { event_id: eventId, delivered: false, error: error instanceof Error ? error.message : "delivery failed" });
    throw error;
  }
}
