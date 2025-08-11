import { onCLS, onINP, onFCP, onLCP, onTTFB, type Metric } from 'web-vitals'
import { log } from './logger'
import { ErrorTracker } from './sentry'

// Web Vitals thresholds
const THRESHOLDS = {
  CLS: { good: 0.1, poor: 0.25 },
  INP: { good: 200, poor: 500 },
  FCP: { good: 1800, poor: 3000 },
  LCP: { good: 2500, poor: 4000 },
  TTFB: { good: 800, poor: 1800 }
} as const

type MetricName = keyof typeof THRESHOLDS
type Rating = 'good' | 'needs-improvement' | 'poor'

interface WebVitalMetric {
  name: MetricName
  value: number
  rating: Rating
  delta: number
  id: string
  navigationType: string
}

// Runtime check for whether web vitals are allowed (env flag + Cookiebot consent)
const canSendWebVitals = (): boolean => {
  if (typeof window === 'undefined') return false
  const enabled = process.env.NEXT_PUBLIC_WEB_VITALS_ENABLED === 'true'
  const consentOk = (window as any).Cookiebot
    ? Boolean((window as any).Cookiebot.consent?.statistics)
    : false
  return enabled && consentOk
}

// Generate session ID for grouping metrics
const getSessionId = (): string => {
  if (typeof window === 'undefined') return 'server'
  
  let sessionId = sessionStorage.getItem('webvitals-session-id')
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    sessionStorage.setItem('webvitals-session-id', sessionId)
  }
  return sessionId
}

// Get rating based on thresholds
const getRating = (name: MetricName, value: number): Rating => {
  const threshold = THRESHOLDS[name]
  if (value <= threshold.good) return 'good'
  if (value <= threshold.poor) return 'needs-improvement'
  return 'poor'
}

// Send metric to analytics
const sendMetric = async (metric: WebVitalMetric, userId?: string) => {
  try {
    if (!canSendWebVitals()) return
    // Log metric for structured logging
    log.performanceMetric(`web-vital-${metric.name.toLowerCase()}`, metric.value, userId)
    
    // Send to backend analytics (if available)
    if (typeof window !== 'undefined') {
      const sessionId = getSessionId()
      const url = window.location.href
      const userAgent = navigator.userAgent
      
      // Store in convex via API route
      fetch('/api/analytics/web-vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          metric: metric.name,
          value: metric.value,
          rating: metric.rating,
          url,
          userAgent,
          timestamp: Date.now()
        })
      }).catch(error => {
        log.error('Failed to send web vital metric', { error: error as Error, metadata: { metric: metric.name } })
      })
    }
    
    // Track poor performance in Sentry
    if (metric.rating === 'poor') {
      ErrorTracker.captureMessage(
        `Poor ${metric.name} performance: ${metric.value}ms`,
        'warning',
        {
          userId,
          action: 'web_vitals_poor_performance',
          extra: {
            metric: metric.name,
            value: metric.value,
            threshold: THRESHOLDS[metric.name].poor,
            url: typeof window !== 'undefined' ? window.location.href : 'unknown'
          }
        }
      )
    }
  } catch (error) {
    log.error('Error sending web vital metric', { error: error as Error })
  }
}

// Initialize Web Vitals tracking
export const initWebVitals = (userId?: string) => {
  if (typeof window === 'undefined') return
  if (!canSendWebVitals()) return
  
  log.info('Initializing Web Vitals tracking', { userId, action: 'web_vitals_init' })
  
  // Track Cumulative Layout Shift
  onCLS((metric: Metric) => {
    const webVital: WebVitalMetric = {
      name: 'CLS',
      value: metric.value,
      rating: getRating('CLS', metric.value),
      delta: metric.delta,
      id: metric.id,
      navigationType: metric.navigationType
    }
    sendMetric(webVital, userId)
  })
  
  // Track Interaction to Next Paint (replaces FID)
  onINP((metric: Metric) => {
    const webVital: WebVitalMetric = {
      name: 'INP',
      value: metric.value,
      rating: getRating('INP', metric.value),
      delta: metric.delta,
      id: metric.id,
      navigationType: metric.navigationType
    }
    sendMetric(webVital, userId)
  })
  
  // Track First Contentful Paint
  onFCP((metric: Metric) => {
    const webVital: WebVitalMetric = {
      name: 'FCP',
      value: metric.value,
      rating: getRating('FCP', metric.value),
      delta: metric.delta,
      id: metric.id,
      navigationType: metric.navigationType
    }
    sendMetric(webVital, userId)
  })
  
  // Track Largest Contentful Paint
  onLCP((metric: Metric) => {
    const webVital: WebVitalMetric = {
      name: 'LCP',
      value: metric.value,
      rating: getRating('LCP', metric.value),
      delta: metric.delta,
      id: metric.id,
      navigationType: metric.navigationType
    }
    sendMetric(webVital, userId)
  })
  
  // Track Time to First Byte
  onTTFB((metric: Metric) => {
    const webVital: WebVitalMetric = {
      name: 'TTFB',
      value: metric.value,
      rating: getRating('TTFB', metric.value),
      delta: metric.delta,
      id: metric.id,
      navigationType: metric.navigationType
    }
    sendMetric(webVital, userId)
  })
}

// React hook for Web Vitals
export const useWebVitals = (userId?: string) => {
  if (typeof window !== 'undefined') {
    initWebVitals(userId)
  }
}

// Performance observer for custom metrics
export const trackCustomMetric = (name: string, value: number, userId?: string) => {
  log.performanceMetric(name, value, userId)
  
  // Send to backend if available
  if (typeof window !== 'undefined') {
    if (!canSendWebVitals()) return
    fetch('/api/analytics/custom-metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        metric: name,
        value,
        url: window.location.href,
        timestamp: Date.now()
      })
    }).catch(error => {
      log.error('Failed to send custom metric', { error: error as Error, metadata: { metric: name } })
    })
  }
}

// Navigation timing metrics
export const trackNavigationTiming = (userId?: string) => {
  if (typeof window === 'undefined' || !window.performance) return
  
  // Wait for load event to ensure timing is complete
  window.addEventListener('load', () => {
    setTimeout(() => {
      const timing = window.performance.timing
      const navigation = window.performance.navigation
      
      const metrics = {
        dns: timing.domainLookupEnd - timing.domainLookupStart,
        tcp: timing.connectEnd - timing.connectStart,
        request: timing.responseStart - timing.requestStart,
        response: timing.responseEnd - timing.responseStart,
        dom: timing.domContentLoadedEventEnd - timing.domContentLoadedEventStart,
        load: timing.loadEventEnd - timing.loadEventStart,
        total: timing.loadEventEnd - timing.navigationStart
      }
      
      Object.entries(metrics).forEach(([name, value]) => {
        if (value > 0) {
          trackCustomMetric(`navigation-${name}`, value, userId)
        }
      })
      
      log.info('Navigation timing tracked', {
        userId,
        action: 'navigation_timing',
        metadata: { metrics, navigationType: navigation.type }
      })
    }, 0)
  })
}

export type { WebVitalMetric, MetricName, Rating }
