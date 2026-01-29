import { NextRequest, NextResponse } from "next/server";

const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

// Allowed redirect URL hosts
const ALLOWED_REDIRECT_HOSTS = [
    "localhost",
    "rehabifyhealth.com",
    "www.rehabifyhealth.com",
];

// Add the app URL host if configured
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
if (appUrl) {
    try {
        const url = new URL(appUrl);
        ALLOWED_REDIRECT_HOSTS.push(url.hostname);
    } catch {
        // Invalid URL, ignore
    }
}

export async function POST(request: NextRequest) {
    try {
        if (!FLUTTERWAVE_SECRET_KEY) {
            return NextResponse.json(
                { success: false, error: "Flutterwave is not configured" },
                { status: 500 }
            );
        }

        const body = await request.json();
        const { bookingId, amount, email, name, redirectUrl } = body;

        // Validate required fields
        if (!bookingId || !email) {
            return NextResponse.json(
                { success: false, error: "Missing required fields" },
                { status: 400 }
            );
        }

        // Validate amount is a positive number
        const parsedAmount = Number(amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            return NextResponse.json(
                { success: false, error: "Invalid amount" },
                { status: 400 }
            );
        }

        // Validate redirectUrl
        let validatedRedirectUrl: string;
        try {
            const urlObj = new URL(redirectUrl);
            if (!ALLOWED_REDIRECT_HOSTS.includes(urlObj.hostname)) {
                return NextResponse.json(
                    { success: false, error: "Invalid redirect URL" },
                    { status: 400 }
                );
            }
            validatedRedirectUrl = urlObj.toString();
        } catch {
            return NextResponse.json(
                { success: false, error: "Malformed redirect URL" },
                { status: 400 }
            );
        }

        // Generate unique transaction reference
        const txRef = `MARKETPLACE_${bookingId}_${Date.now()}`;

        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        try {
            // Create payment link via Flutterwave
            const response = await fetch(`${FLUTTERWAVE_BASE_URL}/payments`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    tx_ref: txRef,
                    amount: parsedAmount,
                    currency: "NGN",
                    redirect_url: validatedRedirectUrl,
                    customer: {
                        email: email,
                        name: name || "Customer",
                    },
                    customizations: {
                        title: "Rehabify Health",
                        description: "Physiotherapy Session Booking",
                        logo: "https://rehabifyhealth.com/logo.png",
                    },
                    meta: {
                        booking_id: bookingId,
                        booking_type: "marketplace",
                    },
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const data = await response.json();

            if (data.status === "success" && data.data?.link) {
                return NextResponse.json({
                    success: true,
                    paymentUrl: data.data.link,
                    txRef: txRef,
                });
            } else {
                console.error("Flutterwave payment initialization failed:", data);
                return NextResponse.json(
                    {
                        success: false,
                        error: "Failed to initialize payment",
                    },
                    { status: 400 }
                );
            }
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                console.error("Flutterwave request timeout");
                return NextResponse.json(
                    { success: false, error: "Payment service timeout" },
                    { status: 504 }
                );
            }
            throw fetchError;
        }
    } catch (error) {
        console.error("Flutterwave API error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
