import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
import { JoyAuthError } from "@/lib/joy-integration/auth";

export const runtime = "nodejs";

// Joy's structured intake and summaries for one assessment revision, handed to the treating
// physio (see convex/joyHandoff.ts). Re-sending a revision replaces it.
const qa = z.object({ question: z.string().min(1).max(300), answer: z.string().min(1).max(1000) }).strict();

const requestSchema = z.object({
  booking_id: z.string().min(1).max(100).optional(),
  joy_conversation_id: z.string().min(1).max(160),
  assessment_id: z.string().min(1).max(160),
  assessment_revision: z.number().int().positive(),
  protocol_version: z.string().max(80).optional(),
  triage_level: z.enum(["green", "amber", "red"]).optional(),
  chief_complaint: z.string().max(500).optional(),
  body_areas: z.array(z.string().min(1).max(60)).max(10).optional(),
  pain_score: z.number().min(0).max(10).optional(),
  onset: z.string().max(300).optional(),
  duration: z.string().max(100).optional(),
  red_flags: z.array(z.object({ question: z.string().min(1).max(300), answer: z.string().min(1).max(300), flagged: z.boolean() }).strict()).max(30).optional(),
  aggravating_factors: z.array(z.string().min(1).max(200)).max(15).optional(),
  easing_factors: z.array(z.string().min(1).max(200)).max(15).optional(),
  goals: z.string().max(1000).optional(),
  medical_history: z.string().max(2000).optional(),
  medications: z.string().max(1000).optional(),
  answers: z.array(qa).max(60).optional(),
  clinician_summary: z.string().max(4000).optional(),
  patient_summary: z.string().max(2000).optional(),
  language: z.string().max(30).optional(),
  preferred_times: z.string().max(300).optional(),
  consent: z.object({
    share_with_clinician: z.boolean(),
    policy_version: z.string().max(100).optional(),
    acceptance_reference: z.string().max(200).optional(),
    given_at: z.number().int().positive().optional(),
  }).strict().optional(),
  actor: actorSchema,
}).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ patientId: string }> }) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    const { patientId } = await params;
    const authenticated = await authenticatedJson(request, requestSchema);
    requestId = authenticated.requestId;
    const { actor, joy_conversation_id, ...intake } = authenticated.data;
    if (actor.persona !== "patient" || (actor.rh_user_id && actor.rh_user_id !== patientId)) {
      throw new JoyAuthError(403, "FORBIDDEN", "Actor may only send their own intake");
    }
    const data = await callJoyConvexGateway("upsert_intake", {
      ...intake,
      patient_id: patientId,
      conversation_id: joy_conversation_id,
    });
    return success(requestId, data);
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
