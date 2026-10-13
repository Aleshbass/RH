import { createHmac, randomUUID } from "crypto";

/**
 * Server-side client for the Convex partner gateway (convex/partnerGateway.ts).
 * Requests are HMAC-signed with CONVEX_PARTNER_GATEWAY_SECRET; the same secret must be
 * set in the Convex deployment. Never import this from client components.
 */
export type PartnerGatewayOp =
  | "authenticate"
  | "listReferrals"
  | "getReferral"
  | "listSessions"
  | "getReport"
  | "listProviders"
  | "listReferralLinks"
  | "getCommercial"
  | "listCommissions"
  | "createReferral"
  | "createReferralLink"
  | "updateReferralLinkStatus"
  | "sandboxAdvanceReferral"
  | "sandboxTriggerWebhook"
  | "submitLead"
  | "recordLinkClick"
  | "idempotencyBegin"
  | "idempotencyComplete"
  | "idempotencyRelease"
  | "touchApiKey"
  | "logApiRequest";

const PATH = "/partner-gateway/rpc";

export class PartnerGatewayError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PartnerGatewayError";
  }
}

function gatewayBaseUrl(): string {
  const explicit = process.env.CONVEX_PARTNER_GATEWAY_URL || process.env.CONVEX_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (convexUrl) return convexUrl.replace(/\/$/, "").replace(/\.convex\.cloud$/, ".convex.site");
  const joy = process.env.CONVEX_JOY_GATEWAY_URL;
  if (joy) return joy.replace(/\/$/, "");
  throw new PartnerGatewayError("Partner gateway URL is not configured");
}

export function isPartnerGatewayConfigured(): boolean {
  return Boolean(process.env.CONVEX_PARTNER_GATEWAY_SECRET && process.env.CONVEX_PARTNER_GATEWAY_SECRET.length >= 32);
}

export async function callPartnerGateway<T = any>(op: PartnerGatewayOp, args: Record<string, unknown>): Promise<T> {
  const secret = process.env.CONVEX_PARTNER_GATEWAY_SECRET;
  if (!secret || secret.length < 32) throw new PartnerGatewayError("CONVEX_PARTNER_GATEWAY_SECRET is not configured");
  const body = JSON.stringify({ op, args: stripUndefined(args) });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const signature = createHmac("sha256", secret).update(["POST", PATH, timestamp, nonce, body].join("\n"), "utf8").digest("hex");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(`${gatewayBaseUrl()}${PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Partner-Gateway-Timestamp": timestamp,
        "X-Partner-Gateway-Nonce": nonce,
        "X-Partner-Gateway-Signature": signature,
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    console.error("partner_gateway_unreachable", { op, error: error instanceof Error ? error.message : String(error) });
    throw new PartnerGatewayError("Partner gateway is temporarily unreachable", 503);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  if (!response.ok) {
    console.error("partner_gateway_failed", { op, status: response.status, detail: text.slice(0, 500) });
    throw new PartnerGatewayError(`Partner gateway returned ${response.status}`, response.status);
  }
  try {
    return (JSON.parse(text) as { result: T }).result;
  } catch {
    throw new PartnerGatewayError("Partner gateway returned invalid JSON", 502);
  }
}

/** JSON.stringify drops undefined, but Convex validators reject explicit nulls for optionals. */
function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null) continue;
    out[key] = entry !== null && typeof entry === "object" && !Array.isArray(entry) ? stripUndefined(entry as Record<string, unknown>) : entry;
  }
  return out;
}
