/**
 * POST /api/myitura/loan-request
 *
 * Called when a patient submits the "Seek MediLoan" form on the booking page.
 *
 * What this does:
 *  1. Validates the patient's form fields
 *  2. Saves the request to Convex `loanRequests` table (status: "pending")
 *  3. Sends an email to the Rehabify admin inboxes (lib/email/adminRecipients) via Resend
 *     notifying them that a patient is interested in a MediLoan
 *  4. Returns success — the patient sees a confirmation message
 *
 * What this does NOT do:
 *  - Does NOT call the MyItura SDK (only Rehabify admin does that)
 *  - Does NOT require authentication (patients may not be signed in)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { platformAdminEmails } from "@/lib/email/adminRecipients";
import { publicAppUrl } from "@/lib/public-app-url";
import {
    actions,
    button,
    callout,
    details,
    escapeEmailText,
    highlight,
    paragraph,
    renderEmail,
} from "@/lib/email/layout";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import {
  checkRateLimit,
  getClientIp,
  createRateLimitResponse,
} from "@/lib/rate-limiter";

const resend = new Resend(process.env.RESEND_API_KEY);

const ADMIN_EMAILS = platformAdminEmails();
const FROM_EMAIL  = process.env.FROM_EMAIL || "noreply@physioaroundme.com";
const APP_URL     = publicAppUrl();

export async function POST(request: NextRequest) {
    try {
        const clientIp = getClientIp(request);
        const rateLimitResult = await checkRateLimit(
            `loan-request:${clientIp}`,
            "public_form"
        );

        if (!rateLimitResult.success) {
            return createRateLimitResponse({
                rateLimitResult,
                customMessage:
                    "Too many MediLoan requests submitted from your network. Please wait a few minutes before trying again.",
            });
        }

        const body = await request.json();
        const {
            firstName,
            lastName,
            phone,
            email,
            treatment,
            treatmentAmount,
            physiotherapistName,
            physiotherapistId,
        } = body;

        // ── Validation ────────────────────────────────────────────────────────
        if (!firstName?.trim() || !lastName?.trim() || !phone?.trim() || !treatment?.trim()) {
            return NextResponse.json(
                { error: "First name, last name, phone number, and treatment are required." },
                { status: 400 }
            );
        }

        // Validate Nigerian phone number
        const cleanPhone = phone.replace(/\s+/g, "");
        const phoneRegex = /^(\+?234|0)[7-9][0-1]\d{8}$/;
        if (!phoneRegex.test(cleanPhone)) {
            return NextResponse.json(
                { error: "Please enter a valid Nigerian phone number (e.g. 08012345678)" },
                { status: 400 }
            );
        }

        if (treatmentAmount !== undefined && (typeof treatmentAmount !== "number" || treatmentAmount < 0)) {
            return NextResponse.json(
                { error: "Treatment amount must be a positive number." },
                { status: 400 }
            );
        }

        // ── Save to Convex ────────────────────────────────────────────────────
        // A client per request: a signed-in patient's token links the request to their account,
        // so the admin sees their invoices and bookings when starting the loan
        const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
        const token = await (await auth()).getToken({ template: "convex" }).catch(() => null);
        if (token) convex.setAuth(token);
        const requestId = await convex.mutation(api.mediloan.submitLoanRequest, {
            patientFirstName: firstName.trim(),
            patientLastName: lastName.trim(),
            patientPhone: cleanPhone,
            patientEmail: email?.trim() || undefined,
            treatment: treatment.trim(),
            // ₦ to kobo; 0 when the patient didn't give one (the loan uses the invoice or booking amount)
            treatmentAmount: treatmentAmount ? Math.round(treatmentAmount * 100) : 0,
            // The physio whose booking page this came from (a Convex user id)
            physiotherapistId: typeof physiotherapistId === "string" && /^[a-z0-9]{20,40}$/.test(physiotherapistId) ? physiotherapistId : undefined,
        });

        // ── Send admin notification email via Resend ──────────────────────────
        const amountDisplay = treatmentAmount
            ? `₦${Number(treatmentAmount).toLocaleString()}`
            : "Not specified";

        const adminDashboardUrl = `${APP_URL}/dashboard/admin/loans`;

        // The form is public, so everything the patient typed is escaped before going into HTML.
        const safe = {
            firstName: escapeEmailText(firstName.trim()),
            lastName: escapeEmailText(lastName.trim()),
            phone: escapeEmailText(cleanPhone),
            email: email?.trim() ? escapeEmailText(email.trim()) : undefined,
            treatment: escapeEmailText(treatment.trim()),
            physiotherapistName: physiotherapistName ? escapeEmailText(physiotherapistName) : undefined,
        };

        await resend.emails.send({
            from: `Rehabify Health Notifications <${FROM_EMAIL}>`,
            to: ADMIN_EMAILS,
            subject: `🏦 New MediLoan Request — ${firstName} ${lastName}`,
            html: renderEmail({
                eyebrow: "Action required",
                tone: "warning",
                title: "New MediLoan request",
                preheader: `${firstName} ${lastName} asked for MediLoan financing.`,
                body: [
                    paragraph("A patient has asked for loan financing for their physiotherapy treatment."),
                    highlight({ label: "Estimated amount", value: amountDisplay, sub: safe.treatment }),
                    details([
                        ["Full name", `${safe.firstName} ${safe.lastName}`],
                        ["Phone number", safe.phone],
                        ["Email address", safe.email],
                        ["Treatment", safe.treatment],
                        ["Physiotherapist", safe.physiotherapistName],
                    ]),
                    callout("warning", "What to do", "This patient is waiting for a MediLoan to be started. Review their details in the admin dashboard and initiate the loan through MyItura. The patient gets an SMS with their application link as soon as you do."),
                    actions(button("Review in admin dashboard", adminDashboardUrl)),
                    paragraph(`Request ID: ${escapeEmailText(requestId)} &middot; Submitted ${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })} WAT`, { muted: true, size: 13, center: true }),
                ].join(""),
                signOff: false,
                safetyNote: false,
                footerNote: "MediLoan is powered by MyItura, an independent third party.",
            }),
        });

        return NextResponse.json({
            success: true,
            requestId,
            message: "Your loan request has been received. The Rehabify Health team will review it and you will receive an SMS from MediLoan shortly.",
        });

    } catch (error: any) {
        console.error("[MediLoan Loan Request] Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
