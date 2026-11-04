/**
 * Umami (cookieless page and visit counts), loaded only after someone says yes to analytics
 * (components/consent/ConsentProvider.tsx). Every hit passes through rehabifyUmamiBeforeSend
 * (the script's data-before-send), which applies the same rules as PostHog
 * (lib/analytics/privacy.ts): nothing from patient or private-link pages, no codes, ids, query
 * strings or page titles (titles can name a patient).
 */
import { isPrivatePath, scrubPath, scrubUrl } from './privacy'

export const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL || 'https://yoursiteanalytics.vercel.app/script.js'
export const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || '537a4f5b-e1a6-4e59-9b62-47e5681f8235'
// The read-only dashboard shown in Admin › Website analytics
export const UMAMI_SHARE_URL =
  process.env.NEXT_PUBLIC_UMAMI_SHARE_URL || 'https://yoursiteanalytics.vercel.app/share/COWNyDXv9n5cAgSV'
export const UMAMI_BEFORE_SEND = 'rehabifyUmamiBeforeSend'

type UmamiPayload = { url?: string; referrer?: string; title?: string; [key: string]: unknown }

export function umamiBeforeSend(_type: string, payload: UmamiPayload): UmamiPayload | false {
  const path = typeof window !== 'undefined' ? window.location.pathname : payload.url ?? '/'
  if (isPrivatePath(path) || (payload.url && isPrivatePath(payload.url))) return false
  const next: UmamiPayload = { ...payload }
  if (typeof next.url === 'string') next.url = scrubPath(next.url)
  if (typeof next.referrer === 'string' && next.referrer) next.referrer = scrubUrl(next.referrer)
  delete next.title
  return next
}

// Installed when this module loads (before the script, which is added only after consent)
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>)[UMAMI_BEFORE_SEND] = umamiBeforeSend
}
