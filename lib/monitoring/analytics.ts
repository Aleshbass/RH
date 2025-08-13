import { log } from './logger'
import { ErrorTracker } from './sentry'

// User analytics interface
interface UserEvent {
  action: string
  resource?: string
  duration?: number
  metadata?: Record<string, unknown>
}

interface PageView {
  path: string
  referrer?: string
  duration?: number
  metadata?: Record<string, unknown>
}

interface BusinessEvent {
  event: string
  value?: number
  currency?: string
  metadata?: Record<string, unknown>
}

// Runtime check for whether analytics are allowed (env flag + Cookiebot consent)
const canSendAnalytics = (): boolean => {
  if (typeof window === 'undefined') return false
  const enabled = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true'
  // If Cookiebot exists, require statistics consent; otherwise assume allowed
  type CookiebotWindow = typeof window & { Cookiebot?: { consent?: { statistics?: boolean } } }
  const cookiebotWin = window as CookiebotWindow
  const consentOk = cookiebotWin.Cookiebot
    ? Boolean(cookiebotWin.Cookiebot.consent?.statistics)
    : false
  return enabled && consentOk
}

// Analytics class for tracking user behavior
export class Analytics {
  private static instance: Analytics
  private userId?: string
  private sessionId: string
  private pageStartTime: number = Date.now()

  constructor() {
    this.sessionId = this.generateSessionId()
    this.initializeSession()
  }

  static getInstance(): Analytics {
    if (!Analytics.instance) {
      Analytics.instance = new Analytics()
    }
    return Analytics.instance
  }

  private generateSessionId(): string {
    if (typeof window === 'undefined') return 'server-session'
    
    let sessionId = sessionStorage.getItem('analytics-session-id')
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      sessionStorage.setItem('analytics-session-id', sessionId)
    }
    return sessionId
  }

  private initializeSession(): void {
    if (typeof window === 'undefined') return

    // Respect consent/flag
    if (!canSendAnalytics()) return

    // Track session start
    this.trackEvent('session_start', {
      metadata: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        screenResolution: `${screen.width}x${screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    })

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.trackEvent('page_hidden')
      } else {
        this.trackEvent('page_visible')
      }
    })

    // Track session end on page unload
    window.addEventListener('beforeunload', () => {
      const sessionDuration = Date.now() - this.pageStartTime
      this.trackEvent('session_end', {
        duration: sessionDuration,
        metadata: { sessionDuration }
      })
    })
  }

  setUser(userId: string): void {
    this.userId = userId
    log.info('Analytics user set', { userId, sessionId: this.sessionId })
    
    // Update Sentry user context
    ErrorTracker.setUserContext(userId)
  }

  clearUser(): void {
    this.userId = undefined
    ErrorTracker.clearUserContext()
  }

  // Track user events
  trackEvent(action: string, options: Partial<UserEvent> = {}): void {
    const event: UserEvent = {
      action,
      resource: options.resource,
      duration: options.duration,
      metadata: {
        sessionId: this.sessionId,
        timestamp: Date.now(),
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        ...options.metadata
      }
    }

    // Log to structured logger
    log.userAction(action, this.userId || 'anonymous', event.metadata)

    // Send to backend analytics
    this.sendToBackend('user-event', {
      userId: this.userId,
      sessionId: this.sessionId,
      ...event
    })
  }

  // Track page views
  trackPageView(path?: string, options: Partial<PageView> = {}): void {
    const currentPath = path || (typeof window !== 'undefined' ? window.location.pathname : 'unknown')
    const referrer = options.referrer || (typeof document !== 'undefined' ? document.referrer : undefined)
    
    // Calculate time on previous page
    const timeOnPage = Date.now() - this.pageStartTime
    if (timeOnPage > 1000) { // Only track if more than 1 second
      this.trackEvent('page_view_duration', {
        resource: currentPath,
        duration: timeOnPage
      })
    }

    // Track new page view
    this.pageStartTime = Date.now()
    
    const pageView: PageView = {
      path: currentPath,
      referrer,
      metadata: {
        sessionId: this.sessionId,
        timestamp: Date.now(),
        ...options.metadata
      }
    }

    log.info(`Page view: ${currentPath}`, {
      userId: this.userId,
      action: 'page_view',
      resource: currentPath,
      metadata: pageView.metadata
    })

    this.sendToBackend('page-view', {
      userId: this.userId,
      sessionId: this.sessionId,
      ...pageView
    })
  }

  // Track business events
  trackBusinessEvent(event: string, options: Partial<BusinessEvent> = {}): void {
    const businessEvent: BusinessEvent = {
      event,
      value: options.value,
      currency: options.currency || 'USD',
      metadata: {
        sessionId: this.sessionId,
        timestamp: Date.now(),
        ...options.metadata
      }
    }

    log.businessEvent(event, this.userId, businessEvent.metadata)

    this.sendToBackend('business-event', {
      userId: this.userId,
      sessionId: this.sessionId,
      ...businessEvent
    })
  }

  // Track performance metrics
  trackPerformance(metric: string, value: number, metadata?: Record<string, unknown>): void {
    log.performanceMetric(metric, value, this.userId)

    this.sendToBackend('performance-metric', {
      userId: this.userId,
      sessionId: this.sessionId,
      metric,
      value,
      metadata: {
        timestamp: Date.now(),
        ...metadata
      }
    })
  }

  // Track errors
  trackError(error: Error | string, metadata?: Record<string, unknown>): void {
    const errorData = {
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'object' ? error.stack : undefined,
      metadata: {
        sessionId: this.sessionId,
        timestamp: Date.now(),
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        ...metadata
      }
    }

    log.error('User error tracked', {
      userId: this.userId,
      error: errorData.message,
      metadata: errorData.metadata
    })

    ErrorTracker.captureException(
      typeof error === 'string' ? new Error(error) : error,
      {
        userId: this.userId,
        action: 'user_error',
        extra: errorData.metadata
      }
    )

    this.sendToBackend('error', {
      userId: this.userId,
      sessionId: this.sessionId,
      ...errorData
    })
  }

  // Send data to backend
  private sendToBackend(type: string, data: Record<string, unknown>): void {
    if (typeof window === 'undefined') return
    if (!canSendAnalytics()) return

    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data })
    }).catch(error => {
      log.error('Failed to send analytics data', {
        error,
        metadata: { type, userId: this.userId }
      })
    })
  }

  // Get session info
  getSessionInfo() {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      startTime: this.pageStartTime
    }
  }
}

// React hook for analytics
export const useAnalytics = () => {
  const analytics = Analytics.getInstance()
  
  return {
    trackEvent: (action: string, options?: Partial<UserEvent>) => 
      analytics.trackEvent(action, options),
    trackPageView: (path?: string, options?: Partial<PageView>) => 
      analytics.trackPageView(path, options),
    trackBusinessEvent: (event: string, options?: Partial<BusinessEvent>) => 
      analytics.trackBusinessEvent(event, options),
    trackPerformance: (metric: string, value: number, metadata?: Record<string, unknown>) => 
      analytics.trackPerformance(metric, value, metadata),
    trackError: (error: Error | string, metadata?: Record<string, unknown>) => 
      analytics.trackError(error, metadata),
    setUser: (userId: string) => analytics.setUser(userId),
    clearUser: () => analytics.clearUser(),
    getSessionInfo: () => analytics.getSessionInfo()
  }
}

// Export singleton instance
export const analytics = Analytics.getInstance()

// Export types
export type { UserEvent, PageView, BusinessEvent }
