import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import crypto from 'crypto';

// Paystack webhook event types
interface PaystackPaymentData {
  reference: string;
  amount: number;
  status: string;
  metadata?: {
    invoiceId?: string;
    [key: string]: unknown;
  };
  gateway_response?: string;
  paid_at?: string;
  channel?: string;
  fees?: number;
  authorization?: {
    authorization_code: string;
    bin: string;
    last4: string;
    exp_month: string;
    exp_year: string;
    card_type: string;
    bank: string;
  };
}

interface PaystackTransferData {
  reference: string;
  amount: number;
  status: string;
  reason?: string;
  recipient: {
    name: string;
    account_number: string;
    bank_code: string;
  };
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Verify Paystack webhook signature
function verifyWebhookSignature(payload: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(payload)
    .digest('hex');
  return hash === signature;
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-paystack-signature');
    const rawBody = await request.text();
    
    // Verify webhook signature
    if (signature && !verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    const event = JSON.parse(rawBody);
    
    // Handle different event types
    switch (event.event) {
      case 'charge.success':
        await handleSuccessfulPayment(event.data);
        break;
      case 'charge.failed':
        await handleFailedPayment(event.data);
        break;
      case 'transfer.success':
        await handleSuccessfulTransfer(event.data);
        break;
      case 'transfer.failed':
        await handleFailedTransfer(event.data);
        break;
      default:
        console.log(`Unhandled event type: ${event.event}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleSuccessfulPayment(data: PaystackPaymentData) {
  const { reference, amount, metadata, status } = data;
  
  if (status !== 'success') return;

  try {
    // Update payment status in database
    await convex.mutation(api.payments.updatePaymentStatus, {
      paystackReference: reference,
      status: 'completed',
      paystackData: data
    });

    // Update invoice status to paid
    if (metadata?.invoiceId) {
      await convex.mutation(api.billing.updateInvoiceStatus, {
        invoiceId: metadata.invoiceId as Id<'invoices'>,
        status: 'paid',
        paymentReference: reference,
        paidAmount: amount
      });

      // Update patient balance automatically
      await convex.mutation(api.payments.updatePatientBalance, {
        invoiceId: metadata.invoiceId as Id<'invoices'>,
        amountPaid: amount
      });

      // Create notifications
      await convex.mutation(api.notifications.createPaymentNotification, {
        invoiceId: metadata.invoiceId as Id<'invoices'>,
        type: 'payment_success',
        amount: amount,
        reference: reference
      });
    }

    // Log successful payment
    console.log(`Payment successful: ${reference} for amount ${amount}`);
  } catch (error) {
    console.error('Error updating payment status:', error);
    throw error;
  }
}

async function handleFailedPayment(data: PaystackPaymentData) {
  const { reference, metadata } = data;

  try {
    // Update payment status to failed
    await convex.mutation(api.payments.updatePaymentStatus, {
      paystackReference: reference,
      status: 'failed',
      paystackData: data
    });

    // Update invoice status if needed
    if (metadata?.invoiceId) {
      await convex.mutation(api.billing.updateInvoiceStatus, {
        invoiceId: metadata.invoiceId as Id<'invoices'>,
        status: 'failed',
        paymentReference: reference
      });

      // Create failure notification
      await convex.mutation(api.notifications.createPaymentNotification, {
        invoiceId: metadata.invoiceId as Id<'invoices'>,
        type: 'payment_failed',
        reference: reference
      });
    }

    console.log(`Payment failed: ${reference}`);
  } catch (error) {
    console.error('Error updating failed payment:', error);
  }
}

async function handleSuccessfulTransfer(data: PaystackTransferData) {
  const { reference, amount, recipient } = data;
  
  console.log(`Transfer successful: ${reference} for amount ${amount} to ${recipient.name}`);
  
  // Update payout records if you have a payout system
  // This would be used for physiotherapist withdrawals
}

async function handleFailedTransfer(data: PaystackTransferData) {
  const { reference, reason } = data;
  
  console.log(`Transfer failed: ${reference} - Reason: ${reason}`);
  
  // Handle failed transfers to physiotherapists
}
