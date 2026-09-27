import { createHmac, randomUUID } from "crypto";

export class JoyEligibilityError extends Error {}

/**
 * RH asks Joy for a scoped, short-lived decision rather than accepting a
 * caller-supplied GREEN/AMBER boolean. Missing configuration fails closed.
 */
export async function verifyJoyEligibility(input: {
  patientId: string;
  assessmentId: string;
  assessmentRevision: number;
  serviceType: "standard_consultation" | "specialist_review";
  policyVersion: string;
}): Promise<{ eligibility_reference: string; expires_at: string }> {
  const url = process.env.JOY_SAFETY_ELIGIBILITY_URL;
  const secret = process.env.JOY_SAFETY_HMAC_SECRET;
  if (!url || !secret) throw new JoyEligibilityError("Joy safety eligibility is not configured");
  const body = JSON.stringify({
    rh_patient_id: input.patientId, assessment_id: input.assessmentId,
    assessment_revision: input.assessmentRevision, service_type: input.serviceType,
    policy_version: input.policyVersion,
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const requestId = randomUUID();
  const signature = createHmac("sha256", secret).update([timestamp, requestId, body].join("\n"), "utf8").digest("hex");
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", "X-RH-Timestamp": timestamp, "X-RH-Request-Id": requestId, "X-RH-Signature": signature }, body, cache: "no-store",
    });
  } catch (error) {
    // Network failures otherwise escape the route as a generic 503 with no
    // indication of which dependency failed. Never log the signed body or
    // signature; the request id is enough to correlate the two services.
    console.error("joy_safety_eligibility_unreachable", {
      request_id: requestId,
      origin: new URL(url).origin,
      error: error instanceof Error ? error.message : "fetch failed",
    });
    throw new JoyEligibilityError("Joy safety eligibility service is temporarily unreachable");
  }
  if (!response.ok) throw new JoyEligibilityError(`Joy safety eligibility rejected the request (${response.status})`);
  const data = await response.json() as { allowed?: boolean; eligibility_reference?: string; expires_at?: string };
  if (!data.allowed || !data.eligibility_reference || !data.expires_at) throw new JoyEligibilityError("Joy safety eligibility is not current for this service");
  return { eligibility_reference: data.eligibility_reference, expires_at: data.expires_at };
}
