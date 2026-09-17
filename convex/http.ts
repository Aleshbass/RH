import { httpRouter } from "convex/server";
import { calendarWebhook, webhookHealth } from "./calendar/webhook";
import {
  recordExternalRequest, resolvePatient, resolvePhysiotherapist, findMatches,
  resolveAvailabilityProfile, createPendingBooking, getBooking,
  preparePaymentAttempt, recordPaymentInitialization, recordPaymentWebhook, createSpecialistReview, prepareSpecialistReviewPayment, recordSpecialistReviewPaymentInitialization, recordSpecialistReviewPaymentWebhook, cancelBooking, enqueueEvent, markEventDelivery, respondToBooking, replacementCandidates, reassignBooking,
} from "./joyGateway";

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
http.route({ path: "/joy-integration/find_matches", method: "POST", handler: findMatches });
http.route({ path: "/joy-integration/resolve_availability_profile", method: "POST", handler: resolveAvailabilityProfile });
http.route({ path: "/joy-integration/create_pending_booking", method: "POST", handler: createPendingBooking });
http.route({ path: "/joy-integration/get_booking", method: "POST", handler: getBooking });
http.route({ path: "/joy-integration/cancel_booking", method: "POST", handler: cancelBooking });
http.route({ path: "/joy-integration/prepare_payment_attempt", method: "POST", handler: preparePaymentAttempt });
http.route({ path: "/joy-integration/record_payment_initialization", method: "POST", handler: recordPaymentInitialization });
http.route({ path: "/joy-integration/record_payment_webhook", method: "POST", handler: recordPaymentWebhook });
http.route({ path: "/joy-integration/create_specialist_review", method: "POST", handler: createSpecialistReview });
http.route({ path: "/joy-integration/prepare_specialist_review_payment", method: "POST", handler: prepareSpecialistReviewPayment });
http.route({ path: "/joy-integration/record_specialist_review_payment_initialization", method: "POST", handler: recordSpecialistReviewPaymentInitialization });
http.route({ path: "/joy-integration/record_specialist_review_payment_webhook", method: "POST", handler: recordSpecialistReviewPaymentWebhook });
http.route({ path: "/joy-integration/enqueue_event", method: "POST", handler: enqueueEvent });
http.route({ path: "/joy-integration/mark_event_delivery", method: "POST", handler: markEventDelivery });
http.route({ path: "/joy-integration/respond_to_booking", method: "POST", handler: respondToBooking });
http.route({ path: "/joy-integration/replacement_candidates", method: "POST", handler: replacementCandidates });
http.route({ path: "/joy-integration/reassign_booking", method: "POST", handler: reassignBooking });

export default http;

