import { NextRequest, NextResponse } from 'next/server'
import { api } from '@/convex/_generated/api'
import { ConvexHttpClient } from 'convex/browser'
import { log } from '@/lib/monitoring/logger'

let convexClient: ConvexHttpClient | null = null

function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!url) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL is not set')
    }
    convexClient = new ConvexHttpClient(url)
  }
  return convexClient
}

export async function POST(request: NextRequest) {
  try {
    const { type, data } = await request.json()
    
    // Log the analytics event
    log.info(`Analytics event: ${type}`, {
      userId: data.userId,
      action: 'analytics_track',
      metadata: { type, ...data }
    })

    // Route to appropriate analytics function based on type
    switch (type) {
      case 'user-event':
        await getConvexClient().mutation(api.analytics.logSystemEvent, {
          level: 'info',
          message: `User event: ${data.action}`,
          userId: data.userId,
          action: data.action,
          metadata: {
            resource: data.resource,
            duration: data.duration,
            sessionId: data.sessionId,
            ...data.metadata
          }
        })
        break

      case 'page-view':
        await getConvexClient().mutation(api.analytics.recordPerformanceMetric, {
          metric: 'page_view',
          value: 1,
          userId: data.userId,
          metadata: {
            path: data.path,
            referrer: data.referrer,
            sessionId: data.sessionId,
            ...data.metadata
          }
        })
        break

      case 'business-event':
        await getConvexClient().mutation(api.analytics.recordPerformanceMetric, {
          metric: `business_${data.event}`,
          value: data.value || 1,
          userId: data.userId,
          metadata: {
            event: data.event,
            currency: data.currency,
            sessionId: data.sessionId,
            ...data.metadata
          }
        })
        break

      case 'performance-metric':
        await getConvexClient().mutation(api.analytics.recordPerformanceMetric, {
          metric: data.metric,
          value: data.value,
          userId: data.userId,
          metadata: {
            sessionId: data.sessionId,
            ...data.metadata
          }
        })
        break

      case 'error':
        await getConvexClient().mutation(api.analytics.logSystemEvent, {
          level: 'error',
          message: data.message,
          userId: data.userId,
          action: 'user_error',
          metadata: {
            stack: data.stack,
            sessionId: data.sessionId,
            ...data.metadata
          }
        })
        break

      default:
        log.warn(`Unknown analytics event type: ${type}`)
        return NextResponse.json({ error: 'Unknown event type' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Analytics tracking error', { error: error as Error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
