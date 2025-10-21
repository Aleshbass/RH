import { httpRouter } from "convex/server";
import { calendarWebhook, webhookHealth } from "./calendar/webhook";
import { paystackWebhook } from "./webhooks/paystack";
import { verifyPayment } from "./paystackVerify";

const http = httpRouter();

http.route({
  path: "/webhooks/google-calendar",
  method: "POST",
  handler: calendarWebhook,
});

http.route({
  path: "/webhooks/health",
  method: "GET",
  handler: webhookHealth,
});

// Paystack webhook for payment notifications
http.route({
  path: "/paystack-webhook",
  method: "POST",
  handler: paystackWebhook,
});

// Payment verification endpoint (bypasses Next.js)
http.route({
  path: "/verify-payment",
  method: "POST",
  handler: verifyPayment,
});

export default http;
