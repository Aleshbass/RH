import { NextRequest, NextResponse } from 'next/server'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'
import { api } from '@/convex/_generated/api'
import { getConvexClient } from '@/lib/convex-client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { reference, status, amount, metadata, paystackData } = body

    log.info('Updating payment status', {
      userId: metadata?.userId,
      action: 'payment_status_update',
      metadata: { reference, status }
    })

    // Map external statuses to Convex enum
    const mappedStatus = status === 'success' ? 'completed' : status

    // Update via Convex
    const result = await getConvexClient().mutation(api.payments.updatePaymentStatus, {
      paystackReference: reference,
      status: mappedStatus,
      ...(paystackData ? { paystackData } : {})
    } as Parameters<typeof convex.mutation>[1])

    log.info('Payment status updated via Convex', {
      action: 'payment_updated',
      metadata: { reference, status: mappedStatus, amount }
    })

    return NextResponse.json({
      success: result.success,
      message: result.message,
      data: {
        paymentId: result.paymentId,
        invoiceId: result.invoiceId,
        status: mappedStatus
      }
    })

  } catch (error) {
    log.error('Failed to update payment status', {
      action: 'payment_status_error'
    })
    
    ErrorTracker.captureException(error as Error, {
      action: 'payment_status_update_failed'
    })
    
    return NextResponse.json(
      { error: 'Failed to update payment status' },
      { status: 500 }
    )
  }
}
