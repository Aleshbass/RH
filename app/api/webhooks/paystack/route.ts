import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'
import { callJoyConvexGateway } from '@/lib/joy-integration/convex-gateway'
import { deliverJoyEvent } from '@/lib/joy-integration/events'
import { convexServerSecret } from '@/lib/convex-server-secret'
import { SERVER_SECRET_HEADER } from '@/app/api/emails/_auth'

/**
 * Paystack Webhook Handler
 *
 * Paystack sends a POST request with a JSON body and a
 * `x-paystack-signature` header (HMAC SHA512 of the body
 * signed with your secret key).
 *
 * Events handled:
 * - charge.success — payment was successful
 * - charge.failed — payment failed
 * - transfer.success / transfer.failed / transfer.reversed — partner & doctor payouts
 * - refund.processed — refunds (reverses partner commissions)
 */

function verifyWebhookSignature(body: string, signature: string | null): boolean {
    if (!signature) return false

    // Paystack signs webhooks with the account secret key. Keep a dedicated
    // override for deployments that separate webhook configuration, while
    // retaining the documented secret-key fallback.
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY
    if (!secret) return false

    const hash = crypto
        .createHmac('sha512', secret)
        .update(body)
        .digest('hex')

    return hash === signature
}

export async function POST(request: NextRequest) {
    try {
        const rawBody = await request.text()
        const signature = request.headers.get('x-paystack-signature')

        // Verify webhook authenticity
        if (!verifyWebhookSignature(rawBody, signature)) {
            log.warn('Invalid Paystack webhook signature', {
                action: 'paystack_webhook_invalid_sig',
            })
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }

        const payload = JSON.parse(rawBody)
        const event = payload.event
        const data = payload.data

        log.info('Paystack webhook received', {
            action: 'paystack_webhook_received',
            metadata: { event, reference: data?.reference }
        })

        switch (event) {
            case 'charge.success':
                await handlePaymentSuccess(data, rawBody, signature as string)
                break

            case 'charge.failed':
                await handlePaymentFailed(data, rawBody, signature as string)
                break

            case 'transfer.success':
            case 'transfer.failed':
            case 'transfer.reversed':
                await handleTransferEvent(data, rawBody, signature as string, event)
                break

            case 'refund.processed':
                await handleRefundProcessed(data, rawBody, signature as string)
                break

            default:
                log.info('Unhandled Paystack webhook event', {
                    action: 'paystack_webhook_unhandled',
                    metadata: { event }
                })
        }

        // Paystack expects a 200 response
        return NextResponse.json({ received: true })

    } catch (error) {
        log.error('Paystack webhook processing error', { error: error as Error })
        ErrorTracker.captureException(error as Error, {
            action: 'paystack_webhook_error',
        })
        // A verified webhook that could not be durably recorded must be retried.
        // Replay protection in the RH payment path makes retries safe.
        return NextResponse.json({ error: 'processing failed' }, { status: 500 })
    }
}

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(data: {
    reference: string
    amount: number
    currency: string
    status: string
    customer: {
        email: string
        first_name?: string
        last_name?: string
        phone?: string
    }
    metadata?: Record<string, unknown>
    channel?: string
    paid_at?: string
    [key: string]: unknown
}, rawBody: string, signature: string) {
    log.info('Processing successful Paystack payment', {
        action: 'paystack_payment_success',
        metadata: {
            reference: data.reference,
            amount: data.amount,
            channel: data.channel,
        }
    })

    try {
        // Joy payment attempts are resolved from RH's durable reference, not
        // from untrusted client metadata. Payment evidence does not create an
        // appointment: provider acceptance and current safety remain gates.
        try {
            const joyPayment = await callJoyConvexGateway('record_payment_webhook', {
                reference: data.reference,
                amount_kobo: data.amount,
                currency: data.currency,
                paystack_event_id: String(data.id ?? data.reference),
            }) as { handled?: boolean; duplicate?: boolean; booking_id?: string; patient_id?: string; physiotherapist_id?: string; provider_response_due_at?: number; admin_scheduling_required?: boolean };
            if (joyPayment.handled) {
                if (!joyPayment.duplicate && joyPayment.booking_id) {
                    const eventData = { booking_id: joyPayment.booking_id, patient_id: joyPayment.patient_id, physiotherapist_id: joyPayment.physiotherapist_id, payment_reference: data.reference, provider_response_due_at: joyPayment.provider_response_due_at };
                    await deliverJoyEvent(`pay-${data.reference}`, 'booking.payment_confirmed', eventData);
                    if (!joyPayment.admin_scheduling_required) {
                        await deliverJoyEvent(`provider-response-${joyPayment.booking_id}`, 'booking.provider_response_requested', eventData);
                    }
                }
                log.info('Recorded verified Joy payment evidence', {
                    action: 'joy_payment_webhook_recorded', metadata: { reference: data.reference },
                });
                return;
            }
        } catch (joyError) {
            // A gateway outage must be retried by Paystack rather than silently
            // falling through to an unrelated invoice path.
            if (String(data.reference || '').startsWith('JOY_')) throw joyError;
        }

        try {
            const specialistReviewPayment = await callJoyConvexGateway('record_specialist_review_payment_webhook', {
                reference: data.reference,
                amount_kobo: data.amount,
                currency: data.currency,
                paystack_event_id: String(data.id ?? data.reference),
            }) as { handled?: boolean; duplicate?: boolean; review_id?: string; patient_id?: string; reviewer_id?: string; review_status?: string };
            if (specialistReviewPayment.handled) {
                if (!specialistReviewPayment.duplicate && specialistReviewPayment.review_id) {
                    await deliverJoyEvent(`review-payment-${data.reference}`, 'specialist_review.payment_confirmed', {
                        review_id: specialistReviewPayment.review_id,
                        patient_id: specialistReviewPayment.patient_id,
                        payment_reference: data.reference,
                        reviewer_id: specialistReviewPayment.reviewer_id,
                        assignment_status: specialistReviewPayment.review_status ?? 'awaiting_assignment',
                    });
                }
                return;
            }
        } catch (reviewError) {
            if (String(data.reference || '').startsWith('JOYREV_')) throw reviewError;
        }

        // Lazy-import to avoid heavy type instantiation at module level
        const { ConvexHttpClient } = await import('convex/browser')
        const { api } = await import('@/convex/_generated/api') as any

        const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

        // Marketplace bookings: completed only from this verified event (idempotent).
        // Convex re-verifies the Paystack signature and checks the amount.
        if (String(data.reference || '').startsWith('MKT_')) {
            const result = await convex.mutation(api.marketplace.booking.recordMarketplacePaystackWebhook, {
                rawBody,
                signature,
            })
            log.info('Marketplace booking payment processed', {
                action: 'paystack_marketplace_payment',
                metadata: { reference: data.reference, result },
            })
            return
        }

        // 1. Verification badge payments (VERIFICATION_ references): completed only from
        // this verified event (idempotent). Convex re-verifies the Paystack signature, takes
        // the transaction from the reference, checks amount/currency and sends the
        // confirmation email to the physiotherapist's own address.
        if (String(data.reference || '').startsWith('VERIFICATION_')) {
            const result = await convex.mutation(api.marketplace.verification.recordVerificationPaystackWebhook, {
                rawBody,
                signature,
            })
            log.info('Verification badge payment processed', {
                action: 'paystack_verification_payment',
                metadata: { reference: data.reference, result },
            })
            return
        }

        // Rehabify Learn registrations (LEARN_ references): Convex re-verifies the signature,
        // takes the registration from the reference, checks the amount and emails the
        // confirmation (idempotent with the browser's own verify call).
        if (String(data.reference || '').startsWith('LEARN_')) {
            const result = await convex.mutation(api.learn.recordLearnPaystackWebhook, {
                rawBody,
                signature,
            })
            log.info('Learn registration payment processed', {
                action: 'paystack_learn_payment',
                metadata: { reference: data.reference, result },
            })
            return
        }

        // 2. Regular Invoice Payments
        log.info('Processing regular invoice payment', { action: 'regular_payment_path' });

        // Convex re-verifies the Paystack signature, then marks the payment and invoice
        // paid and keeps the patient balance in sync
        await convex.mutation(api.payments.recordPaystackChargeWebhook, {
            rawBody,
            signature,
        })

        // Send payment notification emails
        await sendPaymentEmails({
            type: 'success',
            reference: data.reference,
            amount: data.amount,
            metadata: data.metadata,
        })

    } catch (error) {
        log.error('Failed to process successful payment', { error: error as Error })
        ErrorTracker.captureException(error as Error, {
            action: 'paystack_success_handler_error',
            extra: { reference: data.reference }
        })
        if (String(data.reference || '').startsWith('JOY_') || String(data.reference || '').startsWith('MKT_') || String(data.reference || '').startsWith('VERIFICATION_') || String(data.reference || '').startsWith('LEARN_')) throw error
    }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(data: {
    reference: string
    status: string
    metadata?: Record<string, unknown>
    [key: string]: unknown
}, rawBody: string, signature: string) {
    log.info('Processing failed Paystack payment', {
        action: 'paystack_payment_failed',
        metadata: {
            reference: data.reference,
            status: data.status,
        }
    })

    try {
        // Joy payment failures are matched by RH's durable Paystack reference,
        // not checkout metadata.  The failed attempt stays auditable and the
        // booking remains unschedulable until a later successful payment.
        try {
            const joyPayment = await callJoyConvexGateway('record_payment_failed_webhook', {
                reference: data.reference,
                paystack_event_id: String(data.id ?? data.reference),
                failure_category: 'PAYSTACK_CHARGE_FAILED',
            }) as { handled?: boolean; duplicate?: boolean; booking_id?: string; patient_id?: string };
            if (joyPayment.handled) {
                if (!joyPayment.duplicate && joyPayment.booking_id) {
                    await deliverJoyEvent(`payment-failed-${data.reference}`, 'booking.payment_failed', {
                        booking_id: joyPayment.booking_id,
                        patient_id: joyPayment.patient_id,
                        payment_reference: data.reference,
                    });
                }
                return;
            }
        } catch (joyError) {
            // Acknowledging a Joy payment failure before it is durably stored
            // would lose the patient's retry guidance. Ask Paystack to retry.
            if (String(data.reference || '').startsWith('JOY_')) throw joyError;
        }

        // A failed Learn checkout leaves the registration pending, so the person can simply
        // pay again; it is not an invoice and gets no invoice emails.
        if (String(data.reference || '').startsWith('LEARN_')) return

        const { ConvexHttpClient } = await import('convex/browser')
        const { api } = await import('@/convex/_generated/api') as any

        const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

        await convex.mutation(api.payments.recordPaystackChargeWebhook, {
            rawBody,
            signature,
        })

        await sendPaymentEmails({
            type: 'failed',
            reference: data.reference,
            metadata: data.metadata,
        })

    } catch (error) {
        log.error('Failed to process failed payment', { error: error as Error })
        ErrorTracker.captureException(error as Error, {
            action: 'paystack_failure_handler_error',
            extra: { reference: data.reference }
        })
        if (String(data.reference || '').startsWith('JOY_')) throw error
    }
}

/**
 * Transfer events (partner commission payouts and referring-doctor payouts).
 * Convex verifies the Paystack signature and settles or releases the payout from its
 * own transfer record — nothing is parsed out of the reference string here.
 */
async function handleTransferEvent(data: any, rawBody: string, signature: string, event: string) {
    const { ConvexHttpClient } = await import('convex/browser')
    const { api } = await import('@/convex/_generated/api') as any
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
    const result = await convex.mutation(api.monthlySettlements.recordPaystackTransferWebhook, { rawBody, signature })
    log.info('Paystack transfer event processed', {
        action: 'paystack_transfer_event',
        metadata: { event, reference: data?.reference, result },
    })
}

/**
 * Refunds: marks the marketplace booking refunded and reverses the partner commission
 * earned on that payment (or books a negative adjustment if it was already paid out).
 */
async function handleRefundProcessed(data: any, rawBody: string, signature: string) {
    const { ConvexHttpClient } = await import('convex/browser')
    const { api } = await import('@/convex/_generated/api') as any
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
    const result = await convex.mutation(api.marketplace.booking.recordPaystackRefundWebhook, { rawBody, signature })
    log.info('Paystack refund processed', {
        action: 'paystack_refund_processed',
        metadata: { reference: data?.transaction_reference ?? data?.transaction?.reference, result },
    })
}

/**
 * Send payment notification emails
 */
async function sendPaymentEmails(params: {
    type: 'success' | 'failed'
    reference: string
    amount?: number
    metadata?: Record<string, unknown>
}) {
    try {
        // Generate invoice
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

        const endpoint = params.type === 'success'
            ? '/api/emails/payment-notification'
            : '/api/emails/payment-notification'

        await fetch(`${baseUrl}${endpoint}`, {
            method: 'POST',
            // The email routes only accept our own server (or a signed-in admin)
            headers: { 'Content-Type': 'application/json', [SERVER_SECRET_HEADER]: convexServerSecret() },
            body: JSON.stringify({
                reference: params.reference,
                amount: params.amount,
                status: params.type,
                metadata: params.metadata,
            })
        })
    } catch (error) {
        // Email sending is non-critical — log but don't throw
        log.error('Payment email sending failed', { error: error as Error })
    }
}
