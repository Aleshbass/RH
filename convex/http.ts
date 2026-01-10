import { httpRouter } from "convex/server";
import { calendarWebhook, webhookHealth } from "./calendar/webhook";

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

export default http;

