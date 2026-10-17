import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { convexServerSecret } from '@/lib/convex-server-secret'
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter'

export const dynamic = 'force-dynamic'

/** Clerk error codes that mean "these credentials were wrong" (not network or setup errors). */
const FAILURE_CODES = new Set([
  'form_password_incorrect',
  'form_code_incorrect',
  'form_identifier_not_found',
  'verification_failed',
  'too_many_requests',
  'user_locked',
])

/**
 * Records a rejected sign-in for the admin audit log. Called by the sign-in form, so it
 * is public: it is rate-limited per IP and only stores a known error code and a masked email.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const limit = await checkRateLimit(`failed-sign-in:${ip}`, 'public_query')
  if (!limit.success) return NextResponse.json({ recorded: false }, { status: 429 })

  let body: { code?: unknown; identifier?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const code = typeof body.code === 'string' ? body.code : ''
  if (!FAILURE_CODES.has(code)) return NextResponse.json({ recorded: false })

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) return NextResponse.json({ recorded: false })
  try {
    const convex = new ConvexHttpClient(convexUrl)
    await convex.mutation(api.securityEvents.recordFailedSignIn, {
      serverSecret: convexServerSecret(),
      reason: code,
      identifier: typeof body.identifier === 'string' ? body.identifier : undefined,
      ip,
    })
    return NextResponse.json({ recorded: true })
  } catch {
    // Audit logging must never get in the way of signing in
    return NextResponse.json({ recorded: false })
  }
}
