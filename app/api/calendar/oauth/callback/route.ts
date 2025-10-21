import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // Calendar integrations (OAuth) are disabled. Redirect with a clear message.
  return NextResponse.redirect(
    new URL("/dashboard/physiotherapist/settings?calendar_error=disabled", request.url)
  );
}
