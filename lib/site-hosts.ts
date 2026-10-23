/**
 * Areas of the site that move to their own host once the matching env var is set:
 *   NEXT_PUBLIC_LEARN_URL=https://learn.physioaroundme.com  (Rehabify Learn, /learn)
 *   NEXT_PUBLIC_ADMIN_URL=https://admin.physioaroundme.com  (admin dashboard, /dashboard/admin)
 * Until then they are served from the main site as before.
 */
function hostOf(url: string | null): string | null {
  return url ? new URL(url).host.toLowerCase() : null
}

export const LEARN_URL = process.env.NEXT_PUBLIC_LEARN_URL?.replace(/\/+$/, '') || null
export const LEARN_HOST = hostOf(LEARN_URL)

export const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL?.replace(/\/+$/, '') || null
export const ADMIN_HOST = hostOf(ADMIN_URL)

/** Public URL of a Learn page; `path` is relative to the program root ('' or '/register'). */
export function learnUrl(path = ''): string {
  return LEARN_URL ? `${LEARN_URL}${path || '/'}` : `/learn${path}`
}
