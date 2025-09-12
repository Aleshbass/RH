import { NextRequest, NextResponse } from 'next/server'
import { simplePaystackService } from '@/lib/payments/simple-payments'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'

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

    log.info('Verifying payment', {
      action: 'payment_verification',
      metadata: { reference }
    })

    // Verify payment with Paystack
    const verificationResult = await simplePaystackService.verifyPayment(reference)

    const typedResult = verificationResult as PaystackVerificationResponse;
    
    if (!typedResult.status) {
      log.warn('Payment verification failed', {
        action: 'payment_verification_failed',
        metadata: { reference, message: typedResult.message }
      })
      
      return NextResponse.json({
        success: false,
        message: typedResult.message || 'Payment verification failed',
        data: null
      })
    }

    const paymentData = typedResult.data

    if (!paymentData) {
      log.error('Payment verification succeeded but no data returned', {
        action: 'payment_verification_no_data',
        metadata: { reference }
      })
      
      return NextResponse.json({
        success: false,
        message: 'Payment verification succeeded but no transaction data returned',
        data: null
      })
    }

    // Update payment status in database via internal API
    if (paymentData.status === 'success') {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/payments/update-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference: paymentData.reference,
            status: 'success',
            amount: paymentData.amount,
            metadata: paymentData.metadata,
            paystackData: {
              transactionId: paymentData?.id ? String(paymentData.id) : undefined,
              gatewayResponse: paymentData?.gateway_response,
              paidAt: paymentData?.paid_at ? new Date(paymentData.paid_at).getTime() : undefined,
              channel: paymentData?.channel,
              fees: paymentData?.fees,
              authorization: paymentData?.authorization ? {
                authorizationCode: paymentData.authorization.authorization_code,
                bin: paymentData.authorization.bin,
                last4: paymentData.authorization.last4,
                expMonth: paymentData.authorization.exp_month,
                expYear: paymentData.authorization.exp_year,
                cardType: paymentData.authorization.card_type,
                bank: paymentData.authorization.bank
              } : undefined
            }
          })
        })

        log.info('Payment verified and status updated', {
          action: 'payment_verified_success',
          metadata: { 
            reference,
            amount: paymentData.amount,
            invoiceId: paymentData.metadata?.invoiceId
          }
        })
      } catch (updateError) {
        log.error('Failed to update payment status after verification', {
          error: updateError as Error,
          metadata: { reference }
        })
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
    log.error('Payment verification error', {
      error: error as Error,
      action: 'payment_verification_error'
    })
    
    ErrorTracker.captureException(error as Error, {
      action: 'payment_verification_failed'
    })
    
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
