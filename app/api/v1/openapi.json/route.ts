import spec from "@/public/openapi.json";

export const dynamic = "force-static";

/** OpenAPI 3.1 description of the partner API (also served at https://physioaroundme.com/openapi.json). */
export function GET() {
  return Response.json(spec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
