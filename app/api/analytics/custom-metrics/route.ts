import { NextRequest, NextResponse } from 'next/server'
import { api } from '@/convex/_generated/api'
import { getConvexClient } from '@/lib/convex-client'
import { log } from '@/lib/monitoring/logger'

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    // Log the custom metric
    log.performanceMetric(data.metric, data.value, data.userId)

    // Store in Convex analytics
    await getConvexClient().mutation(api.analytics.recordPerformanceMetric, {
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
