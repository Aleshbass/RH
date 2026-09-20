import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";

export const runtime = "nodejs";

const schema = z.object({
  operation: z.enum([
    "physio_work_summary", "physio_update_availability", "physio_session_note", "physio_visit_event", "physio_message_patient", "physio_feedback_request",
    "family_resolve", "family_grant", "family_update_grant", "family_revoke_grant", "family_care_summary", "change_physio_request",
    "admin_patient", "admin_physio", "admin_finance_summary", "admin_escalation", "admin_verify_physio", "admin_reassign",
  ]),
  actor: actorSchema,
  data: z.record(z.string(), z.unknown()).default({}),
  mutation: z.boolean().default(false),
}).strict();

const mutations = new Set([
  "physio_update_availability", "physio_session_note", "physio_visit_event", "physio_message_patient", "physio_feedback_request",
  "family_grant", "family_update_grant", "family_revoke_grant", "change_physio_request", "admin_escalation", "admin_verify_physio", "admin_reassign",
]);

export async function POST(request: Request) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const authenticated = await authenticatedJson(request, schema); requestId = authenticated.requestId;
    const isMutation = mutations.has(authenticated.data.operation);
    if (isMutation !== authenticated.data.mutation) throw new Error("Operation mutation flag is invalid");
    const expectedPersona = authenticated.data.operation.startsWith("physio_") ? "physiotherapist"
      : authenticated.data.operation.startsWith("family_") ? "family"
      : authenticated.data.operation.startsWith("admin_") ? "admin" : "patient";
    if (authenticated.data.actor.persona !== expectedPersona) throw new Error("Actor is not authorized for this operation");
    const result = await callJoyConvexGateway(isMutation ? "operational_mutation" : "operational_query", {
      operation: authenticated.data.operation, data: { ...authenticated.data.data, actor: authenticated.data.actor }, request_id: requestId,
    });
    return success(requestId, result);
  } catch (error) { return errorResponse(requestId, error); }
}
