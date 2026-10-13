/**
 * Phone normalisation shared by the Next.js partner API. Must stay identical to
 * normalizePhone in convex/helpers/partnerShared.ts.
 *
 * Accepts E.164 (+2348012345678 / 002348012345678) and Nigerian local forms
 * (08012345678, 2348012345678, 8012345678). Returns E.164 or null.
 */
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let digits = raw.trim().replace(/[\s().\-]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("+")) {
    const rest = digits.slice(1);
    if (!/^\d{8,15}$/.test(rest) || rest.startsWith("0")) return null;
    return `+${rest}`;
  }
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith("234") && digits.length === 13) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;
  if (/^[789]\d{9}$/.test(digits)) return `+234${digits}`;
  return null;
}
