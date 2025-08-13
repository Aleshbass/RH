

import { log } from './logger'
import { ErrorTracker } from './sentry'

// Simple interfaces to avoid deep type instantiation
interface SystemMetrics {
  uptime: number
  responseTime: number
  errorRate: number
  notificationDeliveryRate: number
  lastUpdated: number
}

interface UserActivity {
  userId: string
  action: string
  timestamp: number
  metadata?: Record<string, unknown>
}

interface PerformanceMetric {
  metric: string
  value: number
  timestamp: number
  tags?: Record<string, string>
}

class AnalyticsTracker {
  private metrics: Map<string, PerformanceMetric[]> = new Map()
  private userActivities: UserActivity[] = []
  private systemMetrics: SystemMetrics = {
    uptime: 0,
    responseTime: 0,
    errorRate: 0,
    notificationDeliveryRate: 0,
    lastUpdated: Date.now()
  }

  // Track user activity
  trackUserActivity(userId: string, action: string, metadata?: Record<string, unknown>) {
    try {
      const activity: UserActivity = {
        userId,
        action,
        timestamp: Date.now(),
        metadata
      }

      this.userActivities.push(activity)

      // Keep only last 1000 activities to prevent memory issues
      if (this.userActivities.length > 1000) {
        this.userActivities = this.userActivities.slice(-1000)
      }

      log.info('User activity tracked', {
        userId,
        action,
        metadata
      })
    } catch (error) {
      ErrorTracker.captureException(error, {
        context: 'analytics_tracker',
        extra: { userId, action }
      })
    }
  }

  // Track performance metrics
  trackPerformance(metric: string, value: number, tags?: Record<string, string>) {
    try {
      const performanceMetric: PerformanceMetric = {
        metric,
        value,
        timestamp: Date.now(),
        tags
      }

      if (!this.metrics.has(metric)) {
        this.metrics.set(metric, [])
      }

      const metricArray = this.metrics.get(metric)!
      metricArray.push(performanceMetric)

      // Keep only last 100 entries per metric
      if (metricArray.length > 100) {
        this.metrics.set(metric, metricArray.slice(-100))
      }

      log.debug('Performance metric tracked', {
        metric,
        value,
        tags
      })
    } catch (error) {
      ErrorTracker.captureException(error, {
        context: 'analytics_tracker',
        extra: { metric, value }
      })
    }
  }

  // Track API response times
  trackApiResponseTime(endpoint: string, duration: number, statusCode: number) {
    this.trackPerformance('api_response_time', duration, {
      endpoint,
      status_code: statusCode.toString()
    })

    // Update system metrics
    this.updateSystemResponseTime(duration)
    
    if (statusCode >= 400) {
      this.trackError(endpoint, statusCode)
    }
  }

  // Track errors
  trackError(source: string, errorCode?: number) {
    this.trackPerformance('error_count', 1, {
      source,
      error_code: errorCode?.toString()
    })

    this.updateErrorRate()
  }

  // Track notification delivery
  trackNotificationDelivery(type: 'email' | 'push', success: boolean) {
    this.trackPerformance('notification_delivery', success ? 1 : 0, {
      type,
      status: success ? 'success' : 'failed'
    })

    this.updateNotificationDeliveryRate()
  }

  // Update system uptime
  updateUptime(startTime: number) {
    const uptime = (Date.now() - startTime) / 1000 / 60 / 60 // hours
    this.systemMetrics.uptime = uptime
    this.systemMetrics.lastUpdated = Date.now()
  }

  // Update system response time
  private updateSystemResponseTime() {
    const responseTimeMetrics = this.metrics.get('api_response_time') || []
    if (responseTimeMetrics.length > 0) {
      const recent = responseTimeMetrics.slice(-10) // Last 10 requests
      const avgResponseTime = recent.reduce((sum, m) => sum + m.value, 0) / recent.length
      this.systemMetrics.responseTime = avgResponseTime
    }
  }

  // Update error rate
  private updateErrorRate() {
    const errorMetrics = this.metrics.get('error_count') || []
    const responseMetrics = this.metrics.get('api_response_time') || []
    
    if (responseMetrics.length > 0) {
      const recentErrors = errorMetrics.filter(m => m.timestamp > Date.now() - 60000) // Last minute
      const recentRequests = responseMetrics.filter(m => m.timestamp > Date.now() - 60000)
      
      if (recentRequests.length > 0) {
        this.systemMetrics.errorRate = (recentErrors.length / recentRequests.length) * 100
      }
    }
  }

  // Update notification delivery rate
  private updateNotificationDeliveryRate() {
    const notificationMetrics = this.metrics.get('notification_delivery') || []
    const recent = notificationMetrics.filter(m => m.timestamp > Date.now() - 300000) // Last 5 minutes
    
    if (recent.length > 0) {
      const successful = recent.filter(m => m.value === 1).length
      this.systemMetrics.notificationDeliveryRate = (successful / recent.length) * 100
    }
  }

  // Get system metrics
  getSystemMetrics(): SystemMetrics {
    return { ...this.systemMetrics }
  }

  // Get user activity summary
  getUserActivitySummary(timeRange: number = 3600000): Record<string, number> { // Default 1 hour
    const cutoff = Date.now() - timeRange
    const recentActivities = this.userActivities.filter(a => a.timestamp > cutoff)
    
    const summary: Record<string, number> = {}
    recentActivities.forEach(activity => {
      summary[activity.action] = (summary[activity.action] || 0) + 1
    })
    
    return summary
  }

  // Get performance metrics
  getPerformanceMetrics(metric: string, timeRange: number = 3600000): PerformanceMetric[] {
    const cutoff = Date.now() - timeRange
    const metrics = this.metrics.get(metric) || []
    return metrics.filter(m => m.timestamp > cutoff)
  }

  // Get all metrics for dashboard
  getDashboardMetrics() {
    return {
      systemMetrics: this.getSystemMetrics(),
      userActivity: this.getUserActivitySummary(),
      recentErrors: this.getPerformanceMetrics('error_count', 300000), // Last 5 minutes
      responseTimeMetrics: this.getPerformanceMetrics('api_response_time', 3600000), // Last hour
      notificationMetrics: this.getPerformanceMetrics('notification_delivery', 3600000)
    }
  }

  // Clear old data (should be called periodically)
  cleanup() {
    const cutoff = Date.now() - 86400000 // 24 hours
    
    // Clean user activities
    this.userActivities = this.userActivities.filter(a => a.timestamp > cutoff)
    
    // Clean metrics
    this.metrics.forEach((metricArray, key) => {
      const filtered = metricArray.filter(m => m.timestamp > cutoff)
      this.metrics.set(key, filtered)
    })
    
    log.info('Analytics data cleanup completed')
  }
}

// Export singleton instance
export const analyticsTracker = new AnalyticsTracker()

// Middleware function for tracking API calls
export function trackApiCall(endpoint: string) {
  return function(target: unknown, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value
    
    descriptor.value = async function(...args: unknown[]) {
      const startTime = Date.now()
      let statusCode = 200
      
      try {
        const result = await method.apply(this, args)
        return result
      } catch (error) {
        statusCode = 500
        throw error
      } finally {
        const duration = Date.now() - startTime
        analyticsTracker.trackApiResponseTime(endpoint, duration, statusCode)
      }
    }
    
    return descriptor
  }
}

// Helper functions for common tracking scenarios
export const trackUserLogin = (userId: string) => 
  analyticsTracker.trackUserActivity(userId, 'login')

export const trackUserLogout = (userId: string) => 
  analyticsTracker.trackUserActivity(userId, 'logout')

export const trackPatientInvite = (userId: string, patientEmail: string) => 
  analyticsTracker.trackUserActivity(userId, 'patient_invite', { patientEmail })

export const trackAppointmentCreated = (userId: string, appointmentId: string) => 
  analyticsTracker.trackUserActivity(userId, 'appointment_created', { appointmentId })

export const trackPaymentProcessed = (userId: string, amount: number, status: string) => 
  analyticsTracker.trackUserActivity(userId, 'payment_processed', { amount, status })

export const trackEmailSent = (success: boolean) => 
  analyticsTracker.trackNotificationDelivery('email', success)

export const trackError = (source: string, error: Error) => {
  analyticsTracker.trackError(source)
  ErrorTracker.captureException(error, {
    context: source
  })
}
