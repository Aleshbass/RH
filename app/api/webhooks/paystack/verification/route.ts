// @ts-nocheck
/**
 * Paystack Webhook Handler for Verification Badge Purchases
 * Handles payment confirmations and activates verification badges
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;
const paystackSecret = process.env.PAYSTACK_SECRET_KEY!;

// Verify Paystack signature
function verifyPaystackSignature(payload: string, signature: string): boolean {
  const hash = crypto
    .createHmac("sha512", paystackSecret)
    .update(payload)
    .digest("hex");
  return hash === signature;
}

export async function POST(req: NextRequest) {
  try {
    // Get the raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    if (!signature) {
      console.error("[Verification Webhook] Missing signature");
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 400 }
      );
    }

    // Verify signature
    if (!verifyPaystackSignature(rawBody, signature)) {
      console.error("[Verification Webhook] Invalid signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Parse the event
    const event = JSON.parse(rawBody);

    console.log("[Verification Webhook] Event received:", event.event);

    // Handle charge.success event
    if (event.event === "charge.success") {
      const { reference, amount, customer, metadata } = event.data;

      // Extract transaction ID from reference or metadata
      let transactionId: string | null = null;

      if (reference && reference.includes("VERIFICATION_")) {
        const parts = reference.split("_");
        transactionId = parts[1]; // Extract ID from VERIFICATION_{transactionId}_{timestamp}
      } else if (metadata?.custom_fields) {
        const txField = metadata.custom_fields.find(
          (field: any) => field.variable_name === "transaction_id"
        );
        if (txField) {
          transactionId = txField.value;
        }
      }

      if (!transactionId) {
        console.error("[Verification Webhook] No transaction ID found");
        return NextResponse.json(
          { error: "No transaction ID found" },
          { status: 400 }
        );
      }

      // Initialize Convex client
      const client = new ConvexHttpClient(convexUrl);

      try {
        // Complete the verification purchase
        await client.mutation(api.marketplace.verification.completeVerificationPurchase, {
          transactionId: transactionId as Id<"marketplaceTransactions">,
          paymentReference: reference,
        });

        console.log("[Verification Webhook] Badge activated:", transactionId);

        return NextResponse.json({ status: "success" });
      } catch (error: any) {
        console.error("[Verification Webhook] Error activating badge:", error);
        return NextResponse.json(
          { error: "Failed to activate badge", details: error.message },
          { status: 500 }
        );
      }
    }

    // For other events, just acknowledge
    return NextResponse.json({ status: "received" });
  } catch (error: any) {
    console.error("[Verification Webhook] Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed", details: error.message },
      { status: 500 }
    );
  }
}

// Handle GET requests (for webhook verification during setup)
export async function GET() {
  return NextResponse.json({ status: "Verification webhook endpoint active" });
}
