/**
 * MyItura MediLoan: start a loan application for an unpaid invoice or booking.
 *
 * POST /api/myitura/initiate   { invoiceId } | { bookingId }   (+ loanRequestId, phoneNumber)
 *
 *  - Patients: their own unpaid invoice or marketplace booking ("Pay with MediLoan").
 *  - Physiotherapists: their own unpaid invoices.
 *  - Admins: any, usually from a patient's MediLoan request (loanRequestId links it).
 * The patient and the amount (what's still owed) come from the invoice or booking, never from
 * the request. `phoneNumber` is only used when the patient's account has none.
 *
 * MyItura creates the application link (valid 7 days) and texts it to the patient. We also
 * return a WhatsApp link the caller can use as a backup. Updates arrive at
 * /api/myitura/webhook; when the loan pays out, the invoice is marked paid or the booking
 * confirmed (convex/mediloan.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexClient } from "@/lib/convex-client";
import { MyIturaError, initiateMediLoan } from "@/lib/myitura/myitura";
import { getServerViewer } from "@/lib/auth/serverViewer";
import { convexServerSecret } from "@/lib/convex-server-secret";
import { mediLoanWhatsAppUrl } from "@/lib/myitura/share";

const ALLOWED_ROLES = ["admin", "physiotherapist", "patient"];

type Financing = {
    kind: "invoice" | "booking";
    invoiceId?: Id<"invoices">;
    bookingId?: Id<"marketplaceBookings">;
    reference: string;
    treatment: string;
    outstandingKobo: number;
    physiotherapistId?: Id<"users">;
    patient: { id: Id<"users">; firstName: string; lastName: string; email?: string; phone?: string };
};

function convexMessage(error: unknown, fallback: string) {
    const data = (error as { data?: unknown })?.data;
    if (typeof data === "string" && data) return data;
    return (error as Error)?.message?.replace(/^.*Uncaught ConvexError: /, "").split("\n")[0] || fallback;
}

export async function POST(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const viewer = await getServerViewer();
    // Accounts without a role yet are patients (e.g. guests who booked, then signed up)
    const role = viewer?.role ?? (viewer ? "patient" : undefined);
    if (!role || !ALLOWED_ROLES.includes(role)) {
        return NextResponse.json({ error: "MediLoan isn't available for this account." }, { status: 403 });
    }
    const isAdmin = role === "admin";

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const convex = getConvexClient();
    const serverSecret = convexServerSecret();
    const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

    const invoiceId = str(body.invoiceId) || undefined;
    const bookingId = str(body.bookingId) || undefined;
    if (!invoiceId && !bookingId) {
        return NextResponse.json({ error: "Choose the invoice or booking to pay with MediLoan." }, { status: 400 });
    }

    let financing: Financing;
    try {
        financing = (await convex.query(api.mediloan.getFinancingForServer, {
            invoiceId: invoiceId as Id<"invoices"> | undefined,
            bookingId: invoiceId ? undefined : (bookingId as Id<"marketplaceBookings"> | undefined),
            callerClerkId: userId,
            serverSecret,
        })) as Financing;
    } catch (error) {
        return NextResponse.json({ error: convexMessage(error, "This can't be paid with MediLoan.") }, { status: 400 });
    }

    const phoneNumber = financing.patient.phone || str(body.phoneNumber);
    if (!phoneNumber) {
        return NextResponse.json(
            { error: role === "patient" ? "Add your phone number in Settings first. MediLoan texts you the next steps." : "Add the patient's phone number first. MediLoan texts them the next steps." },
            { status: 400 }
        );
    }

    const loan = {
        invoiceId: financing.invoiceId,
        bookingId: financing.bookingId,
        physiotherapistId: financing.physiotherapistId,
        loanRequestId: isAdmin && str(body.loanRequestId) ? (str(body.loanRequestId) as Id<"loanRequests">) : undefined,
        patientId: financing.patient.id,
        firstName: financing.patient.firstName || "Patient",
        lastName: financing.patient.lastName || "",
        email: financing.patient.email,
        phoneNumber,
        treatment: financing.treatment,
        treatmentAmount: financing.outstandingKobo,
        invoiceReference: financing.reference,
    };

    // Unique per Rehabify account; also our idempotency key with MyItura
    const clientReference = `RH-LOAN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    let created;
    try {
        created = await initiateMediLoan({
            clientReference,
            invoiceReference: loan.invoiceReference,
            firstName: loan.firstName,
            lastName: loan.lastName,
            email: loan.email,
            phoneNumber: loan.phoneNumber,
            treatment: loan.treatment,
            treatmentAmount: loan.treatmentAmount,
        });
    } catch (error) {
        const status = error instanceof MyIturaError ? error.httpStatus : 502;
        const code = error instanceof MyIturaError && error.code ? ` (${error.code})` : "";
        console.error("[MyItura Initiate] failed", { status, code });
        return NextResponse.json(
            { error: `MediLoan couldn't start this application: ${(error as Error).message}${code}` },
            { status: status === 504 ? 504 : 502 }
        );
    }

    const data = created.data;
    if (!data?.sdkReference || !data.applicationUrl) {
        return NextResponse.json({ error: "MediLoan returned an incomplete response. Please try again." }, { status: 502 });
    }

    let loanId;
    try {
        loanId = await convex.mutation(api.mediloan.logInitiatedLoan, {
            loanRequestId: loan.loanRequestId,
            invoiceId: loan.invoiceId,
            bookingId: loan.bookingId,
            physiotherapistId: loan.physiotherapistId,
            patientId: loan.patientId,
            initiatorClerkId: userId,
            clientReference,
            invoiceReference: loan.invoiceReference,
            myituraSdkRef: data.sdkReference,
            treatment: loan.treatment,
            amount: loan.treatmentAmount,
            patientFirstName: loan.firstName,
            patientLastName: loan.lastName,
            patientPhone: loan.phoneNumber,
            patientEmail: loan.email,
            applicationUrl: data.applicationUrl,
            expiresAt: data.expiresAt ?? "",
            serverSecret,
        });
    } catch (error) {
        // MyItura already has the application; the reference lets the team match it up by hand
        console.error("[MyItura Initiate] saving the loan failed", { clientReference });
        return NextResponse.json({ error: `The loan started but couldn't be saved here: ${convexMessage(error, "unknown error")}` }, { status: 500 });
    }

    // MyItura texts the patient the link; the WhatsApp link is a backup the caller can send
    const whatsappUrl = mediLoanWhatsAppUrl(loan.phoneNumber, loan.firstName, data.applicationUrl);

    return NextResponse.json({
        success: true,
        data: {
            loanId,
            clientReference,
            sdkReference: data.sdkReference,
            applicationUrl: data.applicationUrl,
            whatsappUrl,
            expiresAt: data.expiresAt,
            amountKobo: loan.treatmentAmount,
            message:
                role === "patient"
                    ? "MediLoan started. MyItura is texting you the application link."
                    : `MediLoan started. MyItura is texting ${loan.firstName} the application link.`,
        },
    });
}
