"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";
import { escapeHtml, escapeOptional, plainSubject } from "../../helpers/escapeHtml";

/**
 * Payment receipt email. Internal: scheduled by the marketplace booking completion
 * (after Paystack-verified payment), never callable from a browser.
 */
export const sendPaymentReceiptEmail = internalAction({
  args: {
    to: v.string(),
    recipientName: v.string(),
    patientName: v.string(),
    physiotherapistName: v.string(),
    amount: v.number(),
    currency: v.string(),
    paymentReference: v.string(),
    date: v.union(v.string(), v.number()),
    bookingId: v.string(),
    patientEmail: v.string(),
    patientPhone: v.optional(v.string()),
    role: v.union(v.literal("patient"), v.literal("physiotherapist"), v.literal("admin")),
    subjectOverride: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    try {
      const defaultSubject = args.role === 'patient'
        ? `Payment Receipt: Booking Confirmation`
        : `New Payment Received: ${args.patientName}`;
      const result = await sendEmail({
        to: args.to,
        subject: plainSubject(args.subjectOverride || defaultSubject),
        template: 'PAYMENT_RECEIPT',
        data: {
          recipientName: escapeHtml(args.recipientName),
          patientName: escapeHtml(args.patientName),
          physiotherapistName: escapeHtml(args.physiotherapistName),
          amount: args.amount,
          currency: args.currency,
          paymentReference: escapeHtml(args.paymentReference),
          date: args.date,
          bookingId: escapeHtml(args.bookingId),
          patientEmail: escapeHtml(args.patientEmail),
          patientPhone: escapeOptional(args.patientPhone),
          role: args.role,
        },
      });

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});
