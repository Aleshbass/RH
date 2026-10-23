/**
 * MyItura MediLoan SDK client (server only). Docs: https://myitura.com/api-docs/mediloan
 *
 *   Production  https://api.myitura.com/api/v1
 *   Sandbox     https://devloansapi.myitura.com/api/v1
 *
 * Env: MYITURA_API_URL (either host above; a trailing /api/v1 is fine), MYITURA_PUBLIC_KEY and
 * MYITURA_SECRET_KEY (pk_test_/sk_test_ for the sandbox, pk_live_/sk_live_ for production).
 * Money is always integer kobo.
 */

export interface InitiateLoanRequest {
    clientReference: string;
    invoiceReference?: string;
    firstName: string;
    lastName: string;
    email?: string;
    phoneNumber: string;
    gender?: 'male' | 'female' | 'other';
    treatment: string;
    treatmentAmount: number; // kobo
}

export interface InitiateLoanResponse {
    status: number;
    success: boolean;
    message: string;
    data?: {
        sdkReference: string;
        clientReference: string;
        applicationUrl: string;
        status: string;
        expiresAt: string; // ISO 8601, 7 days from creation
    };
    error?: string;
}

/** A loan as GET /sdk/loans returns it. Field names vary a little between examples, so most are optional. */
export interface MediLoanRecord {
    loanId?: string;
    id?: string;
    status?: string;
    sdkReference?: string;
    clientReference?: string;
    invoiceReference?: string;
    amountRequested?: number;
    amountApproved?: number;
    principalKobo?: number;
    currency?: string;
    updatedAt?: string;
    [key: string]: unknown;
}

export interface MediLoanProduct {
    tenorMonths?: number;
    monthlyInterestRatePercent?: number;
    minPrincipalKobo?: number;
    maxPrincipalKobo?: number;
    maxTenorMonths?: number;
    [key: string]: unknown;
}

export interface MediLoanQuote {
    monthlyRepaymentKobo: number;
    totalRepayableKobo: number;
    processingFeeKobo?: number;
    totalCostKobo?: number;
    /** Per-instalment schedule: paymentNumber, dueDate, amountKobo, principalKobo, interestKobo, balanceAfterKobo */
    instalments?: Array<Record<string, unknown>>;
    indicative?: boolean;
    [key: string]: unknown;
}

export class MyIturaError extends Error {
    constructor(message: string, readonly httpStatus: number, readonly code?: string) {
        super(message);
        this.name = 'MyIturaError';
    }
}

/** Base URL ending in /api/v1, from MYITURA_API_URL with or without the version path. */
export function myituraBaseUrl(raw = process.env.MYITURA_API_URL): string {
    if (!raw) throw new Error('MYITURA_API_URL is not set.');
    const trimmed = raw.trim().replace(/\/+$/, '');
    return /\/api\/v1$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
}

/** "sandbox" for test keys, "live" for live keys. */
export function myituraMode(publicKey = process.env.MYITURA_PUBLIC_KEY): 'sandbox' | 'live' | 'unknown' {
    if (publicKey?.startsWith('pk_test_')) return 'sandbox';
    if (publicKey?.startsWith('pk_live_')) return 'live';
    return 'unknown';
}

type RequestOptions = { method?: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string; timeoutMs?: number };

/** One authenticated call to the SDK. Returns the `data` of the response envelope. */
export async function myituraRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const publicKey = process.env.MYITURA_PUBLIC_KEY;
    const secretKey = process.env.MYITURA_SECRET_KEY;
    if (!publicKey || !secretKey) {
        throw new Error('MyItura is not configured: set MYITURA_API_URL, MYITURA_PUBLIC_KEY and MYITURA_SECRET_KEY.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
        const headers: Record<string, string> = {
            'X-API-Public-Key': publicKey,
            'X-API-Secret-Key': secretKey,
            Accept: 'application/json',
        };
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';
        if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

        const response = await fetch(`${myituraBaseUrl()}${path}`, {
            method: options.method ?? 'GET',
            headers,
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
            signal: controller.signal,
            cache: 'no-store',
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await response.text();
            throw new MyIturaError(`MyItura returned a non-JSON response (HTTP ${response.status}): ${text.slice(0, 160)}`, response.status);
        }
        const json = (await response.json().catch(() => null)) as
            | { success?: boolean; message?: string; error?: string | { code?: string; message?: string }; code?: string; data?: T }
            | null;
        if (!json) throw new MyIturaError(`MyItura returned invalid JSON (HTTP ${response.status})`, response.status);

        if (!response.ok || json.success === false) {
            const error = json.error;
            const code = typeof error === 'object' ? error?.code : json.code ?? (typeof error === 'string' && /^[A-Z_]+$/.test(error) ? error : undefined);
            const message = (typeof error === 'object' ? error?.message : typeof error === 'string' ? error : undefined) || json.message || `MyItura request failed (HTTP ${response.status})`;
            throw new MyIturaError(message, response.status, code);
        }
        return (json.data ?? (json as unknown)) as T;
    } catch (error) {
        if ((error as Error)?.name === 'AbortError') throw new MyIturaError('MyItura did not respond in time. Please try again.', 504);
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Creates the application link. MyItura texts the patient the link (valid 7 days).
 * POST /sdk/loans/initiate
 */
export async function initiateMediLoan(payload: InitiateLoanRequest): Promise<InitiateLoanResponse> {
    const data = await myituraRequest<InitiateLoanResponse['data']>('/sdk/loans/initiate', {
        method: 'POST',
        body: payload,
        idempotencyKey: `initiate:${payload.clientReference}`,
    });
    return { status: 201, success: true, message: 'Loan initiated', data };
}

/** The loan(s) behind one of our client references. GET /sdk/loans?clientReference= */
export async function findMediLoansByClientReference(clientReference: string): Promise<MediLoanRecord[]> {
    const data = await myituraRequest<MediLoanRecord[] | { loans?: MediLoanRecord[]; items?: MediLoanRecord[] }>(
        `/sdk/loans?clientReference=${encodeURIComponent(clientReference)}&limit=10`
    );
    return Array.isArray(data) ? data : data?.loans ?? data?.items ?? [];
}

/** One loan. GET /sdk/loans/{loanId} */
export function getMediLoan(loanId: string): Promise<MediLoanRecord> {
    return myituraRequest<MediLoanRecord>(`/sdk/loans/${encodeURIComponent(loanId)}`);
}

/** Cancels a loan that hasn't been disbursed (idempotent). POST /sdk/loans/{loanId}/cancel */
export function cancelMediLoan(loanId: string, reason: string) {
    return myituraRequest<{ alreadyCancelled?: boolean; status?: string }>(`/sdk/loans/${encodeURIComponent(loanId)}/cancel`, {
        method: 'POST',
        body: { reason },
        idempotencyKey: `cancel:${loanId}`,
    });
}

/** Priced tenors and limits for this environment. GET /sdk/products */
export async function getMediLoanProducts(): Promise<MediLoanProduct[]> {
    const data = await myituraRequest<MediLoanProduct[] | { products?: MediLoanProduct[] }>('/sdk/products');
    return Array.isArray(data) ? data : data?.products ?? [];
}

/** Indicative repayment for an amount and term. POST /sdk/quote */
export function getMediLoanQuote(principalKobo: number, tenorMonths: number) {
    return myituraRequest<MediLoanQuote>('/sdk/quote', {
        method: 'POST',
        body: { principalKobo: Math.round(principalKobo), tenorMonths: Math.round(tenorMonths) },
    });
}

/** MyItura's loan id from a loan record or webhook data. */
export function mediLoanId(record: { loanId?: unknown; id?: unknown } | null | undefined): string | undefined {
    const id = record?.loanId ?? record?.id;
    return typeof id === 'string' && id ? id : undefined;
}
