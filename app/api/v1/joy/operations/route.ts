import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
import { assertJoyActorPersona } from "@/lib/joy-integration/operationPersona";

export const runtime = "nodejs";

const schema = z.object({
  operation: z.enum([
    "physio_work_summary", "physio_update_availability", "physio_session_note", "physio_visit_event", "physio_message_patient", "physio_feedback_request",
    "family_resolve", "family_grant", "family_update_grant", "family_revoke_grant", "family_care_summary", "change_physio_request",
    "admin_patient", "admin_physio", "admin_finance_summary", "admin_escalation", "admin_verify_physio", "admin_reassign",
    // Additive (Oct 2026), patient persona; payloads documented in convex/joyOperations.ts:
    // consents at the first chat (Terms, Privacy, health information, channel "whatsapp") and
    // whether the patient has Flex Max (Joy reminders and support).
    "patient_consent_status", "patient_record_consents", "patient_recovery_plan",
    // Additive (Nov 2026): link this WhatsApp number to a website account with an emailed code
    "patient_link_request", "patient_link_confirm",
    // Additive (Nov 2026): home-visit areas by city
    "service_areas",
    // Additive (Nov 2026): answers from the WhatsApp sign-up form
    "patient_update_profile",
    // Additive (Nov 2026): the exercise programme on WhatsApp, and DONE replies to reminders
    "patient_programme", "patient_log_exercise",
    // Additive (Nov 2026): the patient asked Joy for a person; admins are alerted
    "patient_request_callback",
    // Additive (Nov 2026): a pain and progress check-in from WhatsApp
    "patient_check_in",
  ]),
  actor: actorSchema,
  data: z.record(z.string(), z.unknown()).default({}),
  mutation: z.boolean().default(false),
}).strict();

const mutations = new Set([
  "physio_update_availability", "physio_session_note", "physio_visit_event", "physio_message_patient", "physio_feedback_request",
  "family_grant", "family_update_grant", "family_revoke_grant", "change_physio_request", "admin_escalation", "admin_verify_physio", "admin_reassign",
  "patient_record_consents", "patient_link_request", "patient_link_confirm", "patient_update_profile",
  "patient_log_exercise", "patient_request_callback", "patient_check_in",
]);

export async function POST(request: Request) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const authenticated = await authenticatedJson(request, schema); requestId = authenticated.requestId;
    const isMutation = mutations.has(authenticated.data.operation);
    const operationData = authenticated.data.data ?? {};
    if (isMutation !== authenticated.data.mutation) throw new Error("Operation mutation flag is invalid");
    assertJoyActorPersona(authenticated.data.operation, authenticated.data.actor);
    // Convex sends patient-facing messages (physio.patient_message) itself, so the
    // direct gateway path and this route deliver them the same way.
    const result = await callJoyConvexGateway(isMutation ? "operational_mutation" : "operational_query", {
      operation: authenticated.data.operation, data: { ...operationData, actor: authenticated.data.actor }, request_id: requestId,
    });
    return success(requestId, result);
  } catch (error) { return errorResponse(requestId, error); }
}
