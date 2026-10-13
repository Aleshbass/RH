/**
 * Partner gateway: the ONLY way the Next.js partner API reaches partner data.
 *
 * POST /partner-gateway/rpc  { "op": "<operation>", "args": { … } }
 * Headers: X-Partner-Gateway-Timestamp, X-Partner-Gateway-Nonce, X-Partner-Gateway-Signature
 * Signature = hex HMAC-SHA256(CONVEX_PARTNER_GATEWAY_SECRET,
 *             "POST\n/partner-gateway/rpc\n<timestamp>\n<nonce>\n<body>")
 *
 * The operation table below is a fixed allowlist of internal functions; it is not a
 * generic Convex dispatcher. Writes reserve the nonce so a captured request cannot be
 * replayed; requests older than 5 minutes are rejected.
 */
import { httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const PATH = "/partner-gateway/rpc";
const encoder = new TextEncoder();

const QUERY_OPS = {
  authenticate: internal.partnerApi.authenticate,
  listReferrals: internal.partnerApi.listReferrals,
  getReferral: internal.partnerApi.getReferral,
  listSessions: internal.partnerApi.listSessions,
  getReport: internal.partnerApi.getReport,
  listProviders: internal.partnerApi.listProviders,
  listReferralLinks: internal.partnerApi.listReferralLinks,
  getCommercial: internal.partnerApi.getCommercial,
  listCommissions: internal.partnerApi.listCommissions,
} as const;

const MUTATION_OPS = {
  createReferral: internal.partnerApi.createReferral,
  createReferralLink: internal.partnerApi.createReferralLink,
  updateReferralLinkStatus: internal.partnerApi.updateReferralLinkStatus,
  sandboxAdvanceReferral: internal.partnerApi.sandboxAdvanceReferral,
  sandboxTriggerWebhook: internal.partnerApi.sandboxTriggerWebhook,
  submitLead: internal.partnerApi.submitLead,
  recordLinkClick: internal.partnerApi.recordLinkClick,
  idempotencyBegin: internal.partnerApi.idempotencyBegin,
  idempotencyComplete: internal.partnerApi.idempotencyComplete,
  idempotencyRelease: internal.partnerApi.idempotencyRelease,
} as const;

/** Low-risk bookkeeping writes that do not need replay protection. */
const UNGUARDED_MUTATION_OPS = {
  touchApiKey: internal.partnerApi.touchApiKey,
  logApiRequest: internal.partnerApi.logApiRequest,
} as const;

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verify(request: Request, body: string): Promise<{ ok: boolean; nonce: string }> {
  // Statically referenced so Convex injects it (dynamic env access is not supported).
  const secret = process.env.CONVEX_PARTNER_GATEWAY_SECRET;
  const timestamp = request.headers.get("X-Partner-Gateway-Timestamp") ?? "";
  const nonce = request.headers.get("X-Partner-Gateway-Nonce") ?? "";
  const signature = request.headers.get("X-Partner-Gateway-Signature") ?? "";
  if (!secret || secret.length < 32 || !nonce || nonce.length > 100 || !signature) return { ok: false, nonce };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return { ok: false, nonce };
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(["POST", PATH, timestamp, nonce, body].join("\n")));
  return { ok: constantTimeEqual(hex(mac), signature.toLowerCase()), nonce };
}

export const reserveGatewayNonce = internalMutation({
  args: { nonce: v.string() },
  handler: async (ctx, { nonce }) => {
    const existing = await ctx.db
      .query("partnerGatewayNonces")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .first();
    if (existing) return { accepted: false };
    await ctx.db.insert("partnerGatewayNonces", { nonce, expiresAt: Date.now() + 10 * 60_000 });
    return { accepted: true };
  },
});

export const rpc = httpAction(async (ctx, request) => {
  const body = await request.text();
  const { ok, nonce } = await verify(request, body);
  if (!ok) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  let parsed: { op?: unknown; args?: unknown };
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
  }
  const op = typeof parsed.op === "string" ? parsed.op : "";
  const args = (parsed.args && typeof parsed.args === "object" ? parsed.args : {}) as Record<string, unknown>;

  try {
    if (Object.prototype.hasOwnProperty.call(QUERY_OPS, op)) {
      const result = await ctx.runQuery(QUERY_OPS[op as keyof typeof QUERY_OPS] as any, args as any);
      return Response.json({ result });
    }
    if (Object.prototype.hasOwnProperty.call(UNGUARDED_MUTATION_OPS, op)) {
      const result = await ctx.runMutation(UNGUARDED_MUTATION_OPS[op as keyof typeof UNGUARDED_MUTATION_OPS] as any, args as any);
      return Response.json({ result });
    }
    if (Object.prototype.hasOwnProperty.call(MUTATION_OPS, op)) {
      const reservation = await ctx.runMutation(internal.partnerGateway.reserveGatewayNonce, { nonce });
      if (!reservation.accepted) return new Response(JSON.stringify({ error: "replay_detected" }), { status: 409 });
      const result = await ctx.runMutation(MUTATION_OPS[op as keyof typeof MUTATION_OPS] as any, args as any);
      return Response.json({ result });
    }
    return new Response(JSON.stringify({ error: "unknown_operation" }), { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("partner_gateway_failure", { op, message });
    // Argument validation failures surface here; they never contain secrets.
    return new Response(JSON.stringify({ error: "operation_failed", message: message.slice(0, 500) }), { status: 500 });
  }
});
