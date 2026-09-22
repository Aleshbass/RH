/**
 * POST /api/myitura/loan-request
 *
 * Called when a patient submits the "Seek MediLoan" form on the booking page.
 *
 * What this does:
 *  1. Validates the patient's form fields
 *  2. Saves the request to Convex `loanRequests` table (status: "pending")
 *  3. Sends an email to the Rehabify admin (PLATFORM_ADMIN_EMAIL) via Resend
 *     notifying them that a patient is interested in a MediLoan
 *  4. Returns success — the patient sees a confirmation message
 *
 * What this does NOT do:
 *  - Does NOT call the MyItura SDK (only Rehabify admin does that)
 *  - Does NOT require authentication (patients may not be signed in)
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import {
  checkRateLimit,
  getClientIp,
  createRateLimitResponse,
} from "@/lib/rate-limiter";

const resend = new Resend(process.env.RESEND_API_KEY);
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL || "admin@physioaroundme.com";
const FROM_EMAIL  = process.env.FROM_EMAIL || "noreply@physioaroundme.com";
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL || "https://rehabifyhealth.com";

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
        // Use the HTTP client without auth (public mutation)
        const requestId = await convex.mutation(api.mediloan.submitLoanRequest, {
            patientFirstName: firstName.trim(),
            patientLastName: lastName.trim(),
            patientPhone: cleanPhone,
            patientEmail: email?.trim() || undefined,
            treatment: treatment.trim(),
            treatmentAmount: treatmentAmount ? Math.round(treatmentAmount * 100) : 100, // convert ₦ to kobo
        });

        // ── Send admin notification email via Resend ──────────────────────────
        const amountDisplay = treatmentAmount
            ? `₦${Number(treatmentAmount).toLocaleString()}`
            : "Not specified";

        const adminDashboardUrl = `${APP_URL}/dashboard/admin/loans`;

        await resend.emails.send({
            from: `Rehabify Health Notifications <${FROM_EMAIL}>`,
            to: ADMIN_EMAIL,
            subject: `🏦 New MediLoan Request — ${firstName} ${lastName}`,
            html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#065f46,#047857);padding:32px 40px;">
              <p style="margin:0;font-size:12px;color:#6ee7b7;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Rehabify Health</p>
              <h1 style="margin:8px 0 0;font-size:24px;font-weight:700;color:#ffffff;">New MediLoan Request</h1>
              <p style="margin:8px 0 0;font-size:14px;color:#a7f3d0;">A patient has requested loan financing for their physiotherapy treatment.</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">

              <!-- Patient Info -->
              <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#111827;">Patient Details</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
                    <span style="font-size:12px;color:#6b7280;display:block;margin-bottom:2px;">Full Name</span>
                    <span style="font-size:15px;font-weight:600;color:#111827;">${firstName} ${lastName}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
                    <span style="font-size:12px;color:#6b7280;display:block;margin-bottom:2px;">Phone Number</span>
                    <span style="font-size:15px;font-weight:600;color:#111827;">${cleanPhone}</span>
                  </td>
                </tr>
                ${email ? `
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
                    <span style="font-size:12px;color:#6b7280;display:block;margin-bottom:2px;">Email Address</span>
                    <span style="font-size:15px;font-weight:600;color:#111827;">${email}</span>
                  </td>
                </tr>` : ""}
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
                    <span style="font-size:12px;color:#6b7280;display:block;margin-bottom:2px;">Treatment</span>
                    <span style="font-size:15px;font-weight:600;color:#111827;">${treatment}</span>
                  </td>
                </tr>
                ${physiotherapistName ? `
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
                    <span style="font-size:12px;color:#6b7280;display:block;margin-bottom:2px;">Physiotherapist</span>
                    <span style="font-size:15px;font-weight:600;color:#111827;">${physiotherapistName}</span>
                  </td>
                </tr>` : ""}
                <tr>
                  <td style="padding:12px 16px;">
                    <span style="font-size:12px;color:#6b7280;display:block;margin-bottom:2px;">Estimated Amount</span>
                    <span style="font-size:18px;font-weight:700;color:#065f46;">${amountDisplay}</span>
                  </td>
                </tr>
              </table>

              <!-- Instructions -->
              <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin-bottom:24px;">
                <p style="margin:0;font-size:14px;color:#92400e;font-weight:600;">⚡ Action Required</p>
                <p style="margin:8px 0 0;font-size:13px;color:#78350f;line-height:1.6;">
                  This patient is awaiting a MediLoan initiation. Log into the admin dashboard to review their details and initiate the loan via the MyItura SDK. The patient will automatically receive an SMS with their application link once you initiate.
                </p>
              </div>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${adminDashboardUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;">
                      Review in Admin Dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Request ID -->
              <p style="margin:24px 0 0;font-size:11px;color:#9ca3af;text-align:center;">
                Request ID: ${requestId} · Submitted at ${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })} WAT
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
                Rehabify Health · MediLoan is powered by MyItura (an independent third party)
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
            `,
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
