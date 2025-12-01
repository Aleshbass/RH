import { NextRequest, NextResponse } from "next/server";
import { fetchMutation, fetchAction } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard/physiotherapist/settings?calendar_error=${error}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/physiotherapist/settings?calendar_error=missing_params", request.url)
    );
  }

  try {
    // Exchange code for tokens
    await fetchAction(api.calendar.oauth.exchangeCode, {
      code,
      state,
    });

    return NextResponse.redirect(
      new URL("/dashboard/physiotherapist/settings?calendar_success=true", request.url)
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/dashboard/physiotherapist/settings?calendar_error=exchange_failed", request.url)
    );
  }
}
