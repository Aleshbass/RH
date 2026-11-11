/**
 * Patients who book through Joy get a Rehabify login without giving an email: Clerk needs an
 * identifier, and phone sign-in is a paid Clerk feature, so the login uses a private address
 * on this domain. The domain has no DNS records, so nothing sent there is delivered to anyone;
 * the patient signs in with one-tap links from Joy until they add their own email.
 */
export const JOY_LOGIN_EMAIL_DOMAIN = "patients.physioaroundme.com";

export function joyLoginEmail(patientId: string) {
  return `wa-${patientId.toLowerCase()}@${JOY_LOGIN_EMAIL_DOMAIN}`;
}

/**
 * Patients a physio or clinic invited on WhatsApp sign in with phone + PIN (convex/patientJoin.ts);
 * their Clerk login uses a private address on the same undeliverable domain.
 */
export function pinLoginEmail(patientId: string) {
  return `pt-${patientId.toLowerCase()}@${JOY_LOGIN_EMAIL_DOMAIN}`;
}

/** Any private login address Rehabify made (Joy's or a phone + PIN login): never a real inbox. */
export function isJoyLoginEmail(email: string | null | undefined) {
  return !!email && email.trim().toLowerCase().endsWith(`@${JOY_LOGIN_EMAIL_DOMAIN}`);
}

/** Only Joy's WhatsApp logins (wa-…): this person uses Rehabify through Joy. */
export function isJoyWhatsAppLoginEmail(email: string | null | undefined) {
  return isJoyLoginEmail(email) && email!.trim().toLowerCase().startsWith("wa-");
}

type ClerkEmails = {
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses: { emailAddress: string; verification?: { status?: string | null } | null }[];
};

/**
 * The person's real email for receipts and checkout: never the Joy login placeholder. A Joy
 * patient's added email starts as a secondary address, so a verified one counts too.
 */
export function usableEmail(user: ClerkEmails | null | undefined): string | null {
  if (!user) return null;
  const primary = user.primaryEmailAddress?.emailAddress;
  if (primary && !isJoyLoginEmail(primary)) return primary;
  return (
    user.emailAddresses.find((e) => e.verification?.status === "verified" && !isJoyLoginEmail(e.emailAddress))?.emailAddress ?? null
  );
}
