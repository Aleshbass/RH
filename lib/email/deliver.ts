/**
 * The one way platform emails leave: Resend first, Amazon SES as the backup (owner 2026-11-20).
 * SES takes over whenever Resend doesn't take the email: its daily/monthly quota is used up, the
 * key is missing or rejected, or Resend is down. A used-up Resend quota still alerts the admins
 * (resendQuota.ts) so they know the backup is carrying the load.
 *
 * Group campaigns (convex/actions/marketingSend.ts) stay on Resend only: they rely on Resend
 * audiences, unsubscribes and open tracking.
 *
 * Plain TypeScript, no Convex imports, never throws: usable from Convex actions and Next routes.
 * Logs carry the source and provider only, never addresses (NDPR).
 */
import { Resend } from "resend";
import { reportResendQuota } from "./resendQuota";
import { sendViaSes, sesConfigured } from "./ses";

export type OutgoingEmail = {
  /** `Name <address>`; the address must be on a domain verified in both Resend and SES. */
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | string[];
};

export type DeliveryResult = {
  success: boolean;
  /** Resend's email id or SES's message id. */
  id?: string;
  provider?: "resend" | "ses";
  error?: string;
};

/** The sandbox sender only works on Resend; SES needs an address on our verified domain. */
function sesFrom(from: string): string {
  if (!/@resend\.dev>?\s*$/i.test(from)) return from;
  const name = /^\s*"?([^"<]*?)"?\s*</.exec(from)?.[1] || "Rehabify Health";
  return `${name} <${process.env.SES_FROM_EMAIL || "noreply@physioaroundme.com"}>`;
}

/**
 * Sends one email. `source` is a short label for logs and the admin quota alert
 * (e.g. "template:PAYMENT_RECEIPT", "clinic-staff-invite").
 */
export async function deliverEmail(email: OutgoingEmail, source: string): Promise<DeliveryResult> {
  let resendError = "RESEND_API_KEY is not set";
  const apiKey = process.env.RESEND_API_KEY;

  if (apiKey) {
    try {
      const { data, error } = await new Resend(apiKey).emails.send({
        from: email.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        ...(email.text ? { text: email.text } : {}),
        ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      });
      if (!error) return { success: true, id: data?.id, provider: "resend" };
      resendError = error.message || error.name || "Resend refused the email";
      await reportResendQuota(error, source);
    } catch (error) {
      resendError = error instanceof Error ? error.message : String(error);
    }
  }

  if (!sesConfigured()) {
    console.error(`[EMAIL] ${source}: Resend failed and no SES backup is set up: ${resendError}`);
    return { success: false, provider: "resend", error: resendError };
  }

  const ses = await sendViaSes({ ...email, from: sesFrom(email.from) });
  if (ses.ok) {
    console.warn(`[EMAIL] ${source}: sent through Amazon SES (Resend: ${resendError})`);
    return { success: true, id: ses.messageId, provider: "ses" };
  }
  console.error(`[EMAIL] ${source}: Resend and SES both failed. Resend: ${resendError} | ${ses.error}`);
  return { success: false, provider: "ses", error: `Resend: ${resendError}; ${ses.error}` };
}

/** `deliverEmail` in the `{ data, error }` shape of `resend.emails.send`, for the older call sites. */
export async function sendEmailWithBackup(
  source: string,
  email: OutgoingEmail
): Promise<{ data: { id: string } | null; error: { name: string; message: string } | null }> {
  const result = await deliverEmail(email, source);
  return result.success
    ? { data: { id: result.id ?? "" }, error: null }
    : { data: null, error: { name: "send_failed", message: result.error ?? "Failed to send email" } };
}

/** Sends straight through SES, skipping Resend (admin/CLI tests of the backup). */
export async function deliverEmailViaSes(email: OutgoingEmail): Promise<DeliveryResult> {
  const ses = await sendViaSes({ ...email, from: sesFrom(email.from) });
  return ses.ok ? { success: true, id: ses.messageId, provider: "ses" } : { success: false, provider: "ses", error: ses.error };
}
