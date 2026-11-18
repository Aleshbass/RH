/**
 * When Resend refuses an email because the plan's daily (free plan: 100 a day) or monthly quota is
 * used up, tell Convex (convex/emailQuota.ts), which alerts the admins once that day. Works from
 * any Convex action (CONVEX_SITE_URL is built in). Plain TypeScript: no Convex imports, no throws.
 */

export type ResendQuotaKind = "daily" | "monthly";

/** "daily" / "monthly" when a Resend error (SDK result or REST body) is a used-up quota, else null. */
export function resendQuotaKind(error: unknown): ResendQuotaKind | null {
  if (!error || typeof error !== "object") return null;
  const { name, message } = error as { name?: unknown; message?: unknown };
  const text = `${typeof name === "string" ? name : ""} ${typeof message === "string" ? message : ""}`.toLowerCase();
  if (text.includes("daily_quota_exceeded") || /daily (email )?(sending )?quota/.test(text)) return "daily";
  if (text.includes("monthly_quota_exceeded") || /monthly (email )?(sending )?quota/.test(text)) return "monthly";
  return null;
}

/** The shared check: SHA-256 of the Resend key, which only our own servers hold. */
export async function resendQuotaToken(apiKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`rehabify-email-quota:${apiKey}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Call after any failed Resend send. Does nothing unless the failure is a used-up quota. */
export async function reportResendQuota(error: unknown, source: string): Promise<void> {
  const kind = resendQuotaKind(error);
  if (!kind) return;
  const site = process.env.CONVEX_SITE_URL?.replace(/\/+$/, "");
  const apiKey = process.env.RESEND_API_KEY;
  if (!site || !apiKey) return;
  try {
    await fetch(`${site}/email/quota-hit`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-quota-token": await resendQuotaToken(apiKey) },
      body: JSON.stringify({ kind, source: source.slice(0, 60) }),
    });
  } catch {
    // The alert is best effort; the email's own failure is already handled by the caller
  }
}
