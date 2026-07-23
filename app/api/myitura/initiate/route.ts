/**
 * MyItura MediLoan — Admin Loan Initiation Route
 *
 * POST /api/myitura/initiate
 *
 * Called by Rehabify admin from the loans dashboard to formally initiate a
 * MediLoan with MyItura on behalf of a patient who submitted a loan request.
 * Can also be called directly from the physiotherapist billing page.
 *
 * Flow:
 *  1. Authenticate caller (must be signed-in admin or physio)
 *  2. Call MyItura SDK with patient details + Rehabify's API keys
 *  3. MyItura auto-sends an SMS to the patient's phone with an application link
 *  4. Log the resulting loanApplication in Convex
 *  5. Link back to the original loanRequest (if provided) and mark it "initiated"
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex-client";
import { initiateMediLoan } from "@/lib/myitura/myitura";

export async function POST(request: NextRequest) {
    try {
        const convex = getConvexClient();

        // 1. Must be authenticated — only Rehabify admin or physio can call MyItura SDK
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
        }

        // 2. Parse & validate body
        const body = await request.json();
        const {
            loanRequestId,    // optional — the Convex loanRequest ID this originated from
            patientId,        // optional — Convex user ID of the patient
            firstName,
            lastName,
            email,
            phoneNumber,
            gender,
            treatment,
            treatmentAmount,  // in Kobo
            invoiceReference,
        } = body;

        if (!firstName || !lastName || !phoneNumber || !treatment || !treatmentAmount) {
            return NextResponse.json(
                { error: "Missing required fields: firstName, lastName, phoneNumber, treatment, treatmentAmount" },
                { status: 400 }
            );
        }

        if (typeof treatmentAmount !== "number" || treatmentAmount <= 0) {
            return NextResponse.json(
                { error: "treatmentAmount must be a positive number (in kobo)" },
                { status: 400 }
            );
        }

        // 3. Generate a unique client reference (must be unique per Rehabify account)
        const clientReference = `RH-LOAN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        // 4. Call MyItura SDK — Rehabify's Public + Secret keys are used here
        let myituraData;
        try {
            myituraData = await initiateMediLoan({
                clientReference,
                invoiceReference: invoiceReference || undefined,
                firstName,
                lastName,
                email: email || undefined,
                phoneNumber,
                gender: gender || undefined,
                treatment,
                treatmentAmount,
            });
        } catch (sdkError: any) {
            const cause = sdkError?.cause?.message || sdkError?.cause?.code || "";
            console.error("[MyItura Initiate] SDK call failed:", sdkError.message, "| cause:", cause);

            if (sdkError.name === "AbortError" || sdkError.message?.includes("timed out")) {
                return NextResponse.json(
                    { error: "MyItura API request timed out. Please try again." },
                    { status: 504 }
                );
            }

            return NextResponse.json(
                { error: `MyItura SDK error: ${sdkError.message}${cause ? ` (${cause})` : ""}` },
                { status: 502 }
            );
        }

        // 5. Validate SDK response
        if (!myituraData.data?.sdkReference || !myituraData.data?.applicationUrl) {
            console.error("[MyItura Initiate] Unexpected response shape:", myituraData);
            return NextResponse.json(
                { error: "MyItura returned an incomplete response. Please try again." },
                { status: 502 }
            );
        }

        // 6. Log the loan in Convex + link back to the loanRequest if provided
        let loanId;
        try {
            loanId = await convex.mutation(api.mediloan.logInitiatedLoan, {
                loanRequestId: loanRequestId || undefined,
                patientId: patientId || undefined,
                initiatorClerkId: userId,
                clientReference,
                invoiceReference: invoiceReference || undefined,
                myituraSdkRef: myituraData.data.sdkReference,
                treatment,
                amount: treatmentAmount,
                patientFirstName: firstName,
                patientLastName: lastName,
                patientPhone: phoneNumber,
                patientEmail: email || undefined,
                applicationUrl: myituraData.data.applicationUrl,
                expiresAt: myituraData.data.expiresAt ?? "",
            });
        } catch (convexError: any) {
            console.error("[MyItura Initiate] Convex mutation failed:", convexError.message);
            return NextResponse.json(
                { error: `Failed to save loan record: ${convexError.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                loanId,
                clientReference,
                sdkReference: myituraData.data.sdkReference,
                applicationUrl: myituraData.data.applicationUrl,
                expiresAt: myituraData.data.expiresAt,
                message: `MediLoan initiated. SMS sent to ${phoneNumber} with the application link.`,
            },
        });

    } catch (error: any) {
        const cause = error?.cause?.message || error?.cause?.code || "";
        console.error("[MyItura Initiate] Unexpected error:", error.message, "| cause:", cause);

        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
