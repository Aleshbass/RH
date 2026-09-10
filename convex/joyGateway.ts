import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

async function verify(request: Request, path: string, body: string): Promise<boolean> {
  const secret = process.env.CONVEX_JOY_GATEWAY_SECRET;
  const timestamp = request.headers.get("X-Joy-Gateway-Timestamp") ?? "";
  const nonce = request.headers.get("X-Joy-Gateway-Nonce") ?? "";
  const signature = request.headers.get("X-Joy-Gateway-Signature") ?? "";
  if (!secret || !nonce || !signature || !Number.isFinite(Number(timestamp)) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const result = await crypto.subtle.sign("HMAC", key, encoder.encode([request.method, path, timestamp, nonce, body].join("\n")));
  return equal(hex(result), signature);
}

async function readJson(request: Request, path: string): Promise<{ body: string; nonce: string; data: Record<string, unknown> } | Response> {
  const body = await request.text();
  if (!(await verify(request, path, body))) return new Response("Unauthorized", { status: 401 });
  try { return { body, nonce: request.headers.get("X-Joy-Gateway-Nonce")!, data: JSON.parse(body) }; } catch { return new Response("Invalid JSON", { status: 400 }); }
}

async function reserveNonce(ctx: { runMutation: Function }, nonce: string): Promise<boolean> {
  const result = await ctx.runMutation((internal as any).joyIntegration.recordGatewayNonce, { nonce, expiresAt: Date.now() + 5 * 60_000 });
  return result.accepted === true;
}

// This is intentionally a fixed allowlist, not a generic Convex function dispatcher.
export const recordExternalRequest = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/record_external_request");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.request_id !== "string" || typeof parsed.data.expires_at !== "number") return new Response("Invalid payload", { status: 400 });
  // `internal` is generated at deploy time; keep this static route-to-function mapping
  // explicit while allowing local Next type checks before Convex code generation runs.
  return Response.json(await ctx.runMutation((internal as any).joyIntegration.recordExternalRequest, { requestId: parsed.data.request_id, expiresAt: parsed.data.expires_at }));
});

export const resolvePatient = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/resolve_patient");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.phone !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runQuery((internal as any).joyIntegration.resolvePatientByPhone, { phone: parsed.data.phone }));
});

export const resolvePhysiotherapist = httpAction(async (ctx, request) => {
  const parsed = await readJson(request, "/joy-integration/resolve_physiotherapist");
  if (parsed instanceof Response) return parsed;
  if (!(await reserveNonce(ctx, parsed.nonce))) return new Response("Replay detected", { status: 409 });
  if (typeof parsed.data.phone !== "string") return new Response("Invalid payload", { status: 400 });
  return Response.json(await ctx.runQuery((internal as any).joyIntegration.resolvePhysiotherapistByPhone, { phone: parsed.data.phone }));
});
