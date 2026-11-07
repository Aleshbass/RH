/**
 * How long a physiotherapist has to accept a paid Rehabify Care booking (Consultation and
 * Booking Policy 5.4): 2 hours (owner decision, Nov 2026; it was 5 hours, or 1 hour within 8
 * hours). Never later than 10 minutes before the start. Shared by website and Joy bookings.
 */
const HOUR = 60 * 60 * 1000;

export const RESPONSE_HOURS = 2;

export function providerResponseDueAt(now: number, sessionStart?: number): number {
  const due = now + RESPONSE_HOURS * HOUR;
  if (sessionStart === undefined) return due;
  return Math.max(now + 10 * 60 * 1000, Math.min(due, sessionStart - 10 * 60 * 1000));
}
