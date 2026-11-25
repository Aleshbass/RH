import { NextResponse } from "next/server";
import { sendEmailWithBackup } from "@/lib/email/deliver";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { checkRateLimit, getClientIp, createRateLimitResponse } from "@/lib/rate-limiter";
import { actions, button, details, escapeEmailText, greeting, link, paragraph, renderEmail } from "@/lib/email/layout";
import { publicAppUrl } from "@/lib/public-app-url";

type WellnessCheckArgs = {
  organisation: string;
  industry: string;
  employeeRange: string;
  location: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  interests: string[];
  message: string;
  consent: boolean;
};

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const registerWellnessCheckRef = makeFunctionReference<"mutation", WellnessCheckArgs, { success: boolean }>("public:registerWellnessCheck");

// Who hears about sign-ups: the same inboxes as pilot and demo requests
const TEAM_INBOXES = (process.env.DEMO_REQUEST_EMAIL || "support@physioaroundme.com,hello@myrehabifyhealth.com")
  .split(",")
  .map((address) => address.trim())
  .filter(Boolean);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Complimentary Workplace Wellness Check" on /platform/employers: save the sign-up for admin
 * (Partnerships › Inquiries, and Employer outreach), then email the team and the requester.
 */
export async function POST(request: Request) {
  try {
    const rateLimitResult = await checkRateLimit(`employer-wellness:${getClientIp(request)}`, "public_form");
    if (!rateLimitResult.success) {
      return createRateLimitResponse({
        rateLimitResult,
        customMessage: "Too many requests from this connection. Please wait a few minutes and try again.",
      });
    }

    const body = await request.json().catch(() => ({}));
    const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
    const args: WellnessCheckArgs = {
      organisation: text(body.organisation, 160),
      industry: text(body.industry, 120),
      employeeRange: text(body.employeeRange, 40),
      location: text(body.location, 160),
      name: text(body.name, 120),
      role: text(body.role, 120),
      email: text(body.email, 200),
      phone: text(body.phone, 40),
      interests: Array.isArray(body.interests) ? body.interests.map((i: unknown) => text(i, 120)).filter(Boolean).slice(0, 10) : [],
      message: text(body.message, 2000),
      consent: body.consent === true,
    };

    if (!args.organisation || !args.industry || !args.employeeRange || !args.location || !args.name || !args.role || !args.email || !args.phone) {
      return NextResponse.json({ error: "Please fill in every required field." }, { status: 400 });
    }
    if (!EMAIL_PATTERN.test(args.email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (!args.consent) {
      return NextResponse.json({ error: "Please agree to be contacted about your request." }, { status: 400 });
    }

    // Saved first, so the sign-up reaches admin even if email fails
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    await convex.mutation(registerWellnessCheckRef, args);

    // Everything below comes from a public form, so it is escaped before going into HTML
    const safe = {
      organisation: escapeEmailText(args.organisation),
      industry: escapeEmailText(args.industry),
      employeeRange: escapeEmailText(args.employeeRange),
      location: escapeEmailText(args.location),
      name: escapeEmailText(args.name),
      role: escapeEmailText(args.role),
      email: escapeEmailText(args.email),
      phone: escapeEmailText(args.phone),
      interests: escapeEmailText(args.interests.join(", ")),
      message: escapeEmailText(args.message),
    };

    const fromAddress =
      process.env.RESEND_FROM_EMAIL ||
      (process.env.NODE_ENV === "production" ? "Rehabify for Work <info@physioaroundme.com>" : "Rehabify for Work <onboarding@resend.dev>");

    // The sign-up is already saved, so a mail outage is logged rather than shown to the visitor
    try {
      await sendEmailWithBackup("employer-wellness", {
        from: fromAddress,
        to: TEAM_INBOXES,
        replyTo: args.email,
        subject: `Wellness check sign-up: ${args.organisation} (${args.employeeRange} employees, ${args.location})`,
        html: renderEmail({
          eyebrow: "Rehabify for Work",
          tone: "warning",
          title: "New workplace wellness check request",
          preheader: `${args.organisation} registered for a complimentary workplace wellness check.`,
          body: [
            paragraph(`<strong>${safe.name}</strong> from <strong>${safe.organisation}</strong> registered for a complimentary workplace wellness check.`),
            details([
              ["Organisation", safe.organisation],
              ["Industry", safe.industry],
              ["Employees", safe.employeeRange],
              ["Location", safe.location],
              ["Name", safe.name],
              ["Role", safe.role],
              ["Email", link(safe.email, `mailto:${safe.email}`)],
              ["WhatsApp / phone", link(safe.phone, `tel:${safe.phone}`)],
              ["Would like to improve", safe.interests || "Not given"],
              ["Anything else", safe.message || "Nothing added"],
            ]),
            actions(button("Open in admin", `${publicAppUrl()}/dashboard/admin/partnerships?tab=inquiries`)),
          ].join(""),
          signOff: false,
          safetyNote: false,
          footerNote: "Internal notification for the Rehabify team.",
        }),
      });

      await sendEmailWithBackup("employer-wellness", {
        from: fromAddress,
        to: args.email,
        subject: "We've received your workplace wellness check request - Rehabify",
        html: renderEmail({
          eyebrow: "Rehabify for Work",
          tone: "success",
          title: "Thanks for registering your interest",
          preheader: "Our team will contact you to discuss the next steps.",
          body: [
            greeting(safe.name),
            paragraph(
              `Thank you for registering ${safe.organisation} for a complimentary workplace wellness check. Our team will contact you to discuss the next steps.`
            ),
            paragraph(
              "The complimentary check is an introductory workplace physical-health review, not a comprehensive medical examination or a substitute for individual clinical care. Visits are subject to availability and confirmation."
            ),
          ].join(""),
          footerNote: "You're receiving this because you registered for a workplace wellness check with Rehabify.",
        }),
      });
    } catch (emailError) {
      console.error("Wellness check sign-up saved, but the emails failed:", emailError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving wellness check sign-up:", error);
    return NextResponse.json({ error: "We couldn't send your request. Please try again." }, { status: 500 });
  }
}
