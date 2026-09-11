import { z } from "zod";
import { authenticatedEmpty, errorResponse, success } from "@/lib/joy-integration/http";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";

export const runtime = "nodejs";

const querySchema = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
  duration_minutes: z.coerce.number().int().min(5).max(180),
  service_mode: z.enum(["home_visit", "clinic", "online"]),
  time_zone: z.literal("Africa/Lagos").default("Africa/Lagos"),
}).strict();

export async function GET(request: Request, context: { params: Promise<{ physioId: string }> }) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    requestId = await authenticatedEmpty(request);
    const { physioId } = await context.params;
    const url = new URL(request.url);
    const input = querySchema.parse({
      from: url.searchParams.get("from"), to: url.searchParams.get("to"),
      duration_minutes: url.searchParams.get("duration_minutes"),
      service_mode: url.searchParams.get("service_mode"), time_zone: url.searchParams.get("time_zone") ?? "Africa/Lagos",
    });
    if (input.to <= input.from || input.from < Date.now()) {
      return errorResponse(requestId, new Error("Invalid time range"));
    }
    const result = await callJoyConvexGateway("resolve_availability_profile", {
      physiotherapist_id: physioId, service_mode: input.service_mode, start: input.from,
      end: input.to, duration_minutes: input.duration_minutes,
    });
    return success(requestId, result);
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
