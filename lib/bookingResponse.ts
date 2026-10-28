/**
 * How long a physiotherapist has to accept a paid Rehabify Care booking (Consultation and
 * Booking Policy 5.4): 5 hours, or 1 hour when the appointment starts within the next 8 hours.
 * Never later than 10 minutes before the start. Shared by website and Joy bookings.
 */
const HOUR = 60 * 60 * 1000;

export const RESPONSE_HOURS = 5;
export const SOON_RESPONSE_HOURS = 1;
export const SOON_WITHIN_HOURS = 8;

export function providerResponseDueAt(now: number, sessionStart?: number): number {
  const soon = sessionStart !== undefined && sessionStart - now <= SOON_WITHIN_HOURS * HOUR;
  const due = now + (soon ? SOON_RESPONSE_HOURS : RESPONSE_HOURS) * HOUR;
  if (sessionStart === undefined) return due;
  return Math.max(now + 10 * 60 * 1000, Math.min(due, sessionStart - 10 * 60 * 1000));
}
