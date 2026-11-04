import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_HOST, LEARN_HOST } from "@/lib/site-hosts";

// Signed-in areas: every dashboard (including the clinic portal) and the onboarding steps.
// Pages still check roles themselves; this stops signed-out visitors before anything renders.
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/role-selection",
  "/onboarding-complete",
  "/physiotherapist",
  "/doctor",
  "/clinic-owner",
  "/patient/(.*)",
]);

// Rehabify Learn pages served at the root of learn.* (/register -> /learn/register).
const LEARN_PAGES = /^\/(?:register|confirmation|course|courses|start|verify)(?:\/|$)/;

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

/** Strips docs./partners./api./learn./admin./www. so referral links always land on the main site. */
function apexHost(host: string): string {
  return host.replace(/^(docs|partners|api|learn|admin|www)\./, "");
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
    // robots.txt is answered per host by app/robots.ts
    if (url.pathname.startsWith("/api") || url.pathname === "/robots.txt") {
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
    // robots.txt is answered per host by app/robots.ts
    if (url.pathname.startsWith("/api") || url.pathname === "/robots.txt") {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    // On this host the partner auth pages are /sign-in and /sign-up (everything else is the portal)
    if (url.pathname === "/partners/sign-in" || url.pathname === "/partners/sign-up") {
      const target = url.clone();
      target.pathname = url.pathname.replace("/partners", "");
      return NextResponse.redirect(target);
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
    // robots.txt is answered per host by app/robots.ts
    if (url.pathname === "/robots.txt") {
      return NextResponse.next({ request: { headers: requestHeaders } });
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

  // 4. Subdomain: learn.physioaroundme.com (or learn.localhost) serves Rehabify Learn
  if (currentHost.startsWith("learn.")) {
    requestHeaders.set("x-subdomain-type", "learn");
    if (
      url.pathname.startsWith("/api") ||
      url.pathname === "/learn" ||
      url.pathname.startsWith("/learn/") ||
      url.pathname.startsWith("/sign-in") ||
      url.pathname.startsWith("/sign-up") ||
      url.pathname.startsWith("/sso-callback") ||
      url.pathname.includes(".") // robots.txt, manifest.json, ...
    ) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    if (url.pathname === "/" || LEARN_PAGES.test(url.pathname)) {
      const pathname = url.pathname === "/" ? "/learn" : `/learn${url.pathname}`;
      return NextResponse.rewrite(new URL(`${pathname}${url.search}`, req.url), {
        request: { headers: requestHeaders },
      });
    }
    // Every other page (pricing, find a physio, dashboards...) lives on the main site
    const mainHost = hostname.toLowerCase().replace(/^learn\./, "");
    return NextResponse.redirect(new URL(`${url.pathname}${url.search}`, `${protocolFor(req, currentHost)}://${mainHost}`));
  }

  // Main site: /learn moves to the Learn host once NEXT_PUBLIC_LEARN_URL is set
  if (
    LEARN_HOST &&
    (url.pathname === "/learn" || url.pathname.startsWith("/learn/")) &&
    apexHost(currentHost) === apexHost(LEARN_HOST)
  ) {
    const learnPath = url.pathname.replace(/^\/learn/, "") || "/";
    return NextResponse.redirect(new URL(`${learnPath}${url.search}`, `https://${LEARN_HOST}`), 308);
  }

  // 5. Subdomain: admin.physioaroundme.com (or admin.localhost) serves the admin dashboard.
  // Admin pages keep their /dashboard/admin paths so every existing link works here.
  if (currentHost.startsWith("admin.")) {
    requestHeaders.set("x-subdomain-type", "admin");
    // A redirect, not a rewrite: the dashboard shell reads the browser path
    if (url.pathname === "/") {
      return NextResponse.redirect(new URL(`/dashboard/admin${url.search}`, req.url));
    }
    if (
      url.pathname.startsWith("/api") ||
      url.pathname === "/dashboard/admin" ||
      url.pathname.startsWith("/dashboard/admin/") ||
      url.pathname.startsWith("/sign-in") ||
      url.pathname.startsWith("/sign-up") ||
      url.pathname.startsWith("/sso-callback") ||
      url.pathname.includes(".")
    ) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    // Everything that isn't the admin dashboard lives on the main site
    const mainHost = hostname.toLowerCase().replace(/^admin\./, "");
    return NextResponse.redirect(new URL(`${url.pathname}${url.search}`, `${protocolFor(req, currentHost)}://${mainHost}`));
  }

  // Main site: the admin dashboard moves to the admin host once NEXT_PUBLIC_ADMIN_URL is set
  if (
    ADMIN_HOST &&
    (url.pathname === "/dashboard/admin" || url.pathname.startsWith("/dashboard/admin/")) &&
    apexHost(currentHost) === apexHost(ADMIN_HOST)
  ) {
    return NextResponse.redirect(new URL(`${url.pathname}${url.search}`, `https://${ADMIN_HOST}`), 308);
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
  // Signed-out visitors to a protected page go to our own sign-in (not Clerk's hosted page), and
  // come back to that page afterwards (lib/auth/ssoRedirect.ts keeps same-site addresses)
}, { signInUrl: "/sign-in", signUpUrl: "/sign-up" });

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|rhx|wasm)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
