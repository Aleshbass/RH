import { NextResponse } from "next/server";
import { sendEmailWithBackup } from "@/lib/email/deliver";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { checkRateLimit, getClientIp, createRateLimitResponse } from "@/lib/rate-limiter";
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
  renderEmail,
} from "@/lib/email/layout";
import { publicAppUrl } from "@/lib/public-app-url";

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const requestEmployerPilotRef = makeFunctionReference<
  "mutation",
  { name: string; company: string; role: string; email: string; phone: string; workerCount: number; workType: string },
  { success: boolean }
>("public:requestEmployerPilot");

// Who hears about pilot requests: the same inboxes as demo requests
const TEAM_INBOXES = (process.env.DEMO_REQUEST_EMAIL || "support@physioaroundme.com,hello@myrehabifyhealth.com")
  .split(",")
  .map((address) => address.trim())
  .filter(Boolean);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Request a pilot" on /platform/employers: save for admin, then email the team and the requester. */
export async function POST(request: Request) {
  try {
    const rateLimitResult = await checkRateLimit(`employer-pilot:${getClientIp(request)}`, "public_form");
    if (!rateLimitResult.success) {
      return createRateLimitResponse({
        rateLimitResult,
        customMessage: "Too many requests from this connection. Please wait a few minutes and try again.",
      });
    }

    const body = await request.json().catch(() => ({}));
    const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
    const name = text(body.name, 120);
    const company = text(body.company, 160);
    const role = text(body.role, 120);
    const email = text(body.email, 200);
    const phone = text(body.phone, 40);
    const workType = text(body.workType, 300);
    const workerCount = Math.round(Number(body.workerCount));

    if (!name || !company || !role || !email || !phone || !workType) {
      return NextResponse.json({ error: "Please fill in every field." }, { status: 400 });
    }
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (!Number.isFinite(workerCount) || workerCount < 1 || workerCount > 1_000_000) {
      return NextResponse.json({ error: "Enter how many workers you have." }, { status: 400 });
    }

    // Saved first, so the request reaches admin (Partnerships › Inquiries) even if email fails
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    await convex.mutation(requestEmployerPilotRef, { name, company, role, email, phone, workerCount, workType });

    // Everything below comes from a public form, so it is escaped before going into HTML.
    const safe = {
      name: escapeEmailText(name),
      company: escapeEmailText(company),
      role: escapeEmailText(role),
      email: escapeEmailText(email),
      phone: escapeEmailText(phone),
      workType: escapeEmailText(workType),
    };
    const workers = workerCount.toLocaleString("en-NG");

    const fromAddress =
      process.env.RESEND_FROM_EMAIL ||
      (process.env.NODE_ENV === "production"
        ? "Rehabify for Work <info@physioaroundme.com>"
        : "Rehabify for Work <onboarding@resend.dev>");

    // The request is already saved, so a mail outage is logged rather than shown to the visitor
    try {
      await sendEmailWithBackup("employer-pilot", {
        from: fromAddress,
        to: TEAM_INBOXES,
        replyTo: email,
        subject: `Pilot request: ${company} (${workers} workers)`,
        html: renderEmail({
          eyebrow: "Rehabify for Work",
          tone: "warning",
          title: "New pilot request",
          preheader: `${company} asked for a Rehabify for Work pilot.`,
          body: [
            paragraph(`<strong>${safe.name}</strong> from <strong>${safe.company}</strong> asked for a pilot on the employers page.`),
            details([
              ["Name", safe.name],
              ["Role", safe.role],
              ["Company", safe.company],
              ["Email", link(safe.email, `mailto:${safe.email}`)],
              ["Phone", link(safe.phone, `tel:${safe.phone}`)],
              ["Workers", workers],
              ["Type of work", safe.workType],
            ]),
            actions(button("Open in admin", `${publicAppUrl()}/dashboard/admin/partnerships?tab=inquiries`)),
          ].join(""),
          signOff: false,
          safetyNote: false,
          footerNote: "Internal notification for the Rehabify team.",
        }),
      });

      await sendEmailWithBackup("employer-pilot", {
        from: fromAddress,
        to: email,
        subject: "We've received your pilot request - Rehabify for Work",
        html: renderEmail({
          eyebrow: "Rehabify for Work",
          tone: "success",
          title: "Thanks for your interest",
          preheader: "Our team will be in touch to plan your pilot.",
          body: [
            greeting(safe.name),
            paragraph(`Thank you for asking about a Rehabify for Work pilot for ${safe.company}. Our team will be in touch to plan it with you.`),
            heading("What we'll cover"),
            checklist([
              "How Joy checks in with your workers on WhatsApp",
              "Fast virtual consultations with licensed physiotherapists",
              "The monthly report you'll receive, with no individual health details shared",
              "Pricing for your team",
            ]),
          ].join(""),
          footerNote: "You're receiving this because you asked for a Rehabify for Work pilot.",
        }),
      });
    } catch (emailError) {
      console.error("Pilot request saved, but the emails failed:", emailError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving pilot request:", error);
    return NextResponse.json({ error: "We couldn't send your request. Please try again." }, { status: 500 });
  }
}
