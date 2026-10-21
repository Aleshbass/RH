/**
 * Shareable Paystack payment links for invoices (clinic CLN_ and physio PHY_ links).
 *
 * A link lasts PAYMENT_LINK_TTL_MS and is only reused while the invoice amount is unchanged;
 * after that a fresh link (new reference) is created and the old one is closed. Links are
 * closed as soon as the invoice is paid another way or cancelled. Paystack can't revoke a
 * checkout page, so a closed link that is still paid is caught in payments.applyPaymentStatus:
 * accepted if the invoice is still owed, otherwise logged for a refund.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const PAYMENT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const LINK_REFERENCE = /^(CLN|PHY|INV)_/;

/** The invoice's payment link if it can still be shared, else null (create a new one). */
export function activePaymentLink(
  invoice: Pick<Doc<"invoices">, "paymentLink" | "paymentLinkExpiresAt" | "paymentLinkAmount" | "totalAmount" | "feeBreakdown">,
  now = Date.now()
): string | null {
  if (!invoice.paymentLink || !invoice.paymentLinkExpiresAt || invoice.paymentLinkExpiresAt <= now) return null;
  const total = invoice.feeBreakdown?.total ?? invoice.totalAmount;
  if (invoice.paymentLinkAmount !== undefined && invoice.paymentLinkAmount !== total) return null;
  return invoice.paymentLink;
}

/**
 * Closes the invoice's outstanding checkout(s): pending link payments are cancelled and the
 * shared link is cleared. `keepReference` is the payment that just settled the invoice.
 */
export async function closeInvoicePaymentLinks(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  options: { keepReference?: string } = {}
): Promise<void> {
  const payments = await ctx.db
    .query("payments")
    .withIndex("by_invoice_id", (q) => q.eq("invoiceId", invoiceId))
    .collect();
  const now = Date.now();
  for (const payment of payments) {
    const reference = payment.paystackReference ?? "";
    if (payment.status !== "pending" || reference === options.keepReference || !LINK_REFERENCE.test(reference)) continue;
    await ctx.db.patch(payment._id, { status: "cancelled", updatedAt: now });
  }
  const invoice = await ctx.db.get(invoiceId);
  if (invoice?.paymentLink) {
    await ctx.db.patch(invoiceId, { paymentLink: undefined, paymentLinkExpiresAt: undefined, paymentLinkAmount: undefined });
  }
}
