import * as Sentry from '@sentry/nextjs'
import { log } from './logger'

// Get Sentry logger instance
const { logger } = Sentry

// Exception capturing utility
export const captureException = (error: Error | unknown, context?: Record<string, any>) => {
  // Cast unknown to Error for proper typing
  const errorObj = error instanceof Error ? error : new Error(String(error))
  
  // Use Sentry to capture the exception
  Sentry.captureException(errorObj, {
    tags: context?.tags,
    extra: context?.extra,
    level: context?.level || 'error'
  })
  
  // Also log to structured logger
  log.error('Exception captured', {
    error: errorObj.message,
    ...(context?.extra && { extra: context.extra })
  })
}

// Custom span instrumentation for UI actions
export const trackUIAction = <T>(actionName: string, operation: string, fn: () => T, attributes?: Record<string, any>): T => {
  return Sentry.startSpan(
    {
      op: operation,
      name: actionName,
    },
    (span) => {
      // Add attributes to span
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          span.setAttribute(key, String(value))
        })
      }
      
      return fn()
    }
  )
}

// Custom span instrumentation for API calls
export const trackAPICall = async <T>(
  method: string,
  endpoint: string,
  fn: () => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> => {
  return Sentry.startSpan(
    {
      op: "http.client",
      name: `${method} ${endpoint}`,
    },
    async (span) => {
      // Add attributes to span
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          span.setAttribute(key, String(value))
        })
      }
      
      try {
        const result = await fn()
        span.setAttribute("http.status_code", "200")
        return result
      } catch (error) {
        span.setAttribute("http.status_code", "500")
        captureException(error, { extra: { endpoint, method } })
        throw error
      }
    }
  )
}

// Structured logging with Sentry logger
export const sentryLogger = {
  trace: (message: string, context?: Record<string, any>) => {
    logger.trace(message, context)
  },
  debug: (message: string, context?: Record<string, any>) => {
    if (context) {
      logger.debug(logger.fmt`${message}`, context)
    } else {
      logger.debug(message)
    }
  },
  info: (message: string, context?: Record<string, any>) => {
    logger.info(message, context)
  },
  warn: (message: string, context?: Record<string, any>) => {
    logger.warn(message, context)
  },
  error: (message: string, context?: Record<string, any>) => {
    logger.error(message, context)
  },
  fatal: (message: string, context?: Record<string, any>) => {
    logger.fatal(message, context)
  }
}

// Legacy init function (no longer needed as Sentry is initialized in config files)
export const initSentry = () => {
  // Sentry is now initialized in sentry.client.config.ts, sentry.server.config.ts, and sentry.edge.config.ts
  // This function is kept for backward compatibility
  console.log('Sentry initialization is handled by config files')
}

// Enhanced error tracking utilities
export class ErrorTracker {
  static captureException(error: Error, context?: {
    userId?: string
    action?: string
    extra?: Record<string, any>
    tags?: Record<string, string>
  }): void {
    // Log to structured logger
    log.error('Exception captured', {
      error,
      userId: context?.userId,
      action: context?.action,
      metadata: context?.extra
    })

    // Send to Sentry if configured
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.withScope((scope) => {
        if (context?.userId) {
          scope.setUser({ id: context.userId })
        }
        if (context?.action) {
          scope.setTag('action', context.action)
        }
        if (context?.tags) {
          Object.entries(context.tags).forEach(([key, value]) => {
            scope.setTag(key, value)
          })
        }
        if (context?.extra) {
          scope.setContext('extra', context.extra)
        }
        Sentry.captureException(error)
      })
    }
  }

  static captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: {
    userId?: string
    action?: string
    extra?: Record<string, any>
  }): void {
    // Log to structured logger
    log[level === 'warning' ? 'warn' : level](message, {
      userId: context?.userId,
      action: context?.action,
      metadata: context?.extra
    })

    // Send to Sentry if configured
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.withScope((scope) => {
        if (context?.userId) {
          scope.setUser({ id: context.userId })
        }
        if (context?.action) {
          scope.setTag('action', context.action)
        }
        if (context?.extra) {
          scope.setContext('extra', context.extra)
        }
        Sentry.captureMessage(message, level)
      })
    }
  }

  static addBreadcrumb(message: string, category: string, data?: Record<string, any>): void {
    log.debug(`Breadcrumb: ${message}`, {
      action: 'breadcrumb',
      metadata: { category, ...data }
    })

    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.addBreadcrumb({
        message,
        category,
        data,
        timestamp: Date.now() / 1000
      })
    }
  }

  static setUserContext(userId: string, email?: string, role?: string): void {
    log.debug('User context set', {
      userId,
      metadata: { email, role }
    })

    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.setUser({
        id: userId,
        email,
        role
      })
    }
  }

  static clearUserContext(): void {
    log.debug('User context cleared')

    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.setUser(null)
    }
  }
}

// React error boundary component
export const withErrorBoundary = Sentry.withErrorBoundary

// Export Sentry for direct use if needed
export { Sentry }
