import { NextResponse } from "next/server";
import { Resend } from "resend";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import {
  checkRateLimit,
  getClientIp,
  createRateLimitResponse,
} from "@/lib/rate-limiter";
import {
  actions,
  button,
  checklist,
  details,
  escapeEmailText,
  greeting,
  heading,
  link,
  paragraph,
  quote,
  renderEmail,
} from "@/lib/email/layout";
import { publicAppUrl } from "@/lib/public-app-url";

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const requestDemoRef = makeFunctionReference<
  "mutation",
  { name: string; email: string; organization: string; phone?: string; message?: string },
  { success: boolean }
>("public:requestDemo");

export async function POST(request: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const clientIp = getClientIp(request);
    const rateLimitResult = await checkRateLimit(
      `book-demo:${clientIp}`,
      "public_form"
    );

    if (!rateLimitResult.success) {
      return createRateLimitResponse({
        rateLimitResult,
        customMessage:
          "Too many demo requests submitted from this IP. Please wait before submitting again.",
      });
    }

    const body = await request.json();
    const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
    const name = text(body.name);
    const email = text(body.email);
    const phone = text(body.phone);
    // Older forms sent clinicName
    const organization = text(body.organization) || text(body.clinicName);
    const message = text(body.message);

    // Validate required fields
    if (!name || !email || !organization) {
      return NextResponse.json(
        { error: "Name, email and organisation are required" },
        { status: 400 }
      );
    }

    // Saved first, so the request reaches admin (Partnerships › Inquiries) even if email fails
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    await convex.mutation(requestDemoRef, {
      name,
      email,
      organization,
      phone: phone || undefined,
      message: message || undefined,
    });

    // Everything below comes from a public form, so it is escaped before going into HTML.
    const safe = {
      name: escapeEmailText(name),
      email: escapeEmailText(email),
      phone: phone ? escapeEmailText(phone) : undefined,
      organization: escapeEmailText(organization),
      message: message ? escapeEmailText(message) : undefined,
    };

    // Use a valid from address (fallback to onboarding@resend.dev in non-prod or when not configured)
    const fromAddress = process.env.RESEND_FROM_EMAIL ||
      (process.env.NODE_ENV === "production"
        ? "Rehabify Demo Requests <info@physioaroundme.com>"
        : "Rehabify Demo Requests <onboarding@resend.dev>");

    // The request is already saved, so a mail outage is logged rather than shown to the visitor
    try {
      // Send email to admin/sales team
      await resend.emails.send({
        from: fromAddress,
        to: process.env.DEMO_REQUEST_EMAIL || "support@physioaroundme.com",
        replyTo: email,
        subject: `New Demo Request from ${name}`,
        html: renderEmail({
          eyebrow: "Demo request",
          tone: "warning",
          title: "New demo request",
          preheader: `${name} asked for a demo of Rehabify.`,
          body: [
            paragraph(`<strong>${safe.name}</strong> asked for a demo from the Rehabify partners page. Please respond within 24 hours.`),
            details([
              ["Name", safe.name],
              ["Email", link(safe.email, `mailto:${safe.email}`)],
              ["Phone", safe.phone],
              ["Organisation", safe.organization],
            ]),
            safe.message ? heading("What they'd like to see") + quote(`<span style="white-space: pre-wrap;">${safe.message}</span>`) : "",
            actions(button("Open in admin", `${publicAppUrl()}/dashboard/admin/partnerships?tab=inquiries`)),
          ].join(""),
          signOff: false,
          safetyNote: false,
          footerNote: "Internal notification for the Rehabify team.",
        }),
      });

      // Send confirmation email to the requester
      await resend.emails.send({
        from: fromAddress,
        to: email,
        subject: "Demo Request Received - Rehabify",
        html: renderEmail({
          eyebrow: "Demo request received",
          tone: "success",
          title: "Thank you for your interest!",
          preheader: "Our team will contact you within 24 hours to schedule your demo.",
          body: [
            greeting(safe.name),
            paragraph("Thank you for requesting a demo of Rehabify. We'll contact you within 24 hours to pick a time that suits you."),
            heading("What to expect"),
            checklist([
              "A 30-minute walkthrough",
              "The parts of Rehabify most relevant to your organisation",
              "Time for your questions",
            ]),
          ].join(""),
          footerNote: "You're receiving this because you asked for a Rehabify demo.",
        }),
      });
    } catch (emailError) {
      console.error("Demo request saved, but the emails failed:", emailError);
    }

    return NextResponse.json({ success: true, message: "Demo request sent successfully" });
  } catch (error) {
    console.error("Error saving demo request:", error);
    return NextResponse.json({ error: "We couldn't send your request. Please try again." }, { status: 500 });
  }
}
