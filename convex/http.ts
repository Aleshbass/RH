import { httpRouter } from "convex/server";
import { calendarWebhook, webhookHealth } from "./calendar/webhook";

const http = httpRouter();

http.route({
  path: "/api/webhooks/google-calendar",
  method: "POST",
  handler: calendarWebhook,
});

http.route({
  path: "/api/webhooks/health",
  method: "GET",
  handler: webhookHealth,
});

export default http;
