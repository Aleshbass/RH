/**
 * Rehabify's policies and agreements, with the version people accept. When a document's wording
 * changes, publish it with a new version (its effective date): people are asked to accept the new
 * version the next time it applies to them. Acceptances are stored append-only in Convex
 * (`policyAcceptances`), so the version someone accepted is never overwritten.
 */

export type PolicyId = 'terms' | 'privacy' | 'payment_policy' | 'booking_policy' | 'payout_policy' | 'cookie_policy';

export type PolicyDocument = { id: PolicyId; title: string; href: string; version: string };

export const POLICIES: Record<PolicyId, PolicyDocument> = {
  terms: { id: 'terms', title: 'Terms of Service', href: '/terms-and-conditions', version: '2026-10-26' },
  privacy: { id: 'privacy', title: 'Privacy Policy', href: '/privacy-policy', version: '2026-10-26' },
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

export function policyVersions(ids: PolicyId[]): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, POLICIES[id].version]));
}
