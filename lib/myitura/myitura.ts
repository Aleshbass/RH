export interface InitiateLoanRequest {
    clientReference: string;
    invoiceReference?: string;
    firstName: string;
    lastName: string;
    email?: string;
    phoneNumber: string;
    gender?: 'male' | 'female' | 'other';
    treatment: string;
    treatmentAmount: number; // in kobo (100 kobo = ₦1)
}

export interface InitiateLoanResponse {
    status: number;
    success: boolean;
    message: string;
    data?: {
        sdkReference: string;       // 10-character unique reference from MyItura
        clientReference: string;
        applicationUrl: string;
        status: string;
        expiresAt: string;          // ISO 8601 — 7 days from creation
    };
    error?: string;
}

/**
 * Initiates a MyItura MediLoan request via their SDK API.
 * This triggers an SMS to the patient with the application URL.
 *
 * Requires env vars: MYITURA_API_URL, MYITURA_PUBLIC_KEY, MYITURA_SECRET_KEY
 * Endpoint: POST /api/v1/sdk/loans/initiate
 */
export async function initiateMediLoan(payload: InitiateLoanRequest): Promise<InitiateLoanResponse> {
    const baseURL = process.env.MYITURA_API_URL;
    const publicKey = process.env.MYITURA_PUBLIC_KEY;
    const secretKey = process.env.MYITURA_SECRET_KEY;

    if (!baseURL || !publicKey || !secretKey) {
        throw new Error(
            "MyItura environment variables are not properly configured. " +
            "Ensure MYITURA_API_URL, MYITURA_PUBLIC_KEY, and MYITURA_SECRET_KEY are set."
        );
    }

    // 15-second timeout to avoid hanging the API route
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
        const response = await fetch(`${baseURL}/api/v1/sdk/loans/initiate`, {
            method: 'POST',
            headers: {
                'X-API-Public-Key': publicKey,
                'X-API-Secret-Key': secretKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        // Handle non-JSON responses (e.g., HTML error pages from a proxy)
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await response.text();
            console.error('[MyItura] Non-JSON response:', { status: response.status, contentType, preview: text.slice(0, 200) });
            throw new Error(`MyItura returned non-JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
        }

        let data: InitiateLoanResponse;
        try {
            data = await response.json();
        } catch {
            throw new Error(`MyItura returned invalid JSON (HTTP ${response.status})`);
        }

        if (!response.ok || !data.success) {
            console.error('[MyItura] API error:', { status: response.status, error: data.error, message: data.message });
            throw new Error(data.error || data.message || "Failed to initiate loan with MyItura");
        }

        return data;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error('MyItura API request timed out after 15 seconds');
        }
        console.error("[MyItura] Request failed:", error.message);
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
