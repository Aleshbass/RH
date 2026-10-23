import { NextResponse } from "next/server";
import { Resend } from "resend";
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
    const { name, email, phone, clinicName, message } = body;

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    // Everything below comes from a public form, so it is escaped before going into HTML.
    const safe = {
      name: escapeEmailText(name),
      email: escapeEmailText(email),
      phone: phone ? escapeEmailText(phone) : undefined,
      clinicName: clinicName ? escapeEmailText(clinicName) : undefined,
      message: message ? escapeEmailText(message) : undefined,
    };

    // Use a valid from address (fallback to onboarding@resend.dev in non-prod or when not configured)
    const fromAddress = process.env.RESEND_FROM_EMAIL ||
      (process.env.NODE_ENV === "production"
        ? "Rehabify Demo Requests <info@physioaroundme.com>"
        : "Rehabify Demo Requests <onboarding@resend.dev>");

    // Send email to admin/sales team
    const adminEmail = await resend.emails.send({
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
          paragraph(`<strong>${safe.name}</strong> asked for a demo from the Rehabify landing page. Please respond within 24 hours.`),
          details([
            ["Name", safe.name],
            ["Email", link(safe.email, `mailto:${safe.email}`)],
            ["Phone", safe.phone],
            ["Clinic or practice", safe.clinicName],
          ]),
          safe.message ? heading("Message") + quote(`<span style="white-space: pre-wrap;">${safe.message}</span>`) : "",
          actions(button(`Reply to ${safe.name}`, `mailto:${safe.email}`)),
        ].join(""),
        signOff: false,
        safetyNote: false,
        footerNote: "Internal notification for the Rehabify team.",
      }),
    });

    // Send confirmation email to the requester
    const confirmationEmail = await resend.emails.send({
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
          paragraph("Thank you for requesting a demo of Rehabify! We're excited to show you how the platform can transform your physiotherapy practice."),
          paragraph("Our team will review your request and contact you within 24 hours to schedule a personalised demo at a time that suits you."),
          heading("What to expect"),
          checklist([
            "A 30-minute personalised walkthrough",
            "The features most relevant to your practice",
            "Q&amp;A with our product experts",
            "A custom pricing discussion",
          ]),
          paragraph(`In the meantime, explore our learning resources at ${link("rehabifylearn.com", "https://www.rehabifylearn.com/")}.`),
        ].join(""),
        footerNote: "You're receiving this because you asked for a Rehabify demo.",
      }),
    });

    return NextResponse.json({
      success: true,
      message: "Demo request sent successfully",
      adminEmailId: adminEmail.data?.id,
      confirmationEmailId: confirmationEmail.data?.id,
    });
  } catch (error: any) {
    console.error("Error sending demo request email:", error);
    return NextResponse.json(
      {
        error: "Failed to send demo request",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
