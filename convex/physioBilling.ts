/**
 * Payment links for invoices an independent or clinic physiotherapist issued themselves.
 * The patient pays from the link without signing in; the Paystack webhook marks the
 * invoice paid (same path as clinic links, see convex/clinicBilling.ts).
 */
import { ConvexError, v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { createClinicPaymentLink, mainAccountChargeKobo, paystackRequest } from "./clinicBilling";
import { publicAppUrl } from "./helpers/appUrl";
import { activePaymentLink } from "./helpers/paymentLinks";
import { usableSubaccount } from "./helpers/paystackMode";

export const getPhysioInvoiceForPaymentLink = internalQuery({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Please sign in again.");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    const invoice = await ctx.db.get(args.invoiceId);
    if (!user || !invoice) throw new ConvexError("Invoice not found");
    // A clinic's invoice is the clinic's: its own link path checks Billing access and pays the clinic
    if (invoice.clinicId) return { clinicInvoice: true as const };
    if (invoice.physiotherapistId !== user._id) {
      throw new ConvexError("Invoice not found");
    }
    const patient = await ctx.db.get(invoice.patientId);
    const account = await ctx.db
      .query("physiotherapistBankAccounts")
      .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", user._id))
      .first();
    return {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      totalKobo: invoice.feeBreakdown?.total ?? invoice.totalAmount,
      mainAccountChargeKobo: mainAccountChargeKobo(invoice),
      // Expired or out-of-date links are replaced with a fresh one
      paymentLink: activePaymentLink(invoice),
      patientId: invoice.patientId,
      patientEmail: patient?.email ?? null,
      patientFirstName: patient?.firstName ?? null,
      physioName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Your physiotherapist",
      physioEmail: user.email ?? null,
      // Only a verified payout account receives the split directly
      subaccountCode: account?.isVerified ? usableSubaccount(account) : null,
    };
  },
});

export const createPhysioPaymentLink = action({
  args: { invoiceId: v.id("invoices"), emailPatient: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ paymentLink: string; emailed: boolean }> => {
    const found = await ctx.runQuery(internal.physioBilling.getPhysioInvoiceForPaymentLink, {
      invoiceId: args.invoiceId,
    });
    // Clinic invoices: the clinic's link (the patient already got the request from the clinic)
    if ("clinicInvoice" in found) return { ...(await createClinicPaymentLink(ctx, args.invoiceId)), emailed: false };
    const invoice = found;
    if (invoice.status === "paid") throw new ConvexError("This invoice is already paid");
    if (invoice.status === "void") throw new ConvexError("This invoice was cancelled");

    let paymentLink = invoice.paymentLink;
    if (!paymentLink) {
      const email = invoice.patientEmail || invoice.physioEmail;
      if (!email) throw new ConvexError("Add an email address for this patient before creating a payment link");

      const reference = `PHY_${invoice.invoiceNumber}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const payload: Record<string, unknown> = {
        reference,
        amount: invoice.totalKobo,
        email,
        currency: "NGN",
        callback_url: `${publicAppUrl()}/payment/callback`,
        channels: ["card", "bank", "ussd", "bank_transfer"],
        metadata: {
          invoiceId: invoice.invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          patientId: invoice.patientId,
          source: "physio_payment_link",
          custom_fields: [
            { display_name: "Physiotherapist", variable_name: "physiotherapist", value: invoice.physioName },
            { display_name: "Invoice", variable_name: "invoice_number", value: invoice.invoiceNumber },
          ],
        },
      };
      if (invoice.subaccountCode) {
        payload.subaccount = invoice.subaccountCode;
        payload.transaction_charge = invoice.mainAccountChargeKobo;
        payload.bearer = "account";
      }
      const data = await paystackRequest("/transaction/initialize", { method: "POST", body: JSON.stringify(payload) });
      paymentLink = data.authorization_url as string;
      await ctx.runMutation(internal.clinicBilling.recordPaymentLink, {
        invoiceId: invoice.invoiceId,
        patientId: invoice.patientId,
        reference,
        amountKobo: invoice.totalKobo,
        paymentLink,
      });
    }

    let emailed = false;
    if (args.emailPatient && invoice.patientEmail) {
      await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
        to: invoice.patientEmail,
        subject: `Payment request from ${invoice.physioName}`,
        greetingName: invoice.patientFirstName ?? undefined,
        heading: `₦${Math.round(invoice.totalKobo / 100).toLocaleString("en-NG")} for your physiotherapy`,
        paragraphs: [
          `${invoice.physioName} has sent you invoice #${invoice.invoiceNumber}.`,
          "You can pay securely by card, bank transfer or USSD. You don't need to sign in.",
        ],
        buttonLabel: "Pay now",
        buttonUrl: paymentLink,
      });
      emailed = true;
    }
    return { paymentLink, emailed };
  },
});
