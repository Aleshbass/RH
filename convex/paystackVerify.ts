import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Convex HTTP endpoint to verify Paystack payment and activate badge
 * This bypasses Next.js entirely - no worker.js issues!
 */
export const verifyPayment = httpAction(async (ctx, request) => {
  try {
    const body = await request.json();
    const { reference } = body;

    if (!reference) {
      return new Response(
        JSON.stringify({ success: false, message: "Payment reference is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("🔍 Verifying payment:", reference);

    // Verify with Paystack directly
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) {
      return new Response(
        JSON.stringify({ success: false, message: "Paystack not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
        },
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackData.status || paystackData.data?.status !== "success") {
      console.warn("❌ Payment verification failed:", paystackData.message);
      return new Response(
        JSON.stringify({
          success: false,
          message: paystackData.message || "Payment verification failed",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const paymentData = paystackData.data;
    console.log("✅ Payment verified with Paystack");

    // Check if this is a verification badge payment
    const metadata = paymentData.metadata || {};
    const customFields = Array.isArray(metadata?.custom_fields) ? metadata.custom_fields : [];
    const transactionType = customFields.find(
      (f: any) => f?.variable_name === "transaction_type"
    )?.value;
    const transactionId = customFields.find(
      (f: any) => f?.variable_name === "transaction_id"
    )?.value;

    const ref = paymentData.reference || "";
    const isVerificationByReference = typeof ref === "string" && ref.startsWith("VERIFICATION_");

    console.log("🔍 Detection:", {
      transactionType,
      transactionId,
      isVerificationByReference,
      reference: ref,
    });

    if ((transactionType === "verification_badge" && transactionId) || isVerificationByReference) {
      console.log("🏆 VERIFICATION BADGE PAYMENT DETECTED");

      // Extract transaction ID
      let txId: string | undefined = transactionId;
      if (!txId && isVerificationByReference) {
        const parts = ref.split("_");
        if (parts.length >= 2) txId = parts[1];
      }

      if (!txId) {
        console.error("❌ Could not extract transaction ID");
        return new Response(
          JSON.stringify({
            success: false,
            message: "Could not extract transaction ID",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      console.log("✅ Using transaction ID:", txId);

      // Activate badge via Convex mutation
      const result = await ctx.runMutation(api.marketplace.verification.completeVerificationPurchase, {
        transactionId: txId as Id<"marketplaceTransactions">,
        paymentReference: ref,
      });

      console.log("🎉 Badge activation result:", result);

      // Send confirmation email (best effort)
      try {
        const userEmail = paymentData.customer?.email || metadata?.email || "";
        const userName = paymentData.customer?.first_name || metadata?.userName || "";

        if (userEmail) {
          await ctx.runAction(
            api.actions.emails.sendVerificationBadgeEmail.sendVerificationBadgeConfirmation,
            {
              userEmail,
              userName,
              tier: result.tier,
              amount: paymentData.amount,
              expiresAt: result.expiresAt,
              paymentReference: ref,
            }
          );
          console.log("📧 Email sent to:", userEmail);
        }
      } catch (emailErr) {
        console.warn("⚠️ Email send failed (non-fatal):", emailErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Verification badge activated",
          data: {
            status: paymentData.status,
            amount: paymentData.amount,
            reference: ref,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Not a verification badge payment
    console.log("ℹ️ Not a verification badge payment");
    return new Response(
      JSON.stringify({
        success: true,
        message: "Payment verified (not a verification badge)",
        data: {
          status: paymentData.status,
          amount: paymentData.amount,
          reference: ref,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Payment verification error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Internal server error during payment verification",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
