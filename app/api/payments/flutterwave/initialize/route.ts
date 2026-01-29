import { NextRequest, NextResponse } from "next/server";

const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

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

        if (!bookingId || !amount || !email) {
            return NextResponse.json(
                { success: false, error: "Missing required fields" },
                { status: 400 }
            );
        }

        // Generate unique transaction reference
        const txRef = `MARKETPLACE_${bookingId}_${Date.now()}`;

        // Create payment link via Flutterwave
        const response = await fetch(`${FLUTTERWAVE_BASE_URL}/payments`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                tx_ref: txRef,
                amount: amount,
                currency: "NGN",
                redirect_url: redirectUrl,
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
        });

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
                    error: data.message || "Failed to initialize payment",
                },
                { status: 400 }
            );
        }
    } catch (error: any) {
        console.error("Flutterwave API error:", error);
        return NextResponse.json(
            { success: false, error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
