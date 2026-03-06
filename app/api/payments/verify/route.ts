import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured.");
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL)

/**
 * Payment verification endpoint — uses Paystack
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { reference, status } = body

    if (!reference) {
      return NextResponse.json(
        { success: false, message: 'Payment reference is required' },
        { status: 400 }
      )
    }

    console.log('Verifying Paystack payment:', { reference, status })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    // Verify with Paystack
    const verifyResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      }
    )

    clearTimeout(timeoutId)

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text().catch(() => '');
      return NextResponse.json({
        success: false,
        message: `Payment verification failed (HTTP ${verifyResponse.status}). ${errorText}`,
        data: null
      }, { status: verifyResponse.status });
    }

    const verifyResult = await verifyResponse.json()

    if (!verifyResult.status || verifyResult.data?.status !== 'success') {
      return NextResponse.json({
        success: false,
        message: verifyResult.message || 'Payment verification failed',
        data: verifyResult.data ? {
          status: verifyResult.data.status,
          amount: verifyResult.data.amount,
          reference,
        } : null
      })
    }

    // Payment verified successfully
    const txData = verifyResult.data

    // Handle verification badge purchase
    if (reference.startsWith('VERIFICATION_')) {
      try {
        const parts = reference.split('_')
        const txId = parts.length >= 2 ? parts[1] : null

        if (txId) {
          // Add basic idempotent check here by checking if it's already completed if needed
          // For now, allow completeVerificationPurchase to handle uniqueness/idempotency by throwing
          const result = await convex.mutation(api.marketplace.verification.completeVerificationPurchase, {
            transactionId: txId as Id<'marketplaceTransactions'>,
            paymentReference: reference,
          })
          console.log('Verification badge activation result:', result)
        }
      } catch (e) {
        console.error('Verification activation error:', e)
        return NextResponse.json({
          success: false,
          message: 'Payment was valid but verification activation failed on server.',
          data: null
        }, { status: 500 })
      }
    }

    // Handle marketplace booking
    if (reference.startsWith('MARKETPLACE_')) {
      try {
        const parts = reference.split('_')
        const bookingId = parts.length >= 2 ? parts[1] : null

        if (bookingId) {
          await convex.mutation(api.marketplace.booking.completeMarketplaceBooking, {
            bookingId: bookingId as Id<'marketplaceBookings'>,
            paymentReference: reference,
          })
        }
      } catch (e) {
        console.error('Marketplace booking error:', e)
        return NextResponse.json({
          success: false,
          message: 'Payment was valid but marketplace booking completion failed.',
          data: null
        }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        status: 'success',
        amount: txData.amount,
        reference,
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
