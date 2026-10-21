import { NextRequest, NextResponse } from 'next/server'
import { getConvexClient } from '@/lib/convex-client'
import { api } from '@/convex/_generated/api'

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

    // Verification badge purchases (VERIFICATION_ references). Convex re-verifies the
    // transaction with Paystack itself, checks amount/currency and activates the badge
    // (idempotent), so this route never marks anything paid on its own.
    if (reference.startsWith('VERIFICATION_')) {
      try {
        const result = await getConvexClient().action(api.marketplace.verification.verifyVerificationPayment, { reference })
        if (!result?.success) {
          return NextResponse.json({
            success: false,
            message: `Payment was received but the verification badge could not be activated (${result?.status ?? 'unknown'}). Our team has been notified.`,
            data: null,
          }, { status: 409 })
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

    // Marketplace bookings (MKT_ references). Convex re-verifies the transaction with
    // Paystack itself and checks the amount before completing the booking (idempotent).
    if (reference.startsWith('MKT_')) {
      try {
        const result = await getConvexClient().action(api.marketplace.booking.verifyMarketplacePayment, { reference })
        if (!result?.success) {
          return NextResponse.json({
            success: false,
            message: `Payment was received but the booking could not be confirmed (${result?.status ?? 'unknown'}). Our team has been notified.`,
            data: null,
          }, { status: 409 })
        }
      } catch (e) {
        console.error('Marketplace booking error:', e)
        return NextResponse.json({
          success: false,
          message: 'Payment was valid but marketplace booking completion failed.',
          data: null
        }, { status: 500 })
      }
    } else if (!reference.startsWith('VERIFICATION_')) {
      // Invoice payments are recorded by Convex (amount checked against the invoice); any
      // other reference isn't a Rehabify checkout, so it's never reported as a success here.
      if (!/^(INV|CLN|PHY)_/.test(reference)) {
        return NextResponse.json({ success: false, message: 'Unknown payment reference', data: null }, { status: 404 })
      }
      const result = await getConvexClient().action(api.payments.verifyPaystackTransaction, { reference })
      if (!result?.success || result.status !== 'success') {
        return NextResponse.json({
          success: false,
          message: result?.error || 'Payment was received but the invoice could not be updated. Our team has been notified.',
          data: null,
        }, { status: 409 })
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
