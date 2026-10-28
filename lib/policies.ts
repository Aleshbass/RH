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
  // Explicit consent for health data (NDPA s.30, GAID): processing it to provide care (Privacy Policy
  // section 3) and storing or processing it outside Nigeria through service providers (section 6).
  // The link is the anchor PolicyPage builds from the section title (components/legal/PolicyPage.tsx).
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
export const PATIENT_POLICIES: PolicyId[] = ['terms', 'privacy', 'health_data', 'payment_policy', 'booking_policy', 'cookie_policy'];

/** Shown to clinicians in their dashboard (with their signed agreement). */
export const CLINICIAN_POLICIES: PolicyId[] = ['payout_policy', 'terms', 'privacy'];

/**
 * What every patient accepts before using Rehabify: at sign-up on the web, in the dashboard if they
 * joined before this was asked, or at their first chat with Joy on WhatsApp.
 */
export const PATIENT_CONSENT_POLICIES: PolicyId[] = ['terms', 'privacy', 'health_data'];

/** What physiotherapists and clinic owners accept when they submit their application. */
export const PROFESSIONAL_SIGNUP_POLICIES: PolicyId[] = ['terms', 'privacy'];

/** Where the transfer part of the health information consent is explained. */
export const HEALTH_DATA_TRANSFER_HREF = '/privacy-policy#transfers-outside-nigeria';

/**
 * The words of the health information consent, the same on the web and on WhatsApp. Kept apart
 * from the Terms and Privacy tick so it is explicit, as the NDPA requires for health data.
 */
export const HEALTH_DATA_CONSENT_TEXT =
  'I agree that Rehabify may use my health information to provide my care, and that it may be stored or processed outside Nigeria by Rehabify’s service providers, as the Privacy Policy explains.';

const CONSENT_ACCEPTANCE_TEXT: Partial<Record<PolicyId, string>> = {
  terms: 'I agree to the Terms of Service.',
  privacy: 'I agree to the Privacy Policy.',
  health_data: HEALTH_DATA_CONSENT_TEXT,
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
