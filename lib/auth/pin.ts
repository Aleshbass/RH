/**
 * The 4-digit PIN patients use with their phone number (convex/patientJoin.ts). Shared by the
 * join pages and the server so both refuse the same easy-to-guess PINs.
 */
export const PIN_LENGTH = 4;
export const PIN_PATTERN = /^\d{4}$/;

/** Why this PIN is too easy to guess, or null when it's fine. */
export function weakPinReason(pin: string, phone?: string | null): string | null {
  if (!PIN_PATTERN.test(pin)) return 'Enter 4 numbers.';
  if (/^(\d)\1{3}$/.test(pin)) return 'Pick a PIN that isn’t the same number four times.';
  const digits = pin.split('').map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return 'Pick a PIN that isn’t a run like 1234.';
  const phoneDigits = (phone ?? '').replace(/\D/g, '');
  if (phoneDigits.length >= 7 && phoneDigits.endsWith(pin)) return 'Pick a PIN that isn’t the end of your phone number.';
  return null;
}

/** Looks like a phone number rather than an email (sign-in accepts either). */
export function looksLikePhone(value: string) {
  const trimmed = value.trim();
  return !trimmed.includes('@') && /^\+?[\d\s()-]{7,}$/.test(trimmed);
}
