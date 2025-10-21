import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

/**
 * Handle successful payment from Paystack webhook
 */
export const handleSuccessfulPayment = internalMutation({
  args: {
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const { data } = args;
    const { reference, amount, metadata, status, customer } = data;
    
    console.log("💰 Processing successful payment");
    console.log("Reference:", reference);
    console.log("Amount:", amount);
    console.log("Status:", status);
    
    if (status !== "success") {
      console.log("⚠️ Payment status is not success:", status);
      return;
    }
    
    // Check if this is a verification badge payment
    // Method 1: Check custom_fields in metadata
    const customFields = metadata?.custom_fields || [];
    const transactionType = customFields.find(
      (field: any) => field.variable_name === "transaction_type"
    )?.value;
    
    const transactionId = customFields.find(
      (field: any) => field.variable_name === "transaction_id"
    )?.value;
    
    // Method 2: Check if reference starts with VERIFICATION_
    const isVerificationByReference = reference.startsWith("VERIFICATION_");
    
    console.log("🔍 Detection:");
    console.log("  - Transaction type from metadata:", transactionType);
    console.log("  - Transaction ID from metadata:", transactionId);
    console.log("  - Is verification by reference:", isVerificationByReference);
    
    // Handle verification badge payment
    if ((transactionType === "verification_badge" && transactionId) || isVerificationByReference) {
      console.log("🏆 VERIFICATION BADGE PAYMENT DETECTED");
      
      // Extract transaction ID from reference if not in metadata
      let txId = transactionId;
      if (!txId && isVerificationByReference) {
        // Format: VERIFICATION_{transactionId}_{timestamp}
        const parts = reference.split("_");
        if (parts.length >= 2) {
          txId = parts[1];
        }
      }
      
      if (!txId) {
        console.error("❌ Could not extract transaction ID");
        return;
      }
      
      console.log("✅ Using transaction ID:", txId);
      
      // Get the transaction
      const transaction = await ctx.db.get(txId as Id<"marketplaceTransactions">);
      if (!transaction) {
        console.error("❌ Transaction not found:", txId);
        return;
      }
      
      console.log("📋 Transaction found:", {
        id: transaction._id,
        userId: transaction.userId,
        tier: transaction.badgeTier,
        status: transaction.status,
      });
      
      // Update transaction status
      await ctx.db.patch(transaction._id, {
        status: "completed",
        paymentReference: reference,
        completedAt: Date.now(),
      });
      
      console.log("✅ Transaction updated to completed");
      
      // Get the physiotherapist profile
      const profile = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", transaction.userId))
        .first();
      
      if (!profile) {
        console.error("❌ Physiotherapist profile not found for user:", transaction.userId);
        return;
      }
      
      console.log("👤 Profile found:", profile._id);
      
      // Calculate expiry date based on tier
      const now = Date.now();
      let expiresAt: number;
      
      switch (transaction.badgeTier) {
        case "monthly":
          expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days
          break;
        case "12_month":
          expiresAt = now + 365 * 24 * 60 * 60 * 1000; // 365 days
          break;
        case "yearly":
          expiresAt = now + 365 * 24 * 60 * 60 * 1000; // 365 days
          break;
        default:
          expiresAt = now + 30 * 24 * 60 * 60 * 1000;
      }
      
      // Update profile with verification badge
      await ctx.db.patch(profile._id, {
        verificationBadge: {
          status: "verified",
          tier: transaction.badgeTier!,
          paidAt: now,
          expiresAt,
          verificationFee: transaction.amount,
          autoRenew: false,
        },
      });
      
      console.log("✅ Badge activated on profile");
      console.log("📅 Expires at:", new Date(expiresAt).toISOString());
      
      // Log successful activation
      await ctx.db.insert("systemLogs", {
        action: "verification_badge_activated",
        type: "badge_activation",
        timestamp: now,
        userId: transaction.userId,
        details: {
          message: `Verification badge activated for user ${transaction.userId}`,
          tier: transaction.badgeTier!,
          transactionId: transaction._id,
          paymentReference: reference,
          expiresAt,
        },
      });
      
      console.log("🎉 VERIFICATION BADGE ACTIVATION COMPLETE");
      
      // Schedule email sending (we'll handle this separately to avoid blocking)
      try {
        const userEmail = customer?.email || metadata?.email || "";
        const userName = customer?.first_name || metadata?.userName || "";
        
        if (userEmail) {
          console.log("📧 Scheduling email to:", userEmail);
          // Note: Email will be sent via action - we'll trigger it separately
          await ctx.scheduler.runAfter(0, "actions/emails/sendVerificationBadgeEmail:sendVerificationBadgeConfirmation" as any, {
            userEmail,
            userName,
            tier: transaction.badgeTier!,
            amount,
            expiresAt,
            paymentReference: reference,
          });
        }
      } catch (emailError) {
        console.error("⚠️ Error scheduling email:", emailError);
        // Don't fail the whole process if email fails
      }
      
      return;
    }
    
    // Handle regular invoice payments
    console.log("💳 Regular invoice payment - updating payment status");
    
    // Find payment by reference
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_paystack_reference", (q) => q.eq("paystackReference", reference))
      .first();
    
    if (!payment) {
      console.error("❌ Payment not found for reference:", reference);
      return;
    }
    
    // Update payment status
    await ctx.db.patch(payment._id, {
      status: "completed",
    });
    
    console.log("✅ Payment status updated to completed");
    
    // Update invoice if present
    if (metadata?.invoiceId) {
      await ctx.db.patch(metadata.invoiceId as Id<"invoices">, {
        status: "paid",
        paymentReference: reference,
        paidAmount: amount,
      });
      
      console.log("✅ Invoice updated to paid");
    }
  },
});

/**
 * Handle failed payment from Paystack webhook
 */
export const handleFailedPayment = internalMutation({
  args: {
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const { data } = args;
    const { reference, metadata } = data;
    
    console.log("❌ Processing failed payment");
    console.log("Reference:", reference);
    
    // Find payment by reference
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_paystack_reference", (q) => q.eq("paystackReference", reference))
      .first();
    
    if (!payment) {
      console.log("⚠️ Payment not found for reference:", reference);
      return;
    }
    
    // Update payment status
    await ctx.db.patch(payment._id, {
      status: "failed",
    });
    
    console.log("✅ Payment status updated to failed");
    
    // Update invoice if present
    if (metadata?.invoiceId) {
      await ctx.db.patch(metadata.invoiceId as Id<"invoices">, {
        status: "failed",
        paymentReference: reference,
      });
      
      console.log("✅ Invoice updated to failed");
    }
  },
});
