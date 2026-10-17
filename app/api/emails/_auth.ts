import type { NextRequest } from 'next/server'
import { viewerHasRole } from '@/lib/auth/serverViewer'

/**
 * Who may call the internal email routes. These routes send mail from Rehabify's domain,
 * so they are never open to the public: either our own server calls them (holding
 * CONVEX_SERVER_SECRET in this header) or a signed-in admin does.
 */
export const SERVER_SECRET_HEADER = 'x-rehabify-server-secret'

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** True when the request carries our server secret (server-to-server call). */
export function isServerRequest(request: NextRequest): boolean {
  const expected = process.env.CONVEX_SERVER_SECRET
  const provided = request.headers.get(SERVER_SECRET_HEADER)
  if (!expected || expected.length < 32 || !provided) return false
  return constantTimeEqual(provided, expected)
}

/** Our server, or a signed-in Rehabify admin. */
export async function isServerOrAdmin(request: NextRequest): Promise<boolean> {
  if (isServerRequest(request)) return true
  return viewerHasRole(['admin'])
}

/** Escape text before putting it into an email's HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
