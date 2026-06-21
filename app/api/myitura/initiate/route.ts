/**
 * MyItura MediLoan — Loan Initiation API Route
 *
 * POST /api/myitura/initiate
 *
 * Called by the Physiotherapist/Clinic billing UI to initiate a MediLoan
 * on behalf of a patient. This route:
 *  1. Authenticates the caller via Clerk
 *  2. Calls the MyItura SDK (via lib/myitura/myitura.ts) to create the loan
 *  3. Logs the loan in our Convex database
 *  4. Returns the application URL + SDK reference
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex-client";
import { initiateMediLoan } from "@/lib/myitura/myitura";

export async function POST(request: NextRequest) {
    try {
        const convex = getConvexClient();

        // 1. Authenticate — only logged-in physios/clinic staff can initiate loans
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
        }

        // 2. Parse & validate body
        const body = await request.json();
        const {
            patientId,
            firstName,
            lastName,
            email,
            phoneNumber,
            gender,
            treatment,
            treatmentAmount,
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

        // 3. Generate a unique client reference for this request
        const clientReference = `RH-LOAN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        // 4. Call MyItura SDK — all env var checks happen inside initiateMediLoan
        const myituraData = await initiateMediLoan({
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

        // 5. Validate the response shape before logging
        if (!myituraData.data?.sdkReference || !myituraData.data?.applicationUrl) {
            console.error("[MyItura] Unexpected response shape: missing data fields", myituraData);
            return NextResponse.json(
                { error: "MyItura returned an incomplete response" },
                { status: 502 }
            );
        }

        // 6. Log in Convex for audit trail and dashboard visibility
        const loanId = await convex.mutation(api.mediloan.logInitiatedLoan, {
            patientId: patientId || undefined,
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

        return NextResponse.json({
            success: true,
            data: {
                loanId,
                clientReference,
                sdkReference: myituraData.data.sdkReference,
                applicationUrl: myituraData.data.applicationUrl,
                expiresAt: myituraData.data.expiresAt,
            },
        });
    } catch (error: any) {
        console.error("[MyItura] Initiation error:", error);

        // Surface timeout errors clearly
        if (error.name === "AbortError" || error.message?.includes("timed out")) {
            return NextResponse.json(
                { error: "MyItura API request timed out. Please try again." },
                { status: 504 }
            );
        }

        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
