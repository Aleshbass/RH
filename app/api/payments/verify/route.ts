import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

/**
 * Payment verification endpoint - now uses Flutterwave
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { reference, transaction_id, tx_ref, status } = body

    // Get reference from various Flutterwave params
    const paymentRef = tx_ref || reference
    const transactionId = transaction_id

    if (!paymentRef && !transactionId) {
      return NextResponse.json(
        { success: false, message: 'Payment reference or transaction ID is required' },
        { status: 400 }
      )
    }

    console.log('Verifying Flutterwave payment:', { paymentRef, transactionId, status })

    // If already marked as successful in callback, go straight to completion
    if (status === 'successful' || status === 'completed') {
      // Verify with Flutterwave to be sure
      const verifyResult = await convex.action(api.flutterwave.verifyTransactionByRef, {
        txRef: paymentRef
      })

      if (!verifyResult.success) {
        return NextResponse.json({
          success: false,
          message: verifyResult.message || 'Payment verification failed',
          data: null
        })
      }

      // Handle verification badge purchase
      if (paymentRef?.startsWith('VERIFICATION_')) {
        try {
          const parts = paymentRef.split('_')
          const txId = parts.length >= 2 ? parts[1] : null

          if (txId) {
            const result = await convex.mutation(api.marketplace.verification.completeVerificationPurchase, {
              transactionId: txId as Id<'marketplaceTransactions'>,
              paymentReference: paymentRef,
            })
            console.log('Verification badge activation result:', result)
          }
        } catch (e) {
          console.error('Verification activation error:', e)
        }
      }

      // Handle marketplace booking
      if (paymentRef?.startsWith('MARKETPLACE_')) {
        try {
          const parts = paymentRef.split('_')
          const bookingId = parts.length >= 2 ? parts[1] : null

          if (bookingId) {
            await convex.mutation(api.marketplace.booking.completeMarketplaceBooking, {
              bookingId: bookingId as Id<'marketplaceBookings'>,
              paymentReference: paymentRef,
            })
          }
        } catch (e) {
          console.error('Marketplace booking error:', e)
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Payment verified successfully',
        data: {
          status: 'success',
          amount: verifyResult.transaction?.amount,
          reference: paymentRef,
        }
      })
    }

    // For pending/other statuses, verify with Flutterwave
    const verifyResult = await convex.action(api.flutterwave.verifyTransactionByRef, {
      txRef: paymentRef
    })

    return NextResponse.json({
      success: verifyResult.success,
      message: verifyResult.success ? 'Payment verified' : verifyResult.message,
      data: verifyResult.transaction ? {
        status: verifyResult.transaction.status,
        amount: verifyResult.transaction.amount,
        reference: paymentRef,
      } : null
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
