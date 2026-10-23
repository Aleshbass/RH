/**
 * MyItura MediLoan: start a loan application.
 *
 * POST /api/myitura/initiate
 *
 *  - Physiotherapists: { invoiceId } for one of their own unpaid invoices. The patient, phone
 *    and amount come from the invoice (what's still owed), never from the request. A
 *    `phoneNumber` is only used when the patient's account has none.
 *  - Admins: the same with an invoiceId, or { loanRequestId, treatmentAmount } for a patient's
 *    MediLoan request from a booking page (amount in kobo, chosen by the admin).
 *
 * MyItura creates the application link (valid 7 days) and texts it to the patient. We also
 * return a WhatsApp link the caller can use as a backup. Updates arrive at
 * /api/myitura/webhook; when the loan disburses, the invoice is marked paid.
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

const ALLOWED_ROLES = ["admin", "physiotherapist"];

type InvoiceForLoan = {
    invoiceId: Id<"invoices">;
    invoiceNumber: string;
    outstandingKobo: number;
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
    if (!viewer?.role || !ALLOWED_ROLES.includes(viewer.role)) {
        return NextResponse.json({ error: "Only Rehabify admins and physiotherapists can start a MediLoan." }, { status: 403 });
    }
    const isAdmin = viewer.role === "admin";

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const convex = getConvexClient();
    const serverSecret = convexServerSecret();
    const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

    let loan: {
        invoiceId?: Id<"invoices">;
        loanRequestId?: Id<"loanRequests">;
        patientId?: Id<"users">;
        firstName: string;
        lastName: string;
        email?: string;
        phoneNumber: string;
        treatment: string;
        treatmentAmount: number;
        invoiceReference?: string;
    };

    if (str(body.invoiceId)) {
        let invoice: InvoiceForLoan;
        try {
            invoice = (await convex.query(api.mediloan.getInvoiceForMediLoan, {
                invoiceId: str(body.invoiceId) as Id<"invoices">,
                callerClerkId: userId,
                serverSecret,
            })) as InvoiceForLoan;
        } catch (error) {
            return NextResponse.json({ error: convexMessage(error, "This invoice can't be financed.") }, { status: 400 });
        }
        const phoneNumber = invoice.patient.phone || str(body.phoneNumber);
        if (!phoneNumber) {
            return NextResponse.json({ error: "Add the patient's phone number first. MediLoan texts them the next steps." }, { status: 400 });
        }
        loan = {
            invoiceId: invoice.invoiceId,
            patientId: invoice.patient.id,
            firstName: invoice.patient.firstName || "Patient",
            lastName: invoice.patient.lastName || "",
            email: invoice.patient.email,
            phoneNumber,
            treatment: `Physiotherapy (invoice ${invoice.invoiceNumber})`,
            treatmentAmount: invoice.outstandingKobo,
            invoiceReference: invoice.invoiceNumber,
        };
    } else if (isAdmin && str(body.loanRequestId)) {
        const amount = Number(body.treatmentAmount);
        if (!Number.isInteger(amount) || amount <= 0) {
            return NextResponse.json({ error: "Enter the treatment amount." }, { status: 400 });
        }
        if (!str(body.firstName) || !str(body.phoneNumber) || !str(body.treatment)) {
            return NextResponse.json({ error: "The request is missing the patient's name, phone or treatment." }, { status: 400 });
        }
        loan = {
            loanRequestId: str(body.loanRequestId) as Id<"loanRequests">,
            firstName: str(body.firstName),
            lastName: str(body.lastName),
            email: str(body.email) || undefined,
            phoneNumber: str(body.phoneNumber),
            treatment: str(body.treatment),
            treatmentAmount: amount,
        };
    } else {
        return NextResponse.json(
            { error: isAdmin ? "Choose an invoice or a patient's loan request." : "Choose one of your unpaid invoices." },
            { status: 400 }
        );
    }

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
            message: `MediLoan started. MyItura is texting ${loan.firstName} the application link.`,
        },
    });
}
