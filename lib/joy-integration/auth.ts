import { createHash, createHmac, timingSafeEqual } from "crypto";

export const JOY_API_VERSION = "1";
const MAX_SKEW_SECONDS = 300;

export type JoyAuthentication = {
  requestId: string;
  keyId: string;
};

export class JoyAuthError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 409 | 429 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function header(request: Request, name: string): string {
  return request.headers.get(name) ?? "";
}

function sha256(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}
export function signaturePayload(request: Request, body: string): string {
  const target = new URL(request.url);
  return [
    request.method.toUpperCase(),
    `${target.pathname}${target.search}`,
    header(request, "X-Timestamp"),
    header(request, "X-Request-Id"),
    header(request, "Idempotency-Key"),
    header(request, "X-Actor-Context"),
    sha256(body),
  ].join("\n");
}

export function signJoyRequest(request: Request, body: string, secret: string): string {
  return createHmac("sha256", secret).update(signaturePayload(request, body), "utf8").digest("hex");
}

export function verifyJoyRequest(request: Request, body: string): JoyAuthentication {
  const secret = process.env.JOY_RH_INBOUND_HMAC_SECRET;
  const expectedKeyId = process.env.JOY_RH_INBOUND_KEY_ID;
  if (!secret || !expectedKeyId) {
    throw new JoyAuthError(503, "INTEGRATION_NOT_CONFIGURED", "Joy integration is not configured");
  }

  const requestId = header(request, "X-Request-Id");
  const keyId = header(request, "X-Key-Id");
  const signature = header(request, "X-Signature");
  const timestamp = Number(header(request, "X-Timestamp"));
  if (header(request, "X-Joy-Api-Version") !== JOY_API_VERSION || !requestId || !keyId || !signature || !Number.isFinite(timestamp)) {
    throw new JoyAuthError(400, "INVALID_AUTH_HEADERS", "Missing or invalid Joy authentication headers");
  }
  if (keyId !== expectedKeyId) {
    throw new JoyAuthError(401, "UNAUTHENTICATED", "Invalid Joy credentials");
  }
  if (Math.abs(Date.now() / 1000 - timestamp) > MAX_SKEW_SECONDS) {
    throw new JoyAuthError(401, "SIGNATURE_EXPIRED", "Joy request timestamp is outside the accepted window");
  }

  const expected = signJoyRequest(request, body, secret);
  const received = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (received.length !== expectedBuffer.length || !timingSafeEqual(received, expectedBuffer)) {
    throw new JoyAuthError(401, "UNAUTHENTICATED", "Invalid Joy credentials");
  }
  return { requestId, keyId };
}
