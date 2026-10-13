/**
 * Partner referral-link attribution (client side).
 *
 * The attribution cookie is set SERVER-SIDE by middleware.ts when a visitor opens
 * /r/<code>: `rhb_partner_ref`, 30 days, on the parent domain (.physioaroundme.com) so it
 * survives moving between subdomains and through Clerk sign-up/OAuth redirects.
 *
 * Only the public link code is stored. The partner is always resolved and validated on
 * the server (active, unexpired, live link of an approved partner), so editing this
 * value cannot attribute a patient to an arbitrary partner.
 */

export const REFERRAL_COOKIE_NAME = "rhb_partner_ref";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const STORAGE_KEY = "rhb_partner_ref";
const CODE_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

export interface PartnerReferralAttribution {
  publicCode: string;
  capturedAt: number;
  expiresAt: number;
}

function parse(raw: string | null | undefined): PartnerReferralAttribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PartnerReferralAttribution>;
    if (!parsed || typeof parsed.publicCode !== "string" || !CODE_PATTERN.test(parsed.publicCode)) return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) return null;
    return { publicCode: parsed.publicCode, capturedAt: parsed.capturedAt ?? 0, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

/** Mirrors the server cookie into localStorage (fallback for browsers that drop cookies). */
export function rememberReferralCode(publicCode: string): void {
  if (typeof window === "undefined" || !CODE_PATTERN.test(publicCode)) return;
  try {
    const now = Date.now();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ publicCode, capturedAt: now, expiresAt: now + REFERRAL_COOKIE_MAX_AGE_SECONDS * 1000 })
    );
  } catch {
    /* storage unavailable (private mode) */
  }
}

/** The most recent unexpired referral-link code, from the cookie or the local mirror. */
export function getPartnerReferralCookie(): PartnerReferralAttribution | null {
  if (typeof document === "undefined") return null;
  try {
    const cookies = document.cookie.split("; ").filter((row) => row.startsWith(`${REFERRAL_COOKIE_NAME}=`));
    for (const row of cookies) {
      const value = parse(decodeURIComponent(row.slice(REFERRAL_COOKIE_NAME.length + 1)));
      if (value) return value;
    }
  } catch {
    /* malformed cookie */
  }
  try {
    const stored = parse(window.localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  return null;
}

export function getReferralPublicCode(): string | undefined {
  return getPartnerReferralCookie()?.publicCode;
}

/** Clears the local copy after it has been claimed (the cookie simply expires). */
export function clearPartnerReferralCookie(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
