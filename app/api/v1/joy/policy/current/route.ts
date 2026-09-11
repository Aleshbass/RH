import { z } from "zod";
import { authenticatedEmpty, errorResponse, success } from "@/lib/joy-integration/http";
import { consultationBookingPolicy } from "@/lib/joy-integration/policy";

export const runtime = "nodejs";

const querySchema = z.object({
  service_type: z.string().min(1).max(80).optional(),
  language: z.string().min(2).max(12).optional(),
}).strict();

/** Service-authenticated policy metadata. No Clerk session is accepted here. */
export async function GET(request: Request) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    requestId = await authenticatedEmpty(request);
    const url = new URL(request.url);
    const query = querySchema.parse({
      service_type: url.searchParams.get("service_type") ?? undefined,
      language: url.searchParams.get("language") ?? undefined,
    });
    // Version 1 has one English draft. Keeping the parameters parsed now makes
    // language/service-specific approved releases additive rather than breaking.
    void query;
    return success(requestId, consultationBookingPolicy);
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
