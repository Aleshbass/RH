/**
 * Canonical policy metadata exposed to the service-to-service Joy API.
 *
 * The legal content and approval record must be supplied by Rehabify before
 * this is changed to APPROVED. Keeping DRAFT here makes every consumer fail
 * closed instead of silently accepting an unpublished policy.
 */
export const consultationBookingPolicy = {
  policy_id: "consultation-booking-policy",
  version: "draft-2026-09-10",
  url: "https://physioaroundme.com/consultation-booking-policy",
  content_sha256: "UNPUBLISHED",
  effective_at: null,
  acceptance_text: "I accept the Consultation & Booking Policy.",
  language: "en",
  approval_status: "DRAFT" as const,
};
