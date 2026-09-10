import { authenticatedEmpty, errorResponse, success } from "@/lib/joy-integration/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let requestId = request.headers.get("X-Request-Id") ?? "unknown";
  try {
    requestId = await authenticatedEmpty(request);
    return success(requestId, { status: "ok", api_version: "1", service: "rh-joy-integration" });
  } catch (error) {
    return errorResponse(requestId, error);
  }
}
