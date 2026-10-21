/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getConvexClient } from '@/lib/convex-client';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { publicAppUrl } from '@/lib/public-app-url';

/**
 * Initialises Paystack checkout for a marketplace booking.
 *
 * The amount charged is ALWAYS the booking's own amount from Convex — never a value
 * sent by the browser — and the booking is completed only from verified Paystack
 * evidence (webhook / server-side verification), never from this route.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const bookingId = typeof body?.bookingId === 'string' ? body.bookingId : '';
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required for payment' }, { status: 400 });
    }
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ error: 'Payment service not configured' }, { status: 503 });
    }

    const quote = await getConvexClient().query(api.marketplace.booking.getMarketplacePaymentQuote, {
      bookingId: bookingId as Id<'marketplaceBookings'>,
    });
    if (!quote) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    if (quote.paymentStatus === 'completed') {
      return NextResponse.json({ error: 'This booking has already been paid' }, { status: 409 });
    }
    if (quote.bookingStatus === 'cancelled') {
      return NextResponse.json({ error: 'This booking was cancelled' }, { status: 409 });
    }
    const amountInKobo = Math.round(quote.amountKobo);
    if (!amountInKobo || amountInKobo <= 0) {
      return NextResponse.json({ error: 'This booking does not require payment' }, { status: 400 });
    }

    const txRef = `MKT_${bookingId.slice(-8)}_${Date.now()}_${randomBytes(4).toString('hex')}`;
    // Keep the slot held while the patient pays (or re-hold it if the hold lapsed and it's free),
    // and record the reference so a missed webhook is picked up by the reconciliation cron
    const hold = await getConvexClient().mutation(api.marketplace.booking.refreshMarketplaceHold, {
      bookingId: bookingId as Id<'marketplaceBookings'>,
      checkoutReference: txRef,
    });
    if (!hold.ok) {
      const message =
        hold.reason === 'slot_taken'
          ? 'That time has been booked by someone else. Please pick a new time.'
          : hold.reason === 'too_late'
            ? 'This session starts too soon to pay online. Please pick a later time.'
            : hold.reason === 'already_paid'
              ? 'This booking has already been paid'
              : 'This booking is no longer open for payment';
      return NextResponse.json({ error: message, reason: hold.reason }, { status: 409 });
    }

    const paymentData: Record<string, unknown> = {
      email,
      amount: amountInKobo,
      reference: txRef,
      callback_url: `${publicAppUrl()}/payment/callback`,
      currency: 'NGN',
      channels: ['card', 'bank', 'ussd', 'bank_transfer'],
      metadata: {
        bookingId,
        customerPhone: typeof body?.phone === 'string' ? body.phone.slice(0, 32) : null,
        customerName: typeof body?.name === 'string' ? body.name.slice(0, 120) : null,
        isMarketplaceBooking: true,
        custom_fields: [{ display_name: 'Booking ID', variable_name: 'booking_id', value: bookingId }],
      },
    };

    // No split: Rehabify holds the payment and pays the physio's fixed payout once the
    // session is completed (Admin › Payouts).

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentData),
    });
    const data = await response.json().catch(() => null);

    if (data?.status === true) {
      return NextResponse.json({
        success: true,
        authorization_url: data.data.authorization_url,
        reference: txRef,
        access_code: data.data.access_code,
        amount_kobo: amountInKobo,
      });
    }
    console.error('Paystack initialization error:', data?.message);
    return NextResponse.json({ error: data?.message || 'Payment initialization failed' }, { status: 400 });
  } catch (error) {
    console.error('Marketplace payment initialization error:', error);
    return NextResponse.json({ error: 'Failed to initialize payment' }, { status: 500 });
  }
}
