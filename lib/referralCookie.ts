/**
 * Enterprise Referral Code Cookie & Storage Persistence Utility
 * 
 * Provides robust 30-day attribution tracking across patient sessions.
 * Uses a dual-layer strategy:
 * 1. Primary: 30-day document.cookie (path=/, SameSite=Lax, Secure on HTTPS)
 * 2. Secondary: localStorage mirrored fallback (for Safari ITP / mobile WebView resilience)
 */

export const REFERRAL_COOKIE_NAME = "rhb_partner_ref";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days (2,592,000 seconds)

export interface PartnerReferralAttribution {
  publicCode: string;
  partnerId: string;
  campaignName?: string;
  capturedAt: number;
  expiresAt: number;
}

/**
 * Sets a 30-day persistent referral attribution cookie and localStorage record.
 */
export function setPartnerReferralCookie(params: {
  publicCode: string;
  partnerId: string;
  campaignName?: string;
}): PartnerReferralAttribution | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  try {
    const now = Date.now();
    const expiresAt = now + REFERRAL_COOKIE_MAX_AGE_SECONDS * 1000;

    const attribution: PartnerReferralAttribution = {
      publicCode: params.publicCode.trim(),
      partnerId: params.partnerId.trim(),
      campaignName: params.campaignName?.trim() || undefined,
      capturedAt: now,
      expiresAt,
    };

    const serialized = encodeURIComponent(JSON.stringify(attribution));

    // Determine security flags
    const isSecure = window.location.protocol === "https:";
    const secureFlag = isSecure ? "; Secure" : "";
    const cookieString = `${REFERRAL_COOKIE_NAME}=${serialized}; Max-Age=${REFERRAL_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secureFlag}`;

    // 1. Set Primary Cookie
    document.cookie = cookieString;

    // 2. Set Secondary Fallback in localStorage
    try {
      window.localStorage.setItem(REFERRAL_COOKIE_NAME, JSON.stringify(attribution));
    } catch {
      // Ignore localStorage quotas or incognito restrictions
    }

    // 3. Set Tertiary Fallback in sessionStorage
    try {
      window.sessionStorage.setItem(REFERRAL_COOKIE_NAME, JSON.stringify(attribution));
    } catch {
      // Ignore sessionStorage quotas
    }

    return attribution;
  } catch (error) {
    console.error("[REFERRAL COOKIE] Failed to set referral persistence:", error);
    return null;
  }
}

/**
 * Retrieves the active partner referral attribution if present and unexpired.
 * Checks document.cookie first, then localStorage, then sessionStorage.
 */
export function getPartnerReferralCookie(): PartnerReferralAttribution | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const now = Date.now();

  // 1. Try reading from document.cookie
  try {
    const cookieMatch = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${REFERRAL_COOKIE_NAME}=`));

    if (cookieMatch) {
      const value = decodeURIComponent(cookieMatch.split("=")[1] || "");
      if (value) {
        const parsed = JSON.parse(value) as PartnerReferralAttribution;
        if (parsed && parsed.expiresAt && parsed.expiresAt > now) {
          return parsed;
        }
      }
    }
  } catch (error) {
    console.debug("[REFERRAL COOKIE] Cookie parsing failed:", error);
  }

  // 2. Fallback to localStorage
  try {
    const localVal = window.localStorage.getItem(REFERRAL_COOKIE_NAME);
    if (localVal) {
      const parsed = JSON.parse(localVal) as PartnerReferralAttribution;
      if (parsed && parsed.expiresAt && parsed.expiresAt > now) {
        return parsed;
      } else {
        window.localStorage.removeItem(REFERRAL_COOKIE_NAME);
      }
    }
  } catch {
    // Ignore localStorage read errors
  }

  // 3. Fallback to sessionStorage
  try {
    const sessionVal = window.sessionStorage.getItem(REFERRAL_COOKIE_NAME);
    if (sessionVal) {
      const parsed = JSON.parse(sessionVal) as PartnerReferralAttribution;
      if (parsed && parsed.expiresAt && parsed.expiresAt > now) {
        return parsed;
      } else {
        window.sessionStorage.removeItem(REFERRAL_COOKIE_NAME);
      }
    }
  } catch {
    // Ignore sessionStorage read errors
  }

  return null;
}

/**
 * Clears the referral attribution from cookies and browser storages.
 */
export function clearPartnerReferralCookie(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  try {
    document.cookie = `${REFERRAL_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
    window.localStorage.removeItem(REFERRAL_COOKIE_NAME);
    window.sessionStorage.removeItem(REFERRAL_COOKIE_NAME);
  } catch {
    // Ignore cleanup errors
  }
}
