import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'

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
 * - transfer.success — payout to physiotherapist completed
 */

function verifyWebhookSignature(body: string, signature: string | null): boolean {
    if (!signature) return false

    const secret = process.env.PAYSTACK_SECRET_KEY
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
                await handlePaymentSuccess(data)
                break

            case 'charge.failed':
                await handlePaymentFailed(data)
                break

            case 'transfer.success':
                await handleTransferCompleted(data, rawBody, signature as string)
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
        // Return 200 even on internal errors so Paystack doesn't retry indefinitely
        return NextResponse.json({ received: true })
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
}) {
    log.info('Processing successful Paystack payment', {
        action: 'paystack_payment_success',
        metadata: {
            reference: data.reference,
            amount: data.amount,
            channel: data.channel,
        }
    })

    try {
        // Lazy-import to avoid heavy type instantiation at module level
        const { ConvexHttpClient } = await import('convex/browser')
        const { api } = await import('@/convex/_generated/api') as any

        const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

        // Update payment status in the database
        await convex.mutation(api.payments.updatePaymentStatus, {
            paystackReference: data.reference,
            status: 'paid',
            paystackData: {
                amount: data.amount,
                currency: data.currency,
                channel: data.channel,
                paid_at: data.paid_at,
                customer_email: data.customer?.email,
            }
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
}) {
    log.info('Processing failed Paystack payment', {
        action: 'paystack_payment_failed',
        metadata: {
            reference: data.reference,
            status: data.status,
        }
    })

    try {
        const { ConvexHttpClient } = await import('convex/browser')
        const { api } = await import('@/convex/_generated/api') as any

        const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

        await convex.mutation(api.payments.updatePaymentStatus, {
            paystackReference: data.reference,
            status: 'failed',
            paystackData: {
                status: data.status,
            }
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
    }
}

/**
 * Handle transfer completed (payout to physiotherapist or referring doctor)
 */
async function handleTransferCompleted(data: any, rawBody: string, signature: string) {
    log.info('Transfer completed', {
        action: 'paystack_transfer_completed',
        metadata: {
            reference: data.reference,
            amount: data.amount,
            reason: data.reason
        }
    })

    try {
        const reference = String(data.reference || '');
        const reason = String(data.reason || '');
        const metadata = data.metadata as Record<string, unknown> | undefined;
        
        let referralId: string | null = null;
        
            // 1. Check if admin explicitly attached a referralId in metadata
        if (metadata && metadata.referralId) {
            referralId = String(metadata.referralId);
            log.info('Resolved referralId from direct metadata', { action: 'paystack_transfer_id_metadata' });
        } else {
            // 2. Fallback check reference or reason with explicit prefixes to prevent random 32-char collisions
            // They can type "referral:xyz" or "convex:xyz"
            const convexIdRegex = /(?:referral:|convex:)([a-zA-Z0-9_-]{32})/;
            
            const refMatch = reference.match(convexIdRegex);
            const reasonMatch = reason.match(convexIdRegex);
            
            if (refMatch) {
                referralId = String(refMatch[1]);
                log.info('Resolved referralId from reference matching fallback', { action: 'paystack_transfer_id_fallback_reference' });
            } else if (reasonMatch) {
                referralId = String(reasonMatch[1]);
                log.info('Resolved referralId from reason matching fallback', { action: 'paystack_transfer_id_fallback_reason' });
            }
        }

        if (referralId) {
            const { ConvexHttpClient } = await import('convex/browser')
            const { api } = await import('@/convex/_generated/api') as any
            const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
            
            await convex.mutation(api.adminReferrals.webhookUpdateReferralPayout, {
                referralId,
                amountPaidOut: Number(data.amount) || 0, // Pass amount in kobo
                signature,
                payload: rawBody
            });
            
            log.info(`Updated referral ${referralId} with payout commission of ${data.amount}`);
        }
    } catch (error) {
        log.error('Failed to process transfer completion', { error: error as Error })
        ErrorTracker.captureException(error as Error, {
            action: 'paystack_transfer_handler_error',
            extra: { reference: data.reference }
        })
    }
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
            headers: { 'Content-Type': 'application/json' },
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
