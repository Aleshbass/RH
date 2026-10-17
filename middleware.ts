import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const isProtectedRoute = createRouteMatcher(["/server"]);

// Partner referral-link attribution (documented: 30-day first-party cookie for
// physioaroundme.com and all its subdomains; first partner wins at sign-up/booking).
const REFERRAL_COOKIE = "rhb_partner_ref";
const REFERRAL_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
const REFERRAL_PATH = /^\/r\/([A-Za-z0-9_-]{3,64})\/?$/;
const PUBLIC_API_PATH = /^\/(?:api\/)?v1\/(?:public\/|openapi\.json$)/;

/** ".physioaroundme.com" for any physioaroundme.com host; undefined elsewhere (localhost, previews). */
function parentCookieDomain(host: string): string | undefined {
  return host === "physioaroundme.com" || host.endsWith(".physioaroundme.com") ? ".physioaroundme.com" : undefined;
}

/** Strips docs./partners./api./www. so referral links always land on the main site. */
function apexHost(host: string): string {
  return host.replace(/^(docs|partners|api|www)\./, "");
}

function protocolFor(req: NextRequest, host: string): string {
  return req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
}

function withReferralCookie(response: NextResponse, req: NextRequest, host: string, publicCode: string): NextResponse {
  const now = Date.now();
  const value = JSON.stringify({ publicCode, capturedAt: now, expiresAt: now + REFERRAL_COOKIE_MAX_AGE * 1000 });
  response.cookies.set(REFERRAL_COOKIE, value, {
    domain: parentCookieDomain(host),
    path: "/",
    maxAge: REFERRAL_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: protocolFor(req, host) === "https",
    // Read by the client at sign-up/booking; the code is validated server-side.
    httpOnly: false,
  });
  return response;
}

export default clerkMiddleware(async (auth, req) => {
  const url = req.nextUrl;
  const hostname = req.headers.get("host") || "";
  const currentHost = hostname.replace(/:\d+$/, "").toLowerCase(); // strip port e.g. :3000

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-current-host", currentHost);
  requestHeaders.set("x-pathname", url.pathname);

  // Referral links: always served from the main site (so sign-up and booking happen
  // there), with the attribution cookie set server-side on the parent domain.
  const referralMatch = url.pathname.match(REFERRAL_PATH);
  if (referralMatch) {
    const apex = apexHost(hostname.toLowerCase());
    if (apex !== hostname.toLowerCase()) {
      const target = new URL(`${protocolFor(req, currentHost)}://${apex}${url.pathname}${url.search}`);
      return withReferralCookie(NextResponse.redirect(target, 307), req, currentHost, referralMatch[1]);
    }
    return withReferralCookie(NextResponse.next({ request: { headers: requestHeaders } }), req, currentHost, referralMatch[1]);
  }

  // 1. Subdomain: docs.physioaroundme.com (or docs.localhost)
  if (currentHost.startsWith("docs.")) {
    requestHeaders.set("x-is-b2b-subdomain", "true");
    requestHeaders.set("x-subdomain-type", "docs");
    if (url.pathname.startsWith("/api")) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    // Symmetrical redirect for partner portal
    if (url.pathname === "/partners" || url.pathname.startsWith("/partners/")) {
      const partnersHost = currentHost.replace("docs.", "partners.");
      return NextResponse.redirect(new URL(url.pathname, `${protocolFor(req, currentHost)}://${partnersHost}`));
    }
    if (url.pathname === "/openapi.json") {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    // Allow auth, sso and tracking
    if (
      url.pathname.startsWith("/sign-in") ||
      url.pathname.startsWith("/sign-up") ||
      url.pathname.startsWith("/sso-callback") ||
      url.pathname.startsWith("/track")
    ) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    const pathname =
      url.pathname === "/"
        ? "/docs"
        : url.pathname.startsWith("/docs")
          ? url.pathname
          : `/docs${url.pathname}`;
    return NextResponse.rewrite(new URL(pathname, req.url), {
      request: { headers: requestHeaders },
    });
  }

  // 2. Subdomain: partners.physioaroundme.com (or partners.localhost)
  if (currentHost.startsWith("partners.")) {
    requestHeaders.set("x-is-b2b-subdomain", "true");
    requestHeaders.set("x-subdomain-type", "partners");
    if (url.pathname.startsWith("/api")) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    // Allow care tracker, auth, sso-callback and onboarding to resolve directly
    if (
      url.pathname.startsWith("/track") ||
      url.pathname.startsWith("/sign-in") ||
      url.pathname.startsWith("/sign-up") ||
      url.pathname.startsWith("/sso-callback") ||
      url.pathname.startsWith("/onboarding")
    ) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    // Redirect docs requests to the docs subdomain
    if (url.pathname === "/docs" || url.pathname.startsWith("/docs/")) {
      const docsHost = currentHost.replace("partners.", "docs.");
      return NextResponse.redirect(new URL(url.pathname, `${protocolFor(req, currentHost)}://${docsHost}`));
    }
    const pathname =
      url.pathname === "/"
        ? "/partners/portal"
        : url.pathname.startsWith("/partners/portal")
          ? url.pathname
          : `/partners/portal${url.pathname}`;
    return NextResponse.rewrite(new URL(pathname, req.url), {
      request: { headers: requestHeaders },
    });
  }

  // 3. Subdomain: api.physioaroundme.com (or api.localhost)
  if (currentHost.startsWith("api.")) {
    requestHeaders.set("x-is-b2b-subdomain", "true");
    requestHeaders.set("x-subdomain-type", "api");

    // Partner endpoints are server-to-server (secret keys) and send no CORS headers.
    // Only the public lead endpoint and the OpenAPI document are browser-callable.
    const isPublic = PUBLIC_API_PATH.test(url.pathname);
    const corsHeaders: Record<string, string> = isPublic
      ? {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        }
      : {};

    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: corsHeaders });
    }

    let pathname = url.pathname;
    if (!pathname.startsWith("/api")) {
      pathname = pathname === "/" ? "/api" : `/api${pathname}`;
    }
    const response = NextResponse.rewrite(new URL(pathname, req.url), {
      request: { headers: requestHeaders },
    });
    for (const [key, value] of Object.entries(corsHeaders)) response.headers.set(key, value);
    return response;
  }

  // Backwards-compatibility: /dashboard/partner redirects to /partners/portal
  if (url.pathname === "/dashboard/partner" || url.pathname.startsWith("/dashboard/partner/")) {
    const newPath = url.pathname.replace("/dashboard/partner", "/partners/portal");
    return NextResponse.redirect(new URL(newPath, req.url));
  }

  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|rhx|wasm)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
