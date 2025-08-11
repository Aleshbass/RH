import { NextRequest, NextResponse } from 'next/server'
import { api } from '@/convex/_generated/api'
import { ConvexHttpClient } from 'convex/browser'
import { log } from '@/lib/monitoring/logger'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    // Log the custom metric
    log.performanceMetric(data.metric, data.value, data.userId)

    // Store in Convex analytics
    await convex.mutation(api.analytics.recordPerformanceMetric, {
      metric: data.metric,
      value: data.value,
      userId: data.userId,
      metadata: {
        url: data.url,
        timestamp: data.timestamp
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Custom metrics tracking error', { error: error as Error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
