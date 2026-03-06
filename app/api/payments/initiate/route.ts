/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { Id } from '@/convex/_generated/dataModel';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: NextRequest) {
  try {
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
    const invoice = await convex.query((api.billing.getInvoiceById as any), {
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

    if (invoice.status === 'paid') {
      return NextResponse.json(
        { error: 'Invoice is already paid' },
        { status: 400 }
      );
    }

    // Calculate amounts (all in kobo)
    const baseAmount = invoice.totalAmount || 0;
    const platformFee = invoice.platformFeeAmount || 100000; // ₦1,000 in kobo
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

    // Get physiotherapist's subaccount if available
    let subaccountCode: string | null = null;
    if (invoice.physiotherapistId) {
      try {
        const bankDetails = await convex.query(api.flutterwave.getPhysiotherapistBankDetails, {
          physiotherapistId: invoice.physiotherapistId
        });
        subaccountCode = bankDetails?.subaccountId || null;
      } catch {
        console.log('No subaccount found for physiotherapist');
      }
    }

    // Determine absolute origin from the incoming request
    const url = new URL(request.url);
    const origin = url.origin;

    // Prepare Paystack payment data (amount in kobo — Paystack's native unit)
    const paymentData: Record<string, unknown> = {
      email: invoice.patientEmail || 'patient@rehabify.com',
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
      paymentData.bearer = 'account'; // Rehabify pays Paystack fees
      paymentData.transaction_charge = platformFee; // Platform fee in kobo
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
      // Save payment reference to database via Convex
      await convex.mutation(api.payments.createPaymentRecord, {
        invoiceId: invoiceId as Id<'invoices'>,
        reference: txRef,
        amount: totalPayable,
        paymentMethod: 'paystack'
      });

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
