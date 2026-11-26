/**
 * The one way platform emails leave: Amazon SES first, Resend as the backup (owner 2026-11-26,
 * once SES left the sandbox: 50,000 a day, 14 a second; Resend's free plan is 100 a day). Resend
 * takes over whenever SES doesn't take the email: SES isn't set up, refuses it, or is down. A
 * used-up Resend quota still alerts the admins (resendQuota.ts).
 *
 * Group campaigns (convex/actions/marketingSend.ts) go through SES only, with our own unsubscribe
 * links and open tracking (convex/emailLinks.ts); Resend's 100 a day couldn't carry them.
 *
 * Plain TypeScript, no Convex imports, never throws: usable from Convex actions and Next routes.
 * Logs carry the source and provider only, never addresses (NDPR).
 */
import { Resend } from "resend";
import { reportResendQuota } from "./resendQuota";
import { sendViaSes, sesConfigured, sesFromAddress } from "./ses";

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

const sesFrom = sesFromAddress;

/**
 * Sends one email. `source` is a short label for logs and the admin quota alert
 * (e.g. "template:PAYMENT_RECEIPT", "clinic-staff-invite").
 */
export async function deliverEmail(email: OutgoingEmail, source: string): Promise<DeliveryResult> {
  // Amazon SES first
  let sesError = "SES is not set up";
  if (sesConfigured()) {
    const ses = await sendViaSes({ ...email, from: sesFrom(email.from) });
    if (ses.ok) return { success: true, id: ses.messageId, provider: "ses" };
    sesError = ses.error ?? "SES refused the email";
  }

  // Resend as the backup
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
      if (!error) {
        if (sesConfigured()) console.warn(`[EMAIL] ${source}: sent through Resend (SES: ${sesError})`);
        return { success: true, id: data?.id, provider: "resend" };
      }
      resendError = error.message || error.name || "Resend refused the email";
      await reportResendQuota(error, source);
    } catch (error) {
      resendError = error instanceof Error ? error.message : String(error);
    }
  }

  console.error(`[EMAIL] ${source}: SES and Resend both failed. SES: ${sesError} | Resend: ${resendError}`);
  return { success: false, provider: apiKey ? "resend" : "ses", error: `SES: ${sesError}; Resend: ${resendError}` };
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
