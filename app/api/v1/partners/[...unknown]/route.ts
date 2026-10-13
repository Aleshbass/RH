import { apiError, newRequestId } from "@/lib/partner-api/http";

export const dynamic = "force-dynamic";

/** Unknown partner API paths return the documented JSON error instead of an HTML 404. */
function notFound() {
  return apiError(
    { requestId: newRequestId() },
    404,
    "resource_not_found",
    "Unknown endpoint. See https://docs.physioaroundme.com/api-reference for the available endpoints."
  );
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
