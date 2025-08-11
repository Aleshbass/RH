// Main monitoring initialization module
import { initSentry } from './sentry'
import { initWebVitals } from './webVitals'
import { analytics } from './analytics'
import { log } from './logger'

// Initialize all monitoring systems
export const initMonitoring = (userId?: string) => {
  try {
    // Initialize Sentry error tracking
    initSentry()
    
    // Initialize Web Vitals tracking
    if (process.env.NEXT_PUBLIC_WEB_VITALS_ENABLED === 'true') {
      initWebVitals(userId)
    }
    
    // Set user context for analytics
    if (userId) {
      analytics.setUser(userId)
    }
    
    log.info('Monitoring systems initialized', {
      userId,
      action: 'monitoring_init',
      metadata: {
        sentry: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
        webVitals: process.env.NEXT_PUBLIC_WEB_VITALS_ENABLED === 'true',
        analytics: process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true'
      }
    })
  } catch (error) {
    console.error('Failed to initialize monitoring:', error)
  }
}

// Export all monitoring utilities
export { log } from './logger'
export { ErrorTracker, Sentry } from './sentry'
export { initWebVitals, useWebVitals, trackCustomMetric, trackNavigationTiming } from './webVitals'
export { analytics, useAnalytics } from './analytics'
export type { WebVitalMetric, MetricName, Rating } from './webVitals'
