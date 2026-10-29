/**
 * Rehabify's policies and agreements, with the version people accept. When a document's wording
 * changes, publish it with a new version (its effective date): people are asked to accept the new
 * version the next time it applies to them. Acceptances are stored append-only in Convex
 * (`policyAcceptances`), so the version someone accepted is never overwritten.
 */

export type PolicyId =
  | 'terms'
  | 'privacy'
  | 'health_data'
  | 'payment_policy'
  | 'booking_policy'
  | 'payout_policy'
  | 'cookie_policy';

export type PolicyDocument = { id: PolicyId; title: string; href: string; version: string };

export const POLICIES: Record<PolicyId, PolicyDocument> = {
  terms: { id: 'terms', title: 'Terms of Service', href: '/terms-and-conditions', version: '2026-10-26' },
  privacy: { id: 'privacy', title: 'Privacy Policy', href: '/privacy-policy', version: '2026-10-26' },
  // No longer asked (the owner removed it, 2026-10-29): kept only so acceptances already recorded
  // under this id still have a title and link.
  health_data: {
    id: 'health_data',
    title: 'Health information consent',
    href: '/privacy-policy#why-we-use-your-data-and-our-lawful-bases',
    version: '2026-10-26',
  },
  payment_policy: { id: 'payment_policy', title: 'Payment Policy', href: '/payment-policy', version: '2026-10-26' },
  // Same version Joy sends (lib/joy-integration/consultation-booking-policy.ts)
  booking_policy: {
    id: 'booking_policy',
    title: 'Consultation & Booking Policy',
    href: '/consultation-booking-policy',
    version: '2026-10-26',
  },
  payout_policy: { id: 'payout_policy', title: 'Payout Policy', href: '/payout-policy', version: '2026-10-23' },
  cookie_policy: { id: 'cookie_policy', title: 'Cookie Policy', href: '/cookie-policy', version: '2026-10-26' },
};

/** What a patient agrees to before paying for a booking on the website. */
export const CHECKOUT_POLICIES: PolicyId[] = ['booking_policy', 'payment_policy'];

/** Shown to patients in their dashboard. */
export const PATIENT_POLICIES: PolicyId[] = ['terms', 'privacy', 'payment_policy', 'booking_policy', 'cookie_policy'];

/** Shown to clinicians in their dashboard (with their signed agreement). */
export const CLINICIAN_POLICIES: PolicyId[] = ['payout_policy', 'terms', 'privacy'];

/**
 * What every patient accepts before using Rehabify: at sign-up on the web, in the dashboard if they
 * joined before this was asked, or at their first chat with Joy on WhatsApp.
 */
export const PATIENT_CONSENT_POLICIES: PolicyId[] = ['terms', 'privacy'];

/** What physiotherapists and clinic owners accept when they submit their application. */
export const PROFESSIONAL_SIGNUP_POLICIES: PolicyId[] = ['terms', 'privacy'];

const CONSENT_ACCEPTANCE_TEXT: Partial<Record<PolicyId, string>> = {
  terms: 'I agree to the Terms of Service.',
  privacy: 'I agree to the Privacy Policy.',
};

/**
 * The consent documents as Joy receives them (GET /api/v1/joy/policy/consents and the patient
 * resolve response), with absolute links on `origin`. Joy accepts by sending back
 * { policy_id: version } (operation patient_record_consents).
 */
export function consentDocumentsForJoy(ids: PolicyId[], origin: string) {
  return ids.map((id) => ({
    policy_id: id,
    title: POLICIES[id].title,
    version: POLICIES[id].version,
    url: `${origin.replace(/\/$/, '')}${POLICIES[id].href}`,
    acceptance_text: CONSENT_ACCEPTANCE_TEXT[id] ?? `I agree to the ${POLICIES[id].title}.`,
  }));
}

export function policyVersions(ids: PolicyId[]): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, POLICIES[id].version]));
}
