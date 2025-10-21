import { NextRequest, NextResponse } from 'next/server'
import { simplePaystackService } from '@/lib/payments/simple-payments'
// import { log } from '@/lib/monitoring/logger'
// import { ErrorTracker } from '@/lib/monitoring/sentry'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'

// Paystack API response types
interface PaystackVerificationResponse {
  status: boolean;
  message: string;
  data?: PaystackTransactionData;
}

interface PaystackTransactionData {
  id: number;
  status: string;
  reference: string;
  amount: number;
  metadata: Record<string, unknown>;
  gateway_response: string;
  paid_at: string;
  channel: string;
  fees: number;
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { reference } = body

    if (!reference) {
      return NextResponse.json(
        { success: false, message: 'Payment reference is required' },
        { status: 400 }
      )
    }

    console.log('Verifying payment:', reference)

    // Verify payment with Paystack
    const verificationResult = await simplePaystackService.verifyPayment(reference)

    const typedResult = verificationResult as PaystackVerificationResponse;
    
    if (!typedResult.status) {
      console.warn('Payment verification failed:', reference, typedResult.message)
      
      return NextResponse.json({
        success: false,
        message: typedResult.message || 'Payment verification failed',
        data: null
      })
    }

    const paymentData = typedResult.data

    if (!paymentData) {
      console.error('Payment verification succeeded but no data returned:', reference)
      
      return NextResponse.json({
        success: false,
        message: 'Payment verification succeeded but no transaction data returned',
        data: null
      })
    }

    // If success, try to activate verification badge (preferred path)
    if (paymentData.status === 'success') {
      try {
        const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

        const metadata: any = paymentData.metadata || {}
        const customFields = Array.isArray(metadata?.custom_fields) ? metadata.custom_fields : []
        const transactionType = customFields.find((f: any) => f?.variable_name === 'transaction_type')?.value
        const transactionId = customFields.find((f: any) => f?.variable_name === 'transaction_id')?.value

        const ref = paymentData.reference || ''
        const isVerificationByReference = typeof ref === 'string' && ref.startsWith('VERIFICATION_')

        console.log('Verify endpoint detection:', { transactionType, transactionId, isVerificationByReference, reference: ref })

        if ((transactionType === 'verification_badge' && transactionId) || isVerificationByReference) {
          let txId: string | undefined = transactionId
          if (!txId && isVerificationByReference) {
            const parts = ref.split('_')
            if (parts.length >= 2) txId = parts[1]
          }

          if (!txId) {
            console.error('Could not extract transaction ID from verification payment:', ref)
          } else {
            const result = await convex.mutation(api.marketplace.verification.completeVerificationPurchase, {
              transactionId: txId as Id<'marketplaceTransactions'>,
              paymentReference: ref,
            })

            console.log('Verification badge activation result:', result)

            // Best-effort: send confirmation email (ignore failures)
            try {
              const userEmail = (metadata?.email as string) || ''
              const userName = (metadata?.userName as string) || ''
              if (userEmail) {
                await convex.action(api.actions.emails.sendVerificationBadgeEmail.sendVerificationBadgeConfirmation, {
                  userEmail,
                  userName,
                  tier: result.tier,
                  amount: paymentData.amount,
                  expiresAt: result.expiresAt,
                  paymentReference: ref,
                })
              }
            } catch (emailErr) {
              console.warn('Verification email send failed (non-fatal):', ref)
            }

            return NextResponse.json({
              success: true,
              message: 'Verification badge activated',
              data: {
                status: paymentData.status,
                amount: paymentData.amount,
                reference: ref,
                metadata: paymentData.metadata,
              }
            })
          }
        }

        // Marketplace booking completion fallback
        try {
          // Detect MARKETPLACE reference or metadata with booking_id
          const refStr = paymentData.reference || ''
          const isMarketplaceByRef = typeof refStr === 'string' && refStr.startsWith('MARKETPLACE_')

          let bookingId: string | undefined
          if (isMarketplaceByRef) {
            const parts = refStr.split('_')
            if (parts.length >= 2) bookingId = parts[1]
          }
          if (!bookingId) {
            const cf = Array.isArray(metadata?.custom_fields) ? metadata.custom_fields : []
            bookingId = cf.find((f: any) => f?.variable_name === 'booking_id')?.value
          }

          if (bookingId) {
            await convex.mutation(api.marketplace.booking.completeMarketplaceBooking, {
              bookingId: bookingId as Id<'marketplaceBookings'>,
              paymentReference: refStr,
            })

            return NextResponse.json({
              success: true,
              message: 'Marketplace booking completed',
              data: {
                status: paymentData.status,
                amount: paymentData.amount,
                reference: refStr,
                bookingId,
              }
            })
          }
        } catch (marketErr) {
          console.error('Marketplace completion fallback failed:', marketErr)
        }

        // Fallback: existing invoice update flow if not a verification badge or marketplace
        try {
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/payments/update-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reference: paymentData.reference,
              status: 'success',
              amount: paymentData.amount,
              metadata: paymentData.metadata,
            })
          })

          console.log('Payment verified and status updated (invoice path):', reference)
        } catch (fallbackErr) {
          console.error('Failed to update payment status after verification (invoice path):', fallbackErr)
        }
      } catch (e) {
        console.error('Verification activation error:', e)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        status: paymentData.status,
        amount: paymentData.amount,
        reference: paymentData.reference,
        metadata: paymentData.metadata
      }
    })

  } catch (error) {
    console.error('Payment verification error:', error)
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error during payment verification',
        data: null
      },
      { status: 500 }
    )
  }
}
