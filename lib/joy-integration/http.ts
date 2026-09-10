import { NextResponse } from "next/server";
import { z } from "zod";
import { JoyAuthError, verifyJoyRequest } from "./auth";

export const actorSchema = z.object({
  persona: z.enum(["patient", "physiotherapist", "family", "admin", "partner"]),
  sender_phone: z.string().min(7).max(32),
  rh_user_id: z.string().optional(),
  persona_session_id: z.string().optional(),
}).strict();

const windows = new Map<string, { count: number; resetsAt: number }>();

function checkRateLimit(key: string): void {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.resetsAt <= now) {
    windows.set(key, { count: 1, resetsAt: now + 60_000 });
    return;
  }
  entry.count += 1;
  if (entry.count > 120) throw new JoyAuthError(429, "RATE_LIMITED", "Too many Joy integration requests");
}

export function errorResponse(requestId: string, error: unknown): NextResponse {
  if (error instanceof JoyAuthError) {
    return NextResponse.json({ request_id: requestId, error: { code: error.code, message: error.message, retryable: error.status === 503 } }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ request_id: requestId, error: { code: "INVALID_REQUEST", message: "Request does not match the integration schema", retryable: false } }, { status: 400 });
  }
  console.error("joy_integration_unexpected_error", { request_id: requestId, error: error instanceof Error ? error.message : "unknown" });
  return NextResponse.json({ request_id: requestId, error: { code: "DEPENDENCY_UNAVAILABLE", message: "Integration dependency unavailable", retryable: true } }, { status: 503 });
}

export async function authenticatedJson<T>(request: Request, schema: z.ZodType<T>): Promise<{ requestId: string; data: T }> {
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > 256 * 1024) throw new JoyAuthError(400, "INVALID_REQUEST", "Request body is too large");
  const auth = verifyJoyRequest(request, body);
  checkRateLimit(auth.keyId);
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new JoyAuthError(400, "INVALID_REQUEST", "Request body must be valid JSON"); }
  return { requestId: auth.requestId, data: schema.parse(parsed) };
}

export async function authenticatedEmpty(request: Request): Promise<string> {
  const auth = verifyJoyRequest(request, "");
  checkRateLimit(auth.keyId);
  return auth.requestId;
}

export function success(requestId: string, data: unknown, status = 200): NextResponse {
  return NextResponse.json({ request_id: requestId, data }, { status });
}
