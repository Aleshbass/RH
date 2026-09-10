import { httpRouter } from "convex/server";
import { calendarWebhook, webhookHealth } from "./calendar/webhook";
import { recordExternalRequest, resolvePatient, resolvePhysiotherapist } from "./joyGateway";

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

http.route({ path: "/joy-integration/record_external_request", method: "POST", handler: recordExternalRequest });
http.route({ path: "/joy-integration/resolve_patient", method: "POST", handler: resolvePatient });
http.route({ path: "/joy-integration/resolve_physiotherapist", method: "POST", handler: resolvePhysiotherapist });

export default http;

