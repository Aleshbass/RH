import { NextRequest, NextResponse } from 'next/server'
import { api } from '@/convex/_generated/api'
import { getConvexClient } from '@/lib/convex-client'
import { convexServerSecret } from '@/lib/convex-server-secret'
import { log } from '@/lib/monitoring/logger'
import { guardAnalyticsRequest } from '@/lib/analytics-guard'

export async function POST(request: NextRequest) {
  try {
    const guard = await guardAnalyticsRequest(request)
    if (!guard.ok) return guard.response
    const data: Record<string, any> = { ...guard.body, userId: guard.userId }
    if (typeof data.metric !== 'string' || typeof data.value !== 'number') {
      return NextResponse.json({ error: 'Invalid metric' }, { status: 400 })
    }
    
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
      },
      serverSecret: convexServerSecret()
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Web vitals tracking error', { error: error as Error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
