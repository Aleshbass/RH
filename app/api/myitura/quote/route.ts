/**
 * MediLoan repayment estimate for an amount, from MyItura's published products and quotes.
 *
 * GET /api/myitura/quote?amountKobo=5000000
 *   → { minPrincipalKobo, maxPrincipalKobo, options: [{ tenorMonths, monthlyRepaymentKobo, totalRepayableKobo }] }
 *
 * Indicative only: the patient sees binding terms inside MediLoan. Admins and physiotherapists.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getServerViewer } from "@/lib/auth/serverViewer";
import { MyIturaError, getMediLoanProducts, getMediLoanQuote } from "@/lib/myitura/myitura";

/** At most this many term options are quoted. */
const MAX_OPTIONS = 3;

export async function GET(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const viewer = await getServerViewer();
    if (!viewer?.role || !["admin", "physiotherapist"].includes(viewer.role)) {
        return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    const amountKobo = Math.round(Number(request.nextUrl.searchParams.get("amountKobo")));
    if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
        return NextResponse.json({ error: "Give an amount in kobo." }, { status: 400 });
    }

    try {
        const products = await getMediLoanProducts();
        const minPrincipalKobo = Math.min(...products.map((p) => p.minPrincipalKobo ?? Infinity));
        const maxPrincipalKobo = Math.max(...products.map((p) => p.maxPrincipalKobo ?? 0));
        const inRange = products.filter(
            (p) =>
                (p.minPrincipalKobo === undefined || amountKobo >= p.minPrincipalKobo) &&
                (p.maxPrincipalKobo === undefined || amountKobo <= p.maxPrincipalKobo)
        );
        // A product is either one priced term (tenorMonths) or carries a list of them
        const termsOf = (p: Record<string, unknown>): number[] => {
            if (typeof p.tenorMonths === "number") return [p.tenorMonths];
            const list = (p.tenors ?? p.pricedTenors ?? p.terms) as unknown;
            if (!Array.isArray(list)) return [];
            return list
                .map((t) => (typeof t === "number" ? t : Number((t as { tenorMonths?: unknown; months?: unknown })?.tenorMonths ?? (t as { months?: unknown })?.months)))
                .filter((n) => Number.isInteger(n) && n > 0);
        };
        // Shortest terms first: the ones patients usually pick for physiotherapy
        const tenors = [...new Set(inRange.flatMap(termsOf))].sort((a, b) => a - b).slice(0, MAX_OPTIONS);
        const options = await Promise.all(
            tenors.map(async (tenorMonths) => {
                const quote = await getMediLoanQuote(amountKobo, tenorMonths);
                return {
                    tenorMonths,
                    monthlyRepaymentKobo: quote.monthlyRepaymentKobo,
                    totalRepayableKobo: quote.totalRepayableKobo,
                    processingFeeKobo: quote.processingFeeKobo ?? null,
                };
            })
        );
        return NextResponse.json({
            minPrincipalKobo: Number.isFinite(minPrincipalKobo) ? minPrincipalKobo : null,
            maxPrincipalKobo: maxPrincipalKobo > 0 ? maxPrincipalKobo : null,
            options,
        });
    } catch (error) {
        const status = error instanceof MyIturaError ? error.httpStatus : 502;
        return NextResponse.json({ error: (error as Error).message, code: error instanceof MyIturaError ? error.code ?? null : null }, { status: status >= 500 ? 502 : status });
    }
}
