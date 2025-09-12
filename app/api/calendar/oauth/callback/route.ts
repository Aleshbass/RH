import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      console.error("OAuth error:", error);
      return NextResponse.redirect(
        new URL("/dashboard/physiotherapist/settings?calendar_error=access_denied", request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/dashboard/physiotherapist/settings?calendar_error=missing_params", request.url)
      );
    }

    // Exchange code for tokens
    const result = await convex.action(api.calendar.oauth.exchangeCode, {
      code,
      state,
    });

    // Immediately sync calendars to populate the UI
    try {
      if (result?.userId) {
        await convex.action(api.calendar.service.syncCalendars, {
          userId: result.userId,
        });
      }
    } catch (syncError) {
      console.error("Failed to sync calendars after OAuth:", syncError);
      // Continue with redirect even if sync fails - user can retry sync later
    }

    // Redirect back to settings with success
    return NextResponse.redirect(
      new URL("/dashboard/physiotherapist/settings?calendar_success=true", request.url)
    );
  } catch (error) {
    console.error("Calendar OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/dashboard/physiotherapist/settings?calendar_error=exchange_failed", request.url)
    );
  }
}
