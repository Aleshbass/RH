import { httpRouter } from "convex/server";
import { calendarWebhook, webhookHealth } from "./calendar/webhook";
import {
  recordExternalRequest, resolvePatient, linkReferral, resolveReferralContext, updatePatientLocation, resolvePhysiotherapist, findMatches,
  resolveAvailabilityProfile, createPendingBooking, createAdminScheduledVirtualBooking, resolvePartnerAttribution, getBooking,
  preparePaymentAttempt, recordPaymentInitialization, recordPaymentWebhook, recordPaymentFailedWebhook, createSpecialistReview, prepareSpecialistReviewPayment, recordSpecialistReviewPaymentInitialization, recordSpecialistReviewPaymentWebhook, cancelBooking, enqueueEvent, markEventDelivery, respondToBooking, replacementCandidates, reassignBooking,
} from "./joyGateway";
import { readResolvePhysiotherapist, readFindMatches, readAvailability, readBooking, operationalQuery, operationalMutation, upsertIntake, recordJourneyEvent, issueDashboardLink, placeForPin, programmeWatchLink } from "./joyGateway";
import { rpc as partnerGatewayRpc } from "./partnerGateway";
import { resendWebhook } from "./emailEvents";
import { videoKey, videoMaster, videoMedia, videoPreflight, workerClaim, workerComplete, workerCreate, workerFail, workerUploadUrls } from "./learnVideo";

const http = httpRouter();

// Resend: campaign email delivered / opened / clicked / bounced / spam (Svix-signed)
http.route({ path: "/resend/webhook", method: "POST", handler: resendWebhook });

// Partner REST API → Convex bridge (HMAC-signed, fixed operation allowlist).
http.route({ path: "/partner-gateway/rpc", method: "POST", handler: partnerGatewayRpc });

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
http.route({ path: "/joy-integration/resolve_or_create_patient", method: "POST", handler: resolvePatient });
http.route({ path: "/joy-integration/link_referral", method: "POST", handler: linkReferral });
http.route({ path: "/joy-integration/resolve_referral_context", method: "POST", handler: resolveReferralContext });
http.route({ path: "/joy-integration/update_patient_location", method: "POST", handler: updatePatientLocation });
http.route({ path: "/joy-integration/resolve_physiotherapist", method: "POST", handler: resolvePhysiotherapist });
http.route({ path: "/joy-integration/find_matches", method: "POST", handler: findMatches });
http.route({ path: "/joy-integration/place_for_pin", method: "POST", handler: placeForPin });
http.route({ path: "/joy-integration/resolve_availability_profile", method: "POST", handler: resolveAvailabilityProfile });
http.route({ path: "/joy-integration/create_pending_booking", method: "POST", handler: createPendingBooking });
http.route({ path: "/joy-integration/create_admin_scheduled_virtual_booking", method: "POST", handler: createAdminScheduledVirtualBooking });
http.route({ path: "/joy-integration/resolve_partner_attribution", method: "POST", handler: resolvePartnerAttribution });
http.route({ path: "/joy-integration/get_booking", method: "POST", handler: getBooking });
http.route({ path: "/joy-integration/cancel_booking", method: "POST", handler: cancelBooking });
http.route({ path: "/joy-integration/prepare_payment_attempt", method: "POST", handler: preparePaymentAttempt });
http.route({ path: "/joy-integration/record_payment_initialization", method: "POST", handler: recordPaymentInitialization });
http.route({ path: "/joy-integration/record_payment_webhook", method: "POST", handler: recordPaymentWebhook });
http.route({ path: "/joy-integration/record_payment_failed_webhook", method: "POST", handler: recordPaymentFailedWebhook });
http.route({ path: "/joy-integration/create_specialist_review", method: "POST", handler: createSpecialistReview });
http.route({ path: "/joy-integration/prepare_specialist_review_payment", method: "POST", handler: prepareSpecialistReviewPayment });
http.route({ path: "/joy-integration/record_specialist_review_payment_initialization", method: "POST", handler: recordSpecialistReviewPaymentInitialization });
http.route({ path: "/joy-integration/record_specialist_review_payment_webhook", method: "POST", handler: recordSpecialistReviewPaymentWebhook });
http.route({ path: "/joy-integration/enqueue_event", method: "POST", handler: enqueueEvent });
http.route({ path: "/joy-integration/mark_event_delivery", method: "POST", handler: markEventDelivery });
http.route({ path: "/joy-integration/respond_to_booking", method: "POST", handler: respondToBooking });
http.route({ path: "/joy-integration/replacement_candidates", method: "POST", handler: replacementCandidates });
http.route({ path: "/joy-integration/reassign_booking", method: "POST", handler: reassignBooking });
http.route({ path: "/joy-integration/upsert_intake", method: "POST", handler: upsertIntake });
http.route({ path: "/joy-integration/record_journey_event", method: "POST", handler: recordJourneyEvent });
http.route({ path: "/joy-integration/issue_dashboard_link", method: "POST", handler: issueDashboardLink });
http.route({ path: "/joy-integration/programme_watch_link", method: "POST", handler: programmeWatchLink });
// Physio / family / admin operations from Joy (fixed allowlist in joyOperations.ts)
http.route({ path: "/joy-integration/operational_query", method: "POST", handler: operationalQuery });
http.route({ path: "/joy-integration/operational_mutation", method: "POST", handler: operationalMutation });
http.route({ path: "/joy-read/resolve_physiotherapist", method: "POST", handler: readResolvePhysiotherapist });
http.route({ path: "/joy-read/find_matches", method: "POST", handler: readFindMatches });
http.route({ path: "/joy-read/availability", method: "POST", handler: readAvailability });
http.route({ path: "/joy-read/get_booking", method: "POST", handler: readBooking });

// Rehabify Learn protected video (learnVideo.ts): playlists and key for players with a playback
// token; the encoder / laptop script API with LEARN_VIDEO_WORKER_SECRET
for (const path of ["/learn/video/master.m3u8", "/learn/video/media.m3u8", "/learn/video/key"]) {
  http.route({ path, method: "OPTIONS", handler: videoPreflight });
}
http.route({ path: "/learn/video/master.m3u8", method: "GET", handler: videoMaster });
http.route({ path: "/learn/video/media.m3u8", method: "GET", handler: videoMedia });
http.route({ path: "/learn/video/key", method: "GET", handler: videoKey });
http.route({ path: "/learn/video/worker/create", method: "POST", handler: workerCreate });
http.route({ path: "/learn/video/worker/claim", method: "POST", handler: workerClaim });
http.route({ path: "/learn/video/worker/upload-urls", method: "POST", handler: workerUploadUrls });
http.route({ path: "/learn/video/worker/complete", method: "POST", handler: workerComplete });
http.route({ path: "/learn/video/worker/fail", method: "POST", handler: workerFail });

export default http;

