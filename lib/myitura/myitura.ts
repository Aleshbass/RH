export interface InitiateLoanRequest {
    clientReference: string;
    invoiceReference?: string;
    firstName: string;
    lastName: string;
    email?: string;
    phoneNumber: string;
    gender?: 'male' | 'female' | 'other';
    treatment: string;
    treatmentAmount: number; // in kobo
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
        expiresAt: string;
    };
    error?: string;
}

/**
 * Initiates a MyItura MediLoan request via their SDK API.
 * This triggers an SMS to the patient with the application URL.
 */
export async function initiateMediLoan(payload: InitiateLoanRequest): Promise<InitiateLoanResponse> {
    const baseURL = process.env.MYITURA_API_URL;
    const publicKey = process.env.MYITURA_PUBLIC_KEY;
    const secretKey = process.env.MYITURA_SECRET_KEY;

    if (!baseURL || !publicKey || !secretKey) {
        throw new Error("MyItura environment variables are not properly configured.");
    }

    try {
        const response = await fetch(`${baseURL}/api/v1/sdk/loans/initiate`, {
            method: 'POST',
            headers: {
                'X-API-Public-Key': publicKey,
                'X-API-Secret-Key': secretKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const contentType = response.headers.get('content-type') || '';
        let data: InitiateLoanResponse;
        try {
            if (!contentType.includes('application/json')) {
                const text = await response.text();
                console.error('MyItura API returned non-JSON response:', { status: response.status, contentType });
                throw new Error(`MyItura returned non-JSON (status ${response.status}): ${text.slice(0, 200)}`);
            }
            data = await response.json();
        } catch (parseError) {
            if (parseError instanceof SyntaxError) {
                const text = await response.text().catch(() => '[unreadable]');
                console.error('MyItura API JSON parse error:', { status: response.status, body: text.slice(0, 200) });
                throw new Error(`MyItura returned invalid JSON (status ${response.status})`);
            }
            throw parseError;
        }

        if (!response.ok || !data.success) {
            console.error('MyItura API Error:', { status: response.status, error: data.error, message: data.message });
            throw new Error(data.error || data.message || "Failed to initiate loan with MyItura");
        }

        return data;
    } catch (error: any) {
        console.error("MyItura API Request Failed:", error);
        throw error;
    }
}
