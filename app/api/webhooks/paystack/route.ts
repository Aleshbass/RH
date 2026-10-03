import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'
import { callJoyConvexGateway } from '@/lib/joy-integration/convex-gateway'
import { deliverJoyEvent } from '@/lib/joy-integration/events'

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
                await handlePaymentSuccess(data)
                break

            case 'charge.failed':
                await handlePaymentFailed(data)
                break

            case 'transfer.success':
                await handleTransferCompleted(data, rawBody, signature as string)
                break

            case 'transfer.failed':
            case 'transfer.reversed':
                await handleTransferFailedOrReversed(data, event)
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

        // 1. Check for Verification Badge Payments
        const transactionType = Array.isArray(data.metadata?.custom_fields)
            ? data.metadata.custom_fields.find((f: any) => f.variable_name === 'transaction_type')?.value
            : undefined;
        
        const transactionId = Array.isArray(data.metadata?.custom_fields)
            ? data.metadata.custom_fields.find((f: any) => f.variable_name === 'transaction_id')?.value
            : undefined;

        const isVerificationByReference = data.reference?.startsWith('VERIFICATION_');

        if ((transactionType === 'verification_badge' && transactionId) || isVerificationByReference) {
            log.info('🏆 Processing verification badge payment...');
            
            let txId = transactionId;
            if (!txId && isVerificationByReference) {
                const parts = data.reference.split('_');
                if (parts.length >= 2) txId = parts[1];
            }
            
            if (txId) {
                const result = await convex.mutation(api.marketplace.verification.completeVerificationPurchase, {
                    transactionId: txId,
                    paymentReference: data.reference,
                });
                
                if (result.success && result.userId) {
                    try {
                        const userEmail = data.customer?.email || data.metadata?.email || "";
                        const userName = data.customer?.first_name || data.metadata?.userName || "";
                        
                        if (userEmail) {
                            await convex.action(api.actions.emails.sendVerificationBadgeEmail.sendVerificationBadgeConfirmation, {
                                userEmail,
                                userName,
                                tier: result.tier,
                                amount: data.amount,
                                expiresAt: result.expiresAt,
                                paymentReference: data.reference,
                            });
                        }
                    } catch (emailError) {
                        log.error('Error sending verification email', { error: emailError as Error });
                    }
                }
                return; // Stop execution if it's a verification badge
            }
        }

        // 2. Regular Invoice Payments
        log.info('Processing regular invoice payment', { action: 'regular_payment_path' });

        // Update payment status in the database (Use 'completed' so it triggers the invoice update)
        await convex.mutation(api.payments.updatePaymentStatus, {
            paystackReference: data.reference,
            status: 'completed',
            paystackData: {
                amount: data.amount,
                currency: data.currency,
                channel: data.channel,
                paid_at: data.paid_at,
                customer_email: data.customer?.email,
            }
        })

        // 3. Keep patient balance in sync automatically
        if (data.metadata?.invoiceId) {
            try {
                // updatePaymentStatus handles invoice status + notifications
                await convex.mutation(api.payments.updatePatientBalance, {
                    invoiceId: data.metadata.invoiceId,
                    amountPaid: data.amount
                });
            } catch (err) {
                log.error('Failed to update patient balance secondary task', { error: err as Error });
            }
        }

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
        if (String(data.reference || '').startsWith('JOY_')) throw error
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
        if (String(data.reference || '').startsWith('JOY_')) throw error
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

        // Check if this is a partner monthly commission disbursement (starts with TRF_RH_ or TRF_BULK_)
        if (reference.startsWith('TRF_RH_') || reference.startsWith('TRF_BULK_')) {
            const { ConvexHttpClient } = await import('convex/browser');
            const { api } = await import('@/convex/_generated/api') as any;
            const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

            const parts = reference.split('_');
            const partnerCode = parts.length >= 3 ? parts[2] : undefined;
            const billingPeriodRaw = parts.length >= 4 ? parts[3] : '';
            const billingPeriod = billingPeriodRaw.length === 6
                ? `${billingPeriodRaw.slice(0, 4)}-${billingPeriodRaw.slice(4, 6)}`
                : undefined;

            await convex.mutation(api.monthlySettlements.processMonthlyBulkPayout, {
                partnerCode,
                billingPeriod: billingPeriod || new Date().toISOString().slice(0, 7),
                payoutBatchReference: reference,
                note: `Paystack webhook transfer.success (${data.transfer_code || reference})`,
            });
            log.info(`Updated partner commission settlement from Paystack transfer.success: ${reference}`);
            return;
        }

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
 * Handle transfer failed or reversed — roll back commission settlements
 */
async function handleTransferFailedOrReversed(data: any, event: string) {
    const reference = String(data.reference || '');
    const reason = String(data.reason || data.message || event);

    log.warn(`Paystack transfer ${event}: ${reference}`, {
        action: 'paystack_transfer_failed_or_reversed',
        metadata: { reference, reason, amount: data.amount }
    })

    // Only roll back partner commission settlements (TRF_RH_ or TRF_BULK_)
    if (reference.startsWith('TRF_RH_') || reference.startsWith('TRF_BULK_')) {
        try {
            const { ConvexHttpClient } = await import('convex/browser');
            const { api } = await import('@/convex/_generated/api') as any;
            const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

            // Parse partner code and billing period from reference
            // Format: TRF_RH_{partnerCode}_{YYYYMM}_{timestamp} or TRF_BULK_{partnerCode}_{YYYYMM}_{timestamp}_{index}
            const parts = reference.split('_');
            const partnerCode = parts.length >= 3 ? parts[2] : undefined;
            const billingPeriodRaw = parts.length >= 4 ? parts[3] : '';
            const billingPeriod = billingPeriodRaw.length === 6
                ? `${billingPeriodRaw.slice(0, 4)}-${billingPeriodRaw.slice(4, 6)}`
                : undefined;

            await convex.mutation(api.monthlySettlements.rollbackPayoutSettlement, {
                partnerCode,
                billingPeriod: billingPeriod || new Date().toISOString().slice(0, 7),
                batchReference: reference,
                failureReason: reason,
            });

            log.info(`Rolled back partner commission settlement after ${event}: ${reference}`);
        } catch (error) {
            log.error(`Failed to roll back commission settlement for ${reference}`, { error: error as Error });
            ErrorTracker.captureException(error as Error, {
                action: 'paystack_transfer_rollback_error',
                extra: { reference, event }
            });
        }
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
