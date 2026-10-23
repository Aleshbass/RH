import { createHmac, timingSafeEqual } from 'crypto';

/**
 * MediLoan webhook verification (https://myitura.com/api-docs/mediloan, "Webhooks").
 *
 *   X-MyItura-Signature-V2  lowercase hex HMAC-SHA256 of "<timestamp>.<raw body>", keyed with the
 *                           webhook signing secret (whsec_test_… / whsec_live_…)
 *   X-MyItura-Timestamp     Unix seconds of this attempt
 *   X-MyItura-Signature     legacy: HMAC-SHA256 of the body only (no timestamp)
 *   X-MyItura-Delivery-Id   unique per attempt (we de-duplicate on it)
 *   X-MyItura-Event         the event name
 *
 * The V2 signature is required when MyItura sends it, and its timestamp must be within five
 * minutes. A delivery that only carries the legacy signature is accepted (it still proves
 * MyItura signed it); replays of it are harmless because statuses only move forward and
 * deliveries are de-duplicated.
 */

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

type HeaderSource = { get(name: string): string | null };

export type WebhookVerification =
  | { ok: true; scheme: 'v2' | 'legacy' }
  | { ok: false; reason: 'not_configured' | 'missing_signature' | 'bad_signature' | 'stale_timestamp' };

function safeEqualHex(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided.trim().toLowerCase().replace(/^sha256=/, ''), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signV2(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

export function signLegacy(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

export function verifyMyIturaWebhook(args: {
  rawBody: string;
  headers: HeaderSource;
  secret: string | undefined;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): WebhookVerification {
  const { rawBody, headers, secret } = args;
  if (!secret) return { ok: false, reason: 'not_configured' };

  const v2 = headers.get('x-myitura-signature-v2');
  if (v2) {
    const timestamp = (headers.get('x-myitura-timestamp') || '').trim();
    if (!/^\d+$/.test(timestamp)) return { ok: false, reason: 'stale_timestamp' };
    const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > (args.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS)) {
      return { ok: false, reason: 'stale_timestamp' };
    }
    return safeEqualHex(signV2(secret, timestamp, rawBody), v2) ? { ok: true, scheme: 'v2' } : { ok: false, reason: 'bad_signature' };
  }

  const legacy = headers.get('x-myitura-signature');
  if (legacy) {
    return safeEqualHex(signLegacy(secret, rawBody), legacy) ? { ok: true, scheme: 'legacy' } : { ok: false, reason: 'bad_signature' };
  }
  return { ok: false, reason: 'missing_signature' };
}

/** The references a webhook carries, wherever MyItura put them. */
export function webhookReferences(body: Record<string, any>) {
  const data = (body?.data ?? {}) as Record<string, any>;
  const pick = (...values: unknown[]) => values.find((v) => typeof v === 'string' && v.length > 0) as string | undefined;
  return {
    event: pick(body?.event, body?.type, body?.eventType) ?? '',
    sdkReference: pick(data.sdkReference, data.sdkRef, body?.sdkReference),
    clientReference: pick(data.clientReference, body?.clientReference),
    loanId: pick(data.loanId, data.id, body?.loanId),
    status: pick(data.status),
    amountApprovedKobo: typeof data.amountApproved === 'number' ? data.amountApproved : undefined,
  };
}
