/**
 * Admin actions on one MediLoan (our loanApplications id).
 *
 * POST /api/myitura/loans/{loanId}   { action: "refresh" }               → ask MyItura for the loan's
 *                                                                          status (backup for a missed webhook)
 * POST /api/myitura/loans/{loanId}   { action: "cancel", reason: "…" }  → cancel it at MyItura
 *                                                                          (only before disbursement)
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexClient } from "@/lib/convex-client";
import { convexServerSecret } from "@/lib/convex-server-secret";
import { getServerViewer } from "@/lib/auth/serverViewer";
import {
    MyIturaError,
    cancelMediLoan,
    findMediLoansByClientReference,
    getMediLoan,
    mediLoanId,
    type MediLoanRecord,
} from "@/lib/myitura/myitura";

type LoanRef = {
    _id: Id<"loanApplications">;
    status: string;
    clientReference: string;
    myituraSdkRef: string | null;
    myituraLoanId: string | null;
};

/** The loan at MyItura: by its id when we have it, else by our client reference. */
async function lookUp(loan: LoanRef): Promise<MediLoanRecord | null> {
    if (loan.myituraLoanId) return getMediLoan(loan.myituraLoanId);
    const matches = await findMediLoansByClientReference(loan.clientReference);
    return matches.find((m) => m.clientReference === loan.clientReference || (loan.myituraSdkRef && m.sdkReference === loan.myituraSdkRef)) ?? matches[0] ?? null;
}

export async function POST(request: Request, { params }: { params: Promise<{ loanId: string }> }) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const viewer = await getServerViewer();
    if (viewer?.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });

    const { loanId } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string; reason?: string };
    const convex = getConvexClient();
    const serverSecret = convexServerSecret();

    const loan = (await convex.query(api.mediloan.getLoanForServer, {
        loanApplicationId: loanId as Id<"loanApplications">,
        serverSecret,
    })) as LoanRef | null;
    if (!loan) return NextResponse.json({ error: "Loan not found." }, { status: 404 });

    try {
        if (body.action === "refresh") {
            const record = await lookUp(loan);
            if (!record) {
                return NextResponse.json({ error: "MyItura has no loan for this reference yet. The patient may not have opened the link." }, { status: 404 });
            }
            const result = await convex.mutation(api.mediloan.applyMediLoanUpdate, {
                loanApplicationId: loan._id,
                myituraLoanId: mediLoanId(record),
                myituraStatus: typeof record.status === "string" ? record.status : undefined,
                amountApprovedKobo: typeof record.amountApproved === "number" ? record.amountApproved : undefined,
                serverSecret,
            });
            return NextResponse.json({ success: true, myituraStatus: record.status ?? null, ...result });
        }

        if (body.action === "cancel") {
            const reason = body.reason?.trim();
            if (!reason) return NextResponse.json({ error: "Give a reason for cancelling." }, { status: 400 });
            if (["disbursed", "repaid", "defaulted"].includes(loan.status)) {
                return NextResponse.json({ error: "This loan has already paid out, so it can't be cancelled." }, { status: 409 });
            }
            const myituraLoanId = loan.myituraLoanId ?? mediLoanId(await lookUp(loan));
            if (myituraLoanId) await cancelMediLoan(myituraLoanId, reason);
            // Without a MyItura loan yet, the application link simply lapses; we close it on our side
            const result = await convex.mutation(api.mediloan.applyMediLoanUpdate, {
                loanApplicationId: loan._id,
                myituraLoanId,
                myituraStatus: "cancelled",
                serverSecret,
            });
            return NextResponse.json({ success: true, cancelledAtMyItura: Boolean(myituraLoanId), ...result });
        }

        return NextResponse.json({ error: 'Unknown action. Use "refresh" or "cancel".' }, { status: 400 });
    } catch (error) {
        if (error instanceof MyIturaError) {
            const message = error.code === "ALREADY_DISBURSED" ? "MyItura has already paid this loan out, so it can't be cancelled." : error.message;
            return NextResponse.json({ error: message, code: error.code ?? null }, { status: error.httpStatus >= 500 ? 502 : error.httpStatus });
        }
        console.error("[MyItura Loan Action] failed:", (error as Error).message);
        return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
}
