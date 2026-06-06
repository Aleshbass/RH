import { NextRequest, NextResponse } from 'next/server'
import { getConvexClient } from '@/lib/convex-client'
import { api } from '@/convex/_generated/api'

/**
 * This route is deprecated - bank connection is now handled via Convex actions
 * See: convex/flutterwave.ts (to be migrated to Paystack)
 */

export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      message: 'This endpoint is deprecated. Bank connection is handled via Convex actions.'
    },
    { status: 410 }
  )
}

// Get list of banks - redirect to Convex action
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      message: 'Use the Convex bank list action instead.'
    },
    { status: 410 }
  )
}
