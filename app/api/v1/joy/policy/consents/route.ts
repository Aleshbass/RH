import { authenticatedEmpty, errorResponse, success } from "@/lib/joy-integration/http";
import { PATIENT_CONSENT_POLICIES, consentDocumentsForJoy } from "@/lib/policies";

export const runtime = "nodejs";

/**
 * Service-authenticated, like GET /api/v1/joy/policy/current (the Consultation & Booking Policy).
 * Additive (Oct 2026): the Terms of Service and Privacy Policy a
 * patient accepts at the first Joy chat. Joy's templates live outside this repo, so the contract:
 *
 * GET /api/v1/joy/policy/consents ->
 *   { documents: [{ policy_id: "terms" | "privacy", title, version, url, acceptance_text }] }
 * (health_data is no longer asked.) Show each document's acceptance_text, then record with
 * POST /api/v1/joy/operations { operation: "patient_record_consents", mutation: true,
 *   actor: { persona: "patient", rh_user_id, ... }, data: { patient_id, conversation_id,
 *   accepted: { terms: version, privacy: version } } }.
 * Which ones a patient still needs: operation "patient_consent_status", or `consents_required`
 * in the patient resolve response.
 */
export async function GET(request: Request) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    requestId = await authenticatedEmpty(request);
    return success(requestId, { documents: consentDocumentsForJoy(PATIENT_CONSENT_POLICIES, "https://physioaroundme.com") });
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
