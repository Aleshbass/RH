"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

export const sendPaymentReceiptEmail = action({
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
      const result = await sendEmail({
        to: args.to,
        subject: args.subjectOverride,
        template: 'PAYMENT_RECEIPT',
        data: {
          recipientName: args.recipientName,
          patientName: args.patientName,
          physiotherapistName: args.physiotherapistName,
          amount: args.amount,
          currency: args.currency,
          paymentReference: args.paymentReference,
          date: args.date,
          bookingId: args.bookingId,
          patientEmail: args.patientEmail,
          patientPhone: args.patientPhone,
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
