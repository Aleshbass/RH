import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'

const FLUTTERWAVE_WEBHOOK_SECRET = process.env.FLUTTERWAVE_WEBHOOK_SECRET

/**
 * Verify Flutterwave webhook signature
 * Flutterwave sends a verif-hash header that should match our secret
 */
function verifyWebhookSignature(request: NextRequest): boolean {
    const verifHash = request.headers.get('verif-hash')

    if (!FLUTTERWAVE_WEBHOOK_SECRET) {
        log.warn('FLUTTERWAVE_WEBHOOK_SECRET not configured')
        return false
    }

    if (!verifHash) {
        log.warn('No verif-hash header in Flutterwave webhook')
        return false
    }

    return verifHash === FLUTTERWAVE_WEBHOOK_SECRET
}

export async function POST(request: NextRequest) {
    try {
        // Verify webhook source
        const isValid = verifyWebhookSignature(request)
        if (!isValid) {
            log.warn('Invalid Flutterwave webhook signature')
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get request body
        const body = await request.text()
        const event = JSON.parse(body)

        log.info('Flutterwave webhook received', {
            event: event.event,
            txRef: event.data?.tx_ref,
            status: event.data?.status
        })

        // Handle different webhook events
        switch (event.event) {
            case 'charge.completed':
                if (event.data?.status === 'successful') {
                    await handlePaymentSuccess(event.data)
                } else {
                    await handlePaymentFailed(event.data)
                }
                break

            case 'transfer.completed':
                await handleTransferCompleted(event.data)
                break

            default:
                log.info('Unhandled Flutterwave webhook event', { event: event.event })
        }

        // Flutterwave expects a 200 response
        return NextResponse.json({ status: 'success' })

    } catch (error) {
        log.error('Flutterwave webhook processing failed', { error: error as Error })
        ErrorTracker.captureException(error as Error, {
            tags: { component: 'flutterwave_webhook' }
        })

        return NextResponse.json(
            { error: 'Webhook processing failed' },
            { status: 500 }
        )
    }
}

// Handle successful payment
async function handlePaymentSuccess(data: {
    id: number
    tx_ref: string
    flw_ref: string
    amount: number
    currency: string
    status: string
    customer: {
        email: string
        name?: string
        phone_number?: string
    }
    meta?: Record<string, unknown>
    payment_type?: string
    created_at?: string
    [key: string]: unknown
}) {
    try {
        const { tx_ref, amount, meta, customer } = data

        log.info('Processing successful Flutterwave payment', {
            txRef: tx_ref,
            amount,
            invoiceId: meta?.invoiceId
        })

        // Update payment status in database
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/payments/update-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reference: tx_ref,
                status: 'success',
                amount: amount * 100, // Convert to kobo
                metadata: meta,
                paystackData: { // Re-using the existing field
                    transactionId: String(data.id),
                    flwRef: data.flw_ref,
                    paidAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
                    channel: data.payment_type,
                    customerEmail: customer?.email,
                    provider: 'flutterwave'
                }
            })
        })

        // Send success emails
        await sendPaymentEmails({
            type: 'success',
            reference: tx_ref,
            amount: amount * 100,
            metadata: meta
        })

    } catch (error) {
        log.error('Failed to handle Flutterwave payment success', { error: error as Error })
        throw error
    }
}

// Handle failed payment
async function handlePaymentFailed(data: {
    id: number
    tx_ref: string
    status: string
    meta?: Record<string, unknown>
    [key: string]: unknown
}) {
    try {
        const { tx_ref, meta } = data

        log.info('Processing failed Flutterwave payment', {
            txRef: tx_ref,
            invoiceId: meta?.invoiceId
        })

        // Update payment status
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/payments/update-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reference: tx_ref,
                status: 'failed',
                metadata: meta,
                paystackData: {
                    transactionId: String(data.id),
                    provider: 'flutterwave'
                }
            })
        })

        // Send failure emails
        await sendPaymentEmails({
            type: 'failed',
            reference: tx_ref,
            metadata: meta
        })

    } catch (error) {
        log.error('Failed to handle Flutterwave payment failure', { error: error as Error })
        throw error
    }
}

// Handle transfer completed (payout)
async function handleTransferCompleted(data: Record<string, unknown>) {
    try {
        log.info('Flutterwave transfer completed', { data })
        // Handle physiotherapist payout completion
    } catch (error) {
        log.error('Failed to handle Flutterwave transfer', { error: error as Error })
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
                metadata,
                provider: 'flutterwave'
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
                    metadata,
                    provider: 'flutterwave'
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
                    metadata,
                    provider: 'flutterwave'
                })
            })
        }

        log.info('Flutterwave payment notification emails sent', { reference, type })

    } catch (error) {
        log.error('Failed to send Flutterwave payment emails', { error: error as Error })
        // Don't throw - email failures shouldn't break webhook processing
    }
}
