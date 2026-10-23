import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter'

/** Analytics payloads are small; anything bigger is refused before it reaches Convex. */
const MAX_BODY_BYTES = 8 * 1024

/**
 * Shared checks for the /api/analytics/* routes, which write to Convex with the server secret:
 * a per-IP rate limit, a size cap, and the signed-in user taken from the session (a userId
 * in the request body is ignored, so nobody can attribute events to someone else).
 */
export async function guardAnalyticsRequest(
  request: NextRequest
): Promise<{ ok: true; body: Record<string, any>; userId?: string } | { ok: false; response: NextResponse }> {
  const limit = await checkRateLimit(`analytics:${getClientIp(request)}`, 'public_query')
  if (!limit.success) return { ok: false, response: createRateLimitResponse({ rateLimitResult: limit }) }

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: NextResponse.json({ error: 'Payload too large' }, { status: 413 }) }
  }
  if (!text.trim()) return { ok: false, response: NextResponse.json({ success: true }) }

  let body: Record<string, any>
  try {
    body = JSON.parse(text)
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, response: NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }
  }

  const { userId } = await auth()
  return { ok: true, body, userId: userId ?? undefined }
}
