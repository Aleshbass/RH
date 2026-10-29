/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ConvexHttpClient } from 'convex/browser';
import { Id } from '@/convex/_generated/dataModel';
import { publicAppUrl } from '@/lib/public-app-url';

export async function POST(request: NextRequest) {
  try {
    // Act as the signed-in patient so Convex can check the invoice belongs to them
    const { userId, getToken } = await auth();
    const token = userId ? await getToken({ template: 'convex' }) : null;
    if (!token) {
      return NextResponse.json({ error: 'Please sign in to pay this invoice' }, { status: 401 });
    }
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json({ error: 'Payments are not configured' }, { status: 500 });
    }
    const convex = new ConvexHttpClient(convexUrl);
    convex.setAuth(token);
    const getConvexClient = () => convex;

    const body = await request.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    // Dynamically import Convex API to avoid heavy type instantiation
    const { api } = await import('@/convex/_generated/api') as any;

    // Get invoice details from Convex
    const invoice = await getConvexClient().query((api.billing.getInvoiceById as any), {
      invoiceId: invoiceId as Id<'invoices'>
    }) as {
      _id: Id<'invoices'>;
      invoiceNumber: string;
      totalAmount: number;
      status: string;
      patientId: Id<'users'>;
      physiotherapistId?: Id<'users'>;
      patientEmail?: string;
      platformFeeAmount?: number;
      feeBreakdown?: { total: number };
    };

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    if (!invoice.patientEmail) {
      return NextResponse.json(
        { error: 'Patient email is required for payment' },
        { status: 400 }
      );
    }

    if (invoice.status === 'paid') {
      return NextResponse.json(
        { error: 'Invoice is already paid' },
        { status: 400 }
      );
    }
    // A cancelled invoice must never reach Paystack
    if (invoice.status === 'void') {
      return NextResponse.json(
        { error: 'This invoice was cancelled, so there is nothing to pay' },
        { status: 400 }
      );
    }

    // Calculate amounts (all in kobo)
    const baseAmount = invoice.totalAmount || 0;
    // Rehabify takes no fee unless the invoice says so (independents' and clinics' own patients pay nothing extra)
    const platformFee = invoice.platformFeeAmount ?? 0;
    // Paystack fee: 1.5% + ₦100 (10000 kobo), capped at ₦2,000 (200000 kobo)
    const paystackFee = Math.min(Math.round((baseAmount + platformFee) * 0.015) + 10000, 200000);
    // Prefer using feeBreakdown.total when available
    const totalPayable = (invoice.feeBreakdown && typeof invoice.feeBreakdown.total === 'number')
      ? invoice.feeBreakdown.total
      : (baseAmount + platformFee + paystackFee);

    // Generate unique payment reference
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const txRef = `INV_${invoice.invoiceNumber}_${timestamp}_${random}`;

    // Settle to the clinic's payout account (clinic invoices) or the physiotherapist's subaccount
    let subaccountCode: string | null = null;
    // Kobo kept by Rehabify's account; the subaccount receives exactly the provider's share
    let mainAccountCharge = platformFee;
    let clinicName: string | null = null;
    let clinicNotConnected = false;
    try {
      const settlement = await getConvexClient().query(api.clinicBilling.getInvoiceSettlement, {
        invoiceId: invoiceId as Id<'invoices'>
      });
      subaccountCode = settlement?.subaccountCode || null;
      if (typeof settlement?.mainAccountChargeKobo === 'number') {
        mainAccountCharge = settlement.mainAccountChargeKobo;
      }
      clinicName = settlement?.clinicName ?? null;
      clinicNotConnected = Boolean(settlement?.clinicNotConnected);
    } catch {
      console.log('No payout subaccount found for invoice');
    }
    // A clinic's patients pay the clinic directly; until it connects its bank there's no online payment
    if (clinicNotConnected) {
      return NextResponse.json(
        { error: `${clinicName ?? 'Your clinic'} can't take online payments yet. Pay the clinic directly, or ask them for a payment link.` },
        { status: 400 }
      );
    }

    // Never from the request Host header (api./partners. subdomains give broken links)
    const origin = publicAppUrl();

    // Prepare Paystack payment data (amount in kobo — Paystack's native unit)
    const paymentData: Record<string, unknown> = {
      email: invoice.patientEmail,
      amount: totalPayable, // Paystack uses kobo natively
      reference: txRef,
      callback_url: `${origin}/payment/callback`,
      currency: 'NGN',
      channels: ['card', 'bank', 'ussd', 'bank_transfer'],
      metadata: {
        invoiceId: invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        patientId: invoice.patientId,
        physiotherapistId: invoice.physiotherapistId || null,
        custom_fields: [
          ...(clinicName ? [{ display_name: "Clinic", variable_name: "clinic", value: clinicName }] : []),
          {
            display_name: "Invoice Number",
            variable_name: "invoice_number",
            value: invoice.invoiceNumber
          }
        ]
      },
    };

    // Add split payment configuration if subaccount exists
    if (subaccountCode) {
      paymentData.subaccount = subaccountCode;
      paymentData.bearer = 'account'; // Rehabify's account pays Paystack fees out of its part
      paymentData.transaction_charge = mainAccountCharge;
    }

    // Initialize payment with Paystack
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentData)
    });

    const data = await response.json();

    if (data.status === true) {
      // Save payment reference to database via Convex. Without this record the webhook
      // cannot match the payment, so stop here if it fails.
      const record = await getConvexClient().mutation(api.payments.createPaymentRecord, {
        invoiceId: invoiceId as Id<'invoices'>,
        reference: txRef,
        amount: totalPayable,
        paymentMethod: 'paystack'
      });
      if (!record?.success) {
        return NextResponse.json(
          { error: record?.message || 'Could not record payment' },
          { status: 403 }
        );
      }

      return NextResponse.json({
        success: true,
        authorization_url: data.data.authorization_url,
        payment_link: data.data.authorization_url,
        reference: txRef,
        access_code: data.data.access_code,
      });
    } else {
      return NextResponse.json(
        { error: data.message || 'Payment initialization failed' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Payment initialization error:', error);
    return NextResponse.json(
      { error: 'Failed to initialize payment' },
      { status: 500 }
    );
  }
}
