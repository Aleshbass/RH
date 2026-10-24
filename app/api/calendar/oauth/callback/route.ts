import { NextRequest, NextResponse } from "next/server";
import { fetchAction } from "convex/nextjs";
import type { FunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";

// The generated api types sit at TypeScript's depth limit: name the one function this route needs
const exchangeCode = (api as unknown as { calendar: { oauth: { exchangeCode: FunctionReference<"action"> } } }).calendar.oauth.exchangeCode;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard/physiotherapist/settings/calendar?calendar_error=${error}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/physiotherapist/settings/calendar?calendar_error=missing_params", request.url)
    );
  }

  try {
    // Exchange code for tokens
    await fetchAction(exchangeCode, {
      code,
      state,
    });

    return NextResponse.redirect(
      new URL("/dashboard/physiotherapist/settings/calendar?calendar_success=true", request.url)
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/dashboard/physiotherapist/settings/calendar?calendar_error=exchange_failed", request.url)
    );
  }
}
