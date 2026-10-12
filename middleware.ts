import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/server"]);

export default clerkMiddleware(async (auth, req) => {
  const url = req.nextUrl;
  const hostname = req.headers.get("host") || "";
  const currentHost = hostname.replace(/:\d+$/, "").toLowerCase(); // strip port e.g. :3000

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-current-host", currentHost);
  requestHeaders.set("x-pathname", url.pathname);

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
      const protocol = req.headers.get("x-forwarded-proto") || (currentHost.includes("localhost") ? "http" : "https");
      return NextResponse.redirect(new URL(url.pathname, `${protocol}://${partnersHost}`));
    }
    // Allow auth, sso, referral landing, and tracking
    if (
      url.pathname.startsWith("/sign-in") ||
      url.pathname.startsWith("/sign-up") ||
      url.pathname.startsWith("/sso-callback") ||
      url.pathname.startsWith("/r/") ||
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
    // Allow care tracker, auth, sso-callback, referral links, and onboarding to resolve directly
    if (
      url.pathname.startsWith("/track") ||
      url.pathname.startsWith("/sign-in") ||
      url.pathname.startsWith("/sign-up") ||
      url.pathname.startsWith("/sso-callback") ||
      url.pathname.startsWith("/r/") ||
      url.pathname.startsWith("/onboarding")
    ) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    // Redirect docs requests to the docs subdomain
    if (url.pathname === "/docs" || url.pathname.startsWith("/docs/")) {
      const docsHost = currentHost.replace("partners.", "docs.");
      const protocol = req.headers.get("x-forwarded-proto") || (currentHost.includes("localhost") ? "http" : "https");
      return NextResponse.redirect(new URL(url.pathname, `${protocol}://${docsHost}`));
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

    // Standard CORS preflight for B2B API integrations
    if (req.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-Request-Id, X-Trace-Id",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    let pathname = url.pathname;
    if (!pathname.startsWith("/api")) {
      pathname = pathname === "/" ? "/api" : `/api${pathname}`;
    }
    const response = NextResponse.rewrite(new URL(pathname, req.url), {
      request: { headers: requestHeaders },
    });
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Request-Id, X-Trace-Id");
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
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
