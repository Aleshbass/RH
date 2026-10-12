import { NextResponse } from 'next/server'

/**
 * Retired: this unauthenticated endpoint allowed anyone to mark a payment as completed.
 * Payment status is now updated only from signature-verified Paystack webhooks
 * (app/api/webhooks/paystack) or server-side Paystack verification (payments.verifyPaystackTransaction).
 */
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Payment status is updated from verified Paystack webhooks.' },
    { status: 410 }
  )
}
