// @ts-nocheck
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

/**
 * Handle successful Flutterwave payment
 * Called when we receive a charge.completed webhook
 */
export const handleSuccessfulPayment = internalMutation({
    args: {
        transactionId: v.string(),
        txRef: v.string(),
        amount: v.number(), // Amount in Naira
        currency: v.string(),
        status: v.string(),
        customerId: v.optional(v.string()),
        customerEmail: v.optional(v.string()),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        console.log("Processing Flutterwave successful payment:", {
            txRef: args.txRef,
            amount: args.amount,
            status: args.status
        });

        // Extract invoice info from tx_ref (format: FLW_INV_{invoiceNumber}_{timestamp}_{random})
        const txRefParts = args.txRef.split("_");
        let invoiceNumber: string | null = null;

        if (txRefParts[0] === "FLW" && txRefParts[1] === "INV" && txRefParts.length >= 3) {
            invoiceNumber = txRefParts[2];
        }

        // Try to get invoiceId from metadata first
        let invoiceId: Id<"invoices"> | null = null;
        if (args.metadata?.invoiceId) {
            invoiceId = args.metadata.invoiceId as Id<"invoices">;
        }

        // Find the payment record by reference
        const payment = await ctx.db
            .query("payments")
            .withIndex("by_paystack_reference", (q) => q.eq("paystackReference", args.txRef))
            .unique();

        if (!payment) {
            console.error("Payment record not found for txRef:", args.txRef);
            // Try to find by invoice number if we have it
            if (invoiceNumber) {
                const invoice = await ctx.db
                    .query("invoices")
                    .filter((q) => q.eq(q.field("invoiceNumber"), invoiceNumber))
                    .unique();

                if (invoice) {
                    invoiceId = invoice._id;
                }
            }

            if (!invoiceId) {
                throw new Error(`Payment record not found for txRef: ${args.txRef}`);
            }
        } else {
            invoiceId = payment.invoiceId;
        }

        // Get the invoice
        const invoice = await ctx.db.get(invoiceId);
        if (!invoice) {
            throw new Error(`Invoice not found: ${invoiceId}`);
        }

        // Verify amounts match (convert Flutterwave amount from Naira to kobo)
        const amountInKobo = Math.round(args.amount * 100);
        const expectedAmount = invoice.feeBreakdown?.total || invoice.totalAmount;

        // Allow small variance for rounding
        if (Math.abs(amountInKobo - expectedAmount) > 100) {
            console.warn("Amount mismatch:", {
                received: amountInKobo,
                expected: expectedAmount,
                difference: amountInKobo - expectedAmount
            });
        }

        // Update payment record
        if (payment) {
            await ctx.db.patch(payment._id, {
                status: "completed",
                paystackData: args,
                paidAt: Date.now(),
                transactionId: args.transactionId,
            });
        }

        // Update invoice status
        await ctx.db.patch(invoiceId, {
            status: "paid",
            paidAt: Date.now(),
            paymentReference: args.txRef,
            paymentTransactionId: args.transactionId,
        });

        // Create a payout record for the physiotherapist if applicable
        if (invoice.physiotherapistId && invoice.feeBreakdown?.physiotherapistEarnings) {
            await ctx.db.insert("payouts", {
                physiotherapistId: invoice.physiotherapistId,
                invoiceId: invoiceId,
                amount: invoice.feeBreakdown.physiotherapistEarnings,
                status: "completed", // Flutterwave split payments are instant
                paymentProvider: "flutterwave",
                transactionReference: args.txRef,
                createdAt: Date.now(),
                processedAt: Date.now(),
            });
        }

        // Create notification for patient
        if (invoice.patientId) {
            await ctx.db.insert("notifications", {
                userId: invoice.patientId,
                type: "billing_reminder" as any,
                priority: "medium" as any,
                status: "pending" as any,
                payload: {
                    title: "Payment Successful",
                    body: `Your payment of ₦${(amountInKobo / 100).toLocaleString()} for Invoice #${invoice.invoiceNumber} has been received.`,
                    data: {
                        entityId: String(invoiceId),
                        entityType: "invoice",
                        actionUrl: `/dashboard/patient/invoices/${invoiceId}`,
                    },
                },
                createdAt: Date.now(),
            });
        }

        // Create notification for physiotherapist
        if (invoice.physiotherapistId) {
            const ptShare = invoice.feeBreakdown?.physiotherapistEarnings || 0;
            await ctx.db.insert("notifications", {
                userId: invoice.physiotherapistId,
                type: "billing_reminder" as any,
                priority: "medium" as any,
                status: "pending" as any,
                payload: {
                    title: "Payment Received",
                    body: `Payment of ₦${(ptShare / 100).toLocaleString()} has been deposited to your account for Invoice #${invoice.invoiceNumber}.`,
                    data: {
                        entityId: String(invoiceId),
                        entityType: "invoice",
                        actionUrl: `/dashboard/physiotherapist/billing`,
                    },
                },
                createdAt: Date.now(),
            });
        }

        console.log("Successfully processed Flutterwave payment for invoice:", invoice.invoiceNumber);

        return {
            success: true,
            invoiceId,
            invoiceNumber: invoice.invoiceNumber,
        };
    },
});

/**
 * Handle failed Flutterwave payment
 */
export const handleFailedPayment = internalMutation({
    args: {
        transactionId: v.string(),
        txRef: v.string(),
        amount: v.number(),
        status: v.string(),
        failureMessage: v.optional(v.string()),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        console.log("Processing Flutterwave failed payment:", {
            txRef: args.txRef,
            status: args.status,
            message: args.failureMessage
        });

        // Find the payment record by reference
        const payment = await ctx.db
            .query("payments")
            .withIndex("by_paystack_reference", (q) => q.eq("paystackReference", args.txRef))
            .unique();

        if (!payment) {
            console.error("Payment record not found for failed txRef:", args.txRef);
            return { success: false, error: "Payment record not found" };
        }

        // Update payment record
        await ctx.db.patch(payment._id, {
            status: "failed",
            failureReason: args.failureMessage || "Payment failed",
            paystackData: args,
        });

        // Update invoice status back to sent
        const invoice = await ctx.db.get(payment.invoiceId);
        if (invoice && invoice.status === "processing") {
            await ctx.db.patch(payment.invoiceId, {
                status: "sent",
            });
        }

        // Notify patient of failure
        if (invoice?.patientId) {
            await ctx.db.insert("notifications", {
                userId: invoice.patientId,
                type: "billing_reminder" as any,
                priority: "high" as any,
                status: "pending" as any,
                payload: {
                    title: "Payment Failed",
                    body: `Your payment for Invoice #${invoice.invoiceNumber} was not successful. Please try again.`,
                    data: {
                        entityId: String(payment.invoiceId),
                        entityType: "invoice",
                        actionUrl: `/dashboard/patient/invoices/${payment.invoiceId}`,
                    },
                },
                createdAt: Date.now(),
            });
        }

        return { success: true, invoiceId: payment.invoiceId };
    },
});

/**
 * Handle transfer completed (payout to subaccount)
 */
export const handleTransferCompleted = internalMutation({
    args: {
        transferId: v.string(),
        reference: v.string(),
        amount: v.number(),
        status: v.string(),
        accountNumber: v.optional(v.string()),
        bankName: v.optional(v.string()),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        console.log("Processing Flutterwave transfer completed:", {
            transferId: args.transferId,
            reference: args.reference,
            amount: args.amount
        });

        // Find payout by reference if we stored it
        const payout = await ctx.db
            .query("payouts")
            .filter((q) => q.eq(q.field("transactionReference"), args.reference))
            .unique();

        if (payout) {
            await ctx.db.patch(payout._id, {
                status: "completed",
                processedAt: Date.now(),
                transferId: args.transferId,
            });
        }

        return { success: true };
    },
});
