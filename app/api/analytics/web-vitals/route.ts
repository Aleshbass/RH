import { NextRequest, NextResponse } from 'next/server'
import { api } from '@/convex/_generated/api'
import { getConvexClient } from '@/lib/convex-client'
import { log } from '@/lib/monitoring/logger'

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    // Log the web vital metric
    log.performanceMetric(`web-vital-${data.metric.toLowerCase()}`, data.value, data.userId)

    // Store in Convex analytics
    await getConvexClient().mutation(api.analytics.recordPerformanceMetric, {
      metric: `web_vital_${data.metric.toLowerCase()}`,
      value: data.value,
      userId: data.userId,
      metadata: {
        sessionId: data.sessionId,
        rating: data.rating,
        url: data.url,
        userAgent: data.userAgent,
        timestamp: data.timestamp
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Web vitals tracking error', { error: error as Error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
