// @ts-nocheck
/**
 * Paystack Webhook Handler for Marketplace Bookings
 * Handles payment confirmations and completes bookings
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
      console.error("[Marketplace Webhook] Missing signature");
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 400 }
      );
    }

    // Verify signature
    if (!verifyPaystackSignature(rawBody, signature)) {
      console.error("[Marketplace Webhook] Invalid signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Parse the event
    const event = JSON.parse(rawBody);

    console.log("[Marketplace Webhook] Event received:", event.event);

    // Handle charge.success event
    if (event.event === "charge.success") {
      const { reference, amount, customer, metadata } = event.data;

      // Extract booking ID from reference or metadata
      let bookingId: string | null = null;

      if (reference && reference.includes("MARKETPLACE_")) {
        const parts = reference.split("_");
        bookingId = parts[1]; // Extract ID from MARKETPLACE_{bookingId}_{timestamp}
      } else if (metadata?.custom_fields) {
        const bookingField = metadata.custom_fields.find(
          (field: any) => field.variable_name === "booking_id"
        );
        if (bookingField) {
          bookingId = bookingField.value;
        }
      }

      if (!bookingId) {
        console.error("[Marketplace Webhook] No booking ID found");
        return NextResponse.json(
          { error: "No booking ID found" },
          { status: 400 }
        );
      }

      // Initialize Convex client
      const client = new ConvexHttpClient(convexUrl);

      try {
        // Complete the booking
        await client.mutation(api.marketplace.booking.completeMarketplaceBooking, {
          bookingId: bookingId as Id<"marketplaceBookings">,
          paymentReference: reference,
        });

        console.log("[Marketplace Webhook] Booking completed:", bookingId);

        return NextResponse.json({ status: "success" });
      } catch (error: any) {
        console.error("[Marketplace Webhook] Error completing booking:", error);
        return NextResponse.json(
          { error: "Failed to complete booking", details: error.message },
          { status: 500 }
        );
      }
    }

    // For other events, just acknowledge
    return NextResponse.json({ status: "received" });
  } catch (error: any) {
    console.error("[Marketplace Webhook] Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed", details: error.message },
      { status: 500 }
    );
  }
}

// Handle GET requests (for webhook verification during setup)
export async function GET() {
  return NextResponse.json({ status: "Marketplace webhook endpoint active" });
}
