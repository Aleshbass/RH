import type { NextRequest } from "next/server";
import { GET as listProviders } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Alias of GET /v1/partners/providers (kept for early integrations; not documented).
export async function GET(req: NextRequest) {
  return listProviders(req);
}
