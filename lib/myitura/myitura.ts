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

        const data: InitiateLoanResponse = await response.json();

        if (!response.ok || !data.success) {
            console.error("MyItura API Error details:", data);
            throw new Error(data.error || data.message || "Failed to initiate loan with MyItura");
        }

        return data;
    } catch (error: any) {
        console.error("MyItura API Request Failed:", error);
        throw error;
    }
}
