/**
 * MyItura MediLoan — Loan Initiation API Route
 *
 * POST /api/myitura/initiate
 *
 * Called by the Physiotherapist/Clinic billing UI to initiate a MediLoan
 * on behalf of a patient. This route:
 *  1. Authenticates the caller via Clerk
 *  2. Calls the MyItura SDK to create the loan
 *  3. Logs the loan in our Convex database
 *  4. Returns the application URL + SDK reference
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL must be set");
const convex = new ConvexHttpClient(convexUrl);

export async function POST(request: NextRequest) {
    try {
        // 1. Authenticate
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
        }

        // 2. Parse body
        const body = await request.json();
        const {
            patientId,
            firstName,
            lastName,
            email,
            phoneNumber,
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

        // 3. Read env
        const baseURL = process.env.MYITURA_API_URL;
        const publicKey = process.env.MYITURA_PUBLIC_KEY;
        const secretKey = process.env.MYITURA_SECRET_KEY;

        if (!baseURL || !publicKey || !secretKey) {
            console.error("[MyItura] Missing environment variables");
            return NextResponse.json(
                { error: "MyItura integration is not configured" },
                { status: 500 }
            );
        }

        // 4. Generate internal reference
        const clientReference = `RH-LOAN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        // 5. Call MyItura SDK (with timeout)
        const controller = new AbortController();
        const timeoutMs = 15000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let myituraResponse: Response;
        try {
            myituraResponse = await fetch(`${baseURL}/api/v1/sdk/loans/initiate`, {
                method: "POST",
                headers: {
                    "X-API-Public-Key": publicKey,
                    "X-API-Secret-Key": secretKey,
                    "Content-Type": "application/json",
                },
                signal: controller.signal,
                body: JSON.stringify({
                    clientReference,
                    invoiceReference: invoiceReference || undefined,
                    firstName,
                    lastName,
                    email: email || undefined,
                    phoneNumber,
                    treatment,
                    treatmentAmount,
                }),
            });
        } catch (fetchError: any) {
            clearTimeout(timer);
            if (fetchError.name === 'AbortError') {
                return NextResponse.json(
                    { error: "MyItura API request timed out" },
                    { status: 504 }
                );
            }
            throw fetchError;
        } finally {
            clearTimeout(timer);
        }

        const data = await myituraResponse.json();

        if (!myituraResponse.ok || !data.success) {
            console.error("[MyItura] API error:", { status: myituraResponse.status, message: data.message, error: data.error });
            return NextResponse.json(
                { error: data.error || data.message || "Failed to initiate loan" },
                { status: myituraResponse.status }
            );
        }

        // 6. Log in Convex — validate data.data exists
        if (!data.data || !data.data.sdkReference || !data.data.applicationUrl) {
            console.error("[MyItura] Unexpected response shape: missing data.data fields");
            return NextResponse.json(
                { error: "MyItura returned an incomplete response" },
                { status: 502 }
            );
        }

        const loanId = await convex.mutation(api.mediloan.logInitiatedLoan, {
            patientId: patientId || undefined,
            clientReference,
            invoiceReference: invoiceReference || undefined,
            myituraSdkRef: data.data.sdkReference,
            treatment,
            amount: treatmentAmount,
            patientFirstName: firstName,
            patientLastName: lastName,
            patientPhone: phoneNumber,
            patientEmail: email || undefined,
            applicationUrl: data.data.applicationUrl,
            expiresAt: data.data.expiresAt ?? '',
        });

        return NextResponse.json({
            success: true,
            data: {
                loanId,
                clientReference,
                sdkReference: data.data.sdkReference,
                applicationUrl: data.data.applicationUrl,
                expiresAt: data.data.expiresAt,
            },
        });
    } catch (error: any) {
        console.error("[MyItura] Initiation error:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
