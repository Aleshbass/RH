/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookingId, amount, email, phone, name } = body;

    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ error: 'Email is required for payment' }, { status: 400 });
    }
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 });
    }

    // Amount comes in as naira (whole number). Paystack needs kobo.
    const amountInKobo = Math.round(amount * 100);

    // Generate unique reference
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const txRef = `MKT_${bookingId.slice(-8)}_${timestamp}_${random}`;

    const url = new URL(request.url);
    const origin = url.origin;

    const paymentData: Record<string, unknown> = {
      email,
      amount: amountInKobo,
      reference: txRef,
      callback_url: `${origin}/payment/callback`,
      currency: 'NGN',
      channels: ['card', 'bank', 'ussd', 'bank_transfer'],
      metadata: {
        bookingId,
        customerPhone: phone || null,
        customerName: name || null,
        isMarketplaceBooking: true,
        custom_fields: [
          {
            display_name: 'Booking ID',
            variable_name: 'booking_id',
            value: bookingId,
          },
        ],
      },
    };

    // Try to get physiotherapist subaccount for split payment
    try {
      const bookingDetails = await convex.query((api as any).marketplace.booking.getMarketplaceBooking, {
        bookingId: bookingId as Id<'marketplaceBookings'>,
      });
      if (bookingDetails?.physiotherapistId) {
        const bankDetails = await convex.query((api as any).flutterwave.getPhysiotherapistBankDetails, {
          physiotherapistId: bookingDetails.physiotherapistId,
        });
        if (bankDetails?.subaccountId) {
          paymentData.subaccount = bankDetails.subaccountId;
          paymentData.bearer = 'account';
        }
      }
    } catch {
      // No subaccount — proceed without split
    }

    // Initialize with Paystack
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();

    if (data.status === true) {
      return NextResponse.json({
        success: true,
        authorization_url: data.data.authorization_url,
        reference: txRef,
        access_code: data.data.access_code,
      });
    } else {
      console.error('Paystack initialization error:', data);
      return NextResponse.json(
        { error: data.message || 'Payment initialization failed' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Marketplace payment initialization error:', error);
    return NextResponse.json({ error: 'Failed to initialize payment' }, { status: 500 });
  }
}
