import { NextRequest, NextResponse } from 'next/server'
import { simplePaystackService } from '@/lib/payments/simple-payments'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'

export async function POST(request: NextRequest) {
  try {
    // Verify webhook source (Paystack uses IP whitelisting)
    const isValid = simplePaystackService.verifyWebhook(request)
    if (!isValid) {
      log.warn('Invalid webhook source - not from Paystack IPs')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request body
    const body = await request.text()

    // Parse webhook data
    const event = JSON.parse(body)
    
    log.info('Paystack webhook received', {
      event: event.event,
      reference: event.data?.reference
    })

    // Handle different webhook events
    switch (event.event) {
      case 'charge.success':
        await handlePaymentSuccess(event.data)
        break
        
      case 'charge.failed':
        await handlePaymentFailed(event.data)
        break
        
      case 'transfer.success':
        await handleTransferSuccess(event.data)
        break
        
      case 'transfer.failed':
        await handleTransferFailed(event.data)
        break
        
      default:
        log.info('Unhandled webhook event', { event: event.event })
    }

    return NextResponse.json({ status: 'success' })

  } catch (error) {
    log.error('Webhook processing failed', { error: error as Error })
    ErrorTracker.captureException(error as Error, {
      tags: { component: 'paystack_webhook' }
    })
    
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

// Handle successful payment
async function handlePaymentSuccess(data: {
  reference: string;
  amount: number;
  metadata?: Record<string, unknown>;
  id?: string | number;
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
  [key: string]: unknown;
}) {
  try {
    const { reference, amount, metadata } = data
    
    log.info('Processing successful payment', {
      reference,
      amount,
      invoiceId: metadata?.invoiceId
    })

    // Update payment status in database (simplified approach)
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/payments/update-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference,
        status: 'success',
        amount,
        metadata,
        paystackData: {
          transactionId: data?.id ? String(data.id) : undefined,
          gatewayResponse: data?.gateway_response,
          paidAt: data?.paid_at ? new Date(data.paid_at).getTime() : undefined,
          channel: data?.channel,
          fees: data?.fees,
          authorization: data?.authorization ? {
            authorizationCode: data.authorization.authorization_code,
            bin: data.authorization.bin,
            last4: data.authorization.last4,
            expMonth: data.authorization.exp_month,
            expYear: data.authorization.exp_year,
            cardType: data.authorization.card_type,
            bank: data.authorization.bank
          } : undefined
        }
      })
    })

    // Send success emails
    await sendPaymentEmails({
      type: 'success',
      reference,
      amount,
      metadata
    })

  } catch (error) {
    log.error('Failed to handle payment success', { error: error as Error })
    throw error
  }
}

// Handle failed payment
async function handlePaymentFailed(data: {
  reference: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}) {
  try {
    const { reference, metadata } = data
    
    log.info('Processing failed payment', {
      reference,
      invoiceId: metadata?.invoiceId
    })

    // Update payment status
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/payments/update-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference,
        status: 'failed',
        metadata,
        paystackData: {
          gatewayResponse: data?.gateway_response
        }
      })
    })

    // Send failure emails
    await sendPaymentEmails({
      type: 'failed',
      reference,
      metadata
    })

  } catch (error) {
    log.error('Failed to handle payment failure', { error: error as Error })
    throw error
  }
}

// Handle successful transfer (physiotherapist payout)
async function handleTransferSuccess(data: Record<string, unknown>) {
  try {
    log.info('Transfer successful', { data })
    // Handle physiotherapist payout success
  } catch (error) {
    log.error('Failed to handle transfer success', { error: error as Error })
  }
}

// Handle failed transfer
async function handleTransferFailed(data: Record<string, unknown>) {
  try {
    log.info('Transfer failed', { data })
    // Handle physiotherapist payout failure
  } catch (error) {
    log.error('Failed to handle transfer failure', { error: error as Error })
  }
}

// Send payment notification emails
async function sendPaymentEmails(params: {
  type: 'success' | 'failed'
  reference: string
  amount?: number
  metadata?: Record<string, unknown>
}) {
  try {
    const { type, reference, amount, metadata } = params

    // Send to platform admin
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/emails/payment-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: process.env.PLATFORM_ADMIN_EMAIL,
        type: 'admin',
        paymentType: type,
        reference,
        amount,
        metadata
      })
    })

    // Send to patient
    if (metadata?.patientId) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/emails/payment-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'patient',
          userId: metadata.patientId,
          type: 'patient',
          paymentType: type,
          reference,
          amount,
          metadata
        })
      })
    }

    // Send to physiotherapist (if applicable)
    if (metadata?.physiotherapistId) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/emails/payment-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'physiotherapist',
          userId: metadata.physiotherapistId,
          type: 'physiotherapist',
          paymentType: type,
          reference,
          amount,
          metadata
        })
      })
    }

    log.info('Payment notification emails sent', { reference, type })

  } catch (error) {
    log.error('Failed to send payment emails', { error: error as Error })
    // Don't throw - email failures shouldn't break webhook processing
  }
}
