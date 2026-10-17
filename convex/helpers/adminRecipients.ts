/**
 * Where Rehabify's internal notification emails go from Convex. ADMIN_EMAIL (Convex env)
 * may hold several addresses separated by commas; without it the team inboxes below are
 * used. Keep in sync with lib/email/adminRecipients.ts.
 */
export const DEFAULT_PLATFORM_ADMIN_EMAILS = ["rehabify.app@gmail.com", "hello@myrehabifyhealth.com"];

export function platformAdminEmails(): string[] {
  const configured = (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.includes("@"));
  return configured.length > 0 ? configured : DEFAULT_PLATFORM_ADMIN_EMAILS;
}
