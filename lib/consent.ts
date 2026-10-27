/**
 * Cookie consent: what we store, why, and the visitor's choice.
 *
 * The choice lives in a first-party cookie (`rh_consent`) on the parent domain, so it is
 * read before anything optional loads and is shared by learn., admin. and partners.
 * Every decision is also recorded in Convex (convex/cookieConsent.ts) as proof of consent,
 * and for signed-in people it follows them to other devices.
 *
 * The banner, the settings panel and the cookie policy page all read COOKIE_CATEGORIES, so
 * they can never disagree. Bump CONSENT_VERSION when a category or optional tool is added:
 * everyone is asked again.
 */

export const CONSENT_COOKIE = 'rh_consent'
export const CONSENT_VERSION = 1
export const CONSENT_MAX_AGE_DAYS = 365
/** Fired on window whenever the choice changes (detail: Consent | null). */
export const CONSENT_EVENT = 'rehabify:consent-changed'

export type ConsentChoices = { analytics: boolean }
export type ConsentAction = 'accept_all' | 'reject_all' | 'custom' | 'gpc'
export type Consent = ConsentChoices & {
  /** Random id for this browser's choice; links it to its record in Convex. */
  id: string
  version: number
  action: ConsentAction
  decidedAt: number
}

export type CookieItem = { name: string; provider: string; purpose: string; duration: string }
export type CookieCategory = {
  id: 'essential' | keyof ConsentChoices
  title: string
  description: string
  required: boolean
  items: CookieItem[]
}

export const COOKIE_CATEGORIES: CookieCategory[] = [
  {
    id: 'essential',
    title: 'Essential',
    description:
      'Keep you signed in, keep payments and your account secure, link a referral you followed, and remember your choices. The site can’t work without these.',
    required: true,
    items: [
      { name: '__session, __client_uat, __clerk_*', provider: 'Clerk (sign-in)', purpose: 'Keeps you signed in securely', duration: 'Session to 1 year' },
      { name: 'rh_consent', provider: 'Rehabify', purpose: 'Remembers your cookie choices', duration: '1 year' },
      {
        name: 'rhb_partner_ref',
        provider: 'Rehabify',
        purpose: 'When you open a referral link from a doctor, clinic or partner, links your sign-up or booking to them',
        duration: '30 days',
      },
      {
        name: 'Browser storage',
        provider: 'Rehabify',
        purpose: 'Remembers settings you choose, such as sounds, theme and your last search',
        duration: 'Until you clear it',
      },
      { name: 'Paystack cookies', provider: 'Paystack', purpose: 'Secure card and bank payments on Paystack’s checkout', duration: 'Set by Paystack' },
      {
        name: 'Error reports',
        provider: 'Sentry',
        purpose: 'Tells us when something breaks, with personal details removed. Sets no cookies',
        duration: '—',
      },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    description:
      'Count visits and see which pages are used, so we can improve Rehabify. Reports are anonymous: they never include your name, health details or what you type.',
    required: false,
    items: [
      { name: 'Umami', provider: 'Rehabify (self-hosted)', purpose: 'Anonymous page and visit counts. Sets no cookies', duration: '—' },
      {
        name: 'PostHog',
        provider: 'PostHog (EU cloud)',
        purpose: 'Which pages and features are used, without recording your screen. Never on your care pages',
        duration: 'Up to 1 year',
      },
    ],
  },
]

/**
 * Videos from YouTube and Google Drive only load when you press play, and then follow those
 * services' own cookie rules (YouTube runs in its privacy-enhanced mode).
 */
export const PLAY_TO_LOAD_NOTE =
  'Videos from YouTube and Google Drive only load when you press play. They then follow those services’ own cookie rules.'

export const DEFAULT_CHOICES: ConsentChoices = { analytics: false }

// ─────────────────────────────────────────────────────────────────────────────
// Cookie format: v1.<id>.<a0|a1>.<decidedAt base36>.<action letter>
// (no JSON, so nothing needs escaping)
// ─────────────────────────────────────────────────────────────────────────────

const ID = /^[a-z0-9-]{8,64}$/i
const ACTION_CODES: Record<ConsentAction, string> = { accept_all: 'A', reject_all: 'R', custom: 'C', gpc: 'G' }

export function serializeConsent(consent: Consent) {
  return [
    `v${consent.version}`,
    consent.id,
    consent.analytics ? 'a1' : 'a0',
    consent.decidedAt.toString(36),
    ACTION_CODES[consent.action],
  ].join('.')
}

/** The stored choice, or null when there's none or it was made for an older version. */
export function parseConsent(raw: string | null | undefined): Consent | null {
  if (!raw) return null
  const [version, id, analytics, decided, code] = decodeURIComponent(raw).split('.')
  const v = Number(version?.slice(1))
  const decidedAt = parseInt(decided ?? '', 36)
  const action = (Object.keys(ACTION_CODES) as ConsentAction[]).find((key) => ACTION_CODES[key] === code)
  if (v !== CONSENT_VERSION || !ID.test(id ?? '') || !['a0', 'a1'].includes(analytics ?? '') || !Number.isFinite(decidedAt) || !action) {
    return null
  }
  return { version: v, id, analytics: analytics === 'a1', action, decidedAt }
}

export function newConsentId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** ".physioaroundme.com" on the live site, so every subdomain shares one choice. */
function cookieDomain(host: string) {
  return host === 'physioaroundme.com' || host.endsWith('.physioaroundme.com') ? '; domain=.physioaroundme.com' : ''
}

export function readConsentCookie(): Consent | null {
  if (typeof document === 'undefined') return null
  const row = document.cookie.split('; ').find((part) => part.startsWith(`${CONSENT_COOKIE}=`))
  return parseConsent(row?.slice(CONSENT_COOKIE.length + 1))
}

export function writeConsentCookie(consent: Consent) {
  if (typeof document === 'undefined') return
  const secure = window.location.protocol === 'https:' ? '; secure' : ''
  document.cookie =
    `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent(consent))}; path=/; max-age=${CONSENT_MAX_AGE_DAYS * 86_400}` +
    `; samesite=lax${secure}${cookieDomain(window.location.hostname)}`
}
