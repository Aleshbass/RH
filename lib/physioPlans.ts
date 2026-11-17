/**
 * Independent physiotherapist plans (owner spec "Individual pro spec-Rehabify", 17 Nov 2026):
 * Free and Individual Pro. These are the defaults; admins change every price, limit and date in
 * Admin › Physio plans (convex/physioPlans.ts physioPlanSettings) without a code change.
 * Shared by the Convex backend and the screens, so it has no server-only imports.
 */

export type PhysioPlanSettings = {
  /** Individual Pro, a month */
  proPriceKobo: number
  /** Founding physios (joined before foundingCutoff) pay this for their first foundingMonths */
  foundingPriceKobo: number
  foundingCutoff: string // "YYYY-MM-DD", Lagos; joined before the end of this day
  foundingMonths: number
  /** Free plan: different patients a month on programmes the physio covers */
  freePatientsPerMonth: number
  /** Scribe sessions a month (a session is up to 30 minutes; longer counts as 2) */
  freeScribeSessions: number
  proScribeSessions: number
  scribeTopUpKobo: number
  scribeTopUpSessions: number
  /** Joy for a patient for a month on Free, and how many Joy patients Pro includes */
  joyPerPatientKobo: number
  proJoyPatients: number
  /** Pro opens (and new physios are on Free limits) */
  launchDate: string // "YYYY-MM-DD"
  /** Everyone who hasn't upgraded is on Free limits */
  limitsDate: string // "YYYY-MM-DD"
  /** Physios outside Nigeria get Pro free as testers until their country launches */
  abroadFreePro: boolean
  /** Reminders before each renewal, days */
  reminderDays: number
  /** A failed card is retried this many days, then this much grace, then Free */
  retryDays: number
  graceDays: number
  /** Show physios the plans pop-up (founding offer) once; admins switch it on when ready */
  announceOn: boolean
}

export const DEFAULT_PHYSIO_PLAN_SETTINGS: PhysioPlanSettings = {
  proPriceKobo: 2_000_000,
  foundingPriceKobo: 1_500_000,
  foundingCutoff: '2026-11-30',
  foundingMonths: 12,
  freePatientsPerMonth: 3,
  freeScribeSessions: 3,
  proScribeSessions: 30,
  scribeTopUpKobo: 600_000,
  scribeTopUpSessions: 10,
  joyPerPatientKobo: 350_000,
  proJoyPatients: 50,
  launchDate: '2026-12-01',
  limitsDate: '2027-01-01',
  abroadFreePro: true,
  reminderDays: 3,
  retryDays: 3,
  graceDays: 7,
  announceOn: false,
}

/** Small card check to save a card before the first charge; refunded straight away. */
export const PRO_CARD_CHECK_KOBO = 5_000

export const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`

/** What each plan gives, for the plan page and the public physiotherapist page. */
export function planFeatures(s: PhysioPlanSettings) {
  return {
    free: [
      'Patients, bookings, notes and invoices',
      `Home programmes you cover for ${s.freePatientsPerMonth} different patients a month`,
      'Patients who pay for Flex themselves never count',
      `Rehabify Scribe: ${s.freeScribeSessions} sessions a month`,
      `Joy on WhatsApp: ${naira(s.joyPerPatientKobo)} per patient a month`,
    ],
    pro: [
      'Everything in Free',
      'Home programmes for every patient you see (fair use)',
      `Rehabify Scribe: ${s.proScribeSessions} sessions a month`,
      `Joy for up to ${s.proJoyPatients} patients a month included`,
      `Scribe top-ups: ${naira(s.scribeTopUpKobo)} for ${s.scribeTopUpSessions} sessions, never expire`,
    ],
  }
}

/** "1 December 2026" from "2026-12-01". */
export function dayLabel(key: string, withYear = true) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12))
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
}

/** Physios outside Nigeria (testers while their country isn't launched). */
export function isOutsideNigeria(country: string | null | undefined) {
  if (!country || !country.trim()) return false
  return !/^(ng|nga|nigeria)$/i.test(country.trim())
}
