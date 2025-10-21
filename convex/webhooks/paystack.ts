import { httpRouter } from "convex/server";
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Paystack Webhook Handler
 * Receives payment notifications from Paystack
 */
export const paystackWebhook = httpAction(async (ctx, request) => {
  // Get signature and body
  const signature = request.headers.get("x-paystack-signature");
  const body = await request.text();
  
  console.log("🔥 CONVEX WEBHOOK VERSION: 1.0 - Paystack webhook received");
  console.log("Signature present:", Boolean(signature));
  
  // Verify webhook signature
  if (signature) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      console.error("❌ PAYSTACK_SECRET_KEY not configured");
      return new Response(JSON.stringify({ error: "Configuration error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    // Use Web Crypto API for signature verification
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(body);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const hash = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    if (hash !== signature) {
      console.error("❌ Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    console.log("✅ Signature verified");
  }
  
  // Parse event
  let event;
  try {
    event = JSON.parse(body);
  } catch (e) {
    console.error("❌ Invalid JSON payload");
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  console.log("📨 Event type:", event.event);
  console.log("📦 Event data:", JSON.stringify(event.data, null, 2));
  
  // Handle different event types
  try {
    switch (event.event) {
      case "charge.success":
        await ctx.runMutation(internal.webhooks.paystackHandlers.handleSuccessfulPayment, {
          data: event.data,
        });
        break;
        
      case "charge.failed":
        await ctx.runMutation(internal.webhooks.paystackHandlers.handleFailedPayment, {
          data: event.data,
        });
        break;
        
      default:
        console.log("ℹ️ Unhandled event type:", event.event);
    }
    
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    return new Response(JSON.stringify({ error: "Processing failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
